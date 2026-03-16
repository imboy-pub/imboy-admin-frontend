import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, RowSelectionState, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'
import { Eye, Flag, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  BatchActionBar,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  deleteMoment,
  getMomentListPayload,
  MomentItem,
  MomentListParams,
} from '@/modules/moments/api'
import { formatDate } from '@/lib/utils'
import { trackUxEvent } from '@/lib/uxTelemetry'

const visibilityLabels: Record<number, string> = {
  0: '公开',
  1: '仅好友',
  2: '仅自己',
  3: '部分可见',
  4: '不给谁看',
}

export function MomentListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [params, setParams] = useState<MomentListParams>({
    page: 1,
    size: 10,
    status: -2,
  })
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchUid, setSearchUid] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    momentId: string | number
  } | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['moments', params],
    queryFn: () => getMomentListPayload(params),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ momentId, reason }: { momentId: string | number; reason: string }) =>
      deleteMoment(momentId, reason),
    onSuccess: () => {
      toast.success('动态已删除')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      setConfirmDialog(null)
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async ({ momentIds, reason }: { momentIds: Array<string | number>; reason: string }) =>
      Promise.allSettled(momentIds.map((momentId) => deleteMoment(momentId, reason))),
    onSuccess: (results) => {
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`批量删除完成：成功 ${successCount} 条动态`)
      }
      if (failedCount > 0) {
        toast.error(`批量删除失败：${failedCount} 条动态`)
      }

      queryClient.invalidateQueries({ queryKey: ['moments'] })
      setRowSelection({})
    },
    onError: (error: Error) => {
      toast.error(`批量删除失败: ${error.message}`)
    },
  })

  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'moment_list',
      keyword: searchKeyword.trim(),
      uid: searchUid.trim(),
    })
    setRowSelection({})
    const keyword = searchKeyword.trim()
    const uid = searchUid.trim()
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: keyword.length > 0 ? keyword : undefined,
      uid: uid.length > 0 ? uid : undefined,
    }))
  }

  const handlePageChange = (page: number) => {
    setRowSelection({})
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setRowSelection({})
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const columns: ColumnDef<MomentItem>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选当前页动态"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择动态 ${row.original.id}`}
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
      header: '动态ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'author_uid',
      header: '作者UID',
      cell: ({ row }) => <span className="font-mono">{row.original.author_uid}</span>,
    },
    {
      accessorKey: 'content',
      header: '内容',
      cell: ({ row }) => (
        <div className="max-w-[360px]">
          <p className="truncate">{row.original.content || '-'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'visibility',
      header: '可见性',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.visibility}
          labels={visibilityLabels}
          variants={{ 0: 'success', 1: 'info', 2: 'warning', 3: 'secondary', 4: 'error' }}
        />
      ),
    },
    {
      id: 'stats',
      header: '互动',
      cell: ({ row }) => {
        const stats = row.original.stats ?? { like_count: 0, comment_count: 0 }
        return (
          <span className="text-sm text-muted-foreground">
            赞 {stats.like_count} / 评 {stats.comment_count}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'success', 0: 'warning', '-1': 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '发布时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
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
              navigate(`/moments/${row.original.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="举报处理"
            onClick={(event) => {
              event.stopPropagation()
              navigate('/moments/reports')
            }}
          >
            <Flag className="h-4 w-4" />
          </Button>
          {row.original.status === 1 && (
            <Button
              variant="ghost"
              size="icon"
              title="删除动态"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmDialog({
                  open: true,
                  momentId: row.original.id,
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

  const moments = data?.items || []

  const table = useReactTable({
    data: moments,
    columns,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => row.original.status === 1,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedMoments = table.getSelectedRowModel().rows.map((row) => row.original)
  const selectedMomentIds = selectedMoments.map((item) => item.id)

  if (isLoading) {
    return <LoadingState message="加载动态数据..." />
  }

  if (error) {
    return <ErrorState message="加载动态数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="朋友圈治理" description="管理朋友圈动态内容与可见性风险" />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="搜索动态内容..."
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
              />
            </div>
            <Input
              className="w-56"
              placeholder="作者 UID（可选）"
              value={searchUid}
              onChange={(event) => setSearchUid(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch}>搜索</Button>
            <Button variant="outline" onClick={() => navigate('/moments/reports')}>
              进入举报处理
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <BatchActionBar
            selectedCount={selectedMoments.length}
            onClear={() => setRowSelection({})}
            actions={[
              {
                key: 'batch-delete',
                label: '批量删除',
                variant: 'destructive',
                permission: 'moments:delete',
                roles: [1, 2],
                riskLevel: 'high',
                confirmKeyword: 'DELETE',
                description: `将删除 ${selectedMomentIds.length} 条动态，删除后不可恢复。`,
                disabled: selectedMomentIds.length === 0,
                loading: batchDeleteMutation.isPending,
                onExecute: async ({ reason }) => {
                  if (selectedMomentIds.length === 0) {
                    toast.error('当前没有可删除动态')
                    return
                  }
                  await batchDeleteMutation.mutateAsync({
                    momentIds: selectedMomentIds,
                    reason: reason || 'admin_batch_delete',
                  })
                },
              },
            ]}
          />

          <DataTable table={table} />
          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog(open ? confirmDialog : null)}
          title="确认删除动态"
          description="删除后用户时间线将不可见，且不可恢复。"
          confirmText="删除"
          variant="destructive"
          loading={deleteMutation.isPending}
          onConfirm={() =>
            deleteMutation.mutate({
              momentId: confirmDialog.momentId,
              reason: 'admin_delete',
            })
          }
        />
      )}
    </div>
  )
}
