import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle } from 'lucide-react'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
  FilterBar,
  ConfirmDialog,
} from '@/components/shared'
import {
  getWithdrawals,
  completeWithdrawal,
  rejectWithdrawal,
  WithdrawalListParams,
} from '@/modules/finance/api'
import type { WithdrawalTransaction } from '@/types/billing'
import type { EntityId } from '@/types/common'
import { formatDate } from '@/lib/utils'
import { fenToYuan } from '@/lib/money'
import { ColumnDef, useReactTable, getCoreRowModel } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { toast } from 'sonner'
import { Select } from '@/components/ui/select'

type PageQuery = { page: number; size: number; status: number; user_id: string }

const STATUS_LABELS: Record<number, string> = { 0: '待处理', 1: '已完成', 2: '已拒绝' }
const STATUS_VARIANTS: Record<number, 'warning' | 'success' | 'error'> = {
  0: 'warning',
  1: 'success',
  2: 'error',
}

export function WithdrawalsPage() {
  const qc = useQueryClient()
  const { allowed: canWriteFinance } = useAdminPermission({ permission: 'finance:write' })
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<PageQuery>({ page: 1, size: 10, status: -1, user_id: '' })

  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [userIdInput, setUserIdInput] = useState(params.user_id || '')
  // 行级 pending：仅禁用正在处理的那一行，而非全表
  const [actingId, setActingId] = useState<EntityId | null>(null)
  // 不可逆金融操作的二次确认
  const [confirmAction, setConfirmAction] = useState<{
    type: 'complete' | 'reject'
    row: WithdrawalTransaction
  } | null>(null)

  const requestParams: WithdrawalListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    user_id: params.user_id.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['withdrawals', requestParams],
    queryFn: () => getWithdrawals(requestParams),
  })

  const { mutate: markComplete } = useMutation({
    mutationFn: (id: EntityId) => completeWithdrawal(id),
    onSuccess: () => {
      toast.success('已标记完成')
      qc.invalidateQueries({ queryKey: ['withdrawals'] })
    },
    onError: () => toast.error('操作失败，请重试'),
    onSettled: () => setActingId(null),
  })

  const { mutate: markReject } = useMutation({
    mutationFn: (id: EntityId) => rejectWithdrawal(id),
    onSuccess: () => {
      toast.success('已拒绝提现')
      qc.invalidateQueries({ queryKey: ['withdrawals'] })
    },
    onError: () => toast.error('操作失败，请重试'),
    onSettled: () => setActingId(null),
  })

  const handleConfirm = () => {
    if (!confirmAction) return
    const { type, row } = confirmAction
    setActingId(row.id)
    if (type === 'complete') markComplete(row.id)
    else markReject(row.id)
  }

  const handleSearch = () =>
    setParams({ page: 1, user_id: userIdInput.trim(), status: Number(statusFilter) })

  const handleReset = () => {
    setUserIdInput('')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, status: -1, user_id: '' })
  }

  const columns: ColumnDef<WithdrawalTransaction>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.user_id}</span>,
    },
    {
      accessorKey: 'amount',
      header: '提现金额',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-destructive">
          {fenToYuan(Math.abs(row.original.amount))}
        </span>
      ),
    },
    {
      accessorKey: 'reference_no',
      header: '单号',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.reference_no}</span>
      ),
    },
    {
      accessorKey: 'remark',
      header: '备注',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.remark ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={STATUS_LABELS}
          variants={STATUS_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '申请时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) =>
        row.original.status === 0 && canWriteFinance ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={actingId === row.original.id}
              onClick={() => setConfirmAction({ type: 'complete', row: row.original })}
            >
              <CheckCircle className="mr-1 h-3.5 w-3.5 text-green-600" />
              完成
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={actingId === row.original.id}
              onClick={() => setConfirmAction({ type: 'reject', row: row.original })}
            >
              <XCircle className="mr-1 h-3.5 w-3.5 text-destructive" />
              拒绝
            </Button>
          </div>
        ) : null,
    },
  ]

  const items = data?.items ?? []
  const table = useReactTable({
    data: items,
    columns,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <LoadingState message="加载提现数据..." />
  if (error) return <ErrorState message="加载提现数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="提现审核"
        description="查看并处理用户提现申请（标记完成 = 已手动打款）"
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <input
              className="h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
              placeholder="用户 ID..."
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待处理</option>
              <option value="1">已完成</option>
              <option value="2">已拒绝</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={(page) => setParams({ page })}
              onPageSizeChange={(size) => setParams({ page: 1, size })}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        variant="destructive"
        title={confirmAction?.type === 'complete' ? '确认标记为已完成？' : '确认拒绝该提现？'}
        description={
          confirmAction
            ? `用户 ${confirmAction.row.user_id} · 金额 ${fenToYuan(
                Math.abs(confirmAction.row.amount),
              )} · 单号 ${confirmAction.row.reference_no}。${
                confirmAction.type === 'complete'
                  ? '标记完成代表已手动打款，操作不可撤销。'
                  : '拒绝将触发钱包原子退款，操作不可撤销。'
              }`
            : ''
        }
        confirmText={confirmAction?.type === 'complete' ? '确认完成' : '确认拒绝'}
        loading={actingId !== null}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
