import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Eye, StopCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  closeGroupVote,
  getGroupVoteDetailPayload,
  getGroupVotesPayload,
  GroupVote,
} from '@/modules/groups/api'
import { formatDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

function formatDateSafe(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

export function GroupVoteManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedVoteId, setSelectedVoteId] = useState('')
  const [confirmCloseVoteId, setConfirmCloseVoteId] = useState('')
  const { allowed: canCloseVote } = useAdminPermission({
    permission: 'groups:vote:close',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-votes', gid, page, size],
    queryFn: () => getGroupVotesPayload(gid, { page, size }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-vote-detail', selectedVoteId],
    queryFn: () => getGroupVoteDetailPayload(selectedVoteId),
    enabled: selectedVoteId.length > 0,
  })

  const closeMutation = useMutation({
    mutationFn: closeGroupVote,
    onSuccess: async () => {
      toast.success('投票已结束')
      setConfirmCloseVoteId('')
      await queryClient.invalidateQueries({ queryKey: ['group-votes', gid] })
      if (selectedVoteId) {
        await refetchDetail()
      }
    },
    onError: (err: Error) => {
      toast.error(`结束投票失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupVote>[] = useMemo(
    () => [
      {
        accessorKey: 'vote_id',
        header: '投票ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.vote_id}</span>,
      },
      {
        accessorKey: 'title',
        header: '标题',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            labels={{ 1: '进行中', 2: '已结束', 3: '已取消' }}
            variants={{ 1: 'success', 2: 'secondary', 3: 'error' }}
          />
        ),
      },
      {
        accessorKey: 'creator_id',
        header: '创建者',
        cell: ({ row }) => <span className="font-mono">{String(row.original.creator_id ?? '-')}</span>,
      },
      {
        accessorKey: 'created_at',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateSafe(row.original.created_at)}
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
              onClick={() => setSelectedVoteId(row.original.vote_id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canCloseVote && row.original.status === 1 && (
              <Button
                variant="ghost"
                size="icon"
                title="结束投票"
                onClick={() => setConfirmCloseVoteId(row.original.vote_id)}
              >
                <StopCircle className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canCloseVote]
  )

  const votes = data?.items || []
  const table = useReactTable({
    data: votes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群投票数据..." />
  }

  if (error) {
    return <ErrorState message="加载群投票数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群投票管理"
        description={`群组 ${gid} 的投票列表与治理操作`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>投票列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedVoteId(row.vote_id)}
          />

          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setSize(nextSize)
                setPage(1)
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>投票详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedVoteId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看投票详情</p>
          )}

          {selectedVoteId && isDetailLoading && (
            <LoadingState message="加载投票详情..." />
          )}

          {selectedVoteId && detailError && (
            <ErrorState message="加载投票详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedVoteId && detail && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">投票ID</dt>
                  <dd className="font-mono text-xs">{detail.vote_id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">状态</dt>
                  <dd>
                    <StatusBadge
                      status={detail.status}
                      labels={{ 1: '进行中', 2: '已结束', 3: '已取消' }}
                      variants={{ 1: 'success', 2: 'secondary', 3: 'error' }}
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">标题</dt>
                  <dd className="font-medium">{detail.title}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">描述</dt>
                  <dd>{detail.description || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">总投票数</dt>
                  <dd>{detail.total_votes ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">截止时间</dt>
                  <dd>{formatDateSafe(detail.end_at)}</dd>
                </div>
              </dl>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">选项统计</h4>
                <div className="rounded-md border divide-y">
                  {(detail.options || []).map((option) => (
                    <div
                      key={option.option_id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>{option.option_text}</span>
                      <span className="font-mono text-muted-foreground">
                        {option.vote_count ?? 0}
                      </span>
                    </div>
                  ))}
                  {(detail.options || []).length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      暂无选项数据
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canCloseVote && confirmCloseVoteId.length > 0}
        onOpenChange={(open) => setConfirmCloseVoteId(open ? confirmCloseVoteId : '')}
        title="确认结束投票"
        description={`确定要结束投票 ${confirmCloseVoteId} 吗？结束后将不可继续投票。`}
        confirmText="结束投票"
        variant="destructive"
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate(confirmCloseVoteId)}
      />
    </div>
  )
}
