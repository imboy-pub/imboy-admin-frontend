import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import {
  ArrowRightLeft,
  Copy,
  Eye,
  FileSearch,
  MessageSquare,
  UserMinus,
  Download,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  EntityDrawer,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import { getMessageDetailPayload, getMessageListPayload } from '@/modules/messages'
import { getLogoutApplicationListPayload } from '@/services/api/logoutApplications'
import { getAdminOperationLogs, type AdminOperationLog } from '@/services/api/adminOperations'
import { formatDate, truncate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { MessageScope } from '@/types/message'
import { useListQueryState } from '@/hooks/useListQueryState'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

type AuditEventType = 'message' | 'logout_apply'

type AuditEvent = {
  id: string
  eventType: AuditEventType
  time: string
  actor: string
  target: string
  summary: string
  detail: string
  requestJson: Record<string, unknown>
  responseJson: Record<string, unknown>
  msgId?: string
  msgScope?: MessageScope
}

type AuditLogQuery = {
  page: number
  size: number
  keyword: string
  eventTypeFilter: string
  dateStart: string
  dateEnd: string
}

type AdminOpsQuery = {
  page: number
  size: number
  adm_user_id: string
  action: string
}

type ActiveTab = 'user_events' | 'admin_ops'

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function toTimestamp(value: unknown): number {
  if (value === null || value === undefined) return 0

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    if (value > 1e12) return value
    if (value > 1e9) return value * 1000
    return value
  }

  if (value instanceof Date) {
    const ts = value.getTime()
    return Number.isNaN(ts) ? 0 : ts
  }

  const raw = String(value).trim()
  if (!raw) return 0

  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return 0
    if (n > 1e12) return n
    if (n > 1e9) return n * 1000
    return n
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const ts = new Date(normalized).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// ---------------------------------------------------------------------------
// Tab 按钮（与 UserDetailPage 保持一致的样式）
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// 用户事件 Tab
// ---------------------------------------------------------------------------

function UserEventsTab() {
  const navigate = useNavigate()
  const { state: params, setState: setParams } = useListQueryState<AuditLogQuery>({
    page: 1,
    size: 10,
    keyword: '',
    eventTypeFilter: 'all',
    dateStart: '',
    dateEnd: '',
  })
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)

  const {
    data: messageData,
    isLoading: loadingMessage,
    error: messageError,
    refetch: refetchMessage,
    dataUpdatedAt: messageDataUpdatedAt,
  } = useQuery({
    queryKey: ['audit-log', 'messages'],
    queryFn: () =>
      getMessageListPayload({
        page: 1,
        size: 100,
        msg_scope: 'all',
      }),
  })

  const {
    data: logoutData,
    isLoading: loadingLogout,
    error: logoutError,
    refetch: refetchLogout,
    dataUpdatedAt: logoutDataUpdatedAt,
  } = useQuery({
    queryKey: ['audit-log', 'logout-applications'],
    queryFn: () =>
      getLogoutApplicationListPayload({
        page: 1,
        size: 100,
      }),
  })

  const dataUpdatedAt = Math.max(messageDataUpdatedAt, logoutDataUpdatedAt)
  const handleRefreshAll = () => {
    void refetchMessage()
    void refetchLogout()
  }

  const {
    data: messageDetail,
    isLoading: loadingMessageDetail,
    error: messageDetailError,
    refetch: refetchMessageDetail,
  } = useQuery({
    queryKey: ['audit-log', 'message-detail', selectedEvent?.msgId, selectedEvent?.msgScope],
    queryFn: () => getMessageDetailPayload(selectedEvent!.msgId!, selectedEvent!.msgScope!),
    enabled: selectedEvent?.eventType === 'message' && !!selectedEvent?.msgId,
  })

  const events = useMemo<AuditEvent[]>(() => {
    const messageEvents: AuditEvent[] = (messageData?.items || []).map((item) => ({
      id: `${item.scope}-${item.msg_id}`,
      eventType: 'message',
      time: item.created_at,
      actor: String(item.from_id ?? '-'),
      target: String(item.to_id ?? '-'),
      summary: `${item.scope.toUpperCase()} ${item.msg_type || '-'} / ${item.action || '-'}`,
      detail: item.payload || '',
      requestJson: {
        method: 'GET',
        path: '/api/adm/message/list',
        query: {
          msg_scope: item.scope,
          keyword: item.msg_id,
        },
      },
      responseJson: {
        code: 0,
        payload: {
          scope: item.scope,
          msg_id: item.msg_id,
          from_id: item.from_id,
          to_id: item.to_id,
          msg_type: item.msg_type,
          action: item.action,
          payload: item.payload,
          created_at: item.created_at,
        },
      },
      msgId: item.msg_id,
      msgScope: item.scope,
    }))

    const logoutEvents: AuditEvent[] = (logoutData?.items || []).map((item, index) => ({
      id: `logout-${item.uid}-${index}`,
      eventType: 'logout_apply',
      time: item.created_at,
      actor: String(item.uid),
      target: item.account || '-',
      summary: '用户发起账号注销申请',
      detail: item.body || '',
      requestJson: {
        method: 'GET',
        path: '/api/adm/user/logout_apply/list',
        query: {
          uid: item.uid,
        },
      },
      responseJson: {
        code: 0,
        payload: {
          uid: item.uid,
          account: item.account,
          nickname: item.nickname,
          app_vsn: item.app_vsn,
          dtype: item.dtype,
          did: item.did,
          ip: item.ip,
          body: item.body,
          created_at: item.created_at,
        },
      },
    }))

    return [...messageEvents, ...logoutEvents].sort(
      (a, b) => toTimestamp(b.time) - toTimestamp(a.time)
    )
  }, [logoutData?.items, messageData?.items])

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = params.keyword.trim().toLowerCase()
    const startMs = params.dateStart ? new Date(params.dateStart).getTime() : 0
    const endMs = params.dateEnd ? new Date(params.dateEnd + 'T23:59:59').getTime() : Infinity
    return events.filter((event) => {
      const typeMatch =
        params.eventTypeFilter === 'all' || event.eventType === params.eventTypeFilter
      if (!typeMatch) return false

      if (startMs > 0 || endMs < Infinity) {
        const eventMs = toTimestamp(event.time)
        if (eventMs < startMs || eventMs > endMs) return false
      }

      if (!normalizedKeyword) return true
      const fullText =
        `${event.summary} ${event.detail} ${event.actor} ${event.target}`.toLowerCase()
      return fullText.includes(normalizedKeyword)
    })
  }, [params.eventTypeFilter, events, params.keyword, params.dateStart, params.dateEnd])

  const total = filteredEvents.length
  const totalPages = Math.max(1, Math.ceil(total / params.size))
  const safePage = Math.min(Math.max(1, params.page), totalPages)
  const pageEvents = filteredEvents.slice(
    (safePage - 1) * params.size,
    safePage * params.size
  )

  const detailRequestJson = useMemo(() => {
    if (!selectedEvent) return {}
    if (selectedEvent.eventType === 'message') {
      return {
        method: 'GET',
        path: '/api/adm/message/detail',
        query: {
          msg_id: selectedEvent.msgId,
          msg_scope: selectedEvent.msgScope,
        },
      }
    }
    return selectedEvent.requestJson
  }, [selectedEvent])

  const detailResponseJson = useMemo(() => {
    if (!selectedEvent) return {}
    if (selectedEvent.eventType === 'message') {
      if (messageDetail) {
        return { code: 0, payload: messageDetail }
      }
      return { loading: true }
    }
    return selectedEvent.responseJson
  }, [selectedEvent, messageDetail])

  const handleCopy = async (label: string, jsonValue: unknown) => {
    try {
      await navigator.clipboard.writeText(prettyJson(jsonValue))
      toast.success(`${label} 已复制`)
    } catch {
      toast.error(`${label} 复制失败`)
    }
  }

  const columns: ColumnDef<AuditEvent>[] = [
    {
      accessorKey: 'eventType',
      header: '事件类型',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.eventType}
          labels={{ message: '消息审计', logout_apply: '注销申请' }}
          variants={{ message: 'info', logout_apply: 'warning' }}
        />
      ),
    },
    {
      accessorKey: 'time',
      header: '发生时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.time)}</span>
      ),
    },
    {
      accessorKey: 'actor',
      header: '操作者',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.actor}</span>,
    },
    {
      accessorKey: 'target',
      header: '目标',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.target}</span>,
    },
    {
      accessorKey: 'summary',
      header: '摘要',
      cell: ({ row }) => <span className="text-sm">{row.original.summary}</span>,
    },
    {
      accessorKey: 'detail',
      header: '详情',
      cell: ({ row }) => (
        <span
          className="block max-w-[320px] truncate font-mono text-xs text-muted-foreground"
          title={row.original.detail}
        >
          {row.original.detail ? truncate(row.original.detail, 100) : '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedEvent(row.original)}
        >
          <Eye className="mr-2 h-4 w-4" />
          详情
        </Button>
      ),
    },
  ]

  const table = useReactTable({
    data: pageEvents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if ((loadingMessage && !messageData) || (loadingLogout && !logoutData)) {
    return <LoadingState message="加载审计日志..." />
  }

  if (messageError || logoutError) {
    return <ErrorState message="加载审计日志失败" onRetry={handleRefreshAll} />
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Button variant="outline" onClick={() => navigate('/messages')}>
          <MessageSquare className="mr-2 h-4 w-4" />
          消息审计页
        </Button>
        <Button variant="outline" onClick={() => navigate('/logout-applications')}>
          <UserMinus className="mr-2 h-4 w-4" />
          注销申请页
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            事件流
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={params.eventTypeFilter}
                onChange={(event) => {
                  setParams({ eventTypeFilter: event.target.value, page: 1 })
                }}
              >
                <option value="all">全部事件</option>
                <option value="message">消息审计</option>
                <option value="logout_apply">注销申请</option>
              </select>
            </div>
            <Input
              className="max-w-md"
              placeholder="搜索UID、账号、摘要、详情关键字"
              value={params.keyword}
              onChange={(event) => {
                setParams({ keyword: event.target.value, page: 1 })
              }}
            />
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>日期</span>
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={params.dateStart}
                onChange={(e) => setParams({ dateStart: e.target.value, page: 1 })}
              />
              <span>—</span>
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={params.dateEnd}
                onChange={(e) => setParams({ dateEnd: e.target.value, page: 1 })}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const csvColumns: CsvColumn<AuditEvent>[] = [
                  {
                    header: '事件类型',
                    accessor: (row) =>
                      row.eventType === 'message' ? '消息审计' : '注销申请',
                  },
                  { header: '发生时间', accessor: (row) => formatDate(row.time) },
                  { header: '操作者', accessor: 'actor' },
                  { header: '目标', accessor: 'target' },
                  { header: '摘要', accessor: 'summary' },
                  { header: '详情', accessor: 'detail' },
                ]
                exportCsv(csvColumns, filteredEvents, 'audit_log_export')
                toast.success(`已导出 ${filteredEvents.length} 条审计记录`)
              }}
              disabled={filteredEvents.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
          </div>

          {(messageData?.total ?? 0) > 100 || (logoutData?.total ?? 0) > 100 ? (
            <p className="text-xs text-amber-600">
              当前仅展示最近 100 条消息 + 100 条注销申请，如需更多数据请前往对应专页查看。
            </p>
          ) : null}
          <DataTable table={table} emptyMessage="暂无匹配的审计事件" />
          <DataTablePagination
            page={safePage}
            pageSize={params.size}
            total={total}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
            dataUpdatedAt={dataUpdatedAt}
            onRefresh={handleRefreshAll}
          />
        </CardContent>
      </Card>

      <EntityDrawer
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null)
        }}
        title="审计事件详情"
        subtitle={selectedEvent?.summary}
        className="max-w-4xl"
      >
        {selectedEvent && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Request JSON</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('Request JSON', detailRequestJson)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    复制
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {prettyJson(detailRequestJson)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Response JSON</span>
                  <div className="flex items-center gap-2">
                    {selectedEvent.eventType === 'message' && messageDetailError && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchMessageDetail()}
                      >
                        重试加载
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy('Response JSON', detailResponseJson)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      复制
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedEvent.eventType === 'message' && loadingMessageDetail ? (
                  <LoadingState message="加载消息详情响应..." />
                ) : selectedEvent.eventType === 'message' && messageDetailError ? (
                  <ErrorState
                    message="加载消息详情失败"
                    onRetry={() => refetchMessageDetail()}
                  />
                ) : (
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                    {prettyJson(detailResponseJson)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </EntityDrawer>
    </>
  )
}

// ---------------------------------------------------------------------------
// 管理员操作 Tab
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  force_logout: '强制登出',
  ban_user: '封禁用户',
  unban_user: '解封用户',
  delete_msg: '删除消息',
  delete_group: '解散群组',
  mute_user: '禁言用户',
  reset_password: '重置密码',
  assign_role: '分配角色',
}

function AdminOpsTab() {
  const { state: params, setState: setParams } = useListQueryState<AdminOpsQuery>({
    page: 1,
    size: 20,
    adm_user_id: '',
    action: '',
  })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['audit-log', 'admin-ops', params],
    queryFn: () =>
      getAdminOperationLogs({
        page: params.page,
        size: params.size,
        adm_user_id: params.adm_user_id || undefined,
        action: params.action || undefined,
      }),
  })

  const columns: ColumnDef<AdminOperationLog>[] = [
    {
      accessorKey: 'created_at',
      header: '操作时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'adm_user_id',
      header: '管理员 ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.adm_user_id || '-'}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: '操作类型',
      cell: ({ row }) => {
        const action = row.original.action
        return (
          <StatusBadge
            status={action}
            labels={ACTION_LABELS}
            variants={{
              force_logout: 'warning',
              ban_user: 'error',
              unban_user: 'success',
              delete_msg: 'warning',
              delete_group: 'error',
              mute_user: 'warning',
              reset_password: 'info',
              assign_role: 'info',
            }}
          />
        )
      },
    },
    {
      accessorKey: 'target_id',
      header: '操作对象 ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.target_id || '-'}</span>
      ),
    },
    {
      accessorKey: 'ip',
      header: 'IP',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.ip}</span>
      ),
    },
  ]

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading && !data) {
    return <LoadingState message="加载管理员操作日志..." />
  }

  if (error) {
    return <ErrorState message="加载管理员操作日志失败" onRetry={() => refetch()} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          管理员操作日志
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-[200px]"
            placeholder="管理员 ID"
            value={params.adm_user_id}
            onChange={(e) => setParams({ adm_user_id: e.target.value, page: 1 })}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={params.action}
            onChange={(e) => setParams({ action: e.target.value, page: 1 })}
          >
            <option value="">全部操作</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csvColumns: CsvColumn<AdminOperationLog>[] = [
                { header: '操作时间', accessor: (row) => formatDate(row.created_at) },
                { header: '管理员 ID', accessor: 'adm_user_id' },
                {
                  header: '操作类型',
                  accessor: (row) => ACTION_LABELS[row.action] ?? row.action,
                },
                { header: '操作对象 ID', accessor: 'target_id' },
                { header: 'IP', accessor: 'ip' },
              ]
              exportCsv(csvColumns, data?.items ?? [], 'admin_ops_export')
              toast.success(`已导出 ${data?.items.length ?? 0} 条操作记录`)
            }}
            disabled={!data?.items.length}
          >
            <Download className="mr-2 h-4 w-4" />
            导出 CSV
          </Button>
        </div>

        <DataTable table={table} emptyMessage="暂无管理员操作记录" />
        <DataTablePagination
          page={data?.page ?? 1}
          pageSize={data?.size ?? params.size}
          total={data?.total ?? 0}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
          dataUpdatedAt={dataUpdatedAt}
          onRefresh={() => refetch()}
        />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------

export function AuditLogPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('user_events')

  return (
    <div className="space-y-6">
      <PageHeader
        title="日志审计"
        description="统一查看用户行为事件与管理员操作日志"
      />

      {/* Tab 导航栏 */}
      <div className="flex border-b">
        <TabButton
          active={activeTab === 'user_events'}
          onClick={() => setActiveTab('user_events')}
          icon={FileSearch}
        >
          用户操作日志
        </TabButton>
        <TabButton
          active={activeTab === 'admin_ops'}
          onClick={() => setActiveTab('admin_ops')}
          icon={ShieldCheck}
        >
          管理员操作
        </TabButton>
      </div>

      {/* Tab 内容 */}
      {activeTab === 'user_events' ? <UserEventsTab /> : <AdminOpsTab />}
    </div>
  )
}
