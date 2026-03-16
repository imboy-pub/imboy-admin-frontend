import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  ChannelGovernanceListParams,
  ChannelInvitation,
  getChannelInvitationsPayload,
} from '@/modules/channels/api'
import { formatDate } from '@/lib/utils'

function formatOptionalDate(value: string | null | undefined): string {
  if (!value) return '-'
  return formatDate(value)
}

export function ChannelInvitationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })

  const queryKey = ['channel-invitations', channelId, params] as const

  const { data, isLoading, error, refetch } = useQuery({
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
    data: data?.items || [],
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
          <Button variant="outline" onClick={() => navigate(`/channels/${channelId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回频道详情
          </Button>
        )}
      />

      <Card>
        <CardHeader />
        <CardContent>
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
    </div>
  )
}
