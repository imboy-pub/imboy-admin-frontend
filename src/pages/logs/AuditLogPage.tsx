import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowRightLeft, Copy, Eye, FileSearch, MessageSquare, UserMinus, X, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import { getMessageDetailPayload, getMessageListPayload } from '@/modules/messages'
import { getLogoutApplicationListPayload } from '@/services/api/logoutApplications'
import { formatDate, truncate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { MessageScope } from '@/types/message'

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

export function AuditLogPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | AuditEventType>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)

  const {
    data: messageData,
    isLoading: loadingMessage,
    error: messageError,
    refetch: refetchMessage,
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
  } = useQuery({
    queryKey: ['audit-log', 'logout-applications'],
    queryFn: () =>
      getLogoutApplicationListPayload({
        page: 1,
        size: 100,
      }),
  })

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
        path: '/adm/message/list',
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
        path: '/adm/user/logout_apply/list',
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

    return [...messageEvents, ...logoutEvents].sort((a, b) => toTimestamp(b.time) - toTimestamp(a.time))
  }, [logoutData?.items, messageData?.items])

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return events.filter((event) => {
      const typeMatch = eventTypeFilter === 'all' || event.eventType === eventTypeFilter
      if (!typeMatch) return false
      if (!normalizedKeyword) return true

      const fullText = `${event.summary} ${event.detail} ${event.actor} ${event.target}`.toLowerCase()
      return fullText.includes(normalizedKeyword)
    })
  }, [eventTypeFilter, events, keyword])

  const total = filteredEvents.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageEvents = filteredEvents.slice((safePage - 1) * pageSize, safePage * pageSize)

  const detailRequestJson = useMemo(() => {
    if (!selectedEvent) return {}

    if (selectedEvent.eventType === 'message') {
      return {
        method: 'GET',
        path: '/adm/message/detail',
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
        return {
          code: 0,
          payload: messageDetail,
        }
      }
      return {
        loading: true,
      }
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
        <span className="block max-w-[320px] truncate font-mono text-xs text-muted-foreground" title={row.original.detail}>
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
    return (
      <ErrorState
        message="加载审计日志失败"
        onRetry={() => {
          void refetchMessage()
          void refetchLogout()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="日志审计"
        description="统一查看消息行为与注销申请等关键审计事件"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/messages')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              消息审计页
            </Button>
            <Button variant="outline" onClick={() => navigate('/logout-applications')}>
              <UserMinus className="mr-2 h-4 w-4" />
              注销申请页
            </Button>
          </>
        }
      />

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
                value={eventTypeFilter}
                onChange={(event) => {
                  setEventTypeFilter(event.target.value as 'all' | AuditEventType)
                  setPage(1)
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
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const csvColumns: CsvColumn<AuditEvent>[] = [
                  { header: '事件类型', accessor: (row) => row.eventType === 'message' ? '消息审计' : '注销申请' },
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

          <DataTable table={table} emptyMessage="暂无匹配的审计事件" />
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </CardContent>
      </Card>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="ml-auto h-full w-full max-w-4xl overflow-y-auto bg-background shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">审计事件详情</h2>
                <p className="text-sm text-muted-foreground">{selectedEvent.summary}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEvent(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 p-6">
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
                    <ErrorState message="加载消息详情失败" onRetry={() => refetchMessageDetail()} />
                  ) : (
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                      {prettyJson(detailResponseJson)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
