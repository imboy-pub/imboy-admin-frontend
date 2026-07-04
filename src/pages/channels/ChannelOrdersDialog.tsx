import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@/components/shared'
import { formatOptionalDate } from '@/lib/utils'
import type { EntityId } from '@/types/common'
import {
  getChannelOrdersPayload,
  type ChannelGovernanceListParams,
  type ChannelOrder,
} from '@/modules/channels/api'

type Props = {
  channelId: EntityId | null
  channelName?: string
  open: boolean
  onOpenChange: (_open: boolean) => void
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  '0': '待支付',
  '1': '已支付',
  '2': '已退款',
  '3': '已取消',
  '4': '已过期',
}

const ORDER_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  '0': 'warning',
  '1': 'success',
  '2': 'error',
  '3': 'secondary',
  '4': 'secondary',
}

export function ChannelOrdersDialog({ channelId, channelName, open, onOpenChange }: Props) {
  const [params, setParams] = useState<ChannelGovernanceListParams>({ page: 1, size: 10 })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['channel-orders', channelId, params],
    queryFn: () => getChannelOrdersPayload(channelId as EntityId, params),
    enabled: open && Boolean(channelId),
  })

  const orders = data?.items || []

  const columns: ColumnDef<ChannelOrder>[] = [
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
        <span className="font-mono tabular-nums">{row.original.currency} {row.original.amount}</span>
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
  ]

  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>频道订单</DialogTitle>
          <DialogDescription>
            {channelName ? `频道：${channelName}` : `频道 ID: ${channelId ?? '-'}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingState message="加载频道订单中..." />}
        {error && <ErrorState message="加载频道订单失败" onRetry={() => refetch()} />}
        {!isLoading && !error && (
          <div className="space-y-3">
            <DataTable table={table} />
            {data && (
              <DataTablePagination
                page={data.page}
                pageSize={data.size}
                total={data.total}
                onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
                onPageSizeChange={(size) => setParams((prev) => ({ ...prev, page: 1, size }))}
                dataUpdatedAt={dataUpdatedAt}
                onRefresh={() => refetch()}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
