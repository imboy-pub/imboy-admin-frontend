import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ColumnDef,
  RowSelectionState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  BatchActionBar,
  DataTable,
  DataTablePagination,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  getMomentReportListPayload,
  MomentReportBatchResolveSummary,
  MomentReport,
  MomentReportListParams,
  resolveMomentReport,
  resolveMomentReportBatchWithFallback,
} from '@/services/api/moments'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { formatDate } from '@/lib/utils'
import { trackUxEvent } from '@/lib/uxTelemetry'

type MomentReportPageQuery = {
  page: number
  size: number
  status: number
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

type MomentReportPageProps = {
  permissionOverride?: {
    allowed: boolean
    loading?: boolean
  }
  showPageHeader?: boolean
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  return target.isContentEditable
}

export function MomentReportPage({ permissionOverride, showPageHeader = true }: MomentReportPageProps = {}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permissionState = useAdminPermission({
    permission: ['moments:report:handle', 'messages:read'],
    enabled: !permissionOverride,
  })
  const canHandleReports = permissionOverride ? permissionOverride.allowed : permissionState.allowed
  const handlePermissionLoading = permissionOverride
    ? Boolean(permissionOverride.loading)
    : permissionState.loading

  const { state: params, setState: setParams, resetState: resetParams } =
    useListQueryState<MomentReportPageQuery>({
    page: 1,
    size: 10,
    status: -1,
  })
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [searchPostId, setSearchPostId] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [activeReportId, setActiveReportId] = useState<string | number | null>(null)
  const [lastBatchExecutionMode, setLastBatchExecutionMode] =
    useState<MomentReportBatchResolveSummary['mode'] | null>(null)
  const clearRowSelection = useCallback(() => {
    setRowSelection((prev) => (Object.keys(prev).length === 0 ? prev : {}))
  }, [])

  const requestParams: MomentReportListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['moment-reports', requestParams],
    queryFn: () => getMomentReportListPayload(requestParams),
  })

  const resolveMutation = useMutation({
    mutationFn: ({ reportId, result, note }: ResolveVariables) =>
      resolveMomentReport(reportId, result, note),
    onSuccess: (_result, variables) => {
      const actionKey = variables.result === 2
        ? 'report_single_confirm_violation'
        : 'report_single_reject'
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'success',
        selected_count: 1,
        report_id: variables.reportId,
      })
      toast.success('举报处理成功')
      queryClient.invalidateQueries({ queryKey: ['moment-reports'] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      clearRowSelection()
    },
    onError: (err: Error, variables) => {
      const actionKey = variables.result === 2
        ? 'report_single_confirm_violation'
        : 'report_single_reject'
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'failed',
        selected_count: 1,
        report_id: variables.reportId,
        message: err.message,
      })
      toast.error(`处理失败: ${err.message}`)
    },
  })

  const batchResolveMutation = useMutation({
    mutationFn: async ({ reportIds, result, note }: BatchResolveVariables) =>
      resolveMomentReportBatchWithFallback(reportIds, result, note),
    onSuccess: (summary: MomentReportBatchResolveSummary) => {
      const fallbackSuffix = summary.mode === 'fallback' ? '（批量接口不可用，已回退单条接口）' : ''
      setLastBatchExecutionMode(summary.mode)
      trackUxEvent('ux_batch_action_execute', {
        action_key: 'report_batch_resolve',
        phase: 'summary',
        selected_count: summary.total,
        success_count: summary.successCount,
        failed_count: summary.failedCount,
        execution_mode: summary.mode,
      })

      if (summary.successCount > 0) {
        toast.success(`批量处理完成：成功 ${summary.successCount} 条举报${fallbackSuffix}`)
      }
      if (summary.failedCount > 0) {
        toast.error(`批量处理失败：${summary.failedCount} 条举报`)
      }

      queryClient.invalidateQueries({ queryKey: ['moment-reports'] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      clearRowSelection()
    },
    onError: (err: Error) => {
      toast.error(`批量处理失败: ${err.message}`)
    },
  })

  const handleQuickViewPost = () => {
    const keyword = searchPostId.trim()
    if (!keyword) {
      toast.error('请输入动态ID')
      return
    }
    navigate(`/moments/${keyword}`)
  }

  const handleSearch = () => {
    const nextStatus = Number(statusFilter)
    const normalizedStatus = Number.isFinite(nextStatus) ? nextStatus : -1

    trackUxEvent('ux_filter_apply', {
      page: 'moment_report_list',
      status: normalizedStatus,
    })

    clearRowSelection()
    setParams({
      page: 1,
      status: normalizedStatus,
    })
  }

  const handleReset = () => {
    setStatusFilter('-1')
    clearRowSelection()
    resetParams({
      page: 1,
      size: 10,
      status: -1,
    })
  }

  const reports = useMemo(() => data?.items || [], [data?.items])
  const resolvedActiveReportId = useMemo(() => {
    const hasCurrent = activeReportId !== null &&
      reports.some((item) => String(item.id) === String(activeReportId))
    if (hasCurrent) return activeReportId

    const firstPending = reports.find((item) => item.status === 0)
    return (firstPending || reports[0])?.id ?? null
  }, [activeReportId, reports])

  const getNextPendingReportId = useCallback((currentReportId: string | number): string | number | null => {
    const pendingReports = reports.filter((item) => item.status === 0)
    if (pendingReports.length === 0) {
      return null
    }

    const currentIndex = pendingReports.findIndex((item) => String(item.id) === String(currentReportId))
    if (currentIndex < 0) {
      return pendingReports[0]?.id ?? null
    }

    return pendingReports[(currentIndex + 1) % pendingReports.length]?.id ?? null
  }, [reports])

  const handleResolve = useCallback((report: MomentReport, result: 1 | 2) => {
    const actionKey = result === 2 ? 'report_single_confirm_violation' : 'report_single_reject'
    if (!canHandleReports || handlePermissionLoading) {
      trackUxEvent('ux_batch_action_execute', {
        action_key: actionKey,
        phase: 'blocked',
        selected_count: 1,
        report_id: report.id,
      })
      toast.error('当前账号仅可查看举报记录，暂无处理权限')
      return
    }

    trackUxEvent('ux_batch_action_execute', {
      action_key: actionKey,
      phase: 'open_confirm',
      selected_count: 1,
      report_id: report.id,
    })

    const note = window.prompt(
      result === 2 ? '输入“违规确认”备注（可选）' : '输入“驳回”备注（可选）',
      ''
    )
    resolveMutation.mutate({
      reportId: report.id,
      result,
      note: note ?? '',
    })
  }, [canHandleReports, handlePermissionLoading, resolveMutation])

  const handlePageChange = (page: number) => {
    clearRowSelection()
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    clearRowSelection()
    setParams({ page: 1, size })
  }

  const columns: ColumnDef<MomentReport>[] = [
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
      accessorKey: 'post_id',
      header: '动态ID',
      cell: ({ row }) => <span className="font-mono">{row.original.post_id}</span>,
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
            title="查看动态"
            onClick={() => navigate(`/moments/${row.original.post_id}`)}
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

  const activeReport = useMemo(
    () => reports.find((item) => String(item.id) === String(resolvedActiveReportId)) || null,
    [reports, resolvedActiveReportId]
  )

  const moveActiveFocus = useCallback((direction: 1 | -1) => {
    if (reports.length === 0) return
    const currentIndex = reports.findIndex((item) => String(item.id) === String(resolvedActiveReportId))
    const startIndex = currentIndex < 0 ? 0 : currentIndex
    const nextIndex = (startIndex + direction + reports.length) % reports.length
    setActiveReportId(reports[nextIndex]?.id ?? null)
  }, [reports, resolvedActiveReportId])

  const handleOpenActiveDetail = useCallback(() => {
    if (!activeReport) return
    navigate(`/moments/${activeReport.post_id}`)
  }, [activeReport, navigate])

  const handleShortcutResolve = useCallback((result: 1 | 2) => {
    if (!activeReport || activeReport.status !== 0) return
    const nextFocusId = getNextPendingReportId(activeReport.id)
    if (nextFocusId !== null) {
      setActiveReportId(nextFocusId)
    }
    handleResolve(activeReport, result)
  }, [activeReport, getNextPendingReportId, handleResolve])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (resolveMutation.isPending || batchResolveMutation.isPending) return
      if (isEditableElement(event.target)) return

      if (event.key === 'j' || event.key === 'J' || event.key === 'ArrowDown') {
        event.preventDefault()
        moveActiveFocus(1)
        return
      }

      if (event.key === 'k' || event.key === 'K' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveActiveFocus(-1)
        return
      }

      if (event.key === 'o' || event.key === 'O') {
        event.preventDefault()
        handleOpenActiveDetail()
        return
      }

      if (!canHandleReports || handlePermissionLoading) return

      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        handleShortcutResolve(1)
        return
      }

      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault()
        handleShortcutResolve(2)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    batchResolveMutation.isPending,
    canHandleReports,
    handlePermissionLoading,
    resolveMutation.isPending,
    handleOpenActiveDetail,
    handleShortcutResolve,
    moveActiveFocus,
  ])

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
  const modeLabel = handlePermissionLoading
    ? '权限解析中...'
    : (canHandleReports ? '可处理举报' : '只读查看')
  const executionModeLabel = lastBatchExecutionMode === 'batch'
    ? '后端批量接口'
    : (lastBatchExecutionMode === 'fallback' ? '回退单条接口' : '尚未执行')

  if (isLoading) {
    return <LoadingState message="加载举报数据..." />
  }

  if (error) {
    return <ErrorState message="加载举报数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      {showPageHeader && (
        <PageHeader title="朋友圈举报处理" description="首版治理必备：查看举报、驳回或确认违规并联动删帖" />
      )}

      <Card>
        <CardHeader>
          <FilterBar
            onSearch={handleSearch}
            onReset={handleReset}
            searchText="应用筛选"
            resetText="恢复默认"
            extraActions={(
              <>
                <Button variant="outline" onClick={handleQuickViewPost}>
                  查看动态
                </Button>
                <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  当前模式：{modeLabel}
                </span>
              </>
            )}
          >
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="输入动态ID快速查看..."
                value={searchPostId}
                onChange={(event) => setSearchPostId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleQuickViewPost()}
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
            <span>快捷键：J/K 切换，R 驳回，V 违规，O 查看动态</span>
            <span className="rounded border px-2 py-0.5">
              当前焦点：{activeReport ? `#${activeReport.id}` : '-'}
            </span>
            <span className="rounded border px-2 py-0.5">
              批量执行：{executionModeLabel}
            </span>
          </div>

          <BatchActionBar
            selectedCount={selectedPendingReports.length}
            onClear={clearRowSelection}
            actions={[
              {
                key: 'batch-reject-report',
                label: '批量驳回',
                variant: 'outline',
                permission: 'moments:report:handle',
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
                key: 'batch-confirm-violation',
                label: '批量确认违规',
                variant: 'destructive',
                permission: 'moments:report:handle',
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

          <DataTable
            table={table}
            onRowClick={(row) => setActiveReportId(row.id)}
          />
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
