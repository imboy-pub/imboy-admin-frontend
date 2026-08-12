import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
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
  getBillingPlanListPayload,
  createBillingPlan,
  updateBillingPlan,
  BillingPlanListParams,
} from '@/modules/finance/api'
import { BillingPlan, CreateBillingPlanParams } from '@/types/billing'
import type { EntityId } from '@/types/common'
import { formatDate } from '@/lib/utils'
import { fenToYuan, yuanToFen } from '@/lib/money'
import { getErrorMessage } from '@/lib/errorUtils'
import { LegacyColumnDef, useLegacyTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table/legacy'
import { SortingState } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { Select } from '@/components/ui/select'

type BillingPlanListPageQuery = {
  page: number
  size: number
  status: number
  billing_period: string
}

type PlanFormState = {
  code: string
  name: string
  priceYuan: string
  billing_period: 'month' | 'year'
  status: number
  quota_config_str: string
  description: string
}

const EMPTY_FORM: PlanFormState = {
  code: '',
  name: '',
  priceYuan: '',
  billing_period: 'month',
  status: 1,
  quota_config_str: '',
  description: '',
}

function formToParams(form: PlanFormState): CreateBillingPlanParams {
  let quota_config: Record<string, unknown> | undefined
  if (form.quota_config_str.trim()) {
    try {
      quota_config = JSON.parse(form.quota_config_str) as Record<string, unknown>
    } catch {
      // ignored — validated before submit
    }
  }
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    price: yuanToFen(form.priceYuan),
    billing_period: form.billing_period,
    status: form.status,
    quota_config,
    description: form.description.trim() || undefined,
  }
}

export function BillingPlanListPage() {
  const queryClient = useQueryClient()

  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<BillingPlanListPageQuery>({
      page: 1,
      size: 10,
      status: -1,
      billing_period: '',
    })

  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [periodFilter, setPeriodFilter] = useState(params.billing_period || '')
  const [sorting, setSorting] = useState<SortingState>([])
  const [editTarget, setEditTarget] = useState<BillingPlan | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const requestParams: BillingPlanListParams = {
    page: params.page,
    size: params.size,
    status: params.status === -1 ? undefined : params.status,
    billing_period: params.billing_period || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['billing-plans', requestParams],
    queryFn: () => getBillingPlanListPayload(requestParams),
  })

  const { allowed: canWriteFinance } = useAdminPermission({ permission: 'finance:write' })

  const createMutation = useMutation({
    mutationFn: createBillingPlan,
    onSuccess: () => {
      toast.success('套餐已创建')
      setIsCreating(false)
      setForm(EMPTY_FORM)
      queryClient.invalidateQueries({ queryKey: ['billing-plans'] })
    },
    onError: (err: unknown) => toast.error(`创建失败: ${getErrorMessage(err)}`),
  })

  const updateMutation = useMutation({
    mutationFn: updateBillingPlan,
    onSuccess: () => {
      toast.success('套餐已更新')
      setEditTarget(null)
      queryClient.invalidateQueries({ queryKey: ['billing-plans'] })
    },
    onError: (err: unknown) => toast.error(`更新失败: ${getErrorMessage(err)}`),
  })

  const openCreate = () => {
    setFormError(null)
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setIsCreating(true)
  }

  const openEdit = (plan: BillingPlan) => {
    setFormError(null)
    setIsCreating(false)
    setForm({
      code: plan.code,
      name: plan.name,
      priceYuan: (plan.price / 100).toFixed(2),
      billing_period: plan.billing_period,
      status: plan.status,
      quota_config_str: plan.quota_config ? JSON.stringify(plan.quota_config, null, 2) : '',
      description: plan.description || '',
    })
    setEditTarget(plan)
  }

  const validateForm = (): boolean => {
    if (!form.code.trim()) { setFormError('套餐编码不能为空'); return false }
    if (!form.name.trim()) { setFormError('套餐名称不能为空'); return false }
    if (!form.priceYuan || Number.isNaN(Number(form.priceYuan))) {
      setFormError('价格必须是有效数字（元）')
      return false
    }
    if (Number(form.priceYuan) < 0) {
      setFormError('价格不能为负数')
      return false
    }
    if (form.quota_config_str.trim()) {
      try { JSON.parse(form.quota_config_str) } catch {
        setFormError('配额配置 JSON 格式有误')
        return false
      }
    }
    setFormError(null)
    return true
  }

  const handleSubmit = () => {
    if (!validateForm()) return
    const p = formToParams(form)
    if (isCreating) {
      createMutation.mutate(p)
    } else if (editTarget) {
      updateMutation.mutate({ id: editTarget.id as EntityId, ...p })
    }
  }

  const handleSearch = () => {
    setParams({ page: 1, status: Number(statusFilter), billing_period: periodFilter })
  }

  const handleReset = () => {
    setStatusFilter('-1')
    setPeriodFilter('')
    resetParams({ page: 1, size: 10, status: -1, billing_period: '' })
  }

  const handlePageChange = (page: number) => setParams({ page })
  const handlePageSizeChange = (size: number) => setParams({ page: 1, size })

  const columns: LegacyColumnDef<BillingPlan>[] = [
    {
      accessorKey: 'code',
      header: '编码',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: '套餐名称',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'price',
      header: '价格',
      cell: ({ row }) => (
        <span className="tabular-nums">{fenToYuan(row.original.price)}</span>
      ),
    },
    {
      accessorKey: 'billing_period',
      header: '计费周期',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.billing_period}
          labels={{ month: '月付', year: '年付' }}
          variants={{ month: 'info', year: 'warning' }}
        />
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '上架', 0: '下架' }}
          variants={{ 1: 'success', 0: 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.created_at ? formatDate(row.original.created_at) : '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) =>
        !canWriteFinance ? null : (
        <Button
          variant="ghost"
          size="icon"
          title="编辑套餐"
          onClick={(e) => { e.stopPropagation(); openEdit(row.original) }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const plans = data?.items || []

  const table = useLegacyTable({
    data: plans,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <LoadingState message="加载套餐数据..." />
  if (error) return <ErrorState message="加载套餐数据失败" onRetry={() => refetch()} />

  const drawerOpen = isCreating || editTarget !== null
  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title="套餐管理"
        description="管理 SaaS 订阅套餐与定价"
        actions={!canWriteFinance ? undefined : (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            新建套餐
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <Select
              className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="1">上架</option>
              <option value="0">下架</option>
            </Select>
            <Select
              className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
            >
              <option value="">全部周期</option>
              <option value="month">月付</option>
              <option value="year">年付</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => openEdit(row)} />
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
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) { setIsCreating(false); setEditTarget(null) }
        }}
        title={isCreating ? '新建套餐' : `编辑套餐 ${editTarget?.code ?? ''}`}
        subtitle={isCreating ? undefined : editTarget?.name}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => { setIsCreating(false); setEditTarget(null) }}
              disabled={isMutating}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isMutating}>
              {isMutating ? '保存中...' : '保存'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4 text-sm">
          {formError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">{formError}</p>
          )}
          <div className="space-y-2">
            <label className="font-medium">套餐编码 *</label>
            <Input
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="如 free / professional / enterprise"
              disabled={!isCreating}
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">套餐名称 *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="套餐名称"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-medium">价格（元）*</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.priceYuan}
                onChange={(e) => setForm((p) => ({ ...p, priceYuan: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium">计费周期 *</label>
              <Select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.billing_period}
                onChange={(e) =>
                  setForm((p) => ({ ...p, billing_period: e.target.value as 'month' | 'year' }))
                }
              >
                <option value="month">月付</option>
                <option value="year">年付</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="font-medium">状态</label>
            <Select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={String(form.status)}
              onChange={(e) => setForm((p) => ({ ...p, status: Number(e.target.value) }))}
            >
              <option value="1">上架</option>
              <option value="0">下架</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="font-medium">配额配置（JSON）</label>
            <Textarea
              value={form.quota_config_str}
              onChange={(e) => setForm((p) => ({ ...p, quota_config_str: e.target.value }))}
              placeholder={'{\n  "max_users": 500,\n  "max_nodes": 3\n}'}
              rows={5}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">描述</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="套餐说明（可选）"
              rows={3}
            />
          </div>
        </div>
      </EntityDrawer>
    </div>
  )
}
