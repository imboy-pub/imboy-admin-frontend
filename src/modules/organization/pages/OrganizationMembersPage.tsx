import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  EmptyState,
  EntityDrawer,
  ErrorState,
  PageHeader,
  type EntityDrawerSection,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useColumnState } from '@/hooks/useColumnState'
import { useListQueryState } from '@/hooks/useListQueryState'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  getOrganizationDetail,
  getOrganizationMembers,
  getOrganizationMembersAggregate,
  removeOrganizationMember,
  restoreOrganizationMember,
  suspendOrganizationMember,
} from '../api/public'
import {
  canTargetMemberRow,
  classifyOrgError,
  isOrgWriteAllowed,
  orgRoleLabel,
  type OrganizationMemberRow,
  type OrganizationSummary,
} from '../api/pureFunctions'
import {
  asMemberRoleFilter,
  filterMemberRows,
  isMemberFilterActive,
  type MemberRoleFilter,
} from '../api/memberFilters'
import { OrganizationOwnerTransferDialog } from './OrganizationOwnerTransferDialog'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  page: number
  size: number
  /** 复合筛选（ENT-ADM-01）：URL 持久化，变化即重置 page=1（根级规范）。 */
  role: string
  keyword: string
}

/**
 * 列管理（ENT-FND-01）：列 id 稳定化 + useColumnState 持久化 key。
 * 列 id 变更即存储 schema 变更——旧存储中的未知 id 会被 hook 清洗丢弃。
 */
const MEMBER_COLUMN_IDS = [
  'userId',
  'nickname',
  'role',
  'status',
  'invitedBy',
  'joinedAt',
  'actions',
] as const

const MEMBER_COLUMN_STORAGE_KEY = 'organization-members'

const MEMBER_COLUMN_LABELS: Record<string, string> = {
  userId: '用户 ID',
  nickname: '昵称 / 账号',
  role: '组织角色',
  status: '成员状态',
  invitedBy: '邀请人',
  joinedAt: '加入时间',
  actions: '操作',
}

/** 可由用户隐藏的列（actions 操作列固定可见，防止行级治理入口消失）。 */
const MEMBER_TOGGLEABLE_COLUMNS = MEMBER_COLUMN_IDS.filter((id) => id !== 'actions')

/** 复合筛选角色档位（与服务端组织角色三档 + unknown 兜底对齐）。 */
const MEMBER_ROLE_OPTIONS: Array<{ value: MemberRoleFilter; label: string }> = [
  { value: 'all', label: '全部角色' },
  { value: 'owner', label: 'owner（所有者）' },
  { value: 'admin', label: 'admin（管理员）' },
  { value: 'member', label: 'member（成员）' },
  { value: 'unknown', label: 'unknown（未知角色）' },
]

/**
 * 「最近停用」记录（ENT-ADM-01 扩展为整行快照）：suspend 成功时保存行快照 +
 * 服务端确认的 suspended 状态。记录是恢复 / 移除 / 查看详情（关系 Drawer）
 * 的唯一 UI 入口来源——成员列表分页只含 active，停用后行从表格消失。
 */
type SuspendedRecord = {
  row: OrganizationMemberRow
  /** 服务端 suspend 结果确认的状态（'suspended'），Drawer 详情如实呈现。 */
  suspendedStatus: string
}

/**
 * 成员详情 Drawer 数据源：表格行（点击）或最近停用记录（快照 + 状态注记）。
 */
type MemberDetail = {
  row: OrganizationMemberRow
  /** 非空时（来自最近停用快照）覆盖呈现状态，避免把停用前行伪装成 active。 */
  statusNote?: string
}

/**
 * 成员治理页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）。
 *
 * 契约（/api/adm/organizations/:id）：GET members（read）；POST
 * owner-transfer、POST members/:uid/suspend、POST members/:uid/restore、
 * POST members/:uid/remove（write）。平台无租户 actor 概念：owner 目标
 * suspend/remove 均被服务端 409 拒绝（先转移 Owner）；admin 目标无
 * 「主 Owner」限制；角色调整（PUT role）不在 adm 面合同内，入口已移除。
 *
 * 恢复入口说明：成员列表分页只含 active（服务端硬编码 status='active'，
 * 无 suspended 列表端点），因此停用后的成员会从表格消失；恢复操作从本页
 * 会话内的「最近停用」记录触发（刷新页面后记录消失，长期悬置成员需在
 * App 端处理）。不发明新页面结构，仅在本页内呈现。
 */
export function OrganizationMembersPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({
    page: 1,
    size: DEFAULT_PAGE_SIZE,
    role: 'all',
    keyword: '',
  })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [pendingSuspend, setPendingSuspend] = useState<OrganizationMemberRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState<OrganizationMemberRow | null>(null)
  const [suspendedRecords, setSuspendedRecords] = useState<SuspendedRecord[]>([])
  const [transferOpen, setTransferOpen] = useState(false)
  // 成员详情关系 Drawer（ENT-FND-01 骨架 / ENT-ADM-01 扩展最近停用快照入口）
  const [detailMember, setDetailMember] = useState<MemberDetail | null>(null)
  const [showColumnPanel, setShowColumnPanel] = useState(false)

  // 复合筛选（ENT-ADM-01）：URL 状态为事实源；关键词输入框是本地草稿，
  // 「筛选」提交才写回 URL（对齐 GroupListPage 的提交模式，避免逐键写 URL）。
  const memberFilter = useMemo(
    () => ({ role: asMemberRoleFilter(state.role), keyword: state.keyword }),
    [state.role, state.keyword]
  )
  const filterActive = isMemberFilterActive(memberFilter)
  const [keywordDraft, setKeywordDraft] = useState(state.keyword)

  // 列显隐持久化（localStorage + 重置）：columnVisibility 接进 useLegacyTable
  const {
    columnVisibility,
    setColumnVisibility,
    toggleColumn,
    isColumnVisible,
    resetColumns,
    visibleColumnCount,
    totalColumnCount,
  } = useColumnState({
    storageKey: MEMBER_COLUMN_STORAGE_KEY,
    columnIds: MEMBER_COLUMN_IDS,
  })

  // 服务端事实：组织状态（archived 门禁与提示的数据源）
  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const orgStatus = org?.status ?? 'unknown'
  const archived = orgStatus === 'archived'

  /**
   * 成员列表（ENT-ADM-01 双模式）：
   *   * 无筛选 —— 服务端分页（既有行为零变化）；
   *   * 筛选激活 —— 聚合拉取（≤10 页 × 100 行）→ filterMemberRows 客户端
   *     组合筛选 → 本地分页切片；loadedScope 如实标注覆盖范围（触达上限时
   *     不伪称全量）。adm 合同 members 端点无 role/keyword 服务端筛选参数。
   */
  const membersQuery = useQuery({
    queryKey: [
      'organization',
      'members',
      organizationId,
      filterActive ? 'client-filtered' : 'server-paged',
      state.page,
      state.size,
      memberFilter.role,
      memberFilter.keyword,
    ],
    queryFn: async () => {
      if (!filterActive) {
        const result = await getOrganizationMembers(organizationId, state.page, state.size)
        return {
          rows: result.items,
          page: result.page,
          size: result.size,
          total: result.total,
          matched: null as null | {
            count: number
            loaded: number
            serverTotal: number
            complete: boolean
          },
        }
      }
      const aggregate = await getOrganizationMembersAggregate(organizationId)
      const matchedRows = filterMemberRows(aggregate.rows, memberFilter)
      const start = (state.page - 1) * state.size
      return {
        rows: matchedRows.slice(start, start + state.size),
        page: state.page,
        size: state.size,
        total: matchedRows.length,
        matched: {
          count: matchedRows.length,
          loaded: aggregate.loadedCount,
          serverTotal: aggregate.total,
          complete: aggregate.complete,
        },
      }
    },
    enabled: readReady && organizationId.length > 0 && detailQuery.isSuccess,
  })

  const invalidateMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'members', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail', organizationId] })
  }

  const suspendMutation = useMutation({
    mutationFn: (row: OrganizationMemberRow) => suspendOrganizationMember(organizationId, row.userId),
    onSuccess: (result, row) => {
      toast.success(`成员 ${row.userId} 已停用（${result.status}）：企业业务授权立即失效，可从「最近停用」记录恢复`)
      setPendingSuspend(null)
      setSuspendedRecords((prev) =>
        prev.some((item) => item.row.userId === row.userId)
          ? prev
          : [...prev, { row, suspendedStatus: result.status }]
      )
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: (record: SuspendedRecord) => restoreOrganizationMember(organizationId, record.row.userId),
    onSuccess: (result, record) => {
      toast.success(`成员 ${record.row.userId} 已恢复（${result.status}）`)
      setSuspendedRecords((prev) => prev.filter((item) => item.row.userId !== record.row.userId))
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(organizationId, userId),
    onSuccess: (_data, userId) => {
      toast.success(
        `成员 ${userId} 已移除（removed 终态）：若仍被依赖资源引用，服务端会以 409 拒绝并要求先完成交接`
      )
      setPendingRemove(null)
      setSuspendedRecords((prev) => prev.filter((item) => item.row.userId !== userId))
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const rows = useMemo(() => membersQuery.data?.rows ?? [], [membersQuery.data])

  const columns = useMemo<LegacyColumnDef<OrganizationMemberRow>[]>(
    () => [
      {
        id: 'userId',
        header: '用户 ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId}</span>,
      },
      {
        id: 'nickname',
        header: '昵称 / 账号',
        cell: ({ row }) => (
          <span>
            {row.original.nickname || '-'}
            {row.original.account ? <span className="ml-1 text-xs text-muted-foreground">({row.original.account})</span> : null}
          </span>
        ),
      },
      {
        id: 'role',
        header: '组织角色',
        cell: ({ row }) => {
          const role = row.original.role
          const variantClass =
            role === 'owner'
              ? 'bg-purple-100 text-purple-800'
              : role === 'admin'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-muted text-muted-foreground'
          return (
            <Badge className={variantClass} data-role={role}>
              {role === 'unknown' ? 'unknown' : orgRoleLabel(role)}
            </Badge>
          )
        },
      },
      {
        id: 'status',
        header: '成员状态',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.status}</span>,
      },
      {
        id: 'invitedBy',
        header: '邀请人',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invitedBy || '-'}</span>,
      },
      {
        id: 'joinedAt',
        header: '加入时间',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.joinedAt || '-'}</span>,
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          if (!canWrite || archived) {
            return <span className="text-xs text-muted-foreground">-</span>
          }
          if (!canTargetMemberRow(row.original)) {
            return <span className="text-xs text-muted-foreground">主 Owner 不可直接操作（先转移 Owner）</span>
          }
          return (
            <MemberLifecycleActions
              row={row.original}
              onSuspend={setPendingSuspend}
              onRemove={setPendingRemove}
            />
          )
        },
      },
    ],
    [canWrite, archived]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!readReady) {
    body = <EmptyState title="无查看权限" description={`进入组织治理面板需要 ${READ_PERMISSION} 权限。`} />
  } else if (detailQuery.error) {
    body = <ErrorState message={classifyOrgError(detailQuery.error).message} onRetry={() => void detailQuery.refetch()} />
  } else if (!detailQuery.isSuccess) {
    body = <EmptyState title="加载中…" description="正在读取组织事实。" />
  } else if (membersQuery.error) {
    body = <ErrorState message={classifyOrgError(membersQuery.error).message} onRetry={() => void membersQuery.refetch()} />
  } else {
    const view = membersQuery.data
    body = (
      <div className="space-y-3">
        {!archived ? (
          <SuspendedMembersPanel
            records={suspendedRecords}
            canRestore={canWrite}
            restoring={restoreMutation.isPending}
            removing={removeMutation.isPending}
            onRestore={(record) => restoreMutation.mutate(record)}
            onRemove={(record) => removeMutation.mutate(record.row.userId)}
            onShowDetail={(record) => setDetailMember({ row: record.row, statusNote: record.suspendedStatus })}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 复合筛选（ENT-ADM-01）：角色 + 关键词组合；adm 合同无服务端筛选参数，
              筛选在已加载行上客户端执行（见下方覆盖范围标注）。状态维度不提供
              （服务端仅返回 active）；部门维度不提供（adm 合同无成员-部门挂载数据）。 */}
          <div className="flex flex-wrap items-center gap-2" data-testid="members-filter-bar">
            <Select
              aria-label="成员角色筛选"
              className="h-8 w-40 text-xs"
              data-testid="member-role-filter"
              value={memberFilter.role}
              onChange={(event) => {
                // 筛选变化重置 page=1（根级规范：分页/筛选变化重置页码）
                setState({ role: event.target.value, page: 1 })
              }}
            >
              {MEMBER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              aria-label="成员关键词筛选"
              className="h-8 w-56 text-xs"
              data-testid="member-keyword-input"
              placeholder="昵称 / 账号 / 用户 TSID / 邀请人"
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setState({ keyword: keywordDraft, page: 1 })
              }}
            />
            <Button
              variant="outline"
              size="sm"
              data-testid="member-filter-submit"
              onClick={() => setState({ keyword: keywordDraft, page: 1 })}
            >
              筛选
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="member-filter-reset"
              disabled={!filterActive && keywordDraft.length === 0}
              onClick={() => {
                setKeywordDraft('')
                setState({ role: 'all', keyword: '', page: 1 })
              }}
            >
              重置
            </Button>
          </div>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              data-testid="members-column-panel-btn"
              onClick={() => setShowColumnPanel((v) => !v)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              列显示（{visibleColumnCount}/{totalColumnCount}）
            </Button>
            {showColumnPanel && (
              <div className="absolute right-0 top-10 z-20 w-56 rounded-md border bg-background p-3 shadow-lg" data-testid="members-column-panel">
                <div className="mb-2 text-xs text-muted-foreground">自定义列表列显示（本浏览器记忆）</div>
                <div className="space-y-2">
                  {MEMBER_TOGGLEABLE_COLUMNS.map((columnId) => (
                    <label key={columnId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid={`members-column-toggle-${columnId}`}
                        checked={isColumnVisible(columnId)}
                        onChange={() => toggleColumn(columnId)}
                      />
                      <span>{MEMBER_COLUMN_LABELS[columnId] ?? columnId}</span>
                    </label>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 w-full justify-start px-2 text-xs"
                  data-testid="members-column-reset-btn"
                  onClick={resetColumns}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  重置列显示
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">「操作」列固定显示。</p>
              </div>
            )}
          </div>
        </div>
        {filterActive && view?.matched ? (
          <p className="text-xs text-muted-foreground" data-testid="members-filter-scope-note">
            复合筛选在浏览器侧执行（adm 合同 members 端点无服务端筛选参数）：命中 {view.matched.count} 行
            / 已加载 {view.matched.loaded} 行（服务端共 {view.matched.serverTotal} 行 active 成员）
            {view.matched.complete ? '' : '；组织成员数超过聚合上限，筛选仅覆盖已加载行'}。状态维度不提供
            （服务端仅返回 active 成员）；部门维度不提供（adm 合同无成员-部门挂载数据）。
          </p>
        ) : null}
        <DataTable
          table={table}
          loading={membersQuery.isLoading}
          emptyMessage={filterActive ? '无匹配成员（当前筛选条件下）' : '暂无成员'}
          onRowClick={(row) => setDetailMember({ row })}
        />
        <DataTablePagination
          page={view?.page ?? state.page}
          pageSize={view?.size ?? state.size}
          total={view?.total ?? 0}
          onPageChange={(page) => setState({ page })}
          onPageSizeChange={(size) => setState({ size, page: 1 })}
          dataUpdatedAt={membersQuery.dataUpdatedAt}
          onRefresh={() => void membersQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="organization-members">
      <PageHeader
        title="成员治理"
        description="组织成员的生命周期治理（停用 / 恢复 / 移除）与 Owner 转移；支持角色 + 关键词复合筛选（客户端执行）、列显示持久化与成员详情关系 Drawer。角色只有 owner / admin / member 三档；Owner 变更只走转移流程。adm 面不提供成员角色调整。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            成员列表
            {org ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {org.name} · 组织 {orgStatus === 'active' || orgStatus === 'archived' ? orgStatus : 'unknown'}
              </span>
            ) : null}
          </CardTitle>
          {canWrite && isOrgWriteAllowed(orgStatus, 'update') ? (
            <Button variant="destructive" size="sm" data-testid="transfer-owner-btn" onClick={() => setTransferOpen(true)}>
              转移 Owner
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {archived ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-testid="members-archived-hint">
              组织已归档：成员管理操作被服务端拒绝（409，C16 fail-closed）。恢复组织后重新开放。
            </p>
          ) : null}
          {body}
          <p className="text-xs text-muted-foreground">
            生命周期命令（POST suspend / restore / remove）已接入平台面：停用是可恢复的撤权第一步，
            移除是 removed 终态（若成员仍被依赖资源引用，服务端 409 要求先交接）。主 Owner 不可被停用或移除
            （先转移 Owner）。成员列表只含 active，停用后的成员从表格消失，恢复操作请使用上方「最近停用」记录
            （仅本会话可见，刷新页面后消失；长期悬置成员需在 App 端处理）。
          </p>
          <p className="text-xs text-muted-foreground">
            <Link className="underline" to={`/organizations/${encodeURIComponent(organizationId)}`}>
              返回组织详情
            </Link>
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingSuspend != null}
        onOpenChange={(open) => {
          if (!open) setPendingSuspend(null)
        }}
        title={`停用成员 ${pendingSuspend?.userId ?? ''}`}
        description="停用（suspend）是可恢复的撤权第一步：该成员的企业业务授权立即失效，但保留成员资格与个人账号；可从「最近停用」记录恢复。主 Owner 不可被停用。确认停用？"
        confirmText="确认停用"
        variant="destructive"
        loading={suspendMutation.isPending}
        onConfirm={async () => {
          if (pendingSuspend) await suspendMutation.mutateAsync(pendingSuspend)
        }}
      />

      <ConfirmDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        title={`移除成员 ${pendingRemove?.userId ?? ''}`}
        description="移除（remove）是 removed 终态：若该成员仍被依赖资源引用（如 active 经办关系），服务端会以 409 拒绝并要求先完成交接——失败会如实呈现，可重试。主 Owner 不可被移除（先转移 Owner）。确认移除？"
        confirmText="确认移除"
        variant="destructive"
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (pendingRemove) await removeMutation.mutateAsync(pendingRemove.userId)
        }}
      />

      <OrganizationOwnerTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        organizationId={organizationId}
        organizationName={org?.name ?? ''}
        currentOwnerId={org?.ownerId ?? ''}
        onChanged={invalidateMembers}
      />

      <EntityDrawer
        open={detailMember != null}
        onOpenChange={(open) => {
          if (!open) setDetailMember(null)
        }}
        title="成员详情"
        subtitle={
          detailMember
            ? `${detailMember.row.nickname || detailMember.row.userId}${org ? ` · ${org.name}` : ''}`
            : undefined
        }
        sections={detailMember ? buildMemberDrawerSections(detailMember, org) : []}
      />
    </div>
  )
}

/**
 * 成员详情 Drawer 的分区内容（ENT-FND-01 sections 消费 / ENT-ADM-01 扩展）：
 * - profile 分区：行内既有事实（只读投影，不新发请求）；来自「最近停用」
 *   快照时以服务端确认的 suspended 状态如实标注（不把停用前行伪装成 active）；
 * - relationship 分区：合同背书的关系导航（所属组织 / 用户详情 / 邀请人）。
 * 「所在群 / 频道」按成员维度的关系端点在 adm 面合同中不存在
 * （adm-org-api-contract 无按 user_id 过滤群/频道的端点）——不伪造数据，
 * 待合同落地后在同一 relationship 分区扩展。
 */
function buildMemberDrawerSections(
  detail: MemberDetail,
  org: OrganizationSummary | undefined
): EntityDrawerSection[] {
  const { row, statusNote } = detail
  const relations: EntityDrawerSection[] = [
    {
      id: 'member-relations',
      kind: 'relationship',
      title: '关系导航',
      items: [
        ...(org
          ? [
              {
                id: 'relation-organization',
                label: `所属组织：${org.name}`,
                description: '组织详情',
                href: `/organizations/${encodeURIComponent(org.id)}`,
              },
            ]
          : []),
        {
          id: 'relation-user-detail',
          label: '用户详情（平台面）',
          href: `/users/${encodeURIComponent(row.userId)}`,
        },
        ...(row.invitedBy
          ? [
              {
                id: 'relation-inviter',
                label: '邀请人详情',
                description: row.invitedBy,
                href: `/users/${encodeURIComponent(row.invitedBy)}`,
              },
            ]
          : []),
      ],
      emptyMessage: '暂无关系导航',
    },
  ]
  return [
    {
      id: 'member-facts',
      kind: 'profile',
      title: '成员事实',
      fields: [
        { label: '用户 TSID', value: row.userId, mono: true },
        { label: '昵称', value: row.nickname || '-' },
        { label: '账号', value: row.account || '-', mono: true },
        {
          label: '组织角色',
          value: row.role === 'unknown' ? 'unknown' : orgRoleLabel(row.role),
        },
        { label: '成员状态', value: statusNote ?? row.status, mono: true },
        { label: '邀请人 TSID', value: row.invitedBy || '-', mono: true },
        { label: '加入时间', value: row.joinedAt || '-', mono: true },
      ],
    },
    ...relations,
  ]
}

/**
 * 行级生命周期按钮（停用 / 移除）：owner 行不出按钮（服务端 409 镜像，
 * 由 canTargetMemberRow 在列级裁决）；平台写权限下的 admin/member 行均放行。
 * 点击需 stopPropagation——行本身可点击（打开成员详情 Drawer）。
 */
function MemberLifecycleActions(props: {
  row: OrganizationMemberRow
  onSuspend: (_row: OrganizationMemberRow) => void
  onRemove: (_row: OrganizationMemberRow) => void
}): ReactElement {
  const { row, onSuspend, onRemove } = props
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        data-testid="member-suspend-btn"
        onClick={(e) => {
          e.stopPropagation()
          onSuspend(row)
        }}
      >
        停用
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="member-remove-btn"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(row)
        }}
      >
        移除
      </Button>
    </>
  )
}

/**
 * 「最近停用」记录面板：本会话内 suspend 成功的成员集中在此，提供恢复 /
 * 移除 / 查看详情（关系 Drawer，ENT-ADM-01）入口。记录仅存在于组件 state
 * （不进 query cache / store / 日志），刷新页面即消失。
 */
function SuspendedMembersPanel(props: {
  records: SuspendedRecord[]
  canRestore: boolean
  restoring: boolean
  removing: boolean
  onRestore: (_record: SuspendedRecord) => void
  onRemove: (_record: SuspendedRecord) => void
  onShowDetail: (_record: SuspendedRecord) => void
}): ReactElement | null {
  const { records, canRestore, restoring, removing, onRestore, onRemove, onShowDetail } = props
  if (records.length === 0) return null
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
      data-testid="suspended-members-panel"
    >
      <p className="mb-1 font-medium">最近停用的成员（仅本会话可见，刷新后消失）：恢复请在此操作。</p>
      <ul className="space-y-1">
        {records.map((record) => (
          <li key={record.row.userId} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{record.row.userId}</span>
            {record.row.nickname ? <span>{record.row.nickname}</span> : null}
            <span className="text-muted-foreground">({record.row.role})</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              data-testid="suspended-detail-btn"
              onClick={() => onShowDetail(record)}
            >
              详情
            </Button>
            {canRestore ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                data-testid="member-restore-btn"
                disabled={restoring}
                onClick={() => onRestore(record)}
              >
                恢复
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              data-testid="suspended-remove-btn"
              disabled={removing}
              onClick={() => onRemove(record)}
            >
              移除
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
