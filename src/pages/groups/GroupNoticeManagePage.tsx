import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Download, Eye, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import {
  deleteGroupNotice,
  getGroupNoticeDetailPayload,
  getGroupNoticesPayload,
  GroupNotice,
} from '@/services/api/groupEnhancements'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { useAdminPermission } from '@/hooks/useAdminPermission'

export function GroupNoticeManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedNoticeId, setSelectedNoticeId] = useState('')
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState('')
  const { allowed: canDeleteNotice } = useAdminPermission({
    permission: 'groups:notice:delete',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['group-notices', gid, page, size],
    queryFn: () => getGroupNoticesPayload(gid, { page, size }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-notice-detail', selectedNoticeId],
    queryFn: () => getGroupNoticeDetailPayload(selectedNoticeId),
    enabled: selectedNoticeId.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupNotice,
    onSuccess: async () => {
      toast.success('公告已删除')
      const deletedId = confirmDeleteNoticeId
      setConfirmDeleteNoticeId('')
      if (deletedId && selectedNoticeId === deletedId) {
        setSelectedNoticeId('')
      }
      await queryClient.invalidateQueries({ queryKey: ['group-notices', gid] })
    },
    onError: (err: Error) => {
      toast.error(`删除公告失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupNotice>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id)}</span>,
      },
      {
        accessorKey: 'title',
        header: '标题',
        cell: ({ row }) => <span className="font-medium">{row.original.title || '-'}</span>,
      },
      {
        accessorKey: 'pinned',
        header: '置顶',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.pinned ? 1 : 0}
            labels={{ 1: '是', 0: '否' }}
            variants={{ 1: 'warning', 0: 'secondary' }}
          />
        ),
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status ?? 0}
            labels={{ 0: '草稿', 1: '已发布' }}
            variants={{ 0: 'secondary', 1: 'success' }}
          />
        ),
      },
      {
        accessorKey: 'read_count',
        header: '已读数',
        cell: ({ row }) => <span>{row.original.read_count ?? 0}</span>,
      },
      {
        accessorKey: 'created_at',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatOptionalDate(row.original.created_at)}
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
              onClick={() => setSelectedNoticeId(String(row.original.id))}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canDeleteNotice && (
              <Button
                variant="ghost"
                size="icon"
                title="删除公告"
                onClick={() => setConfirmDeleteNoticeId(String(row.original.id))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteNotice]
  )

  const notices = data?.items || []
  const handleExportCsv = () => {
    const csvColumns: CsvColumn<GroupNotice>[] = [
      { header: 'ID', accessor: (row) => String(row.id) },
      { header: '标题', accessor: (row) => row.title || '-' },
      { header: '内容', accessor: (row) => (row.body && row.body.length > 200 ? row.body.slice(0, 200) + '...' : (row.body || '-')) },
      { header: '发布者ID', accessor: (row) => String(row.user_id ?? '-') },
      { header: '状态', accessor: (row) => ({ 0: '草稿', 1: '已发布' }[row.status ?? 0] ?? String(row.status)) },
      { header: '是否置顶', accessor: (row) => (row.pinned ? '是' : '否') },
      { header: '阅读量', accessor: (row) => String(row.read_count ?? 0) },
      { header: '过期时间', accessor: (row) => formatOptionalDate(row.expired_at) },
      { header: '创建时间', accessor: (row) => formatOptionalDate(row.created_at) },
    ]
    exportCsv(csvColumns, notices, 'group_notices')
    toast.success(`已导出 ${notices.length} 条数据`)
  }
  const table = useReactTable({
    data: notices,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群公告数据..." />
  }

  if (error) {
    return <ErrorState message="加载群公告数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群公告管理"
        description={`群组 ${gid} 的公告列表与治理操作`}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={notices.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回群详情
            </Button>
          </>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>公告列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedNoticeId(String(row.id))}
          />

          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setSize(nextSize)
                setPage(1)
              }}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公告详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedNoticeId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看公告详情</p>
          )}

          {selectedNoticeId && isDetailLoading && (
            <LoadingState message="加载公告详情..." />
          )}

          {selectedNoticeId && detailError && (
            <ErrorState message="加载公告详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedNoticeId && detail && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">公告ID</dt>
                <dd className="font-mono">{String(detail.id)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">群组ID</dt>
                <dd className="font-mono">{String(detail.group_id)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">标题</dt>
                <dd className="font-medium">{detail.title || '-'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">内容</dt>
                <dd className="whitespace-pre-wrap break-words">{detail.body || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">状态</dt>
                <dd>
                  <StatusBadge
                    status={detail.status ?? 0}
                    labels={{ 0: '草稿', 1: '已发布' }}
                    variants={{ 0: 'secondary', 1: 'success' }}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">置顶</dt>
                <dd>{detail.pinned ? '是' : '否'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">已读数</dt>
                <dd>{detail.read_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">过期时间</dt>
                <dd>{formatOptionalDate(detail.expired_at || undefined)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建时间</dt>
                <dd>{formatOptionalDate(detail.created_at || undefined)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">更新时间</dt>
                <dd>{formatOptionalDate(detail.updated_at || undefined)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canDeleteNotice && confirmDeleteNoticeId.length > 0}
        onOpenChange={(open) => setConfirmDeleteNoticeId(open ? confirmDeleteNoticeId : '')}
        title="确认删除公告"
        description={`确定要删除公告 ${confirmDeleteNoticeId} 吗？该操作将执行软删除。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(confirmDeleteNoticeId)}
      />
    </div>
  )
}
