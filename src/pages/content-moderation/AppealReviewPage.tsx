import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCoreRowModel, useLegacyTable } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DataTable,
  DataTablePagination,
  LoadingState,
  ErrorState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  getAppealListPayload,
  reviewAppeal,
  type AppealItem,
  type AppealStatus,
} from '@/services/api/appeals'
import { formatDate } from '@/lib/utils'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { Select } from '@/components/ui/select'

type PageQuery = {
  page: number
  size: number
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待复审',
  accepted: '已翻案',
  rejected: '已维持',
}

const STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
}

function truncateReason(reason: string): string {
  return reason.length > 60 ? `${reason.slice(0, 60)}…` : reason
}

export function AppealReviewPage() {
  const queryClient = useQueryClient()

  const { state: params, setState: setParams } = useListQueryState<PageQuery>({
    page: 1,
    size: 10,
    status: 'all',
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['moderation-appeals', params],
    queryFn: () =>
      getAppealListPayload({
        page: params.page,
        size: params.size,
        status: params.status === 'all' ? undefined : (params.status as AppealStatus),
      }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      verdict,
      reason,
    }: {
      id: EntityId
      verdict: 'accept' | 'reject'
      reason?: string
    }) => reviewAppeal(id, verdict, reason),
    onSuccess: (_data, variables) => {
      toast.success(variables.verdict === 'accept' ? '已翻案：原处置已撤销' : '已维持原处置')
      void queryClient.invalidateQueries({ queryKey: ['moderation-appeals'] })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const columns = [
    { accessorKey: 'id', header: '申诉ID' },
    { accessorKey: 'appellant_uid', header: '申诉人' },
    { accessorKey: 'action_id', header: '处置动作' },
    {
      accessorKey: 'reason',
      header: '申诉理由',
      cell: ({ row }: { row: { original: AppealItem } }) => (
        <span title={row.original.reason}>{truncateReason(row.original.reason)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }: { row: { original: AppealItem } }) => (
        <StatusBadge
          status={row.original.status}
          labels={STATUS_LABELS}
          variants={STATUS_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '申诉时间',
      cell: ({ row }: { row: { original: AppealItem } }) => formatDate(row.original.created_at),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }: { row: { original: AppealItem } }) => (
        <AppealActions
          disabled={row.original.status !== 'pending'}
          busy={reviewMutation.isPending}
          onReview={(verdict) => reviewMutation.mutate({ id: row.original.id, verdict })}
        />
      ),
    },
  ]

  const table = useLegacyTable({
    data: data?.list ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="处置申诉复审"
        description="被处置用户对处置动作的申诉。原处置执行者不能复审（独立复审由服务端强制）。"
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>申诉列表</CardTitle>
            <Select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={params.status}
              onChange={(e) => setParams({ status: e.target.value, page: 1 })}
            >
              <option value="all">全部状态</option>
              <option value="pending">待复审</option>
              <option value="accepted">已翻案</option>
              <option value="rejected">已维持</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <LoadingState message="加载申诉列表..." />
          ) : error ? (
            <ErrorState message="加载申诉列表失败" onRetry={() => refetch()} />
          ) : (
            <>
              <DataTable table={table} emptyMessage="当前没有申诉记录" />
              <DataTablePagination
                page={params.page}
                pageSize={params.size}
                total={data?.list.length ?? 0}
                onPageChange={(p) => setParams({ page: p })}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AppealActions({
  disabled,
  busy,
  onReview,
}: {
  disabled: boolean
  busy: boolean
  onReview: (_verdict: 'accept' | 'reject') => void
}) {
  const [confirming, setConfirming] = useState<'accept' | 'reject' | null>(null)

  if (disabled) {
    return <span className="text-xs text-muted-foreground">已终审</span>
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onReview(confirming)}
        >
          确认{confirming === 'accept' ? '翻案' : '维持'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
          取消
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming('accept')}>
        翻案
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming('reject')}>
        维持
      </Button>
    </div>
  )
}
