import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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
  changeMemberRole,
  getOrganizationDetail,
  getOrganizationMembers,
  removeOrganizationMember,
  transferOrganizationOwner,
} from '../api/public'
import {
  canManageAdminRole,
  canOrgWrite,
  canTransferOwner,
  canViewMembers,
  classifyOrgError,
  isOrgWriteAllowed,
  orgRoleLabel,
  type OrganizationMemberRow,
} from '../api/pureFunctions'

const READ_PERMISSION = 'workspaces:read'

type ListState = {
  page: number
  size: number
}

/**
 * 成员治理页（ORG-14）。
 *
 * 契约：GET 成员列表（owner/admin）；PUT role（仅 admin|member，Owner 走转移流程）；
 * DELETE member（Owner 不可移除；移除 admin 需主 Owner）；POST transfer_owner（主 Owner 专属）。
 * 契约缺口（BLOCKED_MISSING_ENDPOINT）：App organization 面未暴露 membership
 * suspend / restore / offboard 端点（logic 层有 suspend/3 但无 HTTP 面；enterprise 面的
 * members/:uid/suspend 属 Enterprise Business 模块，不在本模块调用范围），本页不发明端点。
 */
export function OrganizationMembersPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [roleDraft, setRoleDraft] = useState<{ row: OrganizationMemberRow; role: 'admin' | 'member' } | null>(null)
  const [pendingRemove, setPendingRemove] = useState<OrganizationMemberRow | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')

  // 服务端事实：组织状态 + 我的 member_role（权限矩阵数据源）
  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const myRole = org?.memberRole ?? null
  const orgStatus = org?.status ?? 'unknown'
  const canList = canViewMembers(myRole)
  const archived = orgStatus === 'archived'

  const membersQuery = useQuery({
    queryKey: ['organization', 'members', organizationId, state.page, state.size],
    queryFn: () => getOrganizationMembers(organizationId, state.page, state.size),
    enabled: readReady && canList && organizationId.length > 0 && detailQuery.isSuccess,
  })

  const invalidateMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'members', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail', organizationId] })
  }

  const roleMutation = useMutation({
    mutationFn: (input: { row: OrganizationMemberRow; role: 'admin' | 'member' }) =>
      changeMemberRole(organizationId, input.row.userId, input.role),
    onSuccess: (_data, input) => {
      toast.success(`成员 ${input.row.userId} 角色已调整为 ${input.role}`)
      setRoleDraft(null)
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const removeMutation = useMutation({
    mutationFn: (row: OrganizationMemberRow) => removeOrganizationMember(organizationId, row.userId),
    onSuccess: (_data, row) => {
      toast.success(`成员 ${row.userId} 已移除（若仍被依赖资源引用，服务端会以 409 拒绝并说明）`)
      setPendingRemove(null)
      invalidateMembers()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const transferMutation = useMutation({
    mutationFn: (userId: string) => transferOrganizationOwner(organizationId, userId),
    onSuccess: () => {
      toast.success('Owner 已转移（单事务：旧 Owner 降级为 admin，新 Owner 升级，owner_id 投影同步）')
      setTransferOpen(false)
      setTransferTarget('')
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
          if (!canOrgWrite(myRole) || archived) {
            return <span className="text-xs text-muted-foreground">-</span>
          }
          const isOwnerRow = row.original.role === 'owner'
          const isAdminRow = row.original.role === 'admin'
          return (
            <div className="flex items-center gap-1">
              {isOwnerRow ? (
                <span className="text-xs text-muted-foreground">主 Owner 不可经角色接口修改</span>
              ) : (
                <Select
                  aria-label={`调整成员 ${row.original.userId} 角色`}
                  className="h-8 w-28 text-xs"
                  value={row.original.role === 'admin' ? 'admin' : 'member'}
                  disabled={isAdminRow && !canManageAdminRole(myRole)}
                  onChange={(event) => {
                    const next = event.target.value === 'admin' ? 'admin' : 'member'
                    if (next !== (row.original.role === 'admin' ? 'admin' : 'member')) {
                      setRoleDraft({ row: row.original, role: next })
                    }
                  }}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </Select>
              )}
              {isOwnerRow ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="member-remove-btn"
                  disabled={isAdminRow && !canManageAdminRole(myRole)}
                  onClick={() => setPendingRemove(row.original)}
                >
                  移除
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [myRole, archived]
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
    body = <EmptyState title="加载中…" description="正在读取组织事实（成员资格裁决依据）。" />
  } else if (!canList) {
    body = (
      <EmptyState
        title="需要组织 Owner / Admin 角色"
        description={`成员列表仅组织 Owner/Admin 可见（服务端 403 fail-closed）。当前角色：${orgRoleLabel(myRole)}。`}
      />
    )
  } else if (membersQuery.error) {
    body = <ErrorState message={classifyOrgError(membersQuery.error).message} onRetry={() => void membersQuery.refetch()} />
  } else {
    body = (
      <div className="space-y-3">
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
        description="组织成员的角色治理与离场。角色只有 owner / admin / member 三档（无万能角色 UI）；Owner 变更只走转移流程。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            成员列表
            {org ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {org.name} · 我的角色 {orgRoleLabel(myRole)} · 组织 {orgStatusLabelSafe(orgStatus)}
              </span>
            ) : null}
          </CardTitle>
          {canTransferOwner(myRole) && isOrgWriteAllowed(orgStatus, 'update') ? (
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
            契约缺口：membership suspend / restore / offboard 端点未在冻结契约的 organization App
            面暴露，本页不提供对应入口（不发明端点）。角色调整对 admin 档需要主 Owner；admin 成员的移除同样需要主 Owner。
          </p>
          <p className="text-xs text-muted-foreground">
            <Link className="underline" to={`/organizations/${encodeURIComponent(organizationId)}`}>
              返回组织详情
            </Link>
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={roleDraft != null}
        onOpenChange={(open) => {
          if (!open) setRoleDraft(null)
        }}
        title={`调整成员 ${roleDraft?.row.userId ?? ''} 的角色`}
        description={
          roleDraft?.role === 'admin'
            ? '授予 admin 将允许该成员参与组织治理（成员/邀请/部门/生命周期写）。授予 admin 角色需要主 Owner。确认继续？'
            : '把该成员降级为 member（普通成员，仅保留成员资格）。确认继续？'
        }
        confirmText="确认调整"
        loading={roleMutation.isPending}
        onConfirm={async () => {
          if (roleDraft) await roleMutation.mutateAsync(roleDraft)
        }}
      />

      <ConfirmDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        title={`移除成员 ${pendingRemove?.userId ?? ''}`}
        description="移除是治理写：若该成员仍被依赖资源引用（如 active 经办关系），服务端会以 409 拒绝并要求先完成交接——失败会如实呈现，可重试。确认移除？"
        confirmText="确认移除"
        variant="destructive"
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (pendingRemove) await removeMutation.mutateAsync(pendingRemove)
        }}
      />

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转移组织 Owner（危险动作）</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            单事务执行：当前主 Owner 降级为 admin，目标成员升级为 Owner，organization.owner_id 投影同步更新。
            该动作影响组织控制权归属，请确认目标用户 ID。
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-target-input">新 Owner 用户 ID（必填）</Label>
            <Input
              id="transfer-target-input"
              value={transferTarget}
              inputMode="numeric"
              onChange={(event) => setTransferTarget(event.target.value)}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferMutation.isPending}>
              取消
            </Button>
            <Button
              variant="destructive"
              data-testid="transfer-owner-submit"
              disabled={transferMutation.isPending || transferTarget.trim().length === 0}
              onClick={() => transferMutation.mutate(transferTarget.trim())}
            >
              确认转移
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function orgStatusLabelSafe(status: string): string {
  return status === 'active' || status === 'archived' ? status : 'unknown'
}
