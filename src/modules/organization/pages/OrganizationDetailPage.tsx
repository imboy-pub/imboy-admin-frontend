import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { parseOrgWorkspaceQuery, serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { cn } from '@/lib/utils'
import {
  archiveOrganization,
  getOrganizationDetail,
  listOrganizationWorkspaces,
  restoreOrganization,
} from '../api/public'
import {
  classifyOrgError,
  isOrgWriteAllowed,
  orgStatusLabel,
} from '../api/pureFunctions'
import { OrganizationOwnerTransferDialog } from './OrganizationOwnerTransferDialog'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

/** 只读端点分页上限（后端 admin_workspace_page 将 size 收敛到 min(Size,100)）。 */
const WORKSPACE_PAGE_SIZE = 100

/**
 * 默认 Workspace 的**成立事实**来源说明（不得编造，故写明依据）。
 *
 * 平台面**没有**任何只读端点投影「是否默认」标记：
 *   - `GET /api/adm/organizations/:id/workspaces` 的 SQL 只选取
 *     id/name/owner_id/organization_id/status/created_at/updated_at
 *     （后端 `src/logic/organization_admin_logic.erl:288`）；
 *   - `GET /api/adm/organizations/:id`（detail）投影同样不含 default_workspace_id
 *     （同文件 `:160`）。
 * 默认指针只出现在 `POST /api/adm/organizations` 的**创建响应**里
 * （`src/adm/adm_organization_handler.erl:859`，`default_workspace` 字段）。
 *
 * 因此本页把 URL 的 `ws` 参数（创建成功跳转 / 分享链接所携带，源自该创建响应）
 * 作为默认 Workspace 的成立事实，并用只读端点解析其名称与状态；
 * 拿不到 `ws` 时**如实降级**为组织工作区列表 + 依据说明，绝不推导、绝不编造。
 */
const DEFAULT_WORKSPACE_EVIDENCE =
  '依据：平台面只读端点不投影「是否默认」标记（workspaces 投影仅 id/name/owner_id/organization_id/status/created_at/updated_at；detail 无 default_workspace_id），默认指针仅由创建响应 POST /api/adm/organizations 的 default_workspace 返回。故此处以 URL 的 ws 参数（创建成功跳转携带）为成立事实，名称与状态由只读端点解析；不做任何 ID 推导。'

/**
 * 组织详情页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）：事实域展示 +
 * 默认 Workspace 只读事实 + 跨面直达入口（携带 org/ws 上下文）+
 * 危险区（archive / restore，二次确认 + 服务端事实刷新）。
 *
 * 平台面合同未提供：组织改名（PATCH）、删除预检（deletion-preflight）、
 * 默认 Workspace 指针（default-workspace）的读端点——相应**写**面板已随 App 面迁移移除；
 * Workspace 关系事实的只读端点（/workspaces）在本页已接入 UI 旅程。
 */
export function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [pendingArchive, setPendingArchive] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(false)
  const [ownerTransferOpen, setOwnerTransferOpen] = useState(false)

  // 默认 Workspace 上下文：只经共享 codec 读写，禁止手写字符串拼接。
  const scopedContext = parseOrgWorkspaceQuery(searchParams)
  const defaultWorkspaceId = scopedContext.ws

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const workspacesQuery = useQuery({
    queryKey: ['organization', 'workspaces', organizationId, WORKSPACE_PAGE_SIZE],
    queryFn: () => listOrganizationWorkspaces(organizationId, 1, WORKSPACE_PAGE_SIZE),
    enabled: readReady && organizationId.length > 0,
  })

  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'list'] })
    // Owner 转移后成员行角色同步变化（旧 owner→admin / 新 owner）；archive/restore
    // 时成员页头部也展示组织状态，一并失效无害且正确。
    void queryClient.invalidateQueries({ queryKey: ['organization', 'members', organizationId] })
  }

  const archiveMutation = useMutation({
    mutationFn: () => archiveOrganization(organizationId),
    onSuccess: (result) => {
      toast.success(
        `组织已归档（status=${result.status}${result.changed ? '' : '，幂等重放'}；写入口已 fail-closed，仅 restore 放行）`
      )
      setPendingArchive(false)
      invalidateDetail()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: () => restoreOrganization(organizationId),
    onSuccess: (result) => {
      toast.success(`组织已恢复为 ${result.status}`)
      setPendingRestore(false)
      invalidateDetail()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  if (!readReady) {
    return (
      <div className="space-y-4" data-page="organization-detail">
        <PageHeader title="组织详情" description="Organization 治理事实域" />
        <EmptyState title="无查看权限" description={`进入组织治理面板需要 ${READ_PERMISSION} 权限。`} />
      </div>
    )
  }

  if (detailQuery.error) {
    const failure = classifyOrgError(detailQuery.error)
    return (
      <div className="space-y-4" data-page="organization-detail">
        <PageHeader title="组织详情" description="Organization 治理事实域" />
        <ErrorState
          message={failure.message}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    )
  }

  const org = detailQuery.data
  if (!org) {
    return (
      <div className="space-y-4" data-page="organization-detail">
        <PageHeader title="组织详情" description="Organization 治理事实域" />
        <EmptyState title="加载中…" description="正在读取组织事实。" />
      </div>
    )
  }

  const memberLinks = [
    { to: `/organizations/${encodeURIComponent(organizationId)}/members`, label: '成员治理' },
    { to: `/organizations/${encodeURIComponent(organizationId)}/invitations`, label: '邀请管理' },
    { to: `/organizations/${encodeURIComponent(organizationId)}/departments`, label: '部门管理' },
  ]

  // -------------------------------------------------------------------------
  // 默认 Workspace：只读事实解析（名称 + 状态），来源 = URL 的 ws 成立事实
  // -------------------------------------------------------------------------
  const workspaces = workspacesQuery.data?.items ?? []
  const defaultWorkspace = defaultWorkspaceId
    ? workspaces.find((item) => item.id === defaultWorkspaceId) ?? null
    : null
  const workspaceFactsLoading = workspacesQuery.isLoading
  const workspaceFactsFailed = workspacesQuery.isError

  // -------------------------------------------------------------------------
  // 跨面直达入口：查询串统一经共享 codec 生成（org/ws），禁止手写拼接
  // -------------------------------------------------------------------------
  const scopedSearch = serializeOrgWorkspaceQuery({ org: organizationId, ws: defaultWorkspaceId })
  const withScope = (path: string) => (scopedSearch.length > 0 ? `${path}?${scopedSearch}` : path)

  const directLinks = [
    { to: withScope('/customer-service'), label: '在线客服', testId: 'org-link-customer-service' },
    { to: withScope('/enterprise-business'), label: '企业业务', testId: 'org-link-enterprise-business' },
    {
      to: withScope(`/organizations/${encodeURIComponent(organizationId)}/members`),
      label: '成员',
      testId: 'org-link-members',
    },
    {
      to: withScope(`/organizations/${encodeURIComponent(organizationId)}/departments`),
      label: '部门',
      testId: 'org-link-departments',
    },
  ]

  // 「默认 Workspace」直达：只有在拿到 ws 成立事实时才提供入口（不造假按钮）。
  const defaultWorkspaceLink = defaultWorkspaceId
    ? { to: withScope('/enterprise-business'), label: '默认 Workspace', testId: 'org-link-default-workspace' }
    : null

  return (
    <div className="space-y-4" data-page="organization-detail">
      <PageHeader
        title={`组织：${org.name}`}
        description={`事实域展示 + 生命周期治理（/api/adm/organizations）。写入口需要 ${WRITE_PERMISSION}（adm_acl 分权）；平台管理员权限不映射为组织角色。`}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">事实域（服务端真源投影）</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={org.status === 'active' ? 'default' : 'destructive'} data-status={org.status}>
              {orgStatusLabel(org.status)}
            </Badge>
            {canWrite && isOrgWriteAllowed(org.status, 'update') && org.ownerId ? (
              <Button variant="outline" size="sm" data-testid="org-owner-change-btn" onClick={() => setOwnerTransferOpen(true)}>
                修改 Owner
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <FactRow label="组织 ID" value={org.id} mono />
            <FactRow label="名称" value={org.name} />
            <FactRow label="Owner（owner_id）" value={org.ownerId || '-'} mono />
            <FactRow
              label="Owner 昵称 / 账号"
              value={`${org.ownerNickname || '-'}${org.ownerAccount ? ` (${org.ownerAccount})` : ''}`}
            />
            <FactRow label="状态" value={orgStatusLabel(org.status)} mono />
            <FactRow label="active 成员数" value={org.memberCount == null ? '-' : String(org.memberCount)} mono />
            <FactRow label="Workspace 数" value={org.workspaceCount == null ? '-' : String(org.workspaceCount)} mono />
            <FactRow label="创建时间" value={org.createdAt || '-'} mono />
            <FactRow label="更新时间" value={org.updatedAt || '-'} mono />
            <FactRow
              label="branding 已配置键（仅键名）"
              value={org.brandingKeys.length > 0 ? org.brandingKeys.join(', ') : '（空）'}
              mono
            />
            <FactRow
              label="settings 已配置键（仅键名）"
              value={org.settingsKeys.length > 0 ? org.settingsKeys.join(', ') : '（空）'}
              mono
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            branding/settings 只展示键名白名单：取值可能含租户私有配置，本面板不渲染其内容。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">默认 Workspace（只读事实）</CardTitle>
          <Badge variant={defaultWorkspaceId ? 'secondary' : 'outline'} data-testid="org-default-workspace-source">
            {defaultWorkspaceId ? '来源：URL 上下文（创建响应携带）' : '来源：不可得，已如实降级'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3" data-testid="org-default-workspace">
            {defaultWorkspaceId ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">默认 Workspace</span>
                <span className="font-medium" data-testid="org-default-workspace-name">
                  {defaultWorkspace
                    ? defaultWorkspace.name || '-'
                    : workspaceFactsLoading
                      ? '（解析中…）'
                      : '（该 ws 不在本组织工作区分页内）'}
                </span>
                {defaultWorkspace ? (
                  <Badge
                    variant={defaultWorkspace.status === 'active' ? 'default' : 'secondary'}
                    data-testid="org-default-workspace-status"
                  >
                    {defaultWorkspace.status}
                  </Badge>
                ) : null}
                <span className="font-mono text-xs text-muted-foreground" data-testid="org-default-workspace-id">
                  {defaultWorkspaceId}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="org-default-workspace-degraded">
                本页 URL 未携带 <span className="font-mono">ws</span> 上下文，无法确证默认 Workspace
                指针（从创建流程进入或使用带 ws 的分享链接时才有该事实）。下方列出本组织的全部
                Workspace 关系事实，供人工核对；本面板不推导「哪个是默认」。
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{DEFAULT_WORKSPACE_EVIDENCE}</p>
          </div>

          <div data-testid="org-workspace-facts">
            {workspaceFactsLoading ? (
              <p className="text-sm text-muted-foreground">正在读取组织 Workspace 事实…</p>
            ) : workspaceFactsFailed ? (
              <p className="text-sm text-destructive">
                Workspace 事实读取失败：{classifyOrgError(workspacesQuery.error).message}
              </p>
            ) : workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">该组织下暂无 Workspace 关系事实（只读端点返回空）。</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {workspaces.map((workspace) => (
                  <li
                    key={workspace.id}
                    data-testid="org-workspace-row"
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5"
                  >
                    <span className="font-medium" data-testid="org-workspace-row-name">
                      {workspace.name || '-'}
                    </span>
                    <Badge
                      variant={workspace.status === 'active' ? 'default' : 'secondary'}
                      data-testid="org-workspace-row-status"
                    >
                      {workspace.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{workspace.id}</span>
                    {workspace.id === defaultWorkspaceId ? (
                      <Badge variant="outline" data-testid="org-workspace-row-is-default">
                        默认（URL 上下文）
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            共 {workspacesQuery.data?.total ?? workspaces.length} 个 Workspace（只读端点
            GET /api/adm/organizations/:id/workspaces 分页，最多取 {WORKSPACE_PAGE_SIZE} 条）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">跨面直达（携带 org/ws 上下文）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2" data-testid="org-direct-links">
            {[...directLinks, ...(defaultWorkspaceLink ? [defaultWorkspaceLink] : [])].map((link) => (
              <Link
                key={link.testId}
                to={link.to}
                data-testid={link.testId}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            org/ws 查询参数由共享 codec 生成（{''}
            <span className="font-mono">parseOrgWorkspaceQuery / serializeOrgWorkspaceQuery</span>），
            无 ws 成立事实时如实省略该参数，不做推导。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">治理入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {memberLinks.map((link) => (
            <Link
              key={link.to}
              to={withScope(link.to)}
              data-testid={`org-link-${link.label}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              {link.label}
            </Link>
          ))}
          <p className="w-full text-xs text-muted-foreground">
            成员 / 邀请 / 部门子面板同属平台面：读需要 {READ_PERMISSION}，写需要 {WRITE_PERMISSION}。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">危险区（不可逆 / 高影响动作）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canWrite ? (
            <p className="text-sm text-muted-foreground">
              当前管理员无 {WRITE_PERMISSION} 权限：组织 lifecycle 写（归档 / 恢复）对本账号只读
              （adm_acl read-only 对 mutation 恒 403）。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {isOrgWriteAllowed(org.status, 'archive') ? (
                  <Button variant="destructive" size="sm" data-testid="org-archive-btn" onClick={() => setPendingArchive(true)}>
                    归档组织
                  </Button>
                ) : null}
                {isOrgWriteAllowed(org.status, 'restore') ? (
                  <Button variant="outline" size="sm" data-testid="org-restore-btn" onClick={() => setPendingRestore(true)}>
                    恢复组织
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                归档 / 恢复均为幂等命令并写入平台审计（adm_operation_log）；失败会如实报错，不会伪成功——可直接重试或刷新服务端事实。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingArchive}
        onOpenChange={setPendingArchive}
        title={`归档组织「${org.name}」`}
        description="组织归档后所有治理写入口 fail-closed（成员/邀请/部门写全部拒绝，409），成员与事实保留；唯一恢复途径是 restore。确认执行？"
        confirmText="确认归档"
        variant="destructive"
        loading={archiveMutation.isPending}
        onConfirm={async () => {
          await archiveMutation.mutateAsync()
        }}
      />

      <ConfirmDialog
        open={pendingRestore}
        onOpenChange={setPendingRestore}
        title={`恢复组织「${org.name}」`}
        description="restore 是 archived 态唯一放行的写入口（幂等）。恢复后常规治理写重新开放。"
        confirmText="确认恢复"
        loading={restoreMutation.isPending}
        onConfirm={async () => {
          await restoreMutation.mutateAsync()
        }}
      />

      <OrganizationOwnerTransferDialog
        open={ownerTransferOpen}
        onOpenChange={setOwnerTransferOpen}
        organizationId={organizationId}
        organizationName={org.name}
        currentOwnerId={org.ownerId}
        onChanged={invalidateDetail}
      />
    </div>
  )
}

function FactRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs' : 'break-all'}>{value}</dd>
    </div>
  )
}
