import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Pin, PinOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  ChannelMessage,
  ChannelMessageListParams,
  deleteChannelMessage,
  getChannelMessagesPayload,
  pinChannelMessage,
} from '@/services/api/channels'
import { formatDate, truncate } from '@/lib/utils'

export function ChannelMessagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelMessageListParams>({
    page: 1,
    size: 10,
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    messageId: string | number
  } | null>(null)

  const queryKey = ['channel-messages', channelId, params] as const

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => getChannelMessagesPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string | number; pinned: boolean }) =>
      pinChannelMessage(channelId, messageId, pinned),
    onSuccess: (_, variables) => {
      toast.success(variables.pinned ? '消息已置顶' : '消息已取消置顶')
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
    onError: (err: Error) => {
      toast.error(`操作失败: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (messageId: string | number) => deleteChannelMessage(channelId, messageId),
    onSuccess: () => {
      toast.success('消息已删除')
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
      setConfirmDialog(null)
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const columns: ColumnDef<ChannelMessage>[] = [
    {
      accessorKey: 'id',
      header: '消息 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'author_id',
      header: '作者',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.author_id}</div>
          <div className="text-muted-foreground">{row.original.author_name || '-'}</div>
        </div>
      ),
    },
    {
      accessorKey: 'msg_type',
      header: '类型',
      cell: ({ row }) => <span className="text-sm">{row.original.msg_type}</span>,
    },
    {
      accessorKey: 'content',
      header: '内容',
      cell: ({ row }) => (
        <span title={row.original.content} className="block max-w-[420px] truncate">
          {truncate(row.original.content || '-', 90)}
        </span>
      ),
    },
    {
      accessorKey: 'is_pinned',
      header: '置顶',
      cell: ({ row }) => (
        <span className={row.original.is_pinned ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
          {row.original.is_pinned ? '是' : '否'}
        </span>
      ),
    },
    {
      accessorKey: 'view_count',
      header: '阅读量',
      cell: ({ row }) => <span className="font-mono">{row.original.view_count || 0}</span>,
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
      cell: ({ row }) => {
        const message = row.original
        const toggledPinned = !message.is_pinned
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title={message.is_pinned ? '取消置顶' : '置顶消息'}
              onClick={() => pinMutation.mutate({ messageId: message.id, pinned: toggledPinned })}
            >
              {message.is_pinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="删除消息"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  messageId: message.id,
                })
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道消息中..." />
  }

  if (error || !channelId) {
    return <ErrorState message="加载频道消息失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道消息治理"
        description={`频道 ID: ${channelId}`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回频道详情
          </Button>
        )}
      />

      <Card>
        <CardHeader />
        <CardContent>
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
          title="确认删除消息"
          description={`确定要删除消息 #${confirmDialog.messageId} 吗？此操作不可恢复。`}
          confirmText="删除"
          variant="destructive"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDialog.messageId)}
        />
      )}
    </div>
  )
}
