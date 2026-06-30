import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Download, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  refundChannelOrder,
} from '@/modules/channels/api'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { Select } from '@/components/ui/select'

const ORDER_STATUS_LABELS: Record<number, string> = {
  0: '待支付',
  1: '已支付',
  2: '已退款',
  3: '已取消',
  4: '已过期',
}

const ORDER_STATUS_VARIANTS: Record<number, 'warning' | 'success' | 'error' | 'secondary'> = {
  0: 'warning',
  1: 'success',
  2: 'error',
  3: 'secondary',
  4: 'secondary',
}

export function ChannelOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const channelId = id ?? ''

  const queryClient = useQueryClient()
  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })
  const [statusFilter, setStatusFilter] = useState('-1')
  // 退款对话框：受控承载「退款原因」输入；关闭即清空
  const [refundOrder, setRefundOrder] = useState<ChannelOrder | null>(null)
  const [refundReason, setRefundReason] = useState('')
  // 行级 pending：仅禁用正在处理的那一行
  const [actingOrderNo, setActingOrderNo] = useState<string | null>(null)

  const { allowed: canRefund } = useAdminPermission({
    permission: 'channel_order_refund',
  })

  const queryKey = ['channel-orders', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelOrdersPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const refundMutation = useMutation({
    mutationFn: ({ orderNo, reason }: { orderNo: string; reason: string }) =>
      refundChannelOrder(orderNo, reason),
    onSuccess: () => {
      toast.success('已退款')
      setRefundOrder(null)
      setRefundReason('')
      queryClient.invalidateQueries({ queryKey: ['channel-orders'] })
    },
    onError: (err: unknown) => toast.error(`退款失败: ${getErrorMessage(err)}`),
    onSettled: () => setActingOrderNo(null),
  })

  const openRefundDialog = (order: ChannelOrder) => {
    setRefundOrder(order)
    setRefundReason('')
  }

  const closeRefundDialog = () => {
    setRefundOrder(null)
    setRefundReason('')
  }

  const handleRefundConfirm = () => {
    const reason = refundReason.trim()
    if (!refundOrder || reason.length === 0) return
    setActingOrderNo(refundOrder.order_no)
    refundMutation.mutate({ orderNo: refundOrder.order_no, reason })
  }

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
      { header: '状态', accessor: (row) => ORDER_STATUS_LABELS[row.status] || String(row.status) },
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
          labels={ORDER_STATUS_LABELS}
          variants={ORDER_STATUS_VARIANTS}
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
    ...(canRefund
      ? [
          {
            id: 'actions',
            header: '操作',
            cell: ({ row }: { row: { original: ChannelOrder } }) =>
              row.original.status === 1 ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actingOrderNo === row.original.order_no}
                  onClick={() => openRefundDialog(row.original)}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  退款
                </Button>
              ) : null,
          } as ColumnDef<ChannelOrder>,
        ]
      : []),
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
            <Select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待支付</option>
              <option value="1">已支付</option>
              <option value="2">已退款</option>
              <option value="3">已取消</option>
              <option value="4">已过期</option>
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
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={refundOrder !== null}
        onOpenChange={(open) => {
          if (!open) closeRefundDialog()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>订单退款</DialogTitle>
            <DialogDescription>退款不可撤销，请确认订单信息无误后填写退款原因。</DialogDescription>
          </DialogHeader>

          {refundOrder && (
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <div>
                  订单号：<span className="font-mono">{refundOrder.order_no}</span>
                </div>
                <div>
                  用户：{refundOrder.user?.nickname || refundOrder.user?.account || refundOrder.user_id}
                </div>
                <div>
                  金额：
                  <span className="font-mono">
                    {refundOrder.currency} {refundOrder.amount}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-reason" className="font-medium">
                  退款原因
                </Label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="请填写退款原因（必填）"
                  maxLength={200}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeRefundDialog} disabled={refundMutation.isPending}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleRefundConfirm}
              disabled={refundReason.trim().length === 0 || refundMutation.isPending}
            >
              {refundMutation.isPending ? '退款中...' : '确认退款'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
