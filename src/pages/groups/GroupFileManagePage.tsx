import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  deleteGroupFile,
  getGroupFileDetailPayload,
  getGroupFilesPayload,
  GroupFile,
} from '@/services/api/groupEnhancements'
import { formatDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

function formatDateSafe(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

export function GroupFileManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [selectedFileId, setSelectedFileId] = useState('')
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState('')
  const { allowed: canDeleteFile } = useAdminPermission({
    permission: 'groups:file:delete',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-files', gid, page, size, keyword, category],
    queryFn: () =>
      getGroupFilesPayload(gid, {
        page,
        size,
        keyword: keyword.trim() || undefined,
        category: category.trim() || undefined,
      }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-file-detail', selectedFileId],
    queryFn: () => getGroupFileDetailPayload(selectedFileId),
    enabled: selectedFileId.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupFile,
    onSuccess: async () => {
      toast.success('文件已删除')
      const deletedId = confirmDeleteFileId
      setConfirmDeleteFileId('')
      if (deletedId && selectedFileId === deletedId) {
        setSelectedFileId('')
      }
      await queryClient.invalidateQueries({ queryKey: ['group-files', gid] })
    },
    onError: (err: Error) => {
      toast.error(`删除文件失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupFile>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id)}</span>,
      },
      {
        accessorKey: 'file_id',
        header: '文件ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.file_id}</span>,
      },
      {
        accessorKey: 'file_name',
        header: '文件名',
        cell: ({ row }) => <span className="font-medium">{row.original.file_name || '-'}</span>,
      },
      {
        accessorKey: 'file_category',
        header: '分类',
        cell: ({ row }) => <span>{row.original.file_category || '-'}</span>,
      },
      {
        accessorKey: 'file_size',
        header: '大小(Byte)',
        cell: ({ row }) => <span className="font-mono">{String(row.original.file_size ?? 0)}</span>,
      },
      {
        accessorKey: 'download_count',
        header: '下载数',
        cell: ({ row }) => <span>{row.original.download_count ?? 0}</span>,
      },
      {
        accessorKey: 'created_at',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateSafe(row.original.created_at)}
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
              onClick={() => setSelectedFileId(String(row.original.id))}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canDeleteFile && (
              <Button
                variant="ghost"
                size="icon"
                title="删除文件"
                onClick={() => setConfirmDeleteFileId(String(row.original.id))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteFile]
  )

  const files = data?.items || []
  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群文件数据..." />
  }

  if (error) {
    return <ErrorState message="加载群文件数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群文件管理"
        description={`群组 ${gid} 的文件列表与治理操作`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>文件列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              placeholder="关键词（文件名）"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
            />
            <Input
              placeholder="分类（可选）"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
                setPage(1)
              }}
            />
          </div>

          <DataTable
            table={table}
            onRowClick={(row) => setSelectedFileId(String(row.id))}
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
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>文件详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedFileId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看文件详情</p>
          )}

          {selectedFileId && isDetailLoading && (
            <LoadingState message="加载文件详情..." />
          )}

          {selectedFileId && detailError && (
            <ErrorState message="加载文件详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedFileId && detail && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">主键ID</dt>
                <dd className="font-mono">{String(detail.id)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">文件ID</dt>
                <dd className="font-mono text-xs">{detail.file_id}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">文件名</dt>
                <dd className="font-medium">{detail.file_name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">分类</dt>
                <dd>{detail.file_category || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">文件大小</dt>
                <dd className="font-mono">{String(detail.file_size ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">上传者</dt>
                <dd className="font-mono">{String(detail.uploader_id ?? '-')}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">下载数</dt>
                <dd>{detail.download_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建时间</dt>
                <dd>{formatDateSafe(detail.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">更新时间</dt>
                <dd>{formatDateSafe(detail.updated_at)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canDeleteFile && confirmDeleteFileId.length > 0}
        onOpenChange={(open) => setConfirmDeleteFileId(open ? confirmDeleteFileId : '')}
        title="确认删除文件"
        description={`确定要删除文件 ${confirmDeleteFileId} 吗？该操作将执行软删除。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(confirmDeleteFileId)}
      />
    </div>
  )
}
