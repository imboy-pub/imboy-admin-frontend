import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { LegacyColumnDef, getCoreRowModel, useLegacyTable } from '@tanstack/react-table/legacy'
import { RowSelectionState } from '@tanstack/react-table'
import { ArrowLeft, Pin, PinOff, Trash2, Download, MessageSquareText, Image, Video, Music, File, ChevronDown, ChevronUp } from 'lucide-react'
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
  deleteChannelMessage,
  getChannelMessagesPayload,
  pinChannelMessage,
} from '@/modules/channels/api'
import type { EntityId } from '@/types/common'
import { formatDate, truncate, cn } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { getErrorMessage } from '@/lib/errorUtils'
import { useListQueryState } from '@/hooks/useListQueryState'

/** 消息类型图标映射 */
const MSG_TYPE_ICONS: Record<string, React.ReactNode> = {
  channel_text: <MessageSquareText className="h-4 w-4" />,
  channel_image: <Image className="h-4 w-4 text-blue-500" />,
  channel_video: <Video className="h-4 w-4 text-purple-500" />,
  channel_audio: <Music className="h-4 w-4 text-green-500" />,
  channel_file: <File className="h-4 w-4 text-orange-500" />,
  channel_imageText: <Image className="h-4 w-4 text-indigo-500" />,
}

/** 消息类型标签 */
const MSG_TYPE_LABELS: Record<string, string> = {
  channel_text: '文字',
  channel_image: '图片',
  channel_video: '视频',
  channel_audio: '音频',
  channel_file: '文件',
  channel_imageText: '图文',
  channel_link: '链接',
  channel_location: '位置',
}

/** 检测内容中是否包含图片 URL，返回缩略图 URL */
function detectImageUrl(content: string): string | null {
  if (!content) return null
  const match = content.match(/https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif)(\?[^\s]*)?/i)
  return match?.[0] ?? null
}

/** 检测内容中是否包含视频 URL */
function detectVideoUrl(content: string): boolean {
  if (!content) return false
  return /https?:\/\/[^\s]+\.(mp4|mov|webm)(\?[^\s]*)?/i.test(content)
}

/** 消息类型图标组件 */
function MsgTypeIcon({ msgType }: { msgType: string }) {
  return MSG_TYPE_ICONS[msgType] ?? <MessageSquareText className="h-4 w-4" />
}

/** 消息内容单元格：支持展开/折叠 + 图片缩略图预览 */
function ContentCell({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const imageUrl = detectImageUrl(content)
  const hasVideo = detectVideoUrl(content)

  const displayContent = expanded ? content : truncate(content || '-', 90)

  return (
    <div className="space-y-1">
      {imageUrl && (
        <div className="mb-1">
          <img
            src={imageUrl}
            alt="消息图片"
            className="h-10 w-10 rounded object-cover border"
            loading="lazy"
          />
        </div>
      )}
      {hasVideo && (
        <div className="mb-1 flex items-center gap-1 text-xs text-purple-600">
          <Video className="h-3 w-3" />
          <span>视频消息</span>
        </div>
      )}
      <div className="flex items-start gap-1">
        <span
          className={cn(
            'block max-w-[420px] text-xs font-mono text-muted-foreground',
            !expanded && 'truncate',
          )}
          title={expanded ? undefined : content}
        >
          {displayContent}
        </span>
        {content && content.length > 90 && (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? '收起' : '展开'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  )
}

export function ChannelMessagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = id ?? ''

  const { state: params, setState: setParams } = useListQueryState<{ page: number; size: number }>({
    page: 1,
    size: 10,
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    messageId: EntityId
  } | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pinningMessageId, setPinningMessageId] = useState<EntityId | null>(null)

  const queryKey = ['channel-messages', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelMessagesPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const messages = data?.items || []

  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: EntityId; pinned: boolean }) =>
      pinChannelMessage(channelId, messageId, pinned),
    onMutate: (variables) => {
      setPinningMessageId(variables.messageId)
    },
    onSuccess: (_, variables) => {
      toast.success(variables.pinned ? '消息已置顶' : '消息已取消置顶')
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
    onError: (err: unknown) => {
      toast.error(`操作失败: ${getErrorMessage(err)}`)
    },
    onSettled: () => {
      setPinningMessageId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (messageId: EntityId) => deleteChannelMessage(channelId, messageId),
    onSuccess: (_result, messageId) => {
      const deletedId = String(messageId)
      setRowSelection((prev) => {
        if (!(deletedId in prev)) return prev
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
      toast.success('消息已删除')
      setConfirmDialog(null)
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
    onError: (err: unknown) => {
      toast.error(`删除失败: ${getErrorMessage(err)}`)
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async ({ ids }: { ids: EntityId[] }) =>
      Promise.allSettled(ids.map((msgId) => deleteChannelMessage(channelId, msgId))),
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`批量删除完成：成功 ${successCount} 条消息`)
        queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
      }
      if (failedCount > 0) toast.error(`批量删除失败：${failedCount} 条消息`)
      setRowSelection({})
    },
    onError: (err: unknown) => {
      toast.error(`批量删除失败: ${getErrorMessage(err)}`)
    },
  })

  const batchPinMutation = useMutation({
    mutationFn: async ({ ids, pinned }: { ids: EntityId[]; pinned: boolean }) =>
      Promise.allSettled(ids.map((msgId) => pinChannelMessage(channelId, msgId, pinned))),
    onSuccess: (results, variables) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCount = results.length - successCount
      const action = variables.pinned ? '置顶' : '取消置顶'

      if (successCount > 0) {
        toast.success(`批量${action}完成：成功 ${successCount} 条消息`)
        queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
      }
      if (failedCount > 0) toast.error(`批量${action}失败：${failedCount} 条消息`)
      setRowSelection({})
    },
    onError: (err: unknown) => {
      toast.error(`批量操作失败: ${getErrorMessage(err)}`)
    },
  })

  const handlePageChange = (page: number) => {
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setParams({ page: 1, size })
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

  const columns: LegacyColumnDef<ChannelMessage>[] = [
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
      id: 'msg_type',
      header: '类型',
      cell: ({ row }) => (
        <div className="flex items-center gap-1" title={MSG_TYPE_LABELS[row.original.msg_type] || row.original.msg_type}>
          <MsgTypeIcon msgType={row.original.msg_type} />
          <span className="text-xs text-muted-foreground">{MSG_TYPE_LABELS[row.original.msg_type] || row.original.msg_type}</span>
        </div>
      ),
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
      accessorKey: 'content',
      header: '内容',
      cell: ({ row }) => <ContentCell content={row.original.content} />,
    },
    {
      accessorKey: 'is_pinned',
      header: '置顶',
      cell: ({ row }) => (
        row.original.is_pinned
          ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              <Pin className="h-3 w-3" />
              已置顶
            </span>
          )
          : <span className="text-muted-foreground text-xs">—</span>
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
              disabled={pinningMessageId === message.id}
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

  const table = useLegacyTable({
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
                roles: ['1', '2'],
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
                roles: ['1', '2'],
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
                roles: ['1'],
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
