import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  archiveOrganization,
  createOrganization,
  getMyOrganizations,
  restoreOrganization,
} from '../api/public'
import {
  classifyOrgError,
  canOrgWrite,
  isOrgWriteAllowed,
  orgRoleLabel,
  orgStatusLabel,
  type OrganizationSummary,
} from '../api/pureFunctions'

const READ_PERMISSION = 'workspaces:read'

type ListState = {
  page: number
  size: number
  q: string
}

/**
 * 组织列表页（ORG-14）。
 *
 * 数据面：GET /api/v1/organizations/mine（当前用户视角分页；冻结契约无 admin 侧
 * 全量查询端点，也无服务端搜索参数——本页按名称对当前页结果做客户端过滤）。
 * 权限矩阵：mutation 入口完全由服务端 member_role 事实驱动（owner/admin）；
 * 平台侧 workspaces:read 只控制页面可达性，不映射为 org 角色（ORG-A14）。
 */
export function OrganizationListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE, q: '' })

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [pendingArchive, setPendingArchive] = useState<OrganizationSummary | null>(null)
  const [pendingRestore, setPendingRestore] = useState<OrganizationSummary | null>(null)

  const query = useQuery({
    queryKey: ['organization', 'mine', state.page, state.size],
    queryFn: () => getMyOrganizations(state.page, state.size),
    enabled: readReady,
  })

  const invalidateMine = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'mine'] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail'] })
  }

  const createMutation = useMutation({
    mutationFn: () => createOrganization(createName.trim()),
    onSuccess: (org) => {
      toast.success(`组织「${org.name}」已创建（你是该组织的 Owner）`)
      setCreateOpen(false)
      setCreateName('')
      invalidateMine()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const archiveMutation = useMutation({
    mutationFn: (orgId: string) => archiveOrganization(orgId),
    onSuccess: (org) => {
      toast.success(`组织「${org.name}」已归档（幂等命令；restore 是唯一放行的恢复入口）`)
      setPendingArchive(null)
      invalidateMine()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: (orgId: string) => restoreOrganization(orgId),
    onSuccess: (org) => {
      toast.success(`组织「${org.name}」已恢复为 active`)
      setPendingRestore(null)
      invalidateMine()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  // 客户端按名称过滤（后端 mine 面无搜索参数；只过滤当前页）
  const keyword = state.q.trim().toLowerCase()
  const rows = useMemo(() => {
    const items = query.data?.items ?? []
    if (!keyword) return items
    return items.filter((item) => item.name.toLowerCase().includes(keyword) || item.id.includes(keyword))
  }, [query.data, keyword])

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
        header: '我的角色',
        cell: ({ row }) => {
          const role = row.original.memberRole
          const variantClass =
            role === 'owner'
              ? 'bg-purple-100 text-purple-800'
              : role === 'admin'
                ? 'bg-blue-100 text-blue-800'
                : role === 'member'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-muted text-muted-foreground'
          return (
            <Badge className={variantClass} data-role={role ?? 'none'}>
              {orgRoleLabel(role)}
            </Badge>
          )
        },
      },
      {
        header: '状态',
        cell: ({ row }) => <span className="font-mono text-xs">{orgStatusLabel(row.original.status)}</span>,
      },
      {
        header: 'Owner',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.ownerId || '-'}</span>,
      },
      {
        header: '创建时间',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.createdAt || '-'}</span>,
      },
      {
        header: '操作',
        cell: ({ row }) => {
          const org = row.original
          const canWrite = canOrgWrite(org.memberRole)
          if (!canWrite) {
            return <span className="text-xs text-muted-foreground">只读（{orgRoleLabel(org.memberRole)}）</span>
          }
          return (
            <div className="flex items-center gap-1">
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
            </div>
          )
        },
      },
    ],
    [openDetail]
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
        <DataTable table={table} loading={query.isLoading} emptyMessage="当前用户不是任何组织的 active 成员" />
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
        description="当前用户（active 成员）视角的组织列表与生命周期治理。写入口由服务端 member_role（Owner/Admin）事实控制；平台管理员权限不映射为组织角色。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">我的组织</CardTitle>
          <Button size="sm" data-testid="org-create-btn" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            创建组织
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="org-list-q">按名称 / ID 过滤（当前页）</Label>
            <Input
              id="org-list-q"
              value={state.q}
              onChange={(event) => setState({ q: event.target.value, page: 1 })}
              placeholder="服务端 mine 面无搜索参数，本页按名称过滤当前结果"
            />
          </div>
          {body}
          <p className="text-xs text-muted-foreground">
            数据面为 <code className="font-mono">/api/v1/organizations/mine</code>（App 面）；冻结契约未提供 admin
            侧组织全量查询端点。治理入口见 <Link className="underline" to="/organizations">详情页</Link>。
          </p>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建组织</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="org-create-name">组织名称（1-200 字符）</Label>
            <Input
              id="org-create-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="例如：示例企业"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              取消
            </Button>
            <Button
              data-testid="org-create-submit"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || createName.trim().length === 0 || createName.trim().length > 200}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingArchive != null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null)
        }}
        title={`归档组织「${pendingArchive?.name ?? ''}」`}
        description="归档是幂等命令：组织将禁新写（成员/邀请/部门/改名全部拒绝，C16 fail-closed），成员与既有事实保留；恢复只能通过 restore。确认继续？"
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
        description="restore 是 archived 态唯一放行的写入口，幂等。恢复后组织回到 active，常规治理写重新开放。"
        confirmText="确认恢复"
        loading={restoreMutation.isPending}
        onConfirm={async () => {
          if (pendingRestore) await restoreMutation.mutateAsync(pendingRestore.id)
        }}
      />
    </div>
  )
}
