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
  getBillingSubscriptionListPayload,
  BillingSubscriptionListParams,
} from '@/modules/finance/api'
import { BillingSubscription } from '@/types/billing'
import { formatDate, formatOptionalDate } from '@/lib/utils'
import {
  ColumnDef,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'

type BillingSubscriptionListPageQuery = {
  page: number
  size: number
  status: number
  tenant_id: string
}

const SUB_STATUS_LABELS: Record<string, string> = {
  '0': '试用',
  '1': '生效',
  '2': '过期',
  '3': '已取消',
}

const SUB_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  '0': 'info',
  '1': 'success',
  '2': 'error',
  '3': 'secondary',
}

export function BillingSubscriptionListPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<BillingSubscriptionListPageQuery>({
      page: 1,
      size: 10,
      status: -1,
      tenant_id: '',
    })

  const [tenantIdInput, setTenantIdInput] = useState(params.tenant_id || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [sorting, setSorting] = useState<SortingState>([])
  const [drawerSub, setDrawerSub] = useState<BillingSubscription | null>(null)

  const requestParams: BillingSubscriptionListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    tenant_id: params.tenant_id.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['billing-subscriptions', requestParams],
    queryFn: () => getBillingSubscriptionListPayload(requestParams),
  })

  const handleSearch = () => {
    setParams({
      page: 1,
      status: Number(statusFilter),
      tenant_id: tenantIdInput.trim(),
    })
  }

  const handleReset = () => {
    setTenantIdInput('')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, status: -1, tenant_id: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: ColumnDef<BillingSubscription>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'tenant_id',
      header: '租户 ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.tenant_id}</span>,
    },
    {
      accessorKey: 'plan_id',
      header: '套餐 ID',
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.plan_code || row.original.plan_id}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={SUB_STATUS_LABELS}
          variants={SUB_STATUS_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'auto_renew',
      header: '自动续费',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.auto_renew ? 1 : 0}
          labels={{ 1: '开启', 0: '关闭' }}
          variants={{ 1: 'success', 0: 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'current_period_end',
      header: '到期时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatOptionalDate(row.original.current_period_end)}
        </span>
      ),
    },
  ]

  const subscriptions = data?.items || []

  const table = useReactTable({
    data: subscriptions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载订阅数据..." />
  if (error) return <ErrorState message="加载订阅数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="订阅管理" description="查看租户订阅状态与周期" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="租户 ID..."
                value={tenantIdInput}
                onChange={(e) => setTenantIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">试用</option>
              <option value="1">生效</option>
              <option value="2">过期</option>
              <option value="3">已取消</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => setDrawerSub(row)} />
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
        open={Boolean(drawerSub)}
        onOpenChange={(open) => { if (!open) setDrawerSub(null) }}
        title={`订阅 #${drawerSub?.id ?? ''}`}
        subtitle={`租户 ${drawerSub?.tenant_id ?? ''}`}
      >
        {drawerSub && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">租户 ID</p>
                <p className="font-mono">{drawerSub.tenant_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">套餐</p>
                <p className="font-mono">{drawerSub.plan_code || drawerSub.plan_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <StatusBadge
                  status={drawerSub.status}
                  labels={SUB_STATUS_LABELS}
                  variants={SUB_STATUS_VARIANTS}
                />
              </div>
              <div>
                <p className="text-muted-foreground">自动续费</p>
                <StatusBadge
                  status={drawerSub.auto_renew ? 1 : 0}
                  labels={{ 1: '开启', 0: '关闭' }}
                  variants={{ 1: 'success', 0: 'secondary' }}
                />
              </div>
              <div>
                <p className="text-muted-foreground">周期开始</p>
                <p>{formatOptionalDate(drawerSub.current_period_start)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">周期结束</p>
                <p>{formatOptionalDate(drawerSub.current_period_end)}</p>
              </div>
              {drawerSub.created_at && (
                <div>
                  <p className="text-muted-foreground">创建时间</p>
                  <p>{formatDate(drawerSub.created_at)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </EntityDrawer>
    </div>
  )
}
