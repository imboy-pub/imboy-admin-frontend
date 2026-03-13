import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  ChannelGovernanceListParams,
  ChannelOrder,
  getChannelOrdersPayload,
} from '@/services/api/channels'
import { formatDate } from '@/lib/utils'

function formatOptionalDate(value: string | null | undefined): string {
  if (!value) return '-'
  return formatDate(value)
}

export function ChannelOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })

  const queryKey = ['channel-orders', channelId, params] as const

  const { data, isLoading, error, refetch } = useQuery({
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
    data: data?.items || [],
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
          <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回频道详情
          </Button>
        )}
      />

      <Card>
        <CardHeader />
        <CardContent>
          <DataTable table={table} />
          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
