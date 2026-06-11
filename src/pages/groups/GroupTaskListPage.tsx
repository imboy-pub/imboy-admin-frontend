import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { CheckCircle2, Eye, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  getGroupTasksPayload,
  GroupTask,
} from '@/modules/groups/api'
import { formatOptionalDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import type { EntityId } from '@/types/common'
import { getErrorMessage } from '@/lib/errorUtils'
import { useListQueryState } from '@/hooks/useListQueryState'

const TASK_STATUS_LABELS: Record<number, string> = {
  1: '进行中',
  2: '待审核',
  3: '已完成',
}

const TASK_STATUS_VARIANTS: Record<number, 'success' | 'warning' | 'secondary'> = {
  1: 'success',
  2: 'warning',
  3: 'secondary',
}

type GroupTaskListQuery = {
  page: number
  size: number
  statusFilter: number
  activeGroupId: string
}

export function GroupTaskListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { state: params, setState: setParams } = useListQueryState<GroupTaskListQuery>({
    page: 1,
    size: 10,
    statusFilter: -1,
    activeGroupId: '',
  })

  // 群组ID输入框本地状态（提交前）
  const [groupIdInput, setGroupIdInput] = useState(params.activeGroupId || '')

  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [confirmCloseTaskId, setConfirmCloseTaskId] = useState('')

  const { allowed: canCloseTask } = useAdminPermission({
    permission: 'groups:task:close',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['group-task-list', params.activeGroupId, params.page, params.size, params.statusFilter],
    queryFn: () =>
      getGroupTasksPayload(params.activeGroupId as EntityId, {
        page: params.page,
        size: params.size,
        status: params.statusFilter >= 1 ? params.statusFilter : undefined,
      }),
    enabled: params.activeGroupId.length > 0,
  })

  const closeMutation = useMutation({
    mutationFn: closeGroupTask,
    onSuccess: async () => {
      toast.success('任务已强制关闭')
      setConfirmCloseTaskId('')
      await queryClient.invalidateQueries({ queryKey: ['group-task-list', params.activeGroupId] })
    },
    onError: (err: unknown) => {
      toast.error(`强制关闭任务失败: ${getErrorMessage(err)}`)
    },
  })

  const handleSearch = () => {
    const trimmed = groupIdInput.trim()
    if (trimmed.length === 0) {
      toast.error('请输入群组ID')
      return
    }
    setParams({ activeGroupId: trimmed, page: 1 })
    setSelectedTaskId('')
    setConfirmCloseTaskId('')
  }

  const handleStatusChange = (value: string) => {
    setParams({ statusFilter: Number(value), page: 1 })
  }

  const columns: ColumnDef<GroupTask>[] = useMemo(
    () => [
      {
        accessorKey: 'task_id',
        header: '任务ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.task_id}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: '任务标题',
        cell: ({ row }) => (
          <span className="font-medium">{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'creator_id',
        header: '创建者',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.creator_id ? String(row.original.creator_id) : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            labels={TASK_STATUS_LABELS}
            variants={TASK_STATUS_VARIANTS}
          />
        ),
      },
      {
        accessorKey: 'deadline',
        header: '截止时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatOptionalDate(row.original.deadline ?? undefined)}
          </span>
        ),
      },
      {
        accessorKey: 'group_id',
        header: '群组',
        cell: ({ row }) => (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 font-mono text-xs"
            onClick={() => navigate(`/groups/${String(row.original.group_id)}`)}
          >
            {String(row.original.group_id)}
          </Button>
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
              onClick={() => {
                navigate(`/groups/${String(row.original.group_id)}/tasks`)
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canCloseTask && row.original.status !== 3 && (
              <Button
                variant="ghost"
                size="icon"
                title="强制关闭任务"
                onClick={() => setConfirmCloseTaskId(row.original.task_id)}
              >
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canCloseTask, navigate]
  )

  const tasks = data?.items ?? []

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="群作业管理"
        description="按群组ID查询群作业列表，支持状态筛选与管理员操作"
      />

      {/* 筛选区 */}
      <Card>
        <CardHeader>
          <CardTitle>筛选条件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">群组ID</label>
              <div className="flex gap-2">
                <Input
                  data-testid="group-id-input"
                  value={groupIdInput}
                  onChange={(e) => setGroupIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  placeholder="输入群组ID后查询"
                  className="w-56"
                />
                <Button onClick={handleSearch} disabled={groupIdInput.trim().length === 0}>
                  <Search className="mr-2 h-4 w-4" />
                  查询
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">状态筛选</label>
              <select
                data-testid="status-filter"
                aria-label="状态筛选"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={String(params.statusFilter)}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="-1">全部</option>
                <option value="1">进行中</option>
                <option value="2">待审核</option>
                <option value="3">已完成</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 列表区 */}
      <Card>
        <CardHeader>
          <CardTitle>
            任务列表
            {params.activeGroupId && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                群组 {params.activeGroupId}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!params.activeGroupId && (
            <p className="text-sm text-muted-foreground">请先输入群组ID并点击查询</p>
          )}

          {params.activeGroupId && isLoading && (
            <LoadingState message="加载任务列表..." />
          )}

          {params.activeGroupId && error && (
            <ErrorState message="加载任务列表失败" onRetry={() => refetch()} />
          )}

          {params.activeGroupId && !isLoading && !error && (
            <>
              <DataTable
                table={table}
                onRowClick={(row) => setSelectedTaskId(row.task_id)}
              />

              {data && (
                <DataTablePagination
                  page={data.page}
                  pageSize={data.size}
                  total={data.total}
                  onPageChange={(p) => setParams({ page: p })}
                  onPageSizeChange={(nextSize) => setParams({ size: nextSize, page: 1 })}
                  dataUpdatedAt={dataUpdatedAt}
                  onRefresh={() => refetch()}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 详情提示（只读，引导跳转到群任务详情页） */}
      {selectedTaskId && (
        <Card>
          <CardHeader>
            <CardTitle>任务操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              已选中任务 <span className="font-mono">{selectedTaskId}</span>。
              如需查看完整详情或批改提交，请前往该群组的任务管理页面。
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/groups/${params.activeGroupId}/tasks`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                前往群任务管理
              </Button>
              {canCloseTask && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCloseTaskId(selectedTaskId)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  强制关闭此任务
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={canCloseTask && confirmCloseTaskId.length > 0}
        onOpenChange={(open) => setConfirmCloseTaskId(open ? confirmCloseTaskId : '')}
        title="确认强制关闭任务"
        description={`确定要强制关闭任务 ${confirmCloseTaskId} 吗？此操作不可撤销。`}
        confirmText="强制关闭"
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate(confirmCloseTaskId)}
      />
    </div>
  )
}
