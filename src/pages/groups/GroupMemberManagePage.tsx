import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ColumnDef,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowLeft, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DataTable,
  DataTablePagination,
  LoadingState,
  ErrorState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import { getGroupMembersPayload } from '@/modules/groups/api'
import { formatDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { GroupMember } from '@/types/group'

const ROLE_MAP: Record<number, { label: string; variant: 'info' | 'secondary' | 'warning' }> = {
  1: { label: '群主', variant: 'info' },
  2: { label: '管理员', variant: 'warning' },
  3: { label: '成员', variant: 'secondary' },
}

export function GroupMemberManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const gid = id ?? ''
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['group-members', gid, page, size],
    queryFn: () => getGroupMembersPayload(gid, page, size),
    enabled: gid.length > 0,
  })

  const columns = useMemo<ColumnDef<GroupMember>[]>(() => [
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono text-primary hover:underline"
          onClick={() => navigate(`/users/${row.original.user_id}`)}
        >
          {row.original.user_id}
        </button>
      ),
    },
    {
      accessorKey: 'nickname',
      header: '昵称',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.avatar && (
            <img
              src={row.original.avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
              loading="lazy"
            />
          )}
          <span>{row.original.nickname || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: '角色',
      cell: ({ row }) => {
        const info = ROLE_MAP[row.original.role] ?? ROLE_MAP[3]
        return <StatusBadge status={row.original.role} labels={{ 1: info.label, 2: '管理员', 3: '成员' }} variants={{ 1: info.variant, 2: 'warning', 3: 'secondary' }} />
      },
    },
    {
      accessorKey: 'joined_at',
      header: '加入时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.joined_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/users/${row.original.user_id}`)}
        >
          查看用户
        </Button>
      ),
    },
  ], [navigate])

  const members = useMemo(() => data?.items ?? [], [data?.items])

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<GroupMember>[] = [
      { header: 'ID', accessor: (row) => String(row.id) },
      { header: '用户ID', accessor: (row) => String(row.user_id) },
      { header: '昵称', accessor: (row) => row.nickname || '-' },
      { header: '角色', accessor: (row) => ({ 1: '群主', 2: '管理员', 3: '成员' }[row.role] ?? String(row.role)) },
      { header: '状态', accessor: (row) => String(row.status) },
      { header: '加入时间', accessor: (row) => formatDate(row.joined_at) },
    ]
    exportCsv(csvColumns, members, 'group_members')
    toast.success(`已导出 ${members.length} 条数据`)
  }

  const table = useReactTable({
    data: members,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.user_id),
  })

  if (isLoading) return <LoadingState message="加载群组成员..." />
  if (error) return <ErrorState message="加载群组成员失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="群组成员"
        description={`群组 ${gid} 的成员列表，共 ${data?.total ?? 0} 人`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={members.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群组详情
          </Button>
          </>
        }
      />

      <DataTable table={table} />

      {data && (
        <DataTablePagination
          page={data.page}
          pageSize={data.size}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => { setSize(newSize); setPage(1) }}
          dataUpdatedAt={dataUpdatedAt}
          onRefresh={() => refetch()}
        />
      )}
    </div>
  )
}
