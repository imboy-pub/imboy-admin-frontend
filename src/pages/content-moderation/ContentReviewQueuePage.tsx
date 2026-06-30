import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { CheckCircle, XCircle, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  LoadingState,
  ErrorState,
  PageHeader,
  StatusBadge,
  EntityDrawer,
} from '@/components/shared'
import {
  getReviewQueuePayload,
  moderateMessage,
  type ReviewQueueItem,
  type ReviewStatus,
} from '@/services/api/moderation'
import { formatDate, truncate } from '@/lib/utils'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { Select } from '@/components/ui/select'

type PageQuery = {
  page: number
  size: number
  status: string
  keyword: string
  start: string
  end: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

const STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

export function ContentReviewQueuePage() {
  const queryClient = useQueryClient()

  const { state: params, setState: setParams } = useListQueryState<PageQuery>({
    page: 1,
    size: 10,
    status: 'all',
    keyword: '',
    start: '',
    end: '',
  })

  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['content-review-queue', params],
    queryFn: () =>
      getReviewQueuePayload({
        page: params.page,
        size: params.size,
        status: params.status === 'all' ? undefined : (params.status as ReviewStatus),
        keyword: params.keyword || undefined,
        start: params.start || undefined,
        end: params.end || undefined,
      }),
  })

  const moderateMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: EntityId; action: 'approve' | 'reject'; reason?: string }) =>
      moderateMessage(id, action, reason),
    onSuccess: (_, vars) => {
      toast.success(vars.action === 'approve' ? '已通过审核' : '已拒绝内容')
      setSelectedItem(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['content-review-queue'] })
    },
    onError: (err: unknown) => toast.error(`操作失败: ${getErrorMessage(err)}`),
  })

  const columns: ColumnDef<ReviewQueueItem>[] = [
    {
      accessorKey: 'review_status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.review_status}
          labels={STATUS_LABELS}
          variants={STATUS_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'from_account',
      header: '发送者',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.from_account}</span>
      ),
    },
    {
      accessorKey: 'to_type',
      header: '目标类型',
      cell: ({ row }) => {
        const labels: Record<string, string> = { user: '私信', group: '群组', channel: '频道' }
        return <span className="text-sm">{labels[row.original.to_type] ?? row.original.to_type}</span>
      },
    },
    {
      accessorKey: 'content',
      header: '消息内容',
      cell: ({ row }) => (
        <span className="block max-w-xs truncate text-sm" title={row.original.content}>
          {truncate(row.original.content, 60)}
        </span>
      ),
    },
    {
      accessorKey: 'hit_words',
      header: '命中词',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.hit_words.slice(0, 3).map((word) => (
            <span
              key={word}
              className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive"
            >
              {word}
            </span>
          ))}
          {row.original.hit_words.length > 3 && (
            <span className="text-xs text-muted-foreground">+{row.original.hit_words.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const isPending = row.original.review_status === 'pending'
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="查看详情"
              onClick={() => setSelectedItem(row.original)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {isPending && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="通过"
                  onClick={() => moderateMutation.mutate({ id: row.original.id, action: 'approve' })}
                  disabled={moderateMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="拒绝"
                  onClick={() => {
                    setSelectedItem(row.original)
                  }}
                  disabled={moderateMutation.isPending}
                >
                  <XCircle className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading && !data) return <LoadingState message="加载审核队列..." />
  if (error) return <ErrorState message="加载审核队列失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容人工复审"
        description="对系统标记的疑似违规消息进行人工审核，执行通过或拒绝操作"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={params.status}
              onChange={(e) => setParams({ status: e.target.value, page: 1 })}
            >
              <option value="all">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </Select>
            <Input
              placeholder="搜索发送者 / 内容关键字"
              value={params.keyword}
              onChange={(e) => setParams({ keyword: e.target.value, page: 1 })}
              className="max-w-xs"
            />
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>时间范围</span>
              <input
                type="date"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={params.start}
                onChange={(e) => setParams({ start: e.target.value, page: 1 })}
              />
              <span>—</span>
              <input
                type="date"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={params.end}
                onChange={(e) => setParams({ end: e.target.value, page: 1 })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable table={table} emptyMessage="当前没有待审核内容" />
          <DataTablePagination
            page={params.page}
            pageSize={params.size}
            total={data?.total ?? 0}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
            dataUpdatedAt={dataUpdatedAt}
            onRefresh={() => refetch()}
          />
        </CardContent>
      </Card>

      <EntityDrawer
        open={!!selectedItem}
        onOpenChange={(open) => { if (!open) { setSelectedItem(null); setRejectReason('') } }}
        title="消息审核详情"
        subtitle={`来自 ${selectedItem?.from_account ?? '-'}`}
      >
        {selectedItem && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">消息 ID</p>
                    <p className="font-mono">{selectedItem.msg_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">消息类型</p>
                    <p>{selectedItem.msg_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">发送者</p>
                    <p className="font-mono">{selectedItem.from_account} ({selectedItem.from_id})</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">接收者 ID</p>
                    <p className="font-mono">{selectedItem.to_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">当前状态</p>
                    <StatusBadge
                      status={selectedItem.review_status}
                      labels={STATUS_LABELS}
                      variants={STATUS_VARIANTS}
                    />
                  </div>
                  <div>
                    <p className="text-muted-foreground">消息时间</p>
                    <p>{formatDate(selectedItem.created_at)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">命中敏感词</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedItem.hit_words.map((word) => (
                      <span
                        key={word}
                        className="rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">消息内容</p>
                  <div className="rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
                    {selectedItem.content}
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedItem.review_status === 'pending' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">执行审核</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">拒绝原因（可选）</label>
                    <Input
                      placeholder="输入拒绝原因..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() =>
                        moderateMutation.mutate({ id: selectedItem.id, action: 'approve' })
                      }
                      disabled={moderateMutation.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      通过审核
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() =>
                        moderateMutation.mutate({
                          id: selectedItem.id,
                          action: 'reject',
                          reason: rejectReason || undefined,
                        })
                      }
                      disabled={moderateMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      拒绝内容
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </EntityDrawer>
    </div>
  )
}
