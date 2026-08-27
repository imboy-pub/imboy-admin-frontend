import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye, Archive, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
  ConfirmDialog,
  FilterBar,
} from '@/components/shared'
import {
  getWorkspaceListPayload,
  archiveWorkspace,
  restoreWorkspace,
  workspaceListQueryKey,
  type WorkspaceAdminRow,
} from '@/services/api/workspaces'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'
import { getErrorMessage } from '@/lib/errorUtils'
import { formatDate } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { LegacyColumnDef, useLegacyTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table/legacy'
import { SortingState } from '@tanstack/react-table'

type WorkspaceListPageQuery = {
  page: number
  size: number
  status: string
  keyword: string
}

/**
 * 工作区运营管理列表（双体验 v2.5.2 WP7/T11b）
 * DataTablePagination 默认 size:10；归档/恢复必须二次确认。
 * 归档后 workspace 业务写被后端 T7 守卫以稳定错误码 980 拒绝（读保留）。
 */
export function WorkspaceListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<WorkspaceListPageQuery>({
    page: 1,
    size: 10,
    status: 'all',
    keyword: '',
  })
  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(params.status)
  const [sorting, setSorting] = useState<SortingState>([])
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    row: WorkspaceAdminRow
    action: 'archive' | 'restore'
  } | null>(null)

  const requestParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: workspaceListQueryKey(requestParams),
    queryFn: () => getWorkspaceListPayload(requestParams),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspaces'] })
  }

  const archiveMutation = useMutation({
    mutationFn: archiveWorkspace,
    onSuccess: () => {
      toast.success('工作区已归档（读保留，业务写被拒绝）')
      setConfirmDialog(null)
      invalidate()
    },
    onError: (err: unknown) => toast.error(`归档失败: ${getErrorMessage(err)}`),
  })

  const restoreMutation = useMutation({
    mutationFn: restoreWorkspace,
    onSuccess: () => {
      toast.success('工作区已恢复')
      setConfirmDialog(null)
      invalidate()
    },
    onError: (err: unknown) => toast.error(`恢复失败: ${getErrorMessage(err)}`),
  })

  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'workspace_list',
      keyword: searchKeyword.trim(),
      status: statusFilter,
    })
    setParams({ page: 1, keyword: searchKeyword.trim(), status: statusFilter })
  }

  const handleReset = () => {
    setSearchKeyword('')
    setStatusFilter('all')
    resetParams({ page: 1, size: 10, status: 'all', keyword: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: LegacyColumnDef<WorkspaceAdminRow>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'owner',
      header: '主 Owner',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.owner_nickname || row.original.owner_account || '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.owner_id}</div>
        </div>
      ),
    },
    {
      id: 'resources',
      header: '资源（P/G/C/M）',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-sm" title="项目 / 群组 / 频道 / 工作区成员">
          {row.original.project_count} / {row.original.group_count} / {row.original.channel_count} / {row.original.member_count}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ active: '正常', archived: '已归档' }}
          variants={{ active: 'success', archived: 'warning' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/workspaces/${row.original.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.original.status === 'active' ? (
            <Button
              variant="ghost"
              size="icon"
              title="归档工作区"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmDialog({ open: true, row: row.original, action: 'archive' })
              }}
            >
              <Archive className="h-4 w-4 text-destructive" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              title="恢复工作区"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmDialog({ open: true, row: row.original, action: 'restore' })
              }}
            >
              <ArchiveRestore className="h-4 w-4 text-green-600" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const rows = data?.items || []

  const table = useLegacyTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载工作区数据..." />
  }

  if (error) {
    return <ErrorState message="加载工作区数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="工作区管理"
        description="运营视角管理工作区：查看归属资源、工作区成员与生命周期（归档/恢复）"
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索工作区名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="active">正常</option>
              <option value="archived">已归档</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => navigate(`/workspaces/${row.id}`)} />

          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      {/* 归档/恢复二次确认 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog(open ? confirmDialog : null)}
          title={confirmDialog.action === 'archive' ? '确认归档工作区' : '确认恢复工作区'}
          description={
            confirmDialog.action === 'archive'
              ? `确定要归档工作区「${confirmDialog.row.name}」吗？归档后工作区内全部业务写操作将被拒绝（错误码 980），历史数据仍可读取；可通过"恢复"撤销。`
              : `确定要恢复工作区「${confirmDialog.row.name}」吗？恢复后工作区内业务写操作将重新放行。`
          }
          confirmText={confirmDialog.action === 'archive' ? '归档' : '恢复'}
          variant={confirmDialog.action === 'archive' ? 'destructive' : 'default'}
          loading={archiveMutation.isPending || restoreMutation.isPending}
          onConfirm={() => {
            const id = confirmDialog.row.id
            if (confirmDialog.action === 'archive') {
              archiveMutation.mutate(id)
            } else {
              restoreMutation.mutate(id)
            }
          }}
        />
      )}
    </div>
  )
}
