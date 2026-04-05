import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Send, Loader2, PanelRightOpen, Download } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, DataTable, DataTablePagination, FilterBar, EntityDrawer } from '@/components/shared'
import {
  Feedback,
  FeedbackListParams,
  getFeedbackListPayload,
  replyFeedback,
} from '@/modules/ops_governance/api'
import { PaginatedResponse } from '@/types/api'
import { formatDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { ColumnDef, useReactTable, getCoreRowModel } from '@tanstack/react-table'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'
import {
  fetchFeedbackWorkflowConfig,
  getDefaultFeedbackWorkflowEditableConfig,
  saveFeedbackWorkflowConfig,
  type FeedbackWorkflowEditableConfig,
} from '@/services/api/feedbackWorkflowConfig'

type FeedbackListPageQuery = {
  page: number
  size: number
  status: number
}

const DEFAULT_WORKFLOW_CONFIG = getDefaultFeedbackWorkflowEditableConfig()
const WORKFLOW_CONFIG_QUERY_KEY = ['feedback', 'workflow-config']

function parseDateTime(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return raw
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    // Support both second-level and millisecond-level timestamps.
    const normalizedTs = raw > 1_000_000_000_000 ? raw : raw * 1000
    const parsed = new Date(normalizedTs)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
    const parsed = new Date(normalized)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const candidate = record.datetime ??
      record.dateTime ??
      record.time ??
      record.timestamp ??
      record.value ??
      record.created_at ??
      record.createdAt
    if (candidate !== undefined) {
      return parseDateTime(candidate)
    }
  }

  return null
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}小时${minutes}分`
  return `${minutes}分`
}

function getSlaInfo(feedback: Feedback | null, slaHours: number): { label: string; className: string } {
  if (!feedback) {
    return {
      label: 'SLA 计算中',
      className: 'bg-slate-100 text-slate-700',
    }
  }

  if (feedback.status !== 1) {
    return {
      label: '已处理，SLA 已达成',
      className: 'bg-slate-100 text-slate-700',
    }
  }

  const createdAt = parseDateTime(feedback.created_at)
  if (!createdAt) {
    return {
      label: '无法计算 SLA（时间格式异常）',
      className: 'bg-slate-100 text-slate-700',
    }
  }

  const deadlineTs = createdAt.getTime() + slaHours * 60 * 60 * 1000
  const remainingMs = deadlineTs - Date.now()

  if (remainingMs <= 0) {
    return {
      label: `SLA 已超时 ${formatDuration(Math.abs(remainingMs))}`,
      className: 'bg-red-100 text-red-700',
    }
  }

  const warningThresholdMs = 2 * 60 * 60 * 1000
  if (remainingMs <= warningThresholdMs) {
    return {
      label: `SLA 剩余 ${formatDuration(remainingMs)}`,
      className: 'bg-amber-100 text-amber-700',
    }
  }

  return {
    label: `SLA 剩余 ${formatDuration(remainingMs)}`,
    className: 'bg-green-100 text-green-700',
  }
}

function parseTemplateEditorValue(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 20)
}

function getWorkflowSourceLabel(source: 'backend' | 'local' | 'default'): string {
  if (source === 'backend') return '后端配置'
  if (source === 'local') return '本地配置'
  return '系统默认'
}

export function FeedbackListPage() {
  const queryClient = useQueryClient()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<FeedbackListPageQuery>({
    page: 1,
    size: 10,
    status: -1,
  })
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [activeFeedback, setActiveFeedback] = useState<Feedback | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false)
  const [templateEditorValue, setTemplateEditorValue] = useState('')
  const [slaEditorValue, setSlaEditorValue] = useState(String(DEFAULT_WORKFLOW_CONFIG.slaHours))

  const requestParams: FeedbackListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
  }

  // 获取反馈列表
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['feedback', requestParams],
    queryFn: () => getFeedbackListPayload(requestParams),
  })

  const { data: workflowConfigData } = useQuery({
    queryKey: WORKFLOW_CONFIG_QUERY_KEY,
    queryFn: () => fetchFeedbackWorkflowConfig(),
    staleTime: 60 * 1000,
  })

  const workflowConfig = workflowConfigData || {
    ...DEFAULT_WORKFLOW_CONFIG,
    source: 'default' as const,
  }

  // 回复反馈
  const replyMutation = useMutation({
    mutationFn: (params: { feedback_id: number; reply: string }) =>
      replyFeedback(params),
    onSuccess: (_result, variables) => {
      queryClient.setQueriesData<PaginatedResponse<Feedback>>(
        { queryKey: ['feedback'] },
        (oldData) => {
          if (!oldData || !Array.isArray(oldData.items)) return oldData
          return {
            ...oldData,
            items: oldData.items.map((item) =>
              item.id === variables.feedback_id
                ? {
                    ...item,
                    status: 2,
                    reply: variables.reply,
                    reply_at: new Date().toISOString(),
                  }
                : item
            ),
          }
        }
      )
      toast.success('回复成功')
      void queryClient.invalidateQueries({ queryKey: ['feedback'], refetchType: 'active' })
      setActiveFeedback((current) => {
        if (!current || current.id !== variables.feedback_id) return current
        return {
          ...current,
          status: 2,
          reply: variables.reply,
          reply_at: new Date().toISOString(),
        }
      })
      setActiveFeedback(null)
      setReplyDraft('')
    },
    onError: (error: Error) => {
      toast.error(`回复失败: ${error.message}`)
    },
  })

  const workflowConfigMutation = useMutation({
    mutationFn: (next: FeedbackWorkflowEditableConfig) =>
      saveFeedbackWorkflowConfig(next),
    onSuccess: async (result) => {
      trackUxEvent('ux_feedback_workflow_save', {
        phase: 'success',
        source: result.source,
        template_count: result.config.replyTemplates.length,
        sla_hours: result.config.slaHours,
      })
      await queryClient.invalidateQueries({ queryKey: WORKFLOW_CONFIG_QUERY_KEY })
      toast.success(result.source === 'backend'
        ? '模板与 SLA 配置已同步到后端'
        : '后端保存不可用，已写入本地兜底配置')
      setWorkflowDialogOpen(false)
    },
    onError: (mutationError: Error) => {
      trackUxEvent('ux_feedback_workflow_save', {
        phase: 'failed',
        message: mutationError.message,
      })
      toast.error(`保存模板配置失败: ${mutationError.message}`)
    },
  })

  // 分页处理
  const handlePageChange = (page: number) => {
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setParams({ page: 1, size })
  }

  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'feedback_list',
      status: Number(statusFilter),
    })
    setParams({
      page: 1,
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
    setStatusFilter('-1')
    resetParams({
      page: 1,
      size: 10,
      status: -1,
    })
  }

  // 处理回复
  const handleReply = () => {
    const feedbackId = activeFeedback?.id
    const content = replyDraft
    if (!feedbackId) {
      toast.error('未选择反馈记录')
      return
    }
    if (!content?.trim()) {
      toast.error('请输入回复内容')
      return
    }
    replyMutation.mutate({ feedback_id: feedbackId, reply: content })
  }

  const openFeedbackDrawer = (feedback: Feedback) => {
    setActiveFeedback(feedback)
    setReplyDraft(feedback.reply || '')
    trackUxEvent('ux_drawer_open', {
      entity: 'feedback',
      entity_id: feedback.id,
      source: 'feedback_list',
    })
  }

  const closeFeedbackDrawer = () => {
    if (replyMutation.isPending) return
    setActiveFeedback(null)
    setReplyDraft('')
  }

  const openWorkflowDialog = () => {
    setTemplateEditorValue(workflowConfig.replyTemplates.join('\n'))
    setSlaEditorValue(String(workflowConfig.slaHours))
    setWorkflowDialogOpen(true)
  }

  const handleWorkflowConfigSave = () => {
    const templates = parseTemplateEditorValue(templateEditorValue)
    if (templates.length === 0) {
      toast.error('至少需要保留 1 条回复模板')
      return
    }

    const rawSla = Number(slaEditorValue)
    if (!Number.isFinite(rawSla)) {
      toast.error('SLA 小时必须是数字')
      return
    }

    workflowConfigMutation.mutate({
      replyTemplates: templates,
      slaHours: rawSla,
    })
  }

  const slaInfo = getSlaInfo(activeFeedback, workflowConfig.slaHours)

  // 表格列定义
  const columns: ColumnDef<Feedback>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) => <span className="font-mono">{row.original.user_id}</span>,
    },
    {
      accessorKey: 'content',
      header: '反馈内容',
      cell: ({ row }) => (
        <div className="max-w-xs truncate">{row.original.content}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '待处理', 2: '已回复', 3: '已完结', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'warning', 2: 'success', 3: 'info', 0: 'secondary', '-1': 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '提交时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '快捷处理',
      cell: ({ row }) => {
        const hasReplied = row.original.status === 2 || row.original.status === 3

        return (
          <Button
            size="sm"
            variant={hasReplied ? 'ghost' : 'outline'}
            onClick={(event) => {
              event.stopPropagation()
              openFeedbackDrawer(row.original)
            }}
          >
            {hasReplied ? '查看' : '回复'}
          </Button>
        )
      },
    },
  ]

  const feedbacks = data?.items || []
  const pagination = data

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<Feedback>[] = [
      { header: 'ID', accessor: 'id' },
      { header: '用户 ID', accessor: 'user_id' },
      { header: '反馈内容', accessor: 'content' },
      { header: '状态', accessor: (row) => ({ 1: '待处理', 2: '已回复', 3: '已完结', 0: '禁用', '-1': '已删除' }[String(row.status)] || String(row.status)) },
      { header: '回复内容', accessor: (row) => row.reply || '-' },
      { header: '提交时间', accessor: (row) => formatDate(row.created_at) },
    ]
    exportCsv(csvColumns, feedbacks, 'feedback_export')
    toast.success(`已导出 ${feedbacks.length} 条反馈数据`)
  }

  const table = useReactTable({
    data: feedbacks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载反馈数据..." />
  }

  if (error) {
    return <ErrorState message="加载反馈数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="反馈管理"
        description="处理用户反馈"
      />

      <Card>
        <CardHeader>
          <FilterBar
            onSearch={handleSearch}
            onReset={handleReset}
            extraActions={(
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={feedbacks.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出 CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={openWorkflowDialog}
                >
                  模板与 SLA
                </Button>
              </div>
            )}
          >
            <select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="1">待处理</option>
              <option value="2">已回复</option>
              <option value="3">已完结</option>
            </select>
          </FilterBar>
          <p className="mt-3 text-xs text-muted-foreground">
            当前 SLA：{workflowConfig.slaHours} 小时，模板来源：{getWorkflowSourceLabel(workflowConfig.source)}
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <DataTable
            table={table}
            onRowClick={(row) => openFeedbackDrawer(row)}
          />

          {pagination && (
            <DataTablePagination
              page={pagination.page}
              pageSize={pagination.size}
              total={pagination.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      <EntityDrawer
        open={Boolean(activeFeedback)}
        onOpenChange={(open) => {
          if (!open) closeFeedbackDrawer()
        }}
        title={`反馈 #${activeFeedback?.id ?? '-'}`}
        subtitle={`用户 ID: ${activeFeedback?.user_id ?? '-'}`}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={closeFeedbackDrawer}
              disabled={replyMutation.isPending}
            >
              关闭
            </Button>
            <Button
              onClick={handleReply}
              disabled={replyMutation.isPending || activeFeedback?.status !== 1}
            >
              {replyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  提交中
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  提交回复
                </>
              )}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={activeFeedback?.status ?? '-'}
                labels={{ 1: '待处理', 2: '已回复', 3: '已完结', 0: '禁用', '-1': '已删除' }}
                variants={{ 1: 'warning', 2: 'success', 3: 'info', 0: 'secondary', '-1': 'secondary' }}
              />
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${slaInfo.className}`}>
                {slaInfo.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              提交时间：{activeFeedback?.created_at ? formatDate(activeFeedback.created_at) : '-'}
            </p>
            <div className="mt-2 rounded-md border bg-background p-3 text-sm text-muted-foreground">
              {activeFeedback?.content || '-'}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">回复模板</p>
            <div className="flex flex-wrap gap-2">
              {workflowConfig.replyTemplates.map((template) => (
                <Button
                  key={template}
                  size="sm"
                  variant="outline"
                  onClick={() => setReplyDraft(template)}
                  disabled={activeFeedback?.status !== 1 || replyMutation.isPending}
                >
                  <PanelRightOpen className="mr-1 h-3.5 w-3.5" />
                  {template.slice(0, 10)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">回复内容</p>
            <Textarea
              autoFocus
              placeholder="请输入回复内容..."
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              className="min-h-[140px]"
              disabled={activeFeedback?.status !== 1}
            />
            {activeFeedback?.status !== 1 && (
              <p className="text-xs text-muted-foreground">当前反馈状态不可回复，仅可查看历史记录。</p>
            )}
          </div>
        </div>
      </EntityDrawer>

      <AlertDialog open={workflowDialogOpen} onOpenChange={setWorkflowDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>反馈模板与 SLA 配置</AlertDialogTitle>
            <AlertDialogDescription>
              可编辑本地兜底配置。若后端已下发配置，页面仍优先使用后端配置。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">回复模板（每行一条）</p>
              <Textarea
                value={templateEditorValue}
                onChange={(event) => setTemplateEditorValue(event.target.value)}
                className="min-h-[160px]"
                placeholder="每行输入一条回复模板"
                disabled={workflowConfigMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">SLA 时长（小时）</p>
              <Input
                type="number"
                min={1}
                max={720}
                step={1}
                value={slaEditorValue}
                onChange={(event) => setSlaEditorValue(event.target.value)}
                disabled={workflowConfigMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                推荐范围 1-720 小时，超出范围将自动修正。
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setWorkflowDialogOpen(false)}
              disabled={workflowConfigMutation.isPending}
            >
              取消
            </Button>
            <Button
              onClick={handleWorkflowConfigSave}
              disabled={workflowConfigMutation.isPending}
            >
              {workflowConfigMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中
                </>
              ) : (
                '保存配置'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
