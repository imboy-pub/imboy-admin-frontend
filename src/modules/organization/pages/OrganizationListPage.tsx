import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog, DataTable, DataTablePagination, EmptyState, EntityDrawer, ErrorState, PageHeader } from '@/components/shared'
import type { EntityDrawerSection } from '@/components/shared'
import { serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  archiveOrganization,
  getOrganizations,
  restoreOrganization,
} from '../api/public'
// GZAPP-08：建企走 V2 双模式（registered 复用 EADM-01；pending_phone 建待激活 Owner）
import { OrganizationCreateDialogV2 } from './OrganizationCreateDialogV2'
// CS-ADM-01：档案 Drawer 内嵌组织级客服摘要（Drawer 打开才挂载才发请求）。
import { CsSummaryPanel } from '../components/CsSummaryPanel'
import type { EntityId } from '@/types/common'
import {
  classifyOrgError,
  isOrgWriteAllowed,
  orgStatusLabel,
  type OrganizationSummary,
} from '../api/pureFunctions'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  page: number
  size: number
  q: string
}

/**
 * 组织列表页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）。
 *
 * 数据面：GET /api/adm/organizations（平台视角分页 + 服务端搜索：status /
 * keyword 命中组织名或 TSID）。权限矩阵：页面可达 = organizations:read；
 * mutation 入口 = organizations:write（adm_acl 分权，read-only 恒 403）。
 * Platform Admin 不映射 org owner/admin——member_role 不参与裁决。
 */
export function OrganizationListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE, q: '' })

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [keywordDraft, setKeywordDraft] = useState(state.q)
  const [pendingArchive, setPendingArchive] = useState<OrganizationSummary | null>(null)
  const [pendingRestore, setPendingRestore] = useState<OrganizationSummary | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // 组织档案 Drawer（T-P2-4 最小补差，ENT-ADM-04）：消费 ENT-FND-01 的
  // EntityDrawer sections 能力，只读投影行内既有事实，不新发请求。
  const [profileOrg, setProfileOrg] = useState<OrganizationSummary | null>(null)

  const handleCreated = useCallback(
    (organizationId: EntityId, workspaceId: EntityId, _created: boolean) => {
      // 上下文保持：用 EADM-06 org/ws codec 携带 org/ws，禁止手写字符串拼接。
      const qs = serializeOrgWorkspaceQuery({ org: organizationId, ws: workspaceId })
      const target = qs
        ? `/organizations/${encodeURIComponent(organizationId)}?${qs}`
        : `/organizations/${encodeURIComponent(organizationId)}`
      navigate(target, { replace: false })
    },
    [navigate]
  )

  const keyword = state.q.trim()
  const query = useQuery({
    queryKey: ['organization', 'list', state.page, state.size, keyword],
    queryFn: () => getOrganizations(state.page, state.size, 'all', keyword),
    enabled: readReady,
  })

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail'] })
  }

  const archiveMutation = useMutation({
    mutationFn: (orgId: string) => archiveOrganization(orgId),
    onSuccess: (result, orgId) => {
      toast.success(
        `组织 ${orgId} 已归档（status=${result.status}${result.changed ? '' : '，幂等重放'}；restore 是唯一放行的恢复入口）`
      )
      setPendingArchive(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: (orgId: string) => restoreOrganization(orgId),
    onSuccess: (result, orgId) => {
      toast.success(`组织 ${orgId} 已恢复为 ${result.status}`)
      setPendingRestore(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const rows = useMemo(() => query.data?.items ?? [], [query.data])

  const openDetail = useCallback(
    (org: OrganizationSummary) => {
      navigate(`/organizations/${encodeURIComponent(org.id)}`)
    },
    [navigate]
  )

  const columns = useMemo<LegacyColumnDef<OrganizationSummary>[]>(
    () => [
      {
        header: '名称',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline"
              onClick={() => openDetail(row.original)}
            >
              {row.original.name}
            </button>
            {row.original.status === 'archived' && <Badge variant="destructive">已归档</Badge>}
          </div>
        ),
      },
      {
        header: '组织 ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        header: 'Owner',
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.ownerNickname || row.original.ownerId ? (
              <>
                {row.original.ownerNickname || '-'}
                {row.original.ownerAccount ? (
                  <span className="ml-1 text-muted-foreground">({row.original.ownerAccount})</span>
                ) : null}
                {row.original.ownerId ? (
                  <span className="ml-1 font-mono text-muted-foreground">{row.original.ownerId}</span>
                ) : null}
              </>
            ) : (
              '-'
            )}
          </span>
        ),
      },
      {
        header: '成员 / Workspace',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.memberCount ?? '-'} / {row.original.workspaceCount ?? '-'}
          </span>
        ),
      },
      {
        header: '状态',
        cell: ({ row }) => <span className="font-mono text-xs">{orgStatusLabel(row.original.status)}</span>,
      },
      {
        header: '创建时间',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.createdAt || '-'}</span>,
      },
      {
        header: '操作',
        cell: ({ row }) => {
          const org = row.original
          // 档案 Drawer 为只读投影（organizations:read 门内页面即可用），
          // read-only 账号也提供；归档 / 恢复写入口仍按 canWrite 分权裁决。
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                data-testid="org-profile-btn"
                onClick={() => setProfileOrg(org)}
              >
                档案
              </Button>
              {!canWrite ? (
                <span className="text-xs text-muted-foreground">只读（无 {WRITE_PERMISSION} 权限）</span>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => openDetail(org)}>
                    治理
                  </Button>
                  {isOrgWriteAllowed(org.status, 'archive') ? (
                    <Button variant="outline" size="sm" data-testid="org-archive-btn" onClick={() => setPendingArchive(org)}>
                      归档
                    </Button>
                  ) : null}
                  {isOrgWriteAllowed(org.status, 'restore') ? (
                    <Button variant="outline" size="sm" data-testid="org-restore-btn" onClick={() => setPendingRestore(org)}>
                      恢复
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          )
        },
      },
    ],
    [openDetail, canWrite]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!readReady) {
    body = <EmptyState title="无查看权限" description={`进入组织治理面板需要 ${READ_PERMISSION} 权限。`} />
  } else if (query.error) {
    const failure = classifyOrgError(query.error)
    body = (
      <ErrorState
        message={failure.message}
        onRetry={() => void query.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={query.isLoading} emptyMessage={keyword ? '没有匹配搜索条件的组织' : '暂无组织'} />
        <DataTablePagination
          page={query.data?.page ?? state.page}
          pageSize={query.data?.size ?? state.size}
          total={query.data?.total ?? 0}
          onPageChange={(page) => setState({ page })}
          onPageSizeChange={(size) => setState({ size, page: 1 })}
          dataUpdatedAt={query.dataUpdatedAt}
          onRefresh={() => void query.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="organization-list">
      <PageHeader
        title="组织治理"
        description={`平台视角的组织列表与生命周期治理（/api/adm/organizations）。页面可达需要 ${READ_PERMISSION}；写入口需要 ${WRITE_PERMISSION}（adm_acl 分权，read-only 角色对 mutation 恒 403）。平台管理员权限不映射为组织角色。`}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">组织列表</CardTitle>
          {/*
            §9-2 合同（EADM-07）：read-only 账号「只见只读页、无写入口」。
            「无写入口」= 该入口不进 DOM，而不是渲染一个 disabled 按钮——disabled 仍是
            可见的写入口，且会被无障碍树暴露为可聚焦控件。授权真源仍是服务端
            adm_acl fail-closed（本页直调写 API 亦恒 403，见同用例断言 4），
            这里只负责「不给不该写的人看见入口」。
          */}
          {canWrite && (
            <Button
              type="button"
              size="sm"
              data-testid="org-create-entry"
              title="创建组织"
              onClick={() => setCreateOpen(true)}
            >
              创建组织
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex max-w-md items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setState({ q: keywordDraft, page: 1 })
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="org-list-q">按名称 / ID 搜索（服务端）</Label>
              <Input
                id="org-list-q"
                value={keywordDraft}
                onChange={(event) => setKeywordDraft(event.target.value)}
                placeholder="组织名或 TSID，留空列出全部"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" data-testid="org-search-submit">
              <Search className="mr-1 h-4 w-4" />
              搜索
            </Button>
          </form>
          {body}
          <p className="text-xs text-muted-foreground">
            数据面为 <code className="font-mono">/api/adm/organizations</code>（平台专用端点，adm cookie
            会话）。平台管理员可经上方「创建组织」入口新建组织（Owner 必须经用户搜索选择，禁止手填裸 TSID）；
            创建为幂等命令——同名 + 同 Owner 已有 active 组织时返回既有组织而非报错。治理详情见组织详情页。
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingArchive != null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null)
        }}
        title={`归档组织「${pendingArchive?.name ?? ''}」`}
        description="归档是幂等命令：组织将禁新写（成员/邀请/部门写全部拒绝，C16 fail-closed），成员与既有事实保留；恢复只能通过 restore。平台操作将写入 adm_operation_log 审计。确认继续？"
        confirmText="确认归档"
        variant="destructive"
        loading={archiveMutation.isPending}
        onConfirm={async () => {
          if (pendingArchive) await archiveMutation.mutateAsync(pendingArchive.id)
        }}
      />

      <ConfirmDialog
        open={pendingRestore != null}
        onOpenChange={(open) => {
          if (!open) setPendingRestore(null)
        }}
        title={`恢复组织「${pendingRestore?.name ?? ''}」`}
        description="restore 是 archived 态唯一放行的写入口，幂等。恢复后组织回到 active，常规治理写重新开放。确认恢复？"
        confirmText="确认恢复"
        loading={restoreMutation.isPending}
        onConfirm={async () => {
          if (pendingRestore) await restoreMutation.mutateAsync(pendingRestore.id)
        }}
      />

      <OrganizationCreateDialogV2
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* 组织档案 Drawer（T-P2-4 最小补差 + CS-ADM-01 客服摘要）：行内事实只读投影
          + 客服摘要（custom 分区，Drawer 打开才挂载/发请求）+ 合同背书关系导航 */}
      <EntityDrawer
        open={profileOrg != null}
        onOpenChange={(open) => {
          if (!open) setProfileOrg(null)
        }}
        title="组织档案"
        subtitle={profileOrg ? `${profileOrg.name} · ${orgStatusLabel(profileOrg.status)}` : undefined}
        sections={profileOrg ? buildOrgProfileSections(profileOrg) : []}
      />
    </div>
  )
}

/**
 * 组织档案 Drawer 分区（ENT-FND-01 sections 消费，对齐 MembersPage 模式）：
 * - profile 分区：列表行内既有事实（只读投影，不新发请求）；
 * - relationship 分区：合同背书路由的关系导航（组织详情 / 成员 / 邀请 / 部门 /
 *   Owner 用户详情——均为 App.tsx 已注册的既有 URL，不造新路由）。
 * branding/settings 键值可能含租户私有配置，档案分区不渲染取值（只投影计数事实）。
 */
function buildOrgProfileSections(org: OrganizationSummary): EntityDrawerSection[] {
  const orgBase = `/organizations/${encodeURIComponent(org.id)}`
  // CS-ADM-01：客服治理面直达（org 经共享 codec 生成，禁止手写 ?org= 拼接）。
  const csScope = serializeOrgWorkspaceQuery({ org: org.id })
  const csHref = csScope.length > 0 ? `/customer-service?${csScope}` : '/customer-service'
  return [
    {
      id: 'org-profile-facts',
      kind: 'profile',
      title: '组织档案',
      fields: [
        { label: '组织 TSID', value: org.id, mono: true },
        { label: '名称', value: org.name },
        { label: 'Owner（owner_id）', value: org.ownerId || '-', mono: true },
        {
          label: 'Owner 昵称 / 账号',
          value: `${org.ownerNickname || '-'}${org.ownerAccount ? ` (${org.ownerAccount})` : ''}`,
        },
        { label: '状态', value: orgStatusLabel(org.status), mono: true },
        { label: 'active 成员数', value: org.memberCount == null ? '-' : String(org.memberCount), mono: true },
        { label: 'Workspace 数', value: org.workspaceCount == null ? '-' : String(org.workspaceCount), mono: true },
        { label: '创建时间', value: org.createdAt || '-', mono: true },
      ],
    },
    {
      // CS-ADM-01：组织级客服摘要（custom 分区承载活数据；其余分区仍是
      // 「不新发请求」的行内只读投影——只有本分区按需取数，且仅在 Drawer
      // 打开期间挂载）。面板自带 customer_service:read 门（fail-closed）。
      id: 'org-profile-cs-summary',
      kind: 'custom',
      title: '客服摘要',
      content: <CsSummaryPanel organizationId={org.id} variant="inline" />,
    },
    {
      id: 'org-profile-relations',
      kind: 'relationship',
      title: '关系导航',
      items: [
        { id: 'relation-org-detail', label: '组织详情（事实域）', href: orgBase },
        { id: 'relation-org-members', label: '成员治理', href: `${orgBase}/members` },
        { id: 'relation-org-invitations', label: '邀请管理', href: `${orgBase}/invitations` },
        { id: 'relation-org-departments', label: '部门管理', href: `${orgBase}/departments` },
        { id: 'relation-org-cs', label: '在线客服治理面', href: csHref },
        ...(org.ownerId
          ? [{ id: 'relation-owner-user', label: 'Owner 用户详情', href: `/users/${encodeURIComponent(org.ownerId)}` }]
          : []),
      ],
      emptyMessage: '暂无关系导航',
    },
  ]
}
