import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable, RowSelectionState } from '@tanstack/react-table'
import { ArrowLeft, Pin, PinOff, Trash2, Download } from 'lucide-react'
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
  BatchActionBar,
} from '@/components/shared'
import {
  ChannelMessage,
  ChannelMessageListParams,
  deleteChannelMessage,
  getChannelMessagesPayload,
  pinChannelMessage,
} from '@/modules/channels/api'
import { formatDate, truncate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'

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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Record<string, true>>({})

  const queryKey = ['channel-messages', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelMessagesPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const messages = (data?.items || []).filter((item) => !hiddenMessageIds[String(item.id)])

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
    onSuccess: (_result, messageId) => {
      const deletedId = String(messageId)
      setHiddenMessageIds((prev) => ({ ...prev, [deletedId]: true }))
      setRowSelection((prev) => {
        if (!(deletedId in prev)) return prev
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
      toast.success('消息已删除')
      setConfirmDialog(null)
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async ({ ids }: { ids: Array<string | number> }) =>
      Promise.allSettled(ids.map((msgId) => deleteChannelMessage(channelId, msgId))),
    onSuccess: (results, variables) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCount = results.length - successCount
      const deletedIds = variables.ids
        .filter((_, index) => results[index]?.status === 'fulfilled')
        .map((id) => String(id))

      if (deletedIds.length > 0) {
        setHiddenMessageIds((prev) => {
          const next = { ...prev }
          deletedIds.forEach((id) => {
            next[id] = true
          })
          return next
        })
      }

      if (successCount > 0) toast.success(`批量删除完成：成功 ${successCount} 条消息`)
      if (failedCount > 0) toast.error(`批量删除失败：${failedCount} 条消息`)
      setRowSelection({})
    },
    onError: (err: Error) => {
      toast.error(`批量删除失败: ${err.message}`)
    },
  })

  const batchPinMutation = useMutation({
    mutationFn: async ({ ids, pinned }: { ids: Array<string | number>; pinned: boolean }) =>
      Promise.allSettled(ids.map((msgId) => pinChannelMessage(channelId, msgId, pinned))),
    onSuccess: (results, variables) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const action = variables.pinned ? '置顶' : '取消置顶'
      toast.success(`批量${action}完成：成功 ${successCount} 条消息`)
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
      setRowSelection({})
    },
    onError: (err: Error) => {
      toast.error(`批量操作失败: ${err.message}`)
    },
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<ChannelMessage>[] = [
      { header: '消息ID', accessor: (row) => String(row.id) },
      { header: '作者ID', accessor: (row) => String(row.author_id) },
      { header: '作者名称', accessor: (row) => row.author_name || '-' },
      { header: '消息类型', accessor: 'msg_type' },
      { header: '内容', accessor: (row) => truncate(row.content || '-', 200) },
      { header: '置顶', accessor: (row) => (row.is_pinned ? '是' : '否') },
      { header: '阅读量', accessor: (row) => String(row.view_count || 0) },
      { header: '创建时间', accessor: (row) => formatDate(row.created_at) },
    ]
    exportCsv(csvColumns, messages, 'channel_messages')
    toast.success(`已导出 ${messages.length} 条消息数据`)
  }

  const selectedCount = Object.keys(rowSelection).length

  const columns: ColumnDef<ChannelMessage>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选当前页消息"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择消息 ${row.original.id}`}
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
    data: messages,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={messages.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回频道详情
            </Button>
          </div>
        )}
      />

      <Card>
        <CardContent>
          <BatchActionBar
            selectedCount={selectedCount}
            onClear={() => setRowSelection({})}
            actions={[
              {
                key: 'batch-pin',
                label: '批量置顶',
                variant: 'default',
                permission: 'channels:pin',
                roles: [1, 2],
                riskLevel: 'low',
                description: `将置顶 ${selectedCount} 条消息。`,
                disabled: selectedCount === 0,
                loading: batchPinMutation.isPending,
                onExecute: async () => {
                  const ids = Object.keys(rowSelection)
                  if (ids.length === 0) return
                  await batchPinMutation.mutateAsync({ ids, pinned: true })
                },
              },
              {
                key: 'batch-unpin',
                label: '批量取消置顶',
                variant: 'default',
                permission: 'channels:pin',
                roles: [1, 2],
                riskLevel: 'low',
                description: `将取消置顶 ${selectedCount} 条消息。`,
                disabled: selectedCount === 0,
                loading: batchPinMutation.isPending,
                onExecute: async () => {
                  const ids = Object.keys(rowSelection)
                  if (ids.length === 0) return
                  await batchPinMutation.mutateAsync({ ids, pinned: false })
                },
              },
              {
                key: 'batch-delete',
                label: '批量删除',
                variant: 'destructive',
                permission: 'channels:delete',
                roles: [1],
                riskLevel: 'high',
                description: `将删除 ${selectedCount} 条消息，此操作不可恢复。`,
                disabled: selectedCount === 0,
                loading: batchDeleteMutation.isPending,
                onExecute: async () => {
                  const ids = Object.keys(rowSelection)
                  if (ids.length === 0) {
                    toast.error('请先选择要删除的消息')
                    return
                  }
                  await batchDeleteMutation.mutateAsync({ ids })
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
