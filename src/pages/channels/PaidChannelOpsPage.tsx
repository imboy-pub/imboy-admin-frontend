import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LegacyColumnDef, getCoreRowModel, useLegacyTable } from '@tanstack/react-table/legacy'
import { DollarSign, ListOrdered, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { useListQueryState } from '@/hooks/useListQueryState'
import type { EntityId } from '@/types/common'
import {
  getChannelListPayload,
  type Channel,
  type ChannelListParams,
} from '@/modules/channels/api'
import { SetChannelPriceDialog } from './SetChannelPriceDialog'
import { ChannelOrdersDialog } from './ChannelOrdersDialog'
import { Select } from '@/components/ui/select'

/** 付费频道 type 枚举值（0公开 1私密 2付费）。 */
const PAID_CHANNEL_TYPE = 2

type PaidChannelOpsQuery = {
  page: number
  size: number
  status: number
  keyword: string
}

type DialogTarget = {
  id: EntityId
  name: string
}

export function PaidChannelOpsPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<PaidChannelOpsQuery>({
      page: 1,
      size: 10,
      status: -1,
      keyword: '',
    })

  const [keywordInput, setKeywordInput] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [priceTarget, setPriceTarget] = useState<DialogTarget | null>(null)
  const [ordersTarget, setOrdersTarget] = useState<DialogTarget | null>(null)

  const requestParams: ChannelListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    keyword: params.keyword.trim() || undefined,
    // type 过滤已下沉到后端 /channel/list（adm_channel_handler），
    // 由服务端按 type 分页，避免前端过滤导致 total/page 与可见行数不一致
    type: PAID_CHANNEL_TYPE,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['paid-channels', requestParams],
    queryFn: () => getChannelListPayload(requestParams),
  })

  const paidChannels = data?.items || []

  const handleSearch = () => {
    setParams({ page: 1, keyword: keywordInput.trim(), status: Number(statusFilter) })
  }

  const handleReset = () => {
    setKeywordInput('')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, status: -1, keyword: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: LegacyColumnDef<Channel>[] = [
    {
      accessorKey: 'id',
      header: '频道 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'name',
      header: '频道名称',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-medium">{row.original.name}</div>
          {row.original.custom_id && (
            <div className="font-mono text-xs text-muted-foreground">@{row.original.custom_id}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'owner_id',
      header: '创建者',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.owner_id}</span>,
    },
    {
      accessorKey: 'subscriber_count',
      header: '订阅数',
      cell: ({ row }) => <span className="tabular-nums">{row.original.subscriber_count}</span>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'success', 0: 'warning', '-1': 'error' }}
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPriceTarget({ id: row.original.id, name: row.original.name })}
          >
            <DollarSign className="mr-1 h-4 w-4" />
            设置价格
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrdersTarget({ id: row.original.id, name: row.original.name })}
          >
            <ListOrdered className="mr-1 h-4 w-4" />
            查看订单
          </Button>
        </div>
      ),
    },
  ]

  const table = useLegacyTable({
    data: paidChannels,
    columns,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <LoadingState message="加载付费频道..." />
  if (error) return <ErrorState message="加载付费频道失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="付费频道运营" description="管理付费频道定价与订单（type=付费）" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索频道名称..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
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
              <option value="1">正常</option>
              <option value="0">禁用</option>
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
          {paidChannels.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              暂无付费频道
            </p>
          )}
        </CardContent>
      </Card>

      <SetChannelPriceDialog
        channelId={priceTarget?.id ?? null}
        channelName={priceTarget?.name}
        open={Boolean(priceTarget)}
        onOpenChange={(open) => { if (!open) setPriceTarget(null) }}
        onSuccess={() => refetch()}
      />

      <ChannelOrdersDialog
        channelId={ordersTarget?.id ?? null}
        channelName={ordersTarget?.name}
        open={Boolean(ordersTarget)}
        onOpenChange={(open) => { if (!open) setOrdersTarget(null) }}
      />
    </div>
  )
}
