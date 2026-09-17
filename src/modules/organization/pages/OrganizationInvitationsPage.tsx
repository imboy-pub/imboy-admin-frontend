import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Copy, ShieldAlert } from 'lucide-react'
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
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import {
  createOrganizationInvitation,
  getOrganizationDetail,
  listOrganizationInvitations,
  revokeOrganizationInvitation,
} from '../api/public'
import {
  canManageInvitations,
  classifyOrgError,
  formatEpochSeconds,
  invitationStatusLabel,
  redactToken,
  type InvitationCreatedReveal,
  type InvitationStatus,
  type InvitationView,
} from '../api/pureFunctions'

const READ_PERMISSION = 'workspaces:read'

type ListState = {
  status: string
  limit: number
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'revoked', label: '已撤销' },
  { value: 'expired', label: '已过期' },
]

function parseStatusFilter(value: string): InvitationStatus | undefined {
  return value === 'all'
    ? undefined
    : value === 'pending' || value === 'accepted' || value === 'rejected' || value === 'revoked' || value === 'expired'
      ? value
      : undefined
}

/**
 * 邀请管理页（ORG-14，Core Contract C11）。
 *
 * 契约：GET/POST /organizations/:id/invitations（owner/admin；limit 1..100 默认 20）；
 * POST /invitations/:invitation_id/revoke（幂等）。明文 token 只在 create 响应出现一次：
 * 本页用一次性 Dialog 展示 + 复制，关闭即丢弃，不进 query cache / store / 日志。
 * 不实现 legacy direct-add（POST /organizations/:id/members 是 C11 TRANSITION 过渡项）。
 */
export function OrganizationInvitationsPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ status: 'all', limit: 20 })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [createOpen, setCreateOpen] = useState(false)
  const [createUserId, setCreateUserId] = useState('')
  const [createExpiresInDays, setCreateExpiresInDays] = useState('')
  /** 一次性 token 展示：组件局部 state，关闭即清空（唯一持有点）。 */
  const [reveal, setReveal] = useState<InvitationCreatedReveal | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<InvitationView | null>(null)

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const myRole = org?.memberRole ?? null
  const canManage = canManageInvitations(myRole)
  const archived = org?.status === 'archived'

  const status = parseStatusFilter(state.status)
  const listQuery = useQuery({
    queryKey: ['organization', 'invitations', organizationId, state.status, state.limit],
    queryFn: () => listOrganizationInvitations(organizationId, status, state.limit),
    enabled: readReady && canManage && organizationId.length > 0 && detailQuery.isSuccess,
  })

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'invitations', organizationId] })
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const days = Number(createExpiresInDays.trim())
      const expiresAt =
        Number.isFinite(days) && days > 0 && days <= 365
          ? Math.floor(Date.now() / 1000) + Math.floor(days) * 86400
          : undefined
      return createOrganizationInvitation(organizationId, createUserId.trim(), expiresAt)
    },
    onSuccess: (result) => {
      setCreateOpen(false)
      setCreateUserId('')
      setCreateExpiresInDays('')
      setReveal(result)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeOrganizationInvitation(organizationId, invitationId),
    onSuccess: () => {
      toast.success('邀请已撤销（幂等命令；已终态时服务端返回稳定当前状态）')
      setPendingRevoke(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const copyToken = async () => {
    if (!reveal) return
    try {
      await navigator.clipboard.writeText(reveal.token)
      toast.success('token 已复制；它不会再次显示，请立即交付给被邀请人')
    } catch {
      toast.error('复制失败：请手动选中文本复制（token 关闭后不可再查看）')
    }
  }

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])

  const columns = useMemo<LegacyColumnDef<InvitationView>[]>(
    () => [
      {
        header: '邀请 ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invitationId}</span>,
      },
      {
        header: '被邀请人',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.targetUserId}</span>,
      },
      {
        header: '邀请人',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invitedBy}</span>,
      },
      {
        header: '状态',
        cell: ({ row }) => {
          const s = row.original.status
          const variantClass =
            s === 'pending'
              ? 'bg-amber-100 text-amber-800'
              : s === 'accepted'
                ? 'bg-green-100 text-green-800'
                : 'bg-muted text-muted-foreground'
          return (
            <Badge className={variantClass} data-status={s}>
              {invitationStatusLabel(s)}
            </Badge>
          )
        },
      },
      {
        header: '过期时间',
        cell: ({ row }) => <span className="font-mono text-xs">{formatEpochSeconds(row.original.expiresAt)}</span>,
      },
      {
        header: '创建时间',
        cell: ({ row }) => <span className="font-mono text-xs">{formatEpochSeconds(row.original.createdAt)}</span>,
      },
      {
        header: '操作',
        cell: ({ row }) =>
          row.original.status === 'pending' && canManage && !archived ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="invitation-revoke-btn"
              onClick={() => setPendingRevoke(row.original)}
            >
              撤销
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
    ],
    [canManage, archived]
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
    body = <EmptyState title="加载中…" description="正在读取组织事实（邀请治理裁决依据）。" />
  } else if (!canManage) {
    body = (
      <EmptyState
        title="需要组织 Owner / Admin 角色"
        description={`邀请治理仅组织 Owner/Admin 可见（服务端 403 fail-closed）。当前角色：${myRole === 'admin' ? 'Admin' : myRole === 'member' ? 'Member' : '非成员'}。`}
      />
    )
  } else if (listQuery.error) {
    body = <ErrorState message={classifyOrgError(listQuery.error).message} onRetry={() => void listQuery.refetch()} />
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={listQuery.isLoading} emptyMessage="当前过滤条件下没有邀请记录" />
        <p className="text-xs text-muted-foreground">
          列表为 limit 截断视图（当前 {rows.length} 条 / limit {state.limit}）：服务端邀请面是 limit
          分页而非页码分页；过期状态由读写路径 lazy sweep 推进。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="organization-invitations">
      <PageHeader
        title="邀请管理"
        description="邀请（invitation）与直接加人（legacy direct-add）是不同命令：本页只治理邀请——创建、一次性 token 交付、撤销。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            邀请列表
            {org ? <span className="ml-2 text-xs font-normal text-muted-foreground">{org.name}</span> : null}
          </CardTitle>
          {canManage && !archived ? (
            <Button size="sm" data-testid="invitation-create-btn" onClick={() => setCreateOpen(true)}>
              创建邀请
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {archived ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-testid="invitations-archived-hint">
              组织已归档：邀请读写被服务端拒绝（409，C16 fail-closed）。
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invitation-status-filter">状态过滤</Label>
              <Select
                id="invitation-status-filter"
                className="h-9 w-36"
                value={state.status}
                onChange={(event) => setState({ status: event.target.value })}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invitation-limit">limit（1-100）</Label>
              <Select
                id="invitation-limit"
                className="h-9 w-28"
                value={String(state.limit)}
                onChange={(event) => setState({ limit: Number(event.target.value) || 20 })}
              >
                {[20, 50, 100].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
              刷新
            </Button>
          </div>
          {body}
          <p className="text-xs text-muted-foreground">
            <Link className="underline" to={`/organizations/${encodeURIComponent(organizationId)}`}>
              返回组织详情
            </Link>
          </p>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建邀请</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invitation-target">被邀请人用户 ID（必须是已注册用户）</Label>
              <Input
                id="invitation-target"
                value={createUserId}
                inputMode="numeric"
                onChange={(event) => setCreateUserId(event.target.value)}
                placeholder="TSID，例如 1234567890123456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invitation-expiry">有效期（天，可选；留空 = 服务端默认 7 天）</Label>
              <Input
                id="invitation-expiry"
                value={createExpiresInDays}
                inputMode="numeric"
                onChange={(event) => setCreateExpiresInDays(event.target.value)}
                placeholder="例如 3（上限 365）"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              已是 active 成员的用户会被服务端以 409 拒绝（立即加人走 legacy direct-add，不是邀请）。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              取消
            </Button>
            <Button
              data-testid="invitation-create-submit"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || createUserId.trim().length === 0}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reveal != null}
        onOpenChange={(open) => {
          if (!open) setReveal(null)
        }}
      >
        <DialogContent data-testid="invitation-token-reveal">
          <DialogHeader>
            <DialogTitle>邀请已创建 — 一次性 token</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                明文 token 只在本次创建响应出现一次：服务端只存 digest，关闭本窗口后任何界面（包括本页）都无法再次查看。
                请立即复制并交付给被邀请人。
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invitation-token-value">token（一次性）</Label>
              <Input id="invitation-token-value" readOnly value={reveal?.token ?? ''} className="font-mono text-xs" />
            </div>
            <p className="text-xs text-muted-foreground">
              邀请 ID：<span className="font-mono">{reveal?.view.invitationId ?? '-'}</span>；
              过期时间：{formatEpochSeconds(reveal?.view.expiresAt ?? null)}。日志与列表中只会出现
              <span className="font-mono"> {redactToken(reveal?.token ?? '')} </span>形态的打码占位。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" data-testid="invitation-token-copy" onClick={() => void copyToken()}>
              <Copy className="mr-1 h-4 w-4" />
              复制 token
            </Button>
            <Button data-testid="invitation-token-close" onClick={() => setReveal(null)}>
              我已保存，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRevoke != null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null)
        }}
        title={`撤销邀请 ${pendingRevoke?.invitationId ?? ''}`}
        description="撤销后被邀请人将无法接受该邀请（幂等：已终态时返回稳定当前状态，不重复审计）。确认撤销？"
        confirmText="确认撤销"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={async () => {
          if (pendingRevoke) await revokeMutation.mutateAsync(pendingRevoke.invitationId)
        }}
      />
    </div>
  )
}
