import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  ChannelGovernanceListParams,
  ChannelOrder,
  getChannelOrdersPayload,
} from '@/modules/channels/api'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'

export function ChannelOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })
  const [statusFilter, setStatusFilter] = useState('-1')

  const queryKey = ['channel-orders', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelOrdersPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleStatusSearch = () => {
    setParams((prev) => ({
      ...prev,
      page: 1,
      status: statusFilter === '-1' ? undefined : Number(statusFilter),
    }))
  }

  const handleReset = () => {
    setStatusFilter('-1')
    setParams({ page: 1, size: 10 })
  }

  const orders = data?.items || []

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<ChannelOrder>[] = [
      { header: '订单ID', accessor: (row) => String(row.id) },
      { header: '订单号', accessor: (row) => row.order_no || '-' },
      { header: '用户ID', accessor: (row) => String(row.user_id) },
      { header: '用户昵称', accessor: (row) => row.user?.nickname || row.user?.account || '-' },
      { header: '金额', accessor: (row) => `${row.currency} ${row.amount}` },
      { header: '状态', accessor: (row) => ({ 0: '待支付', 1: '已支付', 2: '已取消', 3: '已退款' }[String(row.status)] || String(row.status)) },
      { header: '支付方式', accessor: (row) => row.payment_method || '-' },
      { header: '支付流水号', accessor: (row) => row.payment_no || '-' },
      { header: '支付时间', accessor: (row) => formatOptionalDate(row.payment_at) },
      { header: '订阅开始', accessor: (row) => formatOptionalDate(row.subscription_start_at) },
      { header: '订阅到期', accessor: (row) => formatOptionalDate(row.subscription_end_at) },
      { header: '创建时间', accessor: (row) => formatOptionalDate(row.created_at) },
    ]
    exportCsv(csvColumns, orders, 'channel_orders')
    toast.success(`已导出 ${orders.length} 条订单记录`)
  }

  const columns: ColumnDef<ChannelOrder>[] = [
    {
      accessorKey: 'id',
      header: '订单 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'order_no',
      header: '订单号',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.order_no}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '下单用户',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.user_id}</div>
          <div className="text-muted-foreground">
            {row.original.user?.nickname || row.original.user?.account || '-'}
          </div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: '金额',
      cell: ({ row }) => (
        <span className="font-mono">{row.original.currency} {row.original.amount}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 0: '待支付', 1: '已支付', 2: '已取消', 3: '已退款' }}
          variants={{ 0: 'warning', 1: 'success', 2: 'secondary', 3: 'error' }}
        />
      ),
    },
    {
      accessorKey: 'payment_method',
      header: '支付方式',
      cell: ({ row }) => <span>{row.original.payment_method || '-'}</span>,
    },
    {
      accessorKey: 'payment_at',
      header: '支付时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.payment_at)}</span>
      ),
    },
    {
      accessorKey: 'subscription_end_at',
      header: '订阅到期',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.subscription_end_at)}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.created_at)}</span>
      ),
    },
  ]

  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道订单中..." />
  }

  if (error || !channelId) {
    return <ErrorState message="加载频道订单失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道订单治理"
        description={`频道 ID: ${channelId}`}
        actions={(
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={orders.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回频道详情
            </Button>
          </div>
        )}
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleStatusSearch} onReset={handleReset} searchText="查询">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待支付</option>
              <option value="1">已支付</option>
              <option value="2">已取消</option>
              <option value="3">已退款</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
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
    </div>
  )
}
