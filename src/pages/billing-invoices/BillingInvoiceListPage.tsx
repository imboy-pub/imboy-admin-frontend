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
  getBillingInvoiceListPayload,
  BillingInvoiceListParams,
} from '@/modules/finance/api'
import { BillingInvoice } from '@/types/billing'
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

type BillingInvoiceListPageQuery = {
  page: number
  size: number
  status: number
  invoice_no: string
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  '0': '待付',
  '1': '已付',
  '2': '逾期',
}

const INVOICE_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  '0': 'warning',
  '1': 'success',
  '2': 'error',
}

export function BillingInvoiceListPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<BillingInvoiceListPageQuery>({
      page: 1,
      size: 10,
      status: -1,
      invoice_no: '',
    })

  const [invoiceNoInput, setInvoiceNoInput] = useState(params.invoice_no || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [sorting, setSorting] = useState<SortingState>([])
  const [drawerInvoice, setDrawerInvoice] = useState<BillingInvoice | null>(null)

  const requestParams: BillingInvoiceListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    invoice_no: params.invoice_no.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['billing-invoices', requestParams],
    queryFn: () => getBillingInvoiceListPayload(requestParams),
  })

  const handleSearch = () => {
    setParams({
      page: 1,
      status: Number(statusFilter),
      invoice_no: invoiceNoInput.trim(),
    })
  }

  const handleReset = () => {
    setInvoiceNoInput('')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, status: -1, invoice_no: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: ColumnDef<BillingInvoice>[] = [
    {
      accessorKey: 'invoice_no',
      header: '账单号',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.invoice_no}</span>,
    },
    {
      accessorKey: 'subscription_id',
      header: '订阅 ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.subscription_id}</span>,
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
          labels={INVOICE_STATUS_LABELS}
          variants={INVOICE_STATUS_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'period_start',
      header: '账期开始',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatOptionalDate(row.original.period_start)}
        </span>
      ),
    },
    {
      accessorKey: 'period_end',
      header: '账期结束',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatOptionalDate(row.original.period_end)}
        </span>
      ),
    },
    {
      accessorKey: 'paid_at',
      header: '支付时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatOptionalDate(row.original.paid_at)}
        </span>
      ),
    },
  ]

  const invoices = data?.items || []

  const table = useReactTable({
    data: invoices,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载账单数据..." />
  if (error) return <ErrorState message="加载账单数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="账单管理" description="查看订阅账单与支付情况" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="账单号..."
                value={invoiceNoInput}
                onChange={(e) => setInvoiceNoInput(e.target.value)}
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
              <option value="0">待付</option>
              <option value="1">已付</option>
              <option value="2">逾期</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => setDrawerInvoice(row)} />
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
        open={Boolean(drawerInvoice)}
        onOpenChange={(open) => { if (!open) setDrawerInvoice(null) }}
        title={`账单 ${drawerInvoice?.invoice_no ?? ''}`}
        subtitle={`订阅 ${drawerInvoice?.subscription_id ?? ''}`}
      >
        {drawerInvoice && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">账单号</p>
                <p className="font-mono">{drawerInvoice.invoice_no}</p>
              </div>
              <div>
                <p className="text-muted-foreground">订阅 ID</p>
                <p className="font-mono">{drawerInvoice.subscription_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">金额</p>
                <p className="font-medium tabular-nums">{fenToYuan(drawerInvoice.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <StatusBadge
                  status={drawerInvoice.status}
                  labels={INVOICE_STATUS_LABELS}
                  variants={INVOICE_STATUS_VARIANTS}
                />
              </div>
              <div>
                <p className="text-muted-foreground">账期开始</p>
                <p>{formatOptionalDate(drawerInvoice.period_start)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">账期结束</p>
                <p>{formatOptionalDate(drawerInvoice.period_end)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">支付时间</p>
                <p>{formatOptionalDate(drawerInvoice.paid_at)}</p>
              </div>
              {drawerInvoice.created_at && (
                <div>
                  <p className="text-muted-foreground">创建时间</p>
                  <p>{formatDate(drawerInvoice.created_at)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </EntityDrawer>
    </div>
  )
}
