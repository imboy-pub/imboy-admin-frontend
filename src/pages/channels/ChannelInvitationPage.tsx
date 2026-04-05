import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  ChannelGovernanceListParams,
  ChannelInvitation,
  getChannelInvitationsPayload,
} from '@/modules/channels/api'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'

export function ChannelInvitationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })
  const [statusFilter, setStatusFilter] = useState('-1')

  const queryKey = ['channel-invitations', channelId, params] as const

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => getChannelInvitationsPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleStatusSearch = () => {
    setParams((prev) => ({
      ...prev,
      page: 1,
      status: statusFilter === '-1' ? undefined : Number(statusFilter),
    }))
  }

  const handleReset = () => {
    setStatusFilter('-1')
    setParams({ page: 1, size: 10 })
  }

  const invitations = data?.items || []

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<ChannelInvitation>[] = [
      { header: '邀请ID', accessor: (row) => String(row.id) },
      { header: '邀请人UID', accessor: (row) => String(row.inviter_uid) },
      { header: '邀请人昵称', accessor: (row) => row.inviter_user?.nickname || '-' },
      { header: '被邀请人UID', accessor: (row) => String(row.invitee_uid) },
      { header: '被邀请人昵称', accessor: (row) => row.invitee_user?.nickname || '-' },
      { header: '状态', accessor: (row) => ({ 0: '待处理', 1: '已接受', 2: '已拒绝', 3: '已过期', 4: '已取消' }[String(row.status)] || String(row.status)) },
      { header: '邀请码', accessor: (row) => row.invitation_code || '-' },
      { header: '过期时间', accessor: (row) => formatOptionalDate(row.expires_at) },
      { header: '接受时间', accessor: (row) => formatOptionalDate(row.accepted_at) },
      { header: '创建时间', accessor: (row) => formatOptionalDate(row.created_at) },
    ]
    exportCsv(csvColumns, invitations, 'channel_invitations')
    toast.success(`已导出 ${invitations.length} 条邀请记录`)
  }

  const columns: ColumnDef<ChannelInvitation>[] = [
    {
      accessorKey: 'id',
      header: '邀请 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'inviter_uid',
      header: '邀请人',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.inviter_uid}</div>
          <div className="text-muted-foreground">
            {row.original.inviter_user?.nickname || row.original.inviter_user?.account || '-'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'invitee_uid',
      header: '被邀请人',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.invitee_uid}</div>
          <div className="text-muted-foreground">
            {row.original.invitee_user?.nickname || row.original.invitee_user?.account || '-'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 0: '待处理', 1: '已接受', 2: '已拒绝', 3: '已过期', 4: '已取消' }}
          variants={{ 0: 'warning', 1: 'success', 2: 'secondary', 3: 'error', 4: 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'invitation_code',
      header: '邀请码',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.invitation_code || '-'}</span>,
    },
    {
      accessorKey: 'expires_at',
      header: '过期时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.expires_at)}</span>
      ),
    },
    {
      accessorKey: 'accepted_at',
      header: '接受时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.accepted_at)}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatOptionalDate(row.original.created_at)}</span>
      ),
    },
  ]

  const table = useReactTable({
    data: invitations,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道邀请中..." />
  }

  if (error || !channelId) {
    return <ErrorState message="加载频道邀请失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道邀请治理"
        description={`频道 ID: ${channelId}`}
        actions={(
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={invitations.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回频道详情
            </Button>
          </div>
        )}
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleStatusSearch} onReset={handleReset} searchText="查询">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="0">待处理</option>
              <option value="1">已接受</option>
              <option value="2">已拒绝</option>
              <option value="3">已过期</option>
              <option value="4">已取消</option>
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
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
    </div>
  )
}
