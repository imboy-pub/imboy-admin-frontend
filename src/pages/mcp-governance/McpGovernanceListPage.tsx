import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Search, CheckCircle, XCircle, Ban, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  approveClient,
  listClients,
  rejectClient,
  revokeClient,
  McpClient,
  McpClientListParams,
  McpClientStatus,
} from '@/services/api/mcpGovernance'
import { formatDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { McpClientGrantsDrawer } from './McpClientGrantsDrawer'
import { McpAuditCard } from './McpAuditCard'

type PendingAction = { type: 'approve' | 'reject' | 'revoke'; client: McpClient }

const STATUS_META: Record<McpClientStatus, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通过', className: 'bg-green-100 text-green-800' },
  revoked: { label: '已撤销', className: 'bg-red-100 text-red-800' },
}

const STATUS_FILTERS: Array<{ value?: McpClientStatus; label: string }> = [
  { value: undefined, label: '全部' },
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已通过' },
  { value: 'revoked', label: '已撤销' },
]

const ACTION_CONFIG = {
  approve: { title: '确认审批通过', confirmText: '通过', variant: 'default' as const, success: '已审批通过 MCP 客户端', run: (c: McpClient) => approveClient(c.client_id) },
  reject: { title: '确认拒绝接入', confirmText: '拒绝', variant: 'destructive' as const, success: '已拒绝 MCP 客户端接入', run: (c: McpClient) => rejectClient(c.client_id) },
  revoke: { title: '确认撤销授权', confirmText: '撤销', variant: 'destructive' as const, success: '已撤销 MCP 客户端授权', run: (c: McpClient) => revokeClient(c.client_id) },
}

export function McpGovernanceListPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useState<McpClientListParams>({ page: 1, size: 10 })
  const [keywordInput, setKeywordInput] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [detailClient, setDetailClient] = useState<McpClient | null>(null)

  // 占位权限码：需后端 adm_acl 新增 mcp_clients:approve；roles 暂沿用超管/运营。
  const { allowed: canApprove } = useAdminPermission({
    permission: 'mcp_clients:approve',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['mcp-clients', params],
    queryFn: () => listClients(params),
    placeholderData: keepPreviousData,
  })

  const mutation = useMutation({
    mutationFn: (action: PendingAction) => ACTION_CONFIG[action.type].run(action.client),
    onSuccess: (_result, action) => {
      toast.success(ACTION_CONFIG[action.type].success)
      void queryClient.invalidateQueries({ queryKey: ['mcp-clients'] })
      void queryClient.invalidateQueries({ queryKey: ['mcp-audit'] })
    },
    onError: (err: unknown) => {
      toast.error(`操作失败: ${getErrorMessage(err)}`)
    },
    onSettled: () => {
      setPending(null)
    },
  })

  const handleSearch = () => {
    setParams((prev) => ({ ...prev, page: 1, keyword: keywordInput.trim() || undefined }))
  }

  const handleStatusFilter = (status?: McpClientStatus) => {
    setParams((prev) => ({ ...prev, page: 1, status }))
  }

  const columns: ColumnDef<McpClient>[] = [
    {
      accessorKey: 'name',
      header: '客户端名称',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium">{row.original.name}</span>
          {row.original.description && (
            <p className="max-w-[320px] truncate text-xs text-muted-foreground">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'client_id',
      header: 'Client ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.client_id}</span>,
    },
    {
      accessorKey: 'created_at',
      header: '接入时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const meta = STATUS_META[row.original.status]
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
            {meta.label}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setDetailClient(client)}>
              <Eye className="mr-1 h-3 w-3" />
              详情
            </Button>
            {!canApprove ? (
              <span className="text-xs text-muted-foreground">无审批权限</span>
            ) : (
              <>
                {client.status === 'pending' && (
                  <>
                    <Button variant="default" size="sm" onClick={() => setPending({ type: 'approve', client })}>
                      <CheckCircle className="mr-1 h-3 w-3" />
                      通过
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setPending({ type: 'reject', client })}>
                      <XCircle className="mr-1 h-3 w-3" />
                      拒绝
                    </Button>
                  </>
                )}
                {client.status === 'approved' && (
                  <Button variant="destructive" size="sm" onClick={() => setPending({ type: 'revoke', client })}>
                    <Ban className="mr-1 h-3 w-3" />
                    撤销
                  </Button>
                )}
              </>
            )}
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading && !data) {
    return <LoadingState message="加载 MCP 客户端..." />
  }

  if (error) {
    return <ErrorState message="加载 MCP 客户端失败" onRetry={() => refetch()} />
  }

  const activeConfig = pending ? ACTION_CONFIG[pending.type] : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="MCP 治理"
        description="审批 MCP 客户端接入、按 scope/tool 管理授权并查看审计（后端 /api/adm/mcp/* 待实现，当前为 mock 数据）"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.label}
                  variant={params.status === filter.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <Input
              className="w-64"
              placeholder="客户端名称/描述关键词"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              搜索
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
              onPageSizeChange={(size) => setParams((prev) => ({ ...prev, page: 1, size }))}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      <McpAuditCard />

      <McpClientGrantsDrawer client={detailClient} onClose={() => setDetailClient(null)} />

      <ConfirmDialog
        open={canApprove && pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        title={activeConfig?.title ?? ''}
        description={pending ? `确定要对客户端「${pending.client.name}」执行「${activeConfig?.confirmText}」操作吗？` : ''}
        confirmText={activeConfig?.confirmText}
        variant={activeConfig?.variant}
        loading={mutation.isPending}
        onConfirm={() => {
          if (pending) void mutation.mutateAsync(pending)
        }}
      />
    </div>
  )
}
