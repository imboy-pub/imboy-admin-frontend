import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Lock, Unlock, Loader2 } from 'lucide-react'
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
} from '@/components/shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  getWalletListPayload,
  getWalletTransactionListPayload,
  freezeWallet,
  unfreezeWallet,
  WalletListParams,
} from '@/modules/finance/api'
import { Wallet, WalletTransaction } from '@/types/billing'
import type { EntityId } from '@/types/common'
import { formatDate } from '@/lib/utils'
import { fenToYuan, yuanToFen } from '@/lib/money'
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
  const [freezeDialog, setFreezeDialog] = useState<{ wallet: Wallet; op: 'freeze' | 'unfreeze' } | null>(null)
  const [amountYuan, setAmountYuan] = useState('')

  const qc = useQueryClient()
  const { allowed: canWriteFinance } = useAdminPermission({ permission: 'finance:write' })

  const closeFreeze = () => {
    setFreezeDialog(null)
    setAmountYuan('')
  }

  const { mutate: submitFreeze, isPending: freezing } = useMutation({
    mutationFn: ({ userId, amount, op }: { userId: EntityId; amount: number; op: 'freeze' | 'unfreeze' }) =>
      op === 'freeze' ? freezeWallet(userId, amount) : unfreezeWallet(userId, amount),
    onSuccess: (_res, vars) => {
      toast.success(vars.op === 'freeze' ? '冻结成功' : '解冻成功')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      closeFreeze()
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : '操作失败，请重试'),
  })

  // 金额（元）转分并校验：正数、不超过上限（冻结=可用余额，解冻=已冻结额）
  const amountFen = amountYuan.trim() === '' ? NaN : yuanToFen(amountYuan.trim())
  const freezeMaxFen = freezeDialog
    ? freezeDialog.op === 'freeze'
      ? freezeDialog.wallet.balance - freezeDialog.wallet.frozen
      : freezeDialog.wallet.frozen
    : 0
  const amountValid = Number.isFinite(amountFen) && amountFen > 0 && amountFen <= freezeMaxFen

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
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) =>
        row.original.status === 1 && canWriteFinance ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={row.original.balance - row.original.frozen <= 0}
              onClick={(e) => {
                e.stopPropagation()
                setAmountYuan('')
                setFreezeDialog({ wallet: row.original, op: 'freeze' })
              }}
            >
              <Lock className="mr-1 h-3.5 w-3.5" />
              冻结
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={row.original.frozen <= 0}
              onClick={(e) => {
                e.stopPropagation()
                setAmountYuan('')
                setFreezeDialog({ wallet: row.original, op: 'unfreeze' })
              }}
            >
              <Unlock className="mr-1 h-3.5 w-3.5" />
              解冻
            </Button>
          </div>
        ) : null,
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

      <Dialog
        open={freezeDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeFreeze()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {freezeDialog?.op === 'freeze' ? '冻结钱包资金' : '解冻钱包资金'}
            </DialogTitle>
            <DialogDescription>
              {freezeDialog
                ? `用户 ${freezeDialog.wallet.user_id} · 余额 ${fenToYuan(
                    freezeDialog.wallet.balance,
                  )} · 已冻结 ${fenToYuan(freezeDialog.wallet.frozen)}。${
                    freezeDialog.op === 'freeze'
                      ? `可冻结（可用余额）上限 ${fenToYuan(freezeMaxFen)}。`
                      : `可解冻（已冻结）上限 ${fenToYuan(freezeMaxFen)}。`
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">金额（元）</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="请输入金额（元）"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
            />
            {amountYuan.trim() !== '' && !amountValid && (
              <p className="text-xs text-destructive">
                金额须为正数且不超过上限 {fenToYuan(freezeMaxFen)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeFreeze} disabled={freezing}>
              取消
            </Button>
            <Button
              disabled={!amountValid || freezing}
              onClick={() =>
                freezeDialog &&
                amountValid &&
                submitFreeze({
                  userId: freezeDialog.wallet.user_id,
                  amount: amountFen,
                  op: freezeDialog.op,
                })
              }
            >
              {freezing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {freezeDialog?.op === 'freeze' ? '确认冻结' : '确认解冻'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
