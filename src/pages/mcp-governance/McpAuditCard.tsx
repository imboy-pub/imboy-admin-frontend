import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DataTablePagination, EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { listAudit, McpAuditAction, McpAuditEntry } from '@/services/api/mcpGovernance'
import { formatDate } from '@/lib/utils'

const ACTION_LABEL: Record<McpAuditAction, string> = {
  approve: '审批通过',
  reject: '拒绝接入',
  revoke: '撤销授权',
  tool_call: 'Tool 调用',
}

const ACTION_CLASS: Record<McpAuditAction, string> = {
  approve: 'bg-green-100 text-green-800',
  reject: 'bg-red-100 text-red-800',
  revoke: 'bg-red-100 text-red-800',
  tool_call: 'bg-blue-100 text-blue-800',
}

function ActionBadge({ action }: { action: McpAuditEntry['action'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_CLASS[action]}`}>
      {ACTION_LABEL[action]}
    </span>
  )
}

export function McpAuditCard() {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['mcp-audit', page, size],
    queryFn: () => listAudit({ page, size }),
    placeholderData: keepPreviousData,
  })

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold">审计记录</h2>
        <p className="text-sm text-muted-foreground">MCP 客户端的审批与 tool 调用审计流水</p>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <LoadingState message="加载审计记录..." />
        ) : error ? (
          <ErrorState message="加载审计记录失败" onRetry={() => refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="暂无审计记录" />
        ) : (
          <>
            <div className="divide-y">
              {data.items.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
                  <ActionBadge action={entry.action} />
                  <span className="font-medium">{entry.client_name || entry.client_id}</span>
                  {entry.tool && <span className="font-mono text-xs text-muted-foreground">{entry.tool}</span>}
                  <span className="text-sm text-muted-foreground">{entry.detail || '-'}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {entry.actor ? `${entry.actor} · ` : ''}{formatDate(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(next) => { setPage(1); setSize(next) }}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
