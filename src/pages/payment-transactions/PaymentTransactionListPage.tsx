import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
  FilterBar,
  EntityDrawer,
  ConfirmDialog,
} from '@/components/shared'
import {
  getPaymentTransactionListPayload,
  refundPaymentTransaction,
  PaymentTransactionListParams,
} from '@/modules/finance/api'
import { PaymentTransaction } from '@/types/billing'
import { formatDate } from '@/lib/utils'
import { fenToYuan } from '@/lib/money'
import { LegacyColumnDef, useLegacyTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table/legacy'
import { SortingState } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { Select } from '@/components/ui/select'

type PaymentTransactionListPageQuery = {
  page: number
  size: number
  gateway: string
  biz_type: number
  status: number
}

const BIZ_TYPE_LABELS: Record<string, string> = {
  '1': '充值',
  '2': '频道',
  '3': '账单',
}

const TX_STATUS_LABELS: Record<string, string> = {
  '0': '待付',
  '1': '成功',
  '2': '失败',
  '3': '已退款',
  '4': '部分退款',
  '5': '退款中',
}

const TX_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  '0': 'warning',
  '1': 'success',
  '2': 'error',
  '3': 'secondary',
  '4': 'info',
  '5': 'warning',
}

export function PaymentTransactionListPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<PaymentTransactionListPageQuery>({
      page: 1,
      size: 10,
      gateway: '',
      biz_type: -1,
      status: -1,
    })

  const [tradeNoInput, setTradeNoInput] = useState('')
  // Committed only on explicit search/Enter — not on every keystroke.
  const [committedTradeNo, setCommittedTradeNo] = useState('')
  const [gatewayFilter, setGatewayFilter] = useState(params.gateway || '')
  const [bizTypeFilter, setBizTypeFilter] = useState(String(params.biz_type))
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [sorting, setSorting] = useState<SortingState>([])
  const [drawerTx, setDrawerTx] = useState<PaymentTransaction | null>(null)
  const [refundTarget, setRefundTarget] = useState<PaymentTransaction | null>(null)

  const qc = useQueryClient()
  const { allowed: canWriteFinance } = useAdminPermission({ permission: 'finance:write' })

  const { mutate: doRefund, isPending: refunding } = useMutation({
    mutationFn: (tx: PaymentTransaction) => refundPaymentTransaction(tx.trade_no),
    onSuccess: () => {
      toast.success('退款成功')
      qc.invalidateQueries({ queryKey: ['payment-transactions'] })
      setRefundTarget(null)
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : '退款失败，请重试'),
  })

  const requestParams: PaymentTransactionListParams = {
    page: params.page,
    size: params.size,
    gateway: params.gateway || undefined,
    biz_type: params.biz_type === -1 ? undefined : params.biz_type,
    status: params.status === -1 ? undefined : params.status,
    trade_no: committedTradeNo.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['payment-transactions', requestParams],
    queryFn: () => getPaymentTransactionListPayload(requestParams),
  })

  const handleSearch = () => {
    setCommittedTradeNo(tradeNoInput)
    setParams({
      page: 1,
      gateway: gatewayFilter,
      biz_type: Number(bizTypeFilter),
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
    setTradeNoInput('')
    setCommittedTradeNo('')
    setGatewayFilter('')
    setBizTypeFilter('-1')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, gateway: '', biz_type: -1, status: -1 })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: LegacyColumnDef<PaymentTransaction>[] = [
    {
      accessorKey: 'trade_no',
      header: '交易号',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.trade_no}</span>,
    },
    {
      accessorKey: 'biz_type',
      header: '业务类型',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.biz_type}
          labels={BIZ_TYPE_LABELS}
          variants={{ '1': 'info', '2': 'warning', '3': 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'gateway',
      header: '支付网关',
      cell: ({ row }) => <span className="text-sm">{row.original.gateway}</span>,
    },
    {
      accessorKey: 'gateway_payment_no',
      header: '网关交易号',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.gateway_payment_no || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: '金额',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{fenToYuan(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={TX_STATUS_LABELS}
          variants={TX_STATUS_VARIANTS}
        />
      ),
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
      // 仅账单类(biz_type=3)成功流水可原路退回；充值/频道订单须走各自专用退款入口（后端会拒绝）
      cell: ({ row }) =>
        row.original.status === 1 && row.original.biz_type === 3 && canWriteFinance ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              setRefundTarget(row.original)
            }}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5 text-destructive" />
            退款
          </Button>
        ) : null,
    },
  ]

  const transactions = data?.items || []

  const table = useLegacyTable({
    data: transactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载支付流水数据..." />
  if (error) return <ErrorState message="加载支付流水数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="支付流水" description="对账视图：查看全量支付交易记录" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="交易号..."
                value={tradeNoInput}
                onChange={(e) => setTradeNoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select
              className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={gatewayFilter}
              onChange={(e) => setGatewayFilter(e.target.value)}
            >
              <option value="">全部网关</option>
              <option value="alipay">支付宝</option>
              <option value="wechat">微信支付</option>
              <option value="stripe">Stripe</option>
            </Select>
            <Select
              className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={bizTypeFilter}
              onChange={(e) => setBizTypeFilter(e.target.value)}
            >
              <option value="-1">全部类型</option>
              <option value="1">充值</option>
              <option value="2">频道</option>
              <option value="3">账单</option>
            </Select>
            <Select
              className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待付</option>
              <option value="1">成功</option>
              <option value="2">失败</option>
              <option value="3">已退款</option>
              <option value="4">部分退款</option>
              <option value="5">退款中</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => setDrawerTx(row)} />
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

      <EntityDrawer
        open={Boolean(drawerTx)}
        onOpenChange={(open) => { if (!open) setDrawerTx(null) }}
        title={`支付流水 ${drawerTx?.trade_no ?? ''}`}
        subtitle={drawerTx ? `${BIZ_TYPE_LABELS[String(drawerTx.biz_type)] ?? '-'} / ${drawerTx.gateway}` : ''}
      >
        {drawerTx && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">交易号</p>
                <p className="font-mono text-xs">{drawerTx.trade_no}</p>
              </div>
              <div>
                <p className="text-muted-foreground">网关交易号</p>
                <p className="font-mono text-xs">{drawerTx.gateway_payment_no || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">业务类型</p>
                <StatusBadge
                  status={drawerTx.biz_type}
                  labels={BIZ_TYPE_LABELS}
                  variants={{ '1': 'info', '2': 'warning', '3': 'secondary' }}
                />
              </div>
              <div>
                <p className="text-muted-foreground">支付网关</p>
                <p>{drawerTx.gateway}</p>
              </div>
              <div>
                <p className="text-muted-foreground">金额</p>
                <p className="font-medium tabular-nums">{fenToYuan(drawerTx.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <StatusBadge
                  status={drawerTx.status}
                  labels={TX_STATUS_LABELS}
                  variants={TX_STATUS_VARIANTS}
                />
              </div>
              <div>
                <p className="text-muted-foreground">创建时间</p>
                <p>{formatDate(drawerTx.created_at)}</p>
              </div>
            </div>
          </div>
        )}
      </EntityDrawer>

      <ConfirmDialog
        open={refundTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null)
        }}
        variant="destructive"
        title="确认原路退回该支付流水？"
        description={
          refundTarget
            ? `交易号 ${refundTarget.trade_no} · 网关 ${refundTarget.gateway} · 金额 ${fenToYuan(
                refundTarget.amount,
              )}。将通过原支付网关原路退回并标记流水为已退款，操作不可撤销。`
            : ''
        }
        confirmText="确认退款"
        loading={refunding}
        onConfirm={() => {
          if (refundTarget) doRefund(refundTarget)
        }}
      />
    </div>
  )
}
