import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Trash2, Eye, Pencil, MessageSquare, PanelRightOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { PageHeader, LoadingState, ErrorState, StatusBadge, DataTable, DataTablePagination, ConfirmDialog, FilterBar, EntityDrawer } from '@/components/shared'
import { getChannelListPayload, getChannelDetailPayload, deleteChannel, ChannelListParams } from '@/services/api/channels'
import { Channel } from '@/services/api/channels'
import { formatDate } from '@/lib/utils'
import { ColumnDef, useReactTable, getCoreRowModel } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'

type ChannelListPageQuery = {
  page: number
  size: number
  status: number
  keyword: string
}

const BLOCKED_CHANNEL_AVATAR_HOSTS = new Set(['i.imboy.pub'])

function avatarInitial(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0) return '?'
  return normalized.charAt(0).toUpperCase()
}

function shouldBlockChannelAvatar(url: string): boolean {
  try {
    const normalized = url.startsWith('//') ? `https:${url}` : url
    const parsed = new URL(normalized, 'https://imboy.local')
    return BLOCKED_CHANNEL_AVATAR_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

type ChannelAvatarProps = {
  src: string | null
  name: string
}

function ChannelAvatar({ src, name }: ChannelAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false)
  const normalizedSrc = typeof src === 'string' ? src.trim() : ''
  const blocked = normalizedSrc.length > 0 && shouldBlockChannelAvatar(normalizedSrc)
  const canRenderImage = normalizedSrc.length > 0 && !blocked && !loadFailed

  if (canRenderImage) {
    return (
      <img
        src={normalizedSrc}
        alt={name}
        loading="lazy"
        className="h-8 w-8 rounded-full"
        data-testid="channel-avatar-image"
        onError={(event) => {
          event.currentTarget.onerror = null
          setLoadFailed(true)
        }}
      />
    )
  }

  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
      data-testid="channel-avatar-fallback"
      title={`${name} avatar fallback`}
    >
      {avatarInitial(name)}
    </span>
  )
}

export function ChannelListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<ChannelListPageQuery>({
    page: 1,
    size: 10,
    status: -1,
    keyword: '',
  })
  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [drawerChannelId, setDrawerChannelId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    channelId: string | number
    name: string
  } | null>(null)

  const requestParams: ChannelListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
  }

  // 获取频道列表
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['channels', requestParams],
    queryFn: () => getChannelListPayload(requestParams),
  })

  const {
    data: drawerChannelDetail,
    isLoading: drawerLoading,
    error: drawerError,
  } = useQuery({
    queryKey: ['channels', 'detail', drawerChannelId],
    queryFn: () => getChannelDetailPayload(drawerChannelId || ''),
    enabled: Boolean(drawerChannelId),
    retry: false,
  })

  // 删除频道
  const deleteMutation = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => {
      toast.success('频道已删除')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      setConfirmDialog(null)
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`)
    },
  })

  // 搜索处理
  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'channel_list',
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
    setParams({
      page: 1,
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
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
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setParams({ page: 1, size })
  }

  const openChannelDrawer = (channelId: string | number) => {
    const normalizedChannelId = String(channelId)
    setDrawerChannelId(normalizedChannelId)
    trackUxEvent('ux_drawer_open', {
      entity: 'channel',
      entity_id: normalizedChannelId,
      source: 'channel_list',
    })
  }

  // 表格列定义
  const columns: ColumnDef<Channel>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'name',
      header: '频道名称',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ChannelAvatar src={row.original.avatar} name={row.original.name} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'owner_id',
      header: '创建者 ID',
      cell: ({ row }) => <span className="font-mono">{row.original.owner_id}</span>,
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.type}
          labels={{ 0: '公开', 1: '私有', 2: '付费' }}
          variants={{ 0: 'success', 1: 'warning', 2: 'info' }}
        />
      ),
    },
    {
      accessorKey: 'subscriber_count',
      header: '订阅数',
      cell: ({ row }) => (
        <span className="font-mono">{row.original.subscriber_count || 0}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
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
            title="快速查看"
            onClick={(event) => {
              event.stopPropagation()
              openChannelDrawer(row.original.id)
            }}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/channels/${row.original.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="编辑频道"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/channels/${row.original.id}?edit=1`)
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="消息治理"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/channels/${row.original.id}/messages`)
            }}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          {row.original.status === 1 && (
            <Button
              variant="ghost"
              size="icon"
              title="删除频道"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmDialog({
                  open: true,
                  channelId: row.original.id,
                  name: row.original.name,
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

  const channels = data?.items || []
  const pagination = data

  const table = useReactTable({
    data: channels,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道数据..." />
  }

  if (error) {
    return <ErrorState message="加载频道数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道管理"
        description="管理系统频道"
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
                placeholder="搜索频道名称..."
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
              <option value="0">禁用</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable
            table={table}
            onRowClick={(row) => navigate(`/channels/${row.id}`)}
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

      {/* 确认删除对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) =>
            setConfirmDialog(open ? confirmDialog : null)
          }
          title="确认删除频道"
          description={`确定要删除频道「${confirmDialog.name}」吗？此操作不可恢复。`}
          confirmText="删除"
          variant="destructive"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDialog.channelId)}
        />
      )}

      <EntityDrawer
        open={Boolean(drawerChannelId)}
        onOpenChange={(open) => {
          if (!open) setDrawerChannelId(null)
        }}
        title={drawerChannelDetail?.name || `频道 ${drawerChannelId || ''}`}
        subtitle="频道快速详情"
        loading={drawerLoading}
        error={drawerError ? '加载频道详情失败' : undefined}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!drawerChannelId) return
                navigate(`/channels/${drawerChannelId}`)
                setDrawerChannelId(null)
              }}
            >
              进入详情页
            </Button>
            <Button
              onClick={() => {
                if (!drawerChannelId) return
                navigate(`/channels/${drawerChannelId}/messages`)
                setDrawerChannelId(null)
              }}
            >
              进入消息治理
            </Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">频道 ID</p>
                <p className="font-mono">{drawerChannelDetail?.id || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">名称</p>
                <p>{drawerChannelDetail?.name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">创建者 ID</p>
                <p className="font-mono">{drawerChannelDetail?.owner_id || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <StatusBadge
                  status={drawerChannelDetail?.status ?? '-'}
                  labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                  variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
                />
              </div>
              <div>
                <p className="text-muted-foreground">类型</p>
                <StatusBadge
                  status={drawerChannelDetail?.type ?? '-'}
                  labels={{ 0: '公开', 1: '私有', 2: '付费' }}
                  variants={{ 0: 'success', 1: 'warning', 2: 'info' }}
                />
              </div>
              <div>
                <p className="text-muted-foreground">订阅数</p>
                <p className="font-mono">{drawerChannelDetail?.subscriber_count ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-2 font-medium">内容信息</p>
            <p className="text-muted-foreground">
              {drawerChannelDetail?.description || '暂无频道描述'}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              创建时间：{drawerChannelDetail?.created_at || '-'}
            </p>
          </div>
        </div>
      </EntityDrawer>
    </div>
  )
}
