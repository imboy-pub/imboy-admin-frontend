import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Eye, RotateCcw, XCircle } from 'lucide-react'

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
  cancelGroupSchedule,
  getGroupScheduleDetailPayload,
  getGroupSchedulesPayload,
  GroupSchedule,
  restoreGroupSchedule,
} from '@/services/api/groupEnhancements'
import { formatDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

function normalizeTimestamp(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'number') {
    const ms = value > 1000000000000 ? value : value * 1000
    return formatDate(ms)
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1000000000000 ? numeric : numeric * 1000
    return formatDate(ms)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return formatDate(parsed)
}

export function GroupScheduleManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [confirmCancelScheduleId, setConfirmCancelScheduleId] = useState('')
  const [confirmRestoreScheduleId, setConfirmRestoreScheduleId] = useState('')
  const { allowed: canCancelSchedule } = useAdminPermission({
    permission: 'groups:schedule:cancel',
    roles: [1, 2],
  })
  const { allowed: canRestoreSchedule } = useAdminPermission({
    permission: 'groups:schedule:restore',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-schedules', gid, page, size],
    queryFn: () => getGroupSchedulesPayload(gid, { page, size }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-schedule-detail', selectedScheduleId],
    queryFn: () => getGroupScheduleDetailPayload(selectedScheduleId),
    enabled: selectedScheduleId.length > 0,
  })

  const cancelMutation = useMutation({
    mutationFn: cancelGroupSchedule,
    onSuccess: async () => {
      toast.success('日程已取消')
      const cancelledId = confirmCancelScheduleId
      setConfirmCancelScheduleId('')
      await queryClient.invalidateQueries({ queryKey: ['group-schedules', gid] })
      if (cancelledId && selectedScheduleId === cancelledId) {
        await refetchDetail()
      }
    },
    onError: (err: Error) => {
      toast.error(`取消日程失败: ${err.message}`)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreGroupSchedule,
    onSuccess: async () => {
      toast.success('日程已恢复')
      const restoredId = confirmRestoreScheduleId
      setConfirmRestoreScheduleId('')
      await queryClient.invalidateQueries({ queryKey: ['group-schedules', gid] })
      if (restoredId && selectedScheduleId === restoredId) {
        await refetchDetail()
      }
    },
    onError: (err: Error) => {
      toast.error(`恢复日程失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupSchedule>[] = useMemo(
    () => [
      {
        accessorKey: 'schedule_id',
        header: '日程ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.schedule_id}</span>
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
            labels={{ 1: '进行中', 4: '已取消' }}
            variants={{ 1: 'success', 4: 'error' }}
          />
        ),
      },
      {
        accessorKey: 'start_at',
        header: '开始时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {normalizeTimestamp(row.original.start_at)}
          </span>
        ),
      },
      {
        accessorKey: 'end_at',
        header: '结束时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {normalizeTimestamp(row.original.end_at)}
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
              onClick={() => setSelectedScheduleId(row.original.schedule_id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canCancelSchedule && row.original.status !== 4 && (
              <Button
                variant="ghost"
                size="icon"
                title="取消日程"
                onClick={() => setConfirmCancelScheduleId(row.original.schedule_id)}
              >
                <XCircle className="h-4 w-4 text-destructive" />
              </Button>
            )}
            {canRestoreSchedule && row.original.status === 4 && (
              <Button
                variant="ghost"
                size="icon"
                title="恢复日程"
                onClick={() => setConfirmRestoreScheduleId(row.original.schedule_id)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canCancelSchedule, canRestoreSchedule]
  )

  const schedules = data?.items || []
  const table = useReactTable({
    data: schedules,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群日程数据..." />
  }

  if (error) {
    return <ErrorState message="加载群日程数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群日程管理"
        description={`群组 ${gid} 的日程列表与参与情况`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>日程列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedScheduleId(row.schedule_id)}
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
          <CardTitle>日程详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedScheduleId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看日程详情</p>
          )}

          {selectedScheduleId && isDetailLoading && (
            <LoadingState message="加载日程详情..." />
          )}

          {selectedScheduleId && detailError && (
            <ErrorState message="加载日程详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedScheduleId && detail && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">日程ID</dt>
                  <dd className="font-mono text-xs">{detail.schedule.schedule_id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">状态</dt>
                  <dd>
                    <StatusBadge
                      status={detail.schedule.status}
                      labels={{ 1: '进行中', 4: '已取消' }}
                      variants={{ 1: 'success', 4: 'error' }}
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">标题</dt>
                  <dd className="font-medium">{detail.schedule.title}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">描述</dt>
                  <dd>{detail.schedule.description || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">开始时间</dt>
                  <dd>{normalizeTimestamp(detail.schedule.start_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">结束时间</dt>
                  <dd>{normalizeTimestamp(detail.schedule.end_at)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">地点</dt>
                  <dd>{detail.schedule.location || '-'}</dd>
                </div>
              </dl>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  参与人（{detail.participant_count || 0}）
                </h4>
                <div className="rounded-md border divide-y">
                  {detail.participants.map((participant) => (
                    <div
                      key={String(participant.id ?? participant.user_id)}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="font-mono">{String(participant.user_id)}</span>
                      <StatusBadge
                        status={participant.status ?? 0}
                        labels={{ 0: '待确认', 1: '参加', 2: '不参加' }}
                        variants={{ 0: 'warning', 1: 'success', 2: 'secondary' }}
                      />
                    </div>
                  ))}
                  {detail.participants.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      暂无参与人数据
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canCancelSchedule && confirmCancelScheduleId.length > 0}
        onOpenChange={(open) => setConfirmCancelScheduleId(open ? confirmCancelScheduleId : '')}
        title="确认取消日程"
        description={`确定要取消日程 ${confirmCancelScheduleId} 吗？可通过“恢复日程”撤销。`}
        confirmText="取消日程"
        variant="destructive"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate(confirmCancelScheduleId)}
      />
      <ConfirmDialog
        open={canRestoreSchedule && confirmRestoreScheduleId.length > 0}
        onOpenChange={(open) => setConfirmRestoreScheduleId(open ? confirmRestoreScheduleId : '')}
        title="确认恢复日程"
        description={`确定要恢复日程 ${confirmRestoreScheduleId} 吗？`}
        confirmText="恢复日程"
        loading={restoreMutation.isPending}
        onConfirm={() => restoreMutation.mutate(confirmRestoreScheduleId)}
      />
    </div>
  )
}
