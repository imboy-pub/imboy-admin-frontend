import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
  FilterBar,
  EntityDrawer,
} from '@/components/shared'
import {
  getRechargeOrderListPayload,
  RechargeOrderListParams,
} from '@/modules/finance/api'
import { RechargeOrder } from '@/types/billing'
import { formatDate, formatOptionalDate } from '@/lib/utils'
import { fenToYuan } from '@/lib/money'
import {
  ColumnDef,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { Select } from '@/components/ui/select'

type RechargeOrderListPageQuery = {
  page: number
  size: number
  status: number
  payment_method: string
  order_no: string
}

const STATUS_LABELS: Record<string, string> = {
  '0': '待支付',
  '1': '已支付',
  '2': '退款中',
  '3': '已退款',
  '4': '已过期',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  '0': 'warning',
  '1': 'success',
  '2': 'info',
  '3': 'secondary',
  '4': 'error',
}

export function RechargeOrderListPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<RechargeOrderListPageQuery>({
      page: 1,
      size: 10,
      status: -1,
      payment_method: '',
      order_no: '',
    })

  const [orderNoInput, setOrderNoInput] = useState(params.order_no || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(params.payment_method || '')
  const [sorting, setSorting] = useState<SortingState>([])
  const [drawerOrder, setDrawerOrder] = useState<RechargeOrder | null>(null)

  const requestParams: RechargeOrderListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    payment_method: params.payment_method || undefined,
    order_no: params.order_no.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['recharge-orders', requestParams],
    queryFn: () => getRechargeOrderListPayload(requestParams),
  })

  const handleSearch = () => {
    setParams({
      page: 1,
      status: Number(statusFilter),
      payment_method: paymentMethodFilter,
      order_no: orderNoInput.trim(),
    })
  }

  const handleReset = () => {
    setOrderNoInput('')
    setStatusFilter('-1')
    setPaymentMethodFilter('')
    resetParams({ page: 1, size: 10, status: -1, payment_method: '', order_no: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: ColumnDef<RechargeOrder>[] = [
    {
      accessorKey: 'order_no',
      header: '订单号',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.order_no}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.user_id}</span>,
    },
    {
      accessorKey: 'amount',
      header: '金额',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{fenToYuan(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: 'payment_method',
      header: '支付方式',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.payment_method || '-'}</span>
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
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'paid_at',
      header: '支付时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.paid_at)}</span>
      ),
    },
  ]

  const orders = data?.items || []

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载充值订单数据..." />
  if (error) return <ErrorState message="加载充值订单数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="充值订单" description="查看用户充值订单与支付状态" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="订单号..."
                value={orderNoInput}
                onChange={(e) => setOrderNoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待支付</option>
              <option value="1">已支付</option>
              <option value="2">退款中</option>
              <option value="3">已退款</option>
              <option value="4">已过期</option>
            </Select>
            <Select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
            >
              <option value="">全部方式</option>
              <option value="alipay">支付宝</option>
              <option value="wechat">微信支付</option>
              <option value="stripe">Stripe</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => setDrawerOrder(row)} />
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
        open={Boolean(drawerOrder)}
        onOpenChange={(open) => { if (!open) setDrawerOrder(null) }}
        title={`充值订单 ${drawerOrder?.order_no ?? ''}`}
        subtitle={`用户 ${drawerOrder?.user_id ?? ''}`}
      >
        {drawerOrder && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">订单号</p>
                  <p className="font-mono">{drawerOrder.order_no}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">用户 ID</p>
                  <p className="font-mono">{drawerOrder.user_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">充值金额</p>
                  <p className="font-medium tabular-nums">{fenToYuan(drawerOrder.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">支付方式</p>
                  <p>{drawerOrder.payment_method || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">状态</p>
                  <StatusBadge
                    status={drawerOrder.status}
                    labels={STATUS_LABELS}
                    variants={STATUS_VARIANTS}
                  />
                </div>
                <div>
                  <p className="text-muted-foreground">创建时间</p>
                  <p>{formatDate(drawerOrder.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">支付时间</p>
                  <p>{formatOptionalDate(drawerOrder.paid_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">过期时间</p>
                  <p>{formatOptionalDate(drawerOrder.expired_at)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </EntityDrawer>
    </div>
  )
}
