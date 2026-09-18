import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { cn } from '@/lib/utils'
import {
  archiveOrganization,
  getOrganizationDetail,
  restoreOrganization,
} from '../api/public'
import {
  classifyOrgError,
  isOrgWriteAllowed,
  orgStatusLabel,
} from '../api/pureFunctions'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

/**
 * 组织详情页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）：事实域展示 +
 * 危险区（archive / restore，二次确认 + 服务端事实刷新）。
 *
 * 平台面合同未提供：组织改名（PATCH）、删除预检（deletion-preflight）、
 * 默认 Workspace 指针（default-workspace）——相应面板已随 App 面迁移移除；
 * Workspace 关系事实有只读端点（/workspaces），暂无 UI 旅程。
 */
export function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [pendingArchive, setPendingArchive] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'list'] })
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
