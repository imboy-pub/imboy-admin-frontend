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
  getWalletListPayload,
  getWalletTransactionListPayload,
  WalletListParams,
} from '@/modules/finance/api'
import { Wallet, WalletTransaction } from '@/types/billing'
import type { EntityId } from '@/types/common'
import { formatDate } from '@/lib/utils'
import { fenToYuan } from '@/lib/money'
import { ColumnDef, useReactTable, getCoreRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { Select } from '@/components/ui/select'

type WalletListPageQuery = {
  page: number
  size: number
  status: number
  user_id: string
}

export function WalletListPage() {
  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<WalletListPageQuery>({
      page: 1,
      size: 10,
      status: -1,
      user_id: '',
    })

  const [userIdInput, setUserIdInput] = useState(params.user_id || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [sorting, setSorting] = useState<SortingState>([])
  const [drawerWallet, setDrawerWallet] = useState<Wallet | null>(null)

  const requestParams: WalletListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    user_id: params.user_id.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['wallets', requestParams],
    queryFn: () => getWalletListPayload(requestParams),
  })

  const {
    data: txData,
    isLoading: txLoading,
    error: txError,
  } = useQuery({
    queryKey: ['wallet-transactions', drawerWallet?.user_id],
    queryFn: () =>
      getWalletTransactionListPayload({
        user_id: drawerWallet?.user_id as EntityId,
        page: 1,
        size: 10,
      }),
    enabled: Boolean(drawerWallet),
  })

  const handleSearch = () => {
    setParams({
      page: 1,
      user_id: userIdInput.trim(),
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
    setUserIdInput('')
    setStatusFilter('-1')
    resetParams({ page: 1, size: 10, status: -1, user_id: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: ColumnDef<Wallet>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.user_id}</span>,
    },
    {
      accessorKey: 'balance',
      header: '余额',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {fenToYuan(row.original.balance)}
        </span>
      ),
    },
    {
      accessorKey: 'frozen',
      header: '冻结金额',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {fenToYuan(row.original.frozen)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '冻结' }}
          variants={{ 1: 'success', 0: 'warning' }}
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
  ]

  const wallets = data?.items || []

  const table = useReactTable({
    data: wallets,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载钱包数据..." />
  if (error) return <ErrorState message="加载钱包数据失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="钱包管理" description="查看用户钱包余额与交易流水" />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="用户 ID..."
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
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
              <option value="0">冻结</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => setDrawerWallet(row)} />
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
        open={Boolean(drawerWallet)}
        onOpenChange={(open) => { if (!open) setDrawerWallet(null) }}
        title={`钱包 #${drawerWallet?.id ?? ''}`}
        subtitle={`用户 ${drawerWallet?.user_id ?? ''}`}
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">余额</p>
                <p className="font-medium tabular-nums">{fenToYuan(drawerWallet?.balance)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">冻结金额</p>
                <p className="tabular-nums">{fenToYuan(drawerWallet?.frozen)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                {drawerWallet && (
                  <StatusBadge
                    status={drawerWallet.status}
                    labels={{ 1: '正常', 0: '冻结' }}
                    variants={{ 1: 'success', 0: 'warning' }}
                  />
                )}
              </div>
              <div>
                <p className="text-muted-foreground">创建时间</p>
                <p>{drawerWallet?.created_at ? formatDate(drawerWallet.created_at) : '-'}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 font-medium">最近交易流水（仅显示最新 10 条）</p>
            {txLoading && <p className="text-muted-foreground text-xs">加载中...</p>}
            {txError && <p className="text-destructive text-xs">加载流水失败</p>}
            {txData && txData.items.length === 0 && (
              <p className="text-muted-foreground text-xs">暂无流水记录</p>
            )}
            {txData && txData.items.length > 0 && (
              <div className="space-y-2">
                {txData.items.map((tx: WalletTransaction) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-mono text-muted-foreground">{tx.id}</span>
                      {tx.remark && <span className="ml-2 text-muted-foreground">{tx.remark}</span>}
                    </div>
                    <span
                      className={
                        tx.amount >= 0
                          ? 'font-medium text-green-600 tabular-nums'
                          : 'font-medium text-destructive tabular-nums'
                      }
                    >
                      {tx.amount >= 0 ? '+' : ''}{fenToYuan(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </EntityDrawer>
    </div>
  )
}
