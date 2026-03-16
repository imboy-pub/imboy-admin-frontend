import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  ChannelAdmin,
  ChannelGovernanceListParams,
  getChannelAdminsPayload,
  removeChannelAdmin,
  updateChannelAdminRole,
} from '@/modules/channels/api'
import { formatDate } from '@/lib/utils'

const ROLE_LABELS: Record<number, string> = {
  1: '管理员',
  2: '高级管理员',
  3: '创建者',
}

export function ChannelAdminPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = id ?? ''

  const [params, setParams] = useState<ChannelGovernanceListParams>({
    page: 1,
    size: 10,
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    userId: string | number
    nickname: string
    role: number
  } | null>(null)

  const queryKey = ['channel-admins', channelId, params] as const

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => getChannelAdminsPayload(channelId, params),
    enabled: channelId.length > 0,
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string | number; role: number }) =>
      updateChannelAdminRole(channelId, userId, role),
    onSuccess: () => {
      toast.success('管理员角色已更新')
      queryClient.invalidateQueries({ queryKey: ['channel-admins', channelId] })
    },
    onError: (err: Error) => {
      toast.error(`角色更新失败: ${err.message}`)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string | number) => removeChannelAdmin(channelId, userId),
    onSuccess: () => {
      toast.success('管理员已移除')
      queryClient.invalidateQueries({ queryKey: ['channel-admins', channelId] })
      setConfirmDialog(null)
    },
    onError: (err: Error) => {
      toast.error(`移除失败: ${err.message}`)
    },
  })

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleRoleChange = (admin: ChannelAdmin, role: number) => {
    if (role === admin.role) return
    if (admin.role === 3) {
      toast.error('创建者角色不可修改')
      return
    }
    roleMutation.mutate({ userId: admin.user_id, role })
  }

  const columns: ColumnDef<ChannelAdmin>[] = [
    {
      accessorKey: 'id',
      header: '记录 ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-mono">{row.original.user_id}</div>
          <div className="text-muted-foreground">
            {row.original.user?.nickname || row.original.user?.account || '-'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: '角色',
      cell: ({ row }) => {
        const admin = row.original
        const isCreator = admin.role === 3
        return (
          <select
            value={String(admin.role)}
            disabled={isCreator || roleMutation.isPending}
            onChange={(event) => handleRoleChange(admin, Number(event.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="1">管理员</option>
            <option value="2">高级管理员</option>
            <option value="3">创建者</option>
          </select>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: '加入时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'role_text',
      header: '角色说明',
      cell: ({ row }) => <span>{ROLE_LABELS[row.original.role] || `角色 ${row.original.role}`}</span>,
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const admin = row.original
        const isCreator = admin.role === 3
        const nickname = admin.user?.nickname || admin.user?.account || String(admin.user_id)

        return (
          <Button
            variant="ghost"
            size="icon"
            title={isCreator ? '创建者不可移除' : '移除管理员'}
            disabled={isCreator}
            onClick={() =>
              setConfirmDialog({
                open: true,
                userId: admin.user_id,
                nickname,
                role: admin.role,
              })
            }
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载频道管理员中..." />
  }

  if (error || !channelId) {
    return <ErrorState message="加载频道管理员失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道管理员治理"
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

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog(open ? confirmDialog : null)}
          title="确认移除管理员"
          description={`确定要移除管理员「${confirmDialog.nickname}」吗？`}
          confirmText="移除"
          variant="destructive"
          loading={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate(confirmDialog.userId)}
        />
      )}
    </div>
  )
}
