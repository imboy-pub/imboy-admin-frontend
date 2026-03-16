import { ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye, Download, X, Copy, SlidersHorizontal } from 'lucide-react'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
} from '@/components/shared'
import {
  exportMessageCsvBlob,
  getMessageDetailPayload,
  getMessageListPayload,
} from '@/modules/messages/api'
import { ManagedMessage, MessageListParams } from '@/types/message'
import { formatDate, truncate } from '@/lib/utils'
import { ColumnDef, VisibilityState, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'

const scopeLabels: Record<string, string> = {
  c2c: '单聊',
  c2g: '群聊',
  c2s: '机器人',
  s2c: '系统',
}

const scopeVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  c2c: 'info',
  c2g: 'success',
  c2s: 'warning',
  s2c: 'secondary',
}

const columnLabels: Record<string, string> = {
  scope: '范围',
  msg_id: '消息 ID',
  from_id: '发送方',
  to_id: '接收方',
  msg_type: '类型',
  action: '动作',
  payload: '内容',
  created_at: '创建时间',
  actions: '操作',
}

type PayloadViewMode = 'pretty' | 'raw' | 'tree'

export function MessageListPage() {
  const [params, setParams] = useState<MessageListParams>({
    page: 1,
    size: 10,
    msg_scope: 'all',
  })
  const [scopeInput, setScopeInput] = useState<MessageListParams['msg_scope']>('all')
  const [uidInput, setUidInput] = useState('')
  const [conversationInput, setConversationInput] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [fromTsInput, setFromTsInput] = useState('')
  const [toTsInput, setToTsInput] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<{
    msgId: string
    scope: MessageListParams['msg_scope']
  } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showColumnPanel, setShowColumnPanel] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [payloadView, setPayloadView] = useState<PayloadViewMode>('pretty')
  const [payloadKeyword, setPayloadKeyword] = useState('')

  const applyQuickRange = (hours: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - hours * 3600 * 1000)
    const fromIso = from.toISOString()
    const toIso = now.toISOString()
    setFromTsInput(fromIso)
    setToTsInput(toIso)
    setParams((prev) => ({
      ...prev,
      page: 1,
      from_ts: fromIso,
      to_ts: toIso,
    }))
  }

  const clearQuickRange = () => {
    setFromTsInput('')
    setToTsInput('')
    setParams((prev) => ({
      ...prev,
      page: 1,
      from_ts: undefined,
      to_ts: undefined,
    }))
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['messages', params],
    queryFn: () => getMessageListPayload(params),
  })
  const {
    data: detailData,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['message-detail', selectedMessage?.msgId, selectedMessage?.scope],
    queryFn: () => getMessageDetailPayload(selectedMessage!.msgId, selectedMessage!.scope),
    enabled: !!selectedMessage?.msgId,
  })

  const handleSearch = () => {
    const nextUid = uidInput.trim() || undefined

    setParams((prev) => ({
      ...prev,
      page: 1,
      msg_scope: scopeInput ?? 'all',
      uid: nextUid,
      conversation: conversationInput.trim() || undefined,
      keyword: keywordInput.trim() || undefined,
      from_ts: fromTsInput.trim() || undefined,
      to_ts: toTsInput.trim() || undefined,
    }))
  }

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleExportCsv = async () => {
    setIsExporting(true)
    try {
      const blob = await exportMessageCsvBlob(params)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `messages_export_${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('已开始下载导出文件')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败'
      toast.error(msg)
    } finally {
      setIsExporting(false)
    }
  }

  const handleCopy = async (label: string, value: string) => {
    if (!value) {
      toast.error(`没有可复制的${label}`)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label}已复制`)
    } catch {
      toast.error(`复制${label}失败`)
    }
  }

  const openMessageDetail = (msg: ManagedMessage) => {
    setPayloadView('pretty')
    setPayloadKeyword('')
    setSelectedMessage({
      msgId: msg.msg_id,
      scope: msg.scope,
    })
  }

  const closeMessageDetail = () => {
    setSelectedMessage(null)
  }

  const columns: ColumnDef<ManagedMessage>[] = [
    {
      accessorKey: 'scope',
      header: '范围',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.scope}
          labels={scopeLabels}
          variants={scopeVariants}
        />
      ),
    },
    {
      accessorKey: 'msg_id',
      header: '消息 ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.original.msg_id}>
          {truncate(row.original.msg_id, 20)}
        </span>
      ),
    },
    {
      accessorKey: 'from_id',
      header: '发送方',
      cell: ({ row }) => <span className="font-mono">{row.original.from_id}</span>,
    },
    {
      accessorKey: 'to_id',
      header: '接收方',
      cell: ({ row }) => <span className="font-mono">{row.original.to_id}</span>,
    },
    {
      accessorKey: 'msg_type',
      header: '类型',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.msg_type || '-'}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: '动作',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.action || '-'}</span>
      ),
    },
    {
      accessorKey: 'payload',
      header: '内容',
      cell: ({ row }) => (
        <span
          className="block max-w-[320px] truncate text-xs font-mono text-muted-foreground"
          title={row.original.payload || ''}
        >
          {row.original.payload ? truncate(row.original.payload, 120) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
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
            title="查看详情"
            onClick={() => openMessageDetail(row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="复制整行JSON"
            onClick={() => handleCopy('整行JSON', JSON.stringify(row.original, null, 2))}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const messages = data?.items || []
  const pagination = data

  const table = useReactTable({
    data: messages,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  const payloadMeta = parsePayload(detailData?.payload || '')
  const payloadText = payloadView === 'raw' ? detailData?.payload || '-' : payloadMeta.display

  if (isLoading) {
    return <LoadingState message="加载消息数据..." />
  }

  if (error) {
    return <ErrorState message="加载消息数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="消息管理"
        description="查询单聊、群聊、系统消息记录"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={scopeInput}
              onChange={(e) => setScopeInput(e.target.value as MessageListParams['msg_scope'])}
            >
              <option value="all">全部范围</option>
              <option value="c2c">单聊 c2c</option>
              <option value="c2g">群聊 c2g</option>
              <option value="c2s">机器人 c2s</option>
              <option value="s2c">系统 s2c</option>
            </select>

            <Input
              className="w-28"
              placeholder="UID"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <Input
              className="w-48"
              placeholder="会话(12:34 或 7)"
              value={conversationInput}
              onChange={(e) => setConversationInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <Input
              className="w-56"
              placeholder="开始时间(RFC3339/毫秒)"
              value={fromTsInput}
              onChange={(e) => setFromTsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <Input
              className="w-56"
              placeholder="结束时间(RFC3339/毫秒)"
              value={toTsInput}
              onChange={(e) => setToTsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyQuickRange(1)}
              >
                最近1小时
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyQuickRange(24)}
              >
                最近24小时
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyQuickRange(24 * 7)}
              >
                最近7天
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearQuickRange}
              >
                清空时间
              </Button>
            </div>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="关键词(匹配 payload)"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            <Button onClick={handleSearch}>查询</Button>

            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowColumnPanel((prev) => !prev)}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                列显示
              </Button>
              {showColumnPanel && (
                <div className="absolute right-0 top-10 z-20 w-56 rounded-md border bg-background p-3 shadow-lg">
                  <div className="mb-2 text-xs text-muted-foreground">自定义列表列显示</div>
                  <div className="space-y-2">
                    {table.getAllLeafColumns().map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                        />
                        <span>{columnLabels[column.id] || column.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? '导出中...' : '导出全部 CSV'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />

          {pagination && (
            <DataTablePagination
              page={pagination.page}
              pageSize={pagination.size}
              total={pagination.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      {selectedMessage && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={closeMessageDetail}
        >
          <div
            className="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">消息详情</h2>
                <p className="text-sm text-muted-foreground font-mono">
                  {selectedMessage.msgId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy('消息ID', selectedMessage.msgId)}
                >
                  复制消息ID
                </Button>
                {detailData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('整行JSON', JSON.stringify(detailData, null, 2))}
                  >
                    复制整行JSON
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeMessageDetail}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4 p-6">
              {detailLoading && <LoadingState message="加载消息详情..." />}

              {detailError && (
                <ErrorState
                  message="加载消息详情失败"
                  onRetry={() => refetchDetail()}
                />
              )}

              {!detailLoading && !detailError && detailData && (
                <>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-muted-foreground">范围</dt>
                      <dd>{detailData.scope}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">消息类型</dt>
                      <dd>{detailData.msg_type || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">发送方</dt>
                      <dd className="font-mono">{detailData.from_id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">接收方</dt>
                      <dd className="font-mono">{detailData.to_id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">动作</dt>
                      <dd>{detailData.action || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">服务端时间</dt>
                      <dd>{formatDate(detailData.server_ts || detailData.created_at)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-sm text-muted-foreground">创建时间</dt>
                      <dd>{formatDate(detailData.created_at)}</dd>
                    </div>
                  </dl>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Payload</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge
                          status={payloadMeta.isJson ? 1 : 0}
                          labels={{ 1: 'JSON有效', 0: '原始文本' }}
                          variants={{ 1: 'success', 0: 'warning' }}
                        />
                        <Button
                          variant={payloadView === 'pretty' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPayloadView('pretty')}
                        >
                          格式化
                        </Button>
                        <Button
                          variant={payloadView === 'raw' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPayloadView('raw')}
                        >
                          原文
                        </Button>
                        <Button
                          variant={payloadView === 'tree' ? 'default' : 'outline'}
                          size="sm"
                          disabled={!payloadMeta.isJson}
                          onClick={() => setPayloadView('tree')}
                        >
                          树视图
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy('Payload', detailData.payload || '')}
                        >
                          复制Payload
                        </Button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <Input
                        placeholder="在Payload中高亮关键词"
                        value={payloadKeyword}
                        onChange={(e) => setPayloadKeyword(e.target.value)}
                      />
                    </div>

                    {payloadView === 'tree' && payloadMeta.isJson ? (
                      <div className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-5">
                        <JsonTree value={payloadMeta.parsed} keyword={payloadKeyword} />
                      </div>
                    ) : (
                      <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-5 whitespace-pre-wrap break-words">
                        {highlightText(payloadText, payloadKeyword)}
                      </pre>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function parsePayload(payload: string): { display: string; isJson: boolean; parsed: unknown } {
  if (!payload) {
    return { display: '-', isJson: false, parsed: null }
  }
  try {
    const parsed = JSON.parse(payload) as unknown
    return { display: JSON.stringify(parsed, null, 2), isJson: true, parsed }
  } catch {
    return { display: payload, isJson: false, parsed: payload }
  }
}

function highlightText(text: string, keyword: string): ReactNode {
  const target = keyword.trim()
  if (!target) {
    return text
  }

  const escaped = escapeRegExp(target)
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, index) => {
    if (part.toLowerCase() === target.toLowerCase()) {
      return (
        <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-black">
          {part}
        </mark>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`
  }
  if (value === null) {
    return 'null'
  }
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface JsonTreeProps {
  value: unknown
  keyword: string
  depth?: number
}

function JsonTree({ value, keyword, depth = 0 }: JsonTreeProps) {
  const style = { marginLeft: depth * 12 }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div style={style} className="text-xs text-muted-foreground">
          []
        </div>
      )
    }
    return (
      <div style={style} className="space-y-1">
        {value.map((item, idx) => (
          <div key={`arr-${depth}-${idx}`} className="space-y-1">
            <div className="text-xs text-muted-foreground">[{idx}]</div>
            <JsonTree value={item} keyword={keyword} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return (
        <div style={style} className="text-xs text-muted-foreground">
          {'{}'}
        </div>
      )
    }
    return (
      <div style={style} className="space-y-1">
        {entries.map(([key, child], idx) => (
          <div key={`obj-${depth}-${key}-${idx}`} className="space-y-1">
            <div className="text-xs">
              <span className="font-semibold text-sky-700">{highlightText(key, keyword)}</span>
              <span className="text-muted-foreground">: </span>
            </div>
            <JsonTree value={child} keyword={keyword} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={style} className="text-xs">
      {highlightText(formatPrimitive(value), keyword)}
    </div>
  )
}
