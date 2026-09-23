import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  getOrganizationDetail,
  getOrganizationMembers,
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
} from '../api/pureFunctions'
import { OrganizationOwnerTransferDialog } from './OrganizationOwnerTransferDialog'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  page: number
  size: number
}

/** 本会话内被停用（suspended）的成员记录：恢复/移除操作的唯一 UI 入口来源。 */
type SuspendedRecord = {
  userId: string
  nickname: string
  role: string
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
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [pendingSuspend, setPendingSuspend] = useState<OrganizationMemberRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState<OrganizationMemberRow | null>(null)
  const [suspendedRecords, setSuspendedRecords] = useState<SuspendedRecord[]>([])
  const [transferOpen, setTransferOpen] = useState(false)

  // 服务端事实：组织状态（archived 门禁与提示的数据源）
  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const orgStatus = org?.status ?? 'unknown'
  const archived = orgStatus === 'archived'

  const membersQuery = useQuery({
    queryKey: ['organization', 'members', organizationId, state.page, state.size],
    queryFn: () => getOrganizationMembers(organizationId, state.page, state.size),
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
        prev.some((item) => item.userId === row.userId)
          ? prev
          : [...prev, { userId: row.userId, nickname: row.nickname, role: row.role }]
      )
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: (record: SuspendedRecord) => restoreOrganizationMember(organizationId, record.userId),
    onSuccess: (result, record) => {
      toast.success(`成员 ${record.userId} 已恢复（${result.status}）`)
      setSuspendedRecords((prev) => prev.filter((item) => item.userId !== record.userId))
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const removeMutation = useMutation({
    mutationFn: (input: { row: OrganizationMemberRow | SuspendedRecord }) =>
      removeOrganizationMember(organizationId, input.row.userId),
    onSuccess: (_data, input) => {
      toast.success(
        `成员 ${input.row.userId} 已移除（removed 终态）：若仍被依赖资源引用，服务端会以 409 拒绝并要求先完成交接`
      )
      setPendingRemove(null)
      setSuspendedRecords((prev) => prev.filter((item) => item.userId !== input.row.userId))
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const rows = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])

  const columns = useMemo<LegacyColumnDef<OrganizationMemberRow>[]>(
    () => [
      {
        header: '用户 ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId}</span>,
      },
      {
        header: '昵称 / 账号',
        cell: ({ row }) => (
          <span>
            {row.original.nickname || '-'}
            {row.original.account ? <span className="ml-1 text-xs text-muted-foreground">({row.original.account})</span> : null}
          </span>
        ),
      },
      {
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
        header: '成员状态',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.status}</span>,
      },
      {
        header: '邀请人',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invitedBy || '-'}</span>,
      },
      {
        header: '加入时间',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.joinedAt || '-'}</span>,
      },
      {
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
    body = (
      <div className="space-y-3">
        {!archived ? (
          <SuspendedMembersPanel
            records={suspendedRecords}
            canRestore={canWrite}
            restoring={restoreMutation.isPending}
            removing={removeMutation.isPending}
            onRestore={(record) => restoreMutation.mutate(record)}
            onRemove={(record) => removeMutation.mutate({ row: record })}
          />
        ) : null}
        <DataTable table={table} loading={membersQuery.isLoading} emptyMessage="暂无成员" />
        <DataTablePagination
          page={membersQuery.data?.page ?? state.page}
          pageSize={membersQuery.data?.size ?? state.size}
          total={membersQuery.data?.total ?? 0}
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
        description="组织成员的生命周期治理（停用 / 恢复 / 移除）与 Owner 转移。角色只有 owner / admin / member 三档；Owner 变更只走转移流程。adm 面不提供成员角色调整。"
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
          if (pendingRemove) await removeMutation.mutateAsync({ row: pendingRemove })
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
    </div>
  )
}

/**
 * 行级生命周期按钮（停用 / 移除）：owner 行不出按钮（服务端 409 镜像，
 * 由 canTargetMemberRow 在列级裁决）；平台写权限下的 admin/member 行均放行。
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
        onClick={() => onSuspend(row)}
      >
        停用
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="member-remove-btn"
        onClick={() => onRemove(row)}
      >
        移除
      </Button>
    </>
  )
}

/**
 * 「最近停用」记录面板：本会话内 suspend 成功的成员集中在此，提供恢复 / 移除入口。
 * 记录仅存在于组件 state（不进 query cache / store / 日志），刷新页面即消失。
 */
function SuspendedMembersPanel(props: {
  records: SuspendedRecord[]
  canRestore: boolean
  restoring: boolean
  removing: boolean
  onRestore: (_record: SuspendedRecord) => void
  onRemove: (_record: SuspendedRecord) => void
}): ReactElement | null {
  const { records, canRestore, restoring, removing, onRestore, onRemove } = props
  if (records.length === 0) return null
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
      data-testid="suspended-members-panel"
    >
      <p className="mb-1 font-medium">最近停用的成员（仅本会话可见，刷新后消失）：恢复请在此操作。</p>
      <ul className="space-y-1">
        {records.map((record) => (
          <li key={record.userId} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{record.userId}</span>
            {record.nickname ? <span>{record.nickname}</span> : null}
            <span className="text-muted-foreground">({record.role})</span>
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
