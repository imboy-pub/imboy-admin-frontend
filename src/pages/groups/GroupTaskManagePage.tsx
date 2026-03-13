import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Eye, RotateCcw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  closeGroupTask,
  deleteGroupTask,
  getGroupTaskDetailPayload,
  getGroupTaskPendingReviewsPayload,
  getGroupTasksPayload,
  GroupTaskAssignment,
  GroupTask,
  reviewGroupTaskAssignment,
  restoreGroupTask,
} from '@/services/api/groupEnhancements'
import { formatDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

function formatDateSafe(value?: string | null): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return formatDate(parsed)
}

export function GroupTaskManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState(-1)
  const [deletedFilter, setDeletedFilter] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [reviewScoreInput, setReviewScoreInput] = useState('')
  const [reviewCommentInput, setReviewCommentInput] = useState('')
  const [confirmCloseTaskId, setConfirmCloseTaskId] = useState('')
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState('')
  const [confirmRestoreTaskId, setConfirmRestoreTaskId] = useState('')
  const [restoreTaskIdInput, setRestoreTaskIdInput] = useState('')
  const { allowed: canReviewTask } = useAdminPermission({
    permission: 'groups:task:review',
    roles: [1, 2],
  })
  const { allowed: canCloseTask } = useAdminPermission({
    permission: 'groups:task:close',
    roles: [1, 2],
  })
  const { allowed: canDeleteTask } = useAdminPermission({
    permission: 'groups:task:delete',
    roles: [1, 2],
  })
  const { allowed: canRestoreTask } = useAdminPermission({
    permission: 'groups:task:restore',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-tasks', gid, page, size, statusFilter, deletedFilter],
    queryFn: () =>
      getGroupTasksPayload(gid, {
        page,
        size,
        status: statusFilter >= 1 ? statusFilter : undefined,
        deleted: deletedFilter === 1 ? 1 : undefined,
      }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-task-detail', selectedTaskId],
    queryFn: () => getGroupTaskDetailPayload(selectedTaskId),
    enabled: selectedTaskId.length > 0,
  })

  const {
    data: pendingReviewData,
    isLoading: pendingReviewLoading,
    error: pendingReviewError,
    refetch: refetchPendingReview,
  } = useQuery({
    queryKey: ['group-task-pending-review', selectedTaskId],
    queryFn: () => getGroupTaskPendingReviewsPayload(selectedTaskId, { page: 1, size: 50 }),
    enabled: selectedTaskId.length > 0,
  })

  const closeMutation = useMutation({
    mutationFn: closeGroupTask,
    onSuccess: async () => {
      toast.success('任务已强制结束')
      const closedId = confirmCloseTaskId
      setConfirmCloseTaskId('')
      await queryClient.invalidateQueries({ queryKey: ['group-tasks', gid] })
      if (closedId && selectedTaskId === closedId) {
        await refetchDetail()
      }
    },
    onError: (err: Error) => {
      toast.error(`强制结束任务失败: ${err.message}`)
    },
  })

  const reviewMutation = useMutation({
    mutationFn: reviewGroupTaskAssignment,
    onSuccess: async () => {
      toast.success('任务批改已提交')
      setSelectedAssignmentId('')
      setReviewScoreInput('')
      setReviewCommentInput('')
      await refetchPendingReview()
      await refetchDetail()
    },
    onError: (err: Error) => {
      toast.error(`任务批改失败: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupTask,
    onSuccess: async () => {
      toast.success('任务已删除')
      setConfirmDeleteTaskId('')
      if (selectedTaskId) {
        setSelectedTaskId('')
      }
      await queryClient.invalidateQueries({ queryKey: ['group-tasks', gid] })
    },
    onError: (err: Error) => {
      toast.error(`删除任务失败: ${err.message}`)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreGroupTask,
    onSuccess: async () => {
      toast.success('任务已恢复')
      const restoredId = confirmRestoreTaskId
      setConfirmRestoreTaskId('')
      setRestoreTaskIdInput('')
      await queryClient.invalidateQueries({ queryKey: ['group-tasks', gid] })
      if (restoredId && selectedTaskId === restoredId) {
        await refetchDetail()
      }
    },
    onError: (err: Error) => {
      toast.error(`恢复任务失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupTask>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{String(row.original.id)}</span>
        ),
      },
      {
        accessorKey: 'task_id',
        header: '任务ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.task_id}</span>
        ),
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
            labels={{ 1: '进行中', 2: '待审核', 3: '已完成' }}
            variants={{ 1: 'success', 2: 'warning', 3: 'secondary' }}
          />
        ),
      },
      {
        accessorKey: 'deadline',
        header: '截止时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateSafe(row.original.deadline ?? undefined)}
          </span>
        ),
      },
      {
        accessorKey: 'deleted_at',
        header: '删除时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateSafe(row.original.deleted_at ?? undefined)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {deletedFilter === 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="查看详情"
                  onClick={() => setSelectedTaskId(String(row.original.id))}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {canCloseTask && row.original.status !== 3 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="强制结束任务"
                    onClick={() => setConfirmCloseTaskId(String(row.original.id))}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                )}
                {canDeleteTask && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="删除任务"
                    onClick={() => setConfirmDeleteTaskId(String(row.original.id))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </>
            )}
            {deletedFilter === 1 && canRestoreTask && (
              <Button
                variant="ghost"
                size="icon"
                title="恢复任务"
                onClick={() => setConfirmRestoreTaskId(String(row.original.id))}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canCloseTask, canDeleteTask, canRestoreTask, deletedFilter]
  )

  const tasks = data?.items || []
  const pendingAssignments: GroupTaskAssignment[] = pendingReviewData?.items || []
  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群任务数据..." />
  }

  if (error) {
    return <ErrorState message="加载群任务数据失败" onRetry={() => refetch()} />
  }

  const submitReview = () => {
    if (!selectedAssignmentId) return
    const scoreRaw = reviewScoreInput.trim()
    let score: number | undefined
    if (scoreRaw.length > 0) {
      const parsedScore = Number(scoreRaw)
      if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
        toast.error('评分需为 0-100 的数字')
        return
      }
      score = parsedScore
    }

    reviewMutation.mutate({
      assignment_id: selectedAssignmentId,
      score,
      comment: reviewCommentInput.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群任务管理"
        description={`群组 ${gid} 的任务列表与治理操作`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>任务列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">状态筛选</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={String(statusFilter)}
              onChange={(event) => {
                setStatusFilter(Number(event.target.value))
                setPage(1)
              }}
            >
              <option value="-1">全部</option>
              <option value="1">进行中</option>
              <option value="2">待审核</option>
              <option value="3">已完成</option>
            </select>
            <span className="text-sm text-muted-foreground">数据视图</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={String(deletedFilter)}
              onChange={(event) => {
                setDeletedFilter(Number(event.target.value))
                setPage(1)
                setSelectedTaskId('')
                setSelectedAssignmentId('')
              }}
            >
              <option value="0">未删除任务</option>
              <option value="1">已删除任务</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">恢复软删除任务</p>
              <p className="text-xs text-muted-foreground">
                输入任务ID（支持业务ID/主键/hashid）后执行恢复
              </p>
            </div>
            <div className="flex w-full gap-2 md:w-auto md:min-w-[380px]">
              <Input
                value={restoreTaskIdInput}
                onChange={(event) => setRestoreTaskIdInput(event.target.value)}
                placeholder="请输入待恢复任务ID"
              />
              <Button
                variant="outline"
                disabled={!canRestoreTask || restoreTaskIdInput.trim().length === 0}
                onClick={() => setConfirmRestoreTaskId(restoreTaskIdInput.trim())}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                恢复
              </Button>
            </div>
          </div>

          <DataTable
            table={table}
            onRowClick={deletedFilter === 0 ? (row) => setSelectedTaskId(String(row.id)) : undefined}
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
          <CardTitle>任务详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {deletedFilter === 1 && (
            <p className="text-sm text-muted-foreground">已删除视图不提供详情，可直接执行恢复操作</p>
          )}
          {!selectedTaskId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看任务详情</p>
          )}

          {selectedTaskId && isDetailLoading && (
            <LoadingState message="加载任务详情..." />
          )}

          {selectedTaskId && detailError && (
            <ErrorState message="加载任务详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedTaskId && detail && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">主键ID</dt>
                <dd className="font-mono">{String(detail.id)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">任务ID</dt>
                <dd className="font-mono text-xs">{detail.task_id}</dd>
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
                <dt className="text-sm text-muted-foreground">状态</dt>
                <dd>
                  <StatusBadge
                    status={detail.status}
                    labels={{ 1: '进行中', 2: '待审核', 3: '已完成' }}
                    variants={{ 1: 'success', 2: 'warning', 3: 'secondary' }}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">截止时间</dt>
                <dd>{formatDateSafe(detail.deadline || undefined)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建者</dt>
                <dd className="font-mono">{String(detail.creator_id ?? '-')}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建时间</dt>
                <dd>{formatDateSafe(detail.created_at || undefined)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {deletedFilter === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>待批改提交</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedTaskId && (
              <p className="text-sm text-muted-foreground">先在任务列表中选择任务，再查看待批改提交</p>
            )}

            {selectedTaskId && pendingReviewLoading && (
              <LoadingState message="加载待批改列表..." />
            )}

            {selectedTaskId && pendingReviewError && (
              <ErrorState message="加载待批改列表失败" onRetry={() => refetchPendingReview()} />
            )}

            {selectedTaskId && !pendingReviewLoading && !pendingReviewError && (
              <>
                <p className="text-sm text-muted-foreground">
                  待批改数量：{pendingReviewData?.total ?? pendingAssignments.length}
                </p>
                <div className="rounded-md border divide-y">
                  {pendingAssignments.map((assignment) => (
                    <div
                      key={String(assignment.id)}
                      className="space-y-2 px-3 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-x-3 text-muted-foreground">
                          <span>分配ID：<span className="font-mono">{String(assignment.id)}</span></span>
                          <span>提交人：<span className="font-mono">{String(assignment.user_id)}</span></span>
                          <span>提交时间：{formatDateSafe(assignment.submitted_at || undefined)}</span>
                        </div>
                        {canReviewTask && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedAssignmentId(String(assignment.id))
                              setReviewScoreInput(
                                assignment.score === undefined ? '' : String(assignment.score)
                              )
                              setReviewCommentInput(assignment.comment || '')
                            }}
                          >
                            批改
                          </Button>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        提交内容：{assignment.content || '-'}
                      </div>
                    </div>
                  ))}
                  {pendingAssignments.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">暂无待批改提交</div>
                  )}
                </div>
              </>
            )}

            {canReviewTask && selectedAssignmentId.length > 0 && (
              <div className="space-y-3 rounded-md border p-3">
                <h4 className="text-sm font-medium">
                  批改分配 {selectedAssignmentId}
                </h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={reviewScoreInput}
                    onChange={(event) => setReviewScoreInput(event.target.value)}
                    placeholder="评分（0-100，可选）"
                  />
                  <Textarea
                    value={reviewCommentInput}
                    onChange={(event) => setReviewCommentInput(event.target.value)}
                    placeholder="评语（可选）"
                    className="md:col-span-2"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={submitReview}
                    disabled={reviewMutation.isPending}
                  >
                    提交批改
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedAssignmentId('')
                      setReviewScoreInput('')
                      setReviewCommentInput('')
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={canCloseTask && confirmCloseTaskId.length > 0}
        onOpenChange={(open) => setConfirmCloseTaskId(open ? confirmCloseTaskId : '')}
        title="确认强制结束任务"
        description={`确定要强制结束任务 ${confirmCloseTaskId} 吗？`}
        confirmText="强制结束"
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate(confirmCloseTaskId)}
      />
      <ConfirmDialog
        open={canDeleteTask && confirmDeleteTaskId.length > 0}
        onOpenChange={(open) => setConfirmDeleteTaskId(open ? confirmDeleteTaskId : '')}
        title="确认删除任务"
        description={`确定要删除任务 ${confirmDeleteTaskId} 吗？该操作将执行软删除。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(confirmDeleteTaskId)}
      />
      <ConfirmDialog
        open={canRestoreTask && confirmRestoreTaskId.length > 0}
        onOpenChange={(open) => setConfirmRestoreTaskId(open ? confirmRestoreTaskId : '')}
        title="确认恢复任务"
        description={`确定要恢复任务 ${confirmRestoreTaskId} 吗？`}
        confirmText="恢复任务"
        loading={restoreMutation.isPending}
        onConfirm={() => restoreMutation.mutate(confirmRestoreTaskId)}
      />
    </div>
  )
}
