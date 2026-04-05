import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  ChannelGovernanceListParams,
  ChannelSubscriber,
  getChannelSubscribersPayload,
  removeChannelSubscriber,
} from '@/modules/channels/api'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'

export function ChannelSubscriberPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    userId: string | number
    nickname: string
  } | null>(null)

  const queryKey = ['channel-subscribers', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelSubscribersPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string | number) => removeChannelSubscriber(channelId, userId),
    onSuccess: () => {
      toast.success('订阅者已移除')
      queryClient.invalidateQueries({ queryKey: ['channel-subscribers', channelId] })
      setConfirmDialog(null)
    },
    onError: (err: Error) => {
      toast.error(`移除失败: ${err.message}`)
    },
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const columns: ColumnDef<ChannelSubscriber>[] = [
    {
      accessorKey: 'id',
      header: '记录 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.user_id}</div>
          <div className="text-muted-foreground">
            {row.original.user?.nickname || row.original.user?.account || '-'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'unread_count',
      header: '未读数',
      cell: ({ row }) => <span className="font-mono">{row.original.unread_count || 0}</span>,
    },
    {
      accessorKey: 'is_pinned',
      header: '置顶会话',
      cell: ({ row }) => (
        <span className={row.original.is_pinned ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
          {row.original.is_pinned ? '是' : '否'}
        </span>
      ),
    },
    {
      accessorKey: 'last_read_at',
      header: '最近已读',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.last_read_at)}</span>
      ),
    },
    {
      accessorKey: 'subscribed_at',
      header: '订阅时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.subscribed_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const userId = row.original.user_id
        const nickname = row.original.user?.nickname || row.original.user?.account || String(userId)
        return (
          <Button
            variant="ghost"
            size="icon"
            title="移除订阅者"
            onClick={() =>
              setConfirmDialog({
                open: true,
                userId,
                nickname,
              })
            }
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )
      },
    },
  ]

  const subscribers = data?.items || []

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<ChannelSubscriber>[] = [
      { header: 'ID', accessor: (row) => String(row.id) },
      { header: '用户ID', accessor: (row) => String(row.user_id) },
      { header: '是否置顶', accessor: (row) => (row.is_pinned ? '是' : '否') },
      { header: '未读数', accessor: (row) => String(row.unread_count ?? 0) },
      { header: '最后阅读时间', accessor: (row) => formatOptionalDate(row.last_read_at) },
      { header: '订阅时间', accessor: (row) => formatOptionalDate(row.subscribed_at) },
      { header: '用户昵称', accessor: (row) => row.user?.nickname || row.user?.account || '-' },
    ]
    exportCsv(csvColumns, subscribers, 'channel_subscribers')
    toast.success(`已导出 ${subscribers.length} 条数据`)
  }

  const table = useReactTable({
    data: subscribers,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道订阅者中..." />
  }

  if (error || !channelId) {
    return <ErrorState message="加载频道订阅者失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道订阅者治理"
        description={`频道 ID: ${channelId}`}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={subscribers.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回频道详情
          </Button>
          </>
        )}
      />

      <Card>
        <CardContent>
          <DataTable table={table} />
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

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog(open ? confirmDialog : null)}
          title="确认移除订阅者"
          description={`确定要移除订阅者「${confirmDialog.nickname}」吗？`}
          confirmText="移除"
          variant="destructive"
          loading={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate(confirmDialog.userId)}
        />
      )}
    </div>
  )
}
