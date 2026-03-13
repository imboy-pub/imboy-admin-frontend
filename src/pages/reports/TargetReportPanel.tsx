import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ColumnDef,
  RowSelectionState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { CheckCircle2, Eye, Search, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import {
  BatchActionBar,
  DataTable,
  DataTablePagination,
  ErrorState,
  FilterBar,
  LoadingState,
  StatusBadge,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import {
  getReportListPayload,
  isReportEndpointUnavailable,
  resolveReport,
  resolveReportBatchWithFallback,
  type NonMomentReportTargetType,
  type ReportBatchResolveSummary,
  type ReportListParams,
  type ReportTicket,
} from '@/services/api/reports'
import { trackUxEvent } from '@/lib/uxTelemetry'

type TargetReportPanelProps = {
  targetType: NonMomentReportTargetType
  targetLabel: string
  governancePath: string
  governanceLabel: string
  processSteps: Array<{
    title: string
    description: string
  }>
}

type TargetReportQuery = {
  page: number
  size: number
  status: number
  target_id: string
}

type ResolveVariables = {
  reportId: string | number
  result: 1 | 2
  note: string
}

type BatchResolveVariables = {
  reportIds: Array<string | number>
  result: 1 | 2
  note: string
}

function resolveTargetPath(targetType: NonMomentReportTargetType, targetId: string | number): string {
  if (targetType === 'group') {
    return `/groups/${targetId}`
  }
  if (targetType === 'channel') {
    return `/channels/${targetId}`
  }
  return `/users/${targetId}`
}

function modeLabel(mode: ReportBatchResolveSummary['mode'] | null): string {
  if (mode === 'batch') return '统一批量接口'
  if (mode === 'target-batch') return '对象批量接口'
  if (mode === 'fallback') return '回退单条接口'
  return '尚未执行'
}

export function TargetReportPanel({
  targetType,
  targetLabel,
  governancePath,
  governanceLabel,
  processSteps,
}: TargetReportPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permissionState = useAdminPermission({
    permission: ['reports:handle', 'moments:report:handle'],
  })
  const canHandleReports = permissionState.allowed
  const handlePermissionLoading = permissionState.loading

  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<TargetReportQuery>({
      page: 1,
      size: 10,
      status: -1,
      target_id: '',
    })
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [searchTargetId, setSearchTargetId] = useState(params.target_id || '')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [lastBatchExecutionMode, setLastBatchExecutionMode] = useState<ReportBatchResolveSummary['mode'] | null>(null)

  const requestParams: ReportListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    target_id: params.target_id.trim() || undefined,
  }

  const clearRowSelection = useCallback(() => {
    setRowSelection((prev) => (Object.keys(prev).length === 0 ? prev : {}))
  }, [])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', targetType, requestParams],
    queryFn: () => getReportListPayload(targetType, requestParams),
    retry: false,
  })

  const resolveMutation = useMutation({
    mutationFn: ({ reportId, result, note }: ResolveVariables) =>
      resolveReport(targetType, reportId, result, note),
    onSuccess: (_result, variables) => {
      const actionKey = variables.result === 2
        ? `${targetType}_report_confirm_violation`
        : `${targetType}_report_reject`
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'success',
        selected_count: 1,
        report_id: variables.reportId,
        target_type: targetType,
      })
      toast.success('举报处理成功')
      queryClient.invalidateQueries({ queryKey: ['reports', targetType] })
      clearRowSelection()
    },
    onError: (err: Error, variables) => {
      const actionKey = variables.result === 2
        ? `${targetType}_report_confirm_violation`
        : `${targetType}_report_reject`
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'failed',
        selected_count: 1,
        report_id: variables.reportId,
        target_type: targetType,
        message: err.message,
      })
      toast.error(`处理失败: ${err.message}`)
    },
  })

  const batchResolveMutation = useMutation({
    mutationFn: ({ reportIds, result, note }: BatchResolveVariables) =>
      resolveReportBatchWithFallback(targetType, reportIds, result, note),
    onSuccess: (summary) => {
      setLastBatchExecutionMode(summary.mode)
      trackUxEvent('ux_batch_action_execute', {
        action_key: `${targetType}_report_batch_resolve`,
        phase: 'summary',
        selected_count: summary.total,
        success_count: summary.successCount,
        failed_count: summary.failedCount,
        execution_mode: summary.mode,
        target_type: targetType,
      })

      if (summary.successCount > 0) {
        toast.success(`批量处理完成：成功 ${summary.successCount} 条举报`)
      }
      if (summary.failedCount > 0) {
        toast.error(`批量处理失败：${summary.failedCount} 条举报`)
      }

      queryClient.invalidateQueries({ queryKey: ['reports', targetType] })
      clearRowSelection()
    },
    onError: (err: Error) => {
      toast.error(`批量处理失败: ${err.message}`)
    },
  })

  const handleSearch = () => {
    const nextStatus = Number(statusFilter)
    const normalizedStatus = Number.isFinite(nextStatus) ? nextStatus : -1
    const normalizedTargetId = searchTargetId.trim()

    trackUxEvent('ux_filter_apply', {
      page: `${targetType}_report_list`,
      status: normalizedStatus,
      target_id: normalizedTargetId,
      target_type: targetType,
    })

    clearRowSelection()
    setParams({
      page: 1,
      status: normalizedStatus,
      target_id: normalizedTargetId,
    })
  }

  const handleReset = () => {
    setStatusFilter('-1')
    setSearchTargetId('')
    clearRowSelection()
    resetParams({
      page: 1,
      size: 10,
      status: -1,
      target_id: '',
    })
  }

  const handleResolve = (report: ReportTicket, result: 1 | 2) => {
    const actionKey = result === 2
      ? `${targetType}_report_confirm_violation`
      : `${targetType}_report_reject`
    if (!canHandleReports || handlePermissionLoading) {
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'blocked',
        selected_count: 1,
        report_id: report.id,
        target_type: targetType,
      })
      toast.error('当前账号仅可查看举报记录，暂无处理权限')
      return
    }

    const note = window.prompt(
      result === 2 ? '输入“违规确认”备注（可选）' : '输入“驳回”备注（可选）',
      ''
    )
    resolveMutation.mutate({
      reportId: report.id,
      result,
      note: note ?? '',
    })
  }

  const handlePageChange = (page: number) => {
    clearRowSelection()
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    clearRowSelection()
    setParams({ page: 1, size })
  }

  const columns: ColumnDef<ReportTicket>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选当前页举报"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择举报 ${row.original.id}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle disabled:opacity-40"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: '举报ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'target_id',
      header: `${targetLabel}ID`,
      cell: ({ row }) => <span className="font-mono">{row.original.target_id}</span>,
    },
    {
      accessorKey: 'reporter_uid',
      header: '举报人UID',
      cell: ({ row }) => <span className="font-mono">{row.original.reporter_uid}</span>,
    },
    {
      accessorKey: 'reason',
      header: '原因',
      cell: ({ row }) => <span>{row.original.reason || '-'}</span>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 0: '待处理', 1: '已驳回', 2: '违规确认' }}
          variants={{ 0: 'warning', 1: 'secondary', 2: 'error' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '举报时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="查看对象"
            onClick={() => navigate(resolveTargetPath(targetType, row.original.target_id))}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.original.status === 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title="驳回举报"
                disabled={!canHandleReports ||
                  handlePermissionLoading ||
                  resolveMutation.isPending ||
                  batchResolveMutation.isPending}
                onClick={() => handleResolve(row.original, 1)}
              >
                <XCircle className="h-4 w-4 text-slate-500" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="确认违规"
                disabled={!canHandleReports ||
                  handlePermissionLoading ||
                  resolveMutation.isPending ||
                  batchResolveMutation.isPending}
                onClick={() => handleResolve(row.original, 2)}
              >
                <CheckCircle2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const reports = useMemo(() => data?.items || [], [data?.items])
  const table = useReactTable({
    data: reports,
    columns,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) =>
      row.original.status === 0 && canHandleReports && !handlePermissionLoading,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedReports = table.getSelectedRowModel().rows.map((row) => row.original)
  const selectedPendingReports = selectedReports.filter((item) => item.status === 0)
  const selectedPendingReportIds = selectedPendingReports.map((item) => item.id)
  const currentModeLabel = handlePermissionLoading
    ? '权限解析中...'
    : (canHandleReports ? '可处理举报' : '只读查看')

  if (isLoading) {
    return <LoadingState message={`加载${targetLabel}举报数据...`} />
  }

  if (error) {
    if (isReportEndpointUnavailable(error)) {
      return (
        <Card>
          <CardHeader className="space-y-3">
            <p className="inline-flex w-fit rounded-md border border-amber-300/70 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
              {targetLabel}举报 API 暂未接入
            </p>
            <h2 className="text-base font-semibold">{targetLabel}举报处理流程（已预置）</h2>
            <p className="text-sm text-muted-foreground">
              运营侧已可按照统一流程执行处理。后端接入 API 后，此处将自动切换为工单列表与批量处置能力。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {processSteps.map((step, index) => (
                <div key={step.title} className="rounded-md border bg-muted/20 p-3">
                  <div className="mb-1 text-sm font-medium">
                    {index + 1}. {step.title}
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              建议后端补齐接口：
              <span className="ml-1 font-mono text-xs">GET /report/list</span>、
              <span className="ml-1 font-mono text-xs">GET /report/detail/:id</span>、
              <span className="ml-1 font-mono text-xs">POST /report/resolve</span>、
              <span className="ml-1 font-mono text-xs">POST /report/batch_resolve</span>。
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(governancePath)}>
                前往{governanceLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }
    return <ErrorState message={`加载${targetLabel}举报数据失败`} onRetry={() => refetch()} />
  }

  return (
    <Card>
      <CardHeader>
        <FilterBar
          onSearch={handleSearch}
          onReset={handleReset}
          searchText="应用筛选"
          resetText="恢复默认"
          extraActions={(
            <>
              <Button variant="outline" onClick={() => navigate(governancePath)}>
                前往{governanceLabel}
              </Button>
              <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                当前模式：{currentModeLabel}
              </span>
            </>
          )}
        >
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder={`输入${targetLabel}ID快速筛选...`}
              value={searchTargetId}
              onChange={(event) => setSearchTargetId(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
            />
          </div>
          <select
            aria-label="举报状态筛选"
            className="h-10 min-w-40 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="-1">全部状态</option>
            <option value="0">待处理</option>
            <option value="1">已驳回</option>
            <option value="2">违规确认</option>
          </select>
        </FilterBar>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span>处理流：受理分拣 -&gt; 证据核验 -&gt; 执行处置 -&gt; 结果回写</span>
          <span className="rounded border px-2 py-0.5">
            批量执行：{modeLabel(lastBatchExecutionMode)}
          </span>
        </div>

        <BatchActionBar
          selectedCount={selectedPendingReports.length}
          onClear={clearRowSelection}
          actions={[
            {
              key: `${targetType}-batch-reject-report`,
              label: '批量驳回',
              variant: 'outline',
              riskLevel: 'medium',
              requireReason: true,
              description: `将驳回 ${selectedPendingReportIds.length} 条举报，建议填写处理备注。`,
              disabled: !canHandleReports ||
                handlePermissionLoading ||
                selectedPendingReportIds.length === 0 ||
                resolveMutation.isPending ||
                batchResolveMutation.isPending,
              loading: batchResolveMutation.isPending && batchResolveMutation.variables?.result === 1,
              onExecute: async ({ reason }) => {
                if (selectedPendingReportIds.length === 0) {
                  toast.error('当前没有可批量处理的待处理举报')
                  return
                }
                await batchResolveMutation.mutateAsync({
                  reportIds: selectedPendingReportIds,
                  result: 1,
                  note: reason || 'admin_batch_reject',
                })
              },
            },
            {
              key: `${targetType}-batch-confirm-violation`,
              label: '批量确认违规',
              variant: 'destructive',
              riskLevel: 'high',
              requireReason: true,
              confirmKeyword: 'VIOLATION',
              confirmText: '确认将这些举报判定为违规？',
              description: `将确认 ${selectedPendingReportIds.length} 条举报违规并联动治理，操作不可撤销。`,
              disabled: !canHandleReports ||
                handlePermissionLoading ||
                selectedPendingReportIds.length === 0 ||
                resolveMutation.isPending ||
                batchResolveMutation.isPending,
              loading: batchResolveMutation.isPending && batchResolveMutation.variables?.result === 2,
              onExecute: async ({ reason }) => {
                if (selectedPendingReportIds.length === 0) {
                  toast.error('当前没有可批量处理的待处理举报')
                  return
                }
                await batchResolveMutation.mutateAsync({
                  reportIds: selectedPendingReportIds,
                  result: 2,
                  note: reason || 'admin_batch_confirm_violation',
                })
              },
            },
          ]}
        />

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
  )
}
