import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { cn } from '@/lib/utils'
import {
  archiveOrganization,
  getDeletionPreflight,
  getDefaultWorkspace,
  getOrganizationDetail,
  restoreOrganization,
  updateOrganizationName,
} from '../api/public'
import {
  canOrgWrite,
  classifyOrgError,
  formatEpochSeconds,
  isOrgWriteAllowed,
  orgRoleLabel,
  orgStatusLabel,
} from '../api/pureFunctions'

const READ_PERMISSION = 'workspaces:read'

/**
 * 组织详情页（ORG-14）：事实域展示、默认 Workspace 指针（只读）、
 * 删除预检（用户级 C17 blocker 列表 + fail-closed 503 呈现）、危险区
 * （改名 / archive / restore，全部二次确认 + 服务端事实刷新）。
 */
export function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [editName, setEditName] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [pendingArchive, setPendingArchive] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const workspaceQuery = useQuery({
    queryKey: ['organization', 'default-workspace', organizationId],
    queryFn: () => getDefaultWorkspace(organizationId),
    enabled: readReady && organizationId.length > 0,
    retry: false,
  })

  const preflightQuery = useQuery({
    queryKey: ['organization', 'deletion-preflight'],
    queryFn: () => getDeletionPreflight(),
    enabled: readReady,
    retry: false,
    staleTime: 0,
  })

  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'mine'] })
  }

  const renameMutation = useMutation({
    mutationFn: () => updateOrganizationName(organizationId, editName.trim()),
    onSuccess: (org) => {
      toast.success(`组织已更名为「${org.name}」`)
      setEditOpen(false)
      invalidateDetail()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveOrganization(organizationId),
    onSuccess: () => {
      toast.success('组织已归档（幂等命令；写入口已 fail-closed，仅 restore 放行）')
      setPendingArchive(false)
      invalidateDetail()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: () => restoreOrganization(organizationId),
    onSuccess: () => {
      toast.success('组织已恢复为 active')
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
        <EmptyState title="加载中…" description="正在读取组织事实（仅组织成员可读详情）。" />
      </div>
    )
  }

  const canWrite = canOrgWrite(org.memberRole)
  const memberLinks = [
    { to: `/organizations/${encodeURIComponent(organizationId)}/members`, label: '成员治理' },
    { to: `/organizations/${encodeURIComponent(organizationId)}/invitations`, label: '邀请管理' },
    { to: `/organizations/${encodeURIComponent(organizationId)}/departments`, label: '部门管理' },
  ]

  return (
    <div className="space-y-4" data-page="organization-detail">
      <PageHeader
        title={`组织：${org.name}`}
        description="事实域展示 + 生命周期治理。写入口由服务端 member_role 事实控制；平台管理员权限不映射为组织角色。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">事实域（服务端真源投影）</CardTitle>
          <div className="flex items-center gap-2">
            <Badge data-role={org.memberRole ?? 'none'}>我的角色：{orgRoleLabel(org.memberRole)}</Badge>
            <Badge variant={org.status === 'active' ? 'default' : 'destructive'} data-status={org.status}>
              {orgStatusLabel(org.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <FactRow label="组织 ID" value={org.id} mono />
            <FactRow label="名称" value={org.name} />
            <FactRow label="Owner（owner_id）" value={org.ownerId || '-'} mono />
            <FactRow label="状态" value={orgStatusLabel(org.status)} mono />
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
        <CardHeader>
          <CardTitle className="text-base">治理入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {memberLinks.map((link) => (
            <Link key={link.to} to={link.to} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              {link.label}
            </Link>
          ))}
          <p className="w-full text-xs text-muted-foreground">
            成员/邀请面需要组织 Owner/Admin；部门面基线是本组织 active 成员（服务端口径）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">默认 Workspace 指针（只读）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workspaceQuery.error ? (
            <p className="text-sm text-destructive" data-testid="org-default-ws-error">
              读取失败：{getErrorMessage(workspaceQuery.error)}
            </p>
          ) : (
            <p className="font-mono text-sm" data-testid="org-default-ws-value">
              default_workspace_id = {workspaceQuery.data == null ? 'null（未设置）' : workspaceQuery.data}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            这是「指向事实」而非 workspace membership：它只告诉客户端本组织当前指到的默认
            Workspace，不产生任何成员资格或授权（Core Contract C05）。管理端只读展示，不在此变更。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">删除预检（Deletion Preflight，C17）</CardTitle>
          <Button
            variant="outline"
            size="sm"
            data-testid="org-preflight-refresh"
            onClick={() => void preflightQuery.refetch()}
          >
            重新预检
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            预检主体是<b>当前用户</b>（服务端只接收用户身份，不带组织参数）：冻结五域
            organization / workspace / enterprise_business / customer_service / agent 事实逐一实时读取，
            聚合为 blocker 列表。它是解释性证据而非最终裁决。
          </p>
          {preflightQuery.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="org-preflight-fail">
              <p className="font-medium">预检被拒绝（fail-closed）</p>
              <p className="mt-1">{classifyOrgError(preflightQuery.error).message}</p>
              <p className="mt-1 text-xs">
                依赖域事实不可用时（DEPENDENCY_FACTS_UNAVAILABLE，503），不允许继续任何删除动作；
                可点击「重新预检」重试实时读取。
              </p>
            </div>
          ) : preflightQuery.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  subject_user_id：<span className="font-mono">{preflightQuery.data.subjectUserId || '-'}</span>
                </span>
                <span>observed_at：{formatEpochSeconds(preflightQuery.data.observedAt)}</span>
                <span>
                  事实域（{preflightQuery.data.facts.length}/5）：
                  {preflightQuery.data.facts.map((f) => f.domain).join(', ') || '-'}
                </span>
              </div>
              {preflightQuery.data.blockers.length === 0 ? (
                <p className="text-sm text-green-700" data-testid="org-preflight-empty">
                  本次实时读取未发现 blocker（blockers = [] 仅代表此刻无阻塞，非永久放行）。
                </p>
              ) : (
                <div className="overflow-x-auto" data-testid="org-preflight-blockers">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-1 pr-3">blocker code</th>
                        <th className="py-1 pr-3">resource_type</th>
                        <th className="py-1 pr-3">resource_id</th>
                        <th className="py-1">organization_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preflightQuery.data.blockers.map((blocker, index) => (
                        <tr key={`${blocker.code}-${index}`} className="border-b last:border-0">
                          <td className="py-1 pr-3 font-mono">{blocker.code}</td>
                          <td className="py-1 pr-3 font-mono">{blocker.resourceType}</td>
                          <td className="py-1 pr-3 font-mono">{blocker.resourceId}</td>
                          <td className="py-1 font-mono">{blocker.organizationId ?? 'null'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">预检读取中…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">危险区（不可逆 / 高影响动作）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canWrite ? (
            <p className="text-sm text-muted-foreground">
              当前角色 {orgRoleLabel(org.memberRole)}：组织本体写（改名 / 归档 / 恢复）仅 Owner / Admin 可执行，
              本页对你是只读的。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="org-rename-input">组织名称</Label>
                  <Input
                    id="org-rename-input"
                    className="w-64"
                    value={editOpen ? editName : org.name}
                    readOnly={!editOpen}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </div>
                {editOpen ? (
                  <>
                    <Button size="sm" data-testid="org-rename-submit" onClick={() => renameMutation.mutate()} disabled={renameMutation.isPending}>
                      保存改名
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="org-rename-edit"
                    onClick={() => {
                      setEditName(org.name)
                      setEditOpen(true)
                    }}
                  >
                    改名
                  </Button>
                )}
              </div>

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
                归档 / 恢复均为幂等命令并产生审计；失败会如实报错，不会伪成功——可直接重试或刷新服务端事实。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingArchive}
        onOpenChange={setPendingArchive}
        title={`归档组织「${org.name}」`}
        description="组织归档后所有治理写入口 fail-closed（成员/邀请/部门/改名全部拒绝，409），成员与事实保留；唯一恢复途径是 restore。确认执行？"
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
