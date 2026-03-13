import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, DataTable, DataTablePagination, ConfirmDialog, FilterBar, BatchActionBar } from '@/components/shared'
import { getGroupListPayload, dissolveGroup, GroupListParams } from '@/services/api/groups'
import { Group } from '@/types/group'
import { formatDate } from '@/lib/utils'
import { ColumnDef, RowSelectionState, useReactTable, getCoreRowModel } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'

type GroupListPageQuery = {
  page: number
  size: number
  status: number
  keyword: string
}

export function GroupListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<GroupListPageQuery>({
    page: 1,
    size: 10,
    status: -1,
    keyword: '',
  })
  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    gid: string | number
    title: string
  } | null>(null)

  const requestParams: GroupListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
  }

  // 获取群组列表
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['groups', requestParams],
    queryFn: () => getGroupListPayload(requestParams),
  })

  // 解散群组
  const dissolveMutation = useMutation({
    mutationFn: dissolveGroup,
    onSuccess: () => {
      toast.success('群组已解散')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setConfirmDialog(null)
    },
    onError: (error: Error) => {
      toast.error(`解散失败: ${error.message}`)
    },
  })

  const batchDissolveMutation = useMutation({
    mutationFn: async ({ gids }: { gids: Array<string | number> }) =>
      Promise.allSettled(gids.map((gid) => dissolveGroup(gid))),
    onSuccess: (results) => {
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`批量解散完成：成功 ${successCount} 个群组`)
      }
      if (failedCount > 0) {
        toast.error(`批量解散失败：${failedCount} 个群组`)
      }

      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setRowSelection({})
    },
    onError: (error: Error) => {
      toast.error(`批量解散失败: ${error.message}`)
    },
  })

  // 搜索处理
  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'group_list',
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
    setRowSelection({})
    setParams({
      page: 1,
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
    setRowSelection({})
    setSearchKeyword('')
    setStatusFilter('-1')
    resetParams({
      page: 1,
      size: 10,
      status: -1,
      keyword: '',
    })
  }

  // 分页处理
  const handlePageChange = (page: number) => {
    setRowSelection({})
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setRowSelection({})
    setParams({ page: 1, size })
  }

  // 表格列定义
  const columns: ColumnDef<Group>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选当前页群组"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择群组 ${row.original.id}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle disabled:opacity-40"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'title',
      header: '群名称',
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: 'owner_uid',
      header: '群主 ID',
      cell: ({ row }) => <span className="font-mono">{row.original.owner_uid}</span>,
    },
    {
      accessorKey: 'member_count',
      header: '成员数',
      cell: ({ row }) => (
        <span className="font-mono">{row.original.member_count || 0}</span>
      ),
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.type}
          labels={{ 1: '普通群', 2: '私有群' }}
          variants={{ 1: 'info', 2: 'warning' }}
        />
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '已解散' }}
          variants={{ 1: 'success', 0: 'error' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/groups/${row.original.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.original.status === 1 && (
            <Button
              variant="ghost"
              size="icon"
              title="解散群组"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmDialog({
                  open: true,
                  gid: row.original.id,
                  title: row.original.title,
                })
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const groups = data?.items || []
  const pagination = data

  const table = useReactTable({
    data: groups,
    columns,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => row.original.status === 1,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedGroups = table.getSelectedRowModel().rows.map((row) => row.original)
  const selectedGroupIds = selectedGroups
    .map((item) => item.id)

  if (isLoading) {
    return <LoadingState message="加载群组数据..." />
  }

  if (error) {
    return <ErrorState message="加载群组数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群组管理"
        description="管理系统群组"
      />

      <Card>
        <CardHeader>
          <FilterBar
            onSearch={handleSearch}
            onReset={handleReset}
          >
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索群名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="1">正常</option>
              <option value="0">已解散</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <BatchActionBar
            selectedCount={selectedGroups.length}
            onClear={() => setRowSelection({})}
            actions={[
              {
                key: 'batch-dissolve',
                label: '批量解散',
                variant: 'destructive',
                permission: 'groups:delete',
                roles: [1, 2],
                riskLevel: 'high',
                confirmKeyword: 'DISSOLVE',
                description: `将解散 ${selectedGroupIds.length} 个群组，此操作不可恢复。`,
                disabled: selectedGroupIds.length === 0,
                loading: batchDissolveMutation.isPending,
                onExecute: async () => {
                  if (selectedGroupIds.length === 0) {
                    toast.error('当前没有可解散群组')
                    return
                  }
                  await batchDissolveMutation.mutateAsync({
                    gids: selectedGroupIds,
                  })
                },
              },
            ]}
          />

          <DataTable
            table={table}
            onRowClick={(row) => navigate(`/groups/${row.id}`)}
          />

          {pagination && (
            <DataTablePagination
              page={pagination.page}
              pageSize={pagination.size}
              total={pagination.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      {/* 确认解散对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) =>
            setConfirmDialog(open ? confirmDialog : null)
          }
          title="确认解散群组"
          description={`确定要解散群组「${confirmDialog.title}」吗？此操作不可恢复。`}
          confirmText="解散"
          variant="destructive"
          loading={dissolveMutation.isPending}
          onConfirm={() => dissolveMutation.mutate(confirmDialog.gid)}
        />
      )}
    </div>
  )
}
