import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  deleteGroupAlbum,
  getGroupAlbumDetailPayload,
  getGroupAlbumsPayload,
  GroupAlbum,
} from '@/services/api/groupEnhancements'
import { formatDate } from '@/lib/utils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

function formatDateSafe(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

export function GroupAlbumManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState('')
  const { allowed: canDeleteAlbum } = useAdminPermission({
    permission: 'groups:album:delete',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-albums', gid, page, size],
    queryFn: () => getGroupAlbumsPayload(gid, { page, size }),
    enabled: gid.length > 0,
  })

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-album-detail', selectedAlbumId],
    queryFn: () => getGroupAlbumDetailPayload(selectedAlbumId),
    enabled: selectedAlbumId.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupAlbum,
    onSuccess: async () => {
      toast.success('相册已删除')
      const deletedId = confirmDeleteAlbumId
      setConfirmDeleteAlbumId('')
      if (deletedId && selectedAlbumId === deletedId) {
        setSelectedAlbumId('')
      }
      await queryClient.invalidateQueries({ queryKey: ['group-albums', gid] })
    },
    onError: (err: Error) => {
      toast.error(`删除相册失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupAlbum>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id)}</span>,
      },
      {
        accessorKey: 'album_id',
        header: '相册ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.album_id}</span>,
      },
      {
        accessorKey: 'album_name',
        header: '相册名',
        cell: ({ row }) => <span className="font-medium">{row.original.album_name || '-'}</span>,
      },
      {
        accessorKey: 'photo_count',
        header: '图片数',
        cell: ({ row }) => <span>{row.original.photo_count ?? 0}</span>,
      },
      {
        accessorKey: 'creator_id',
        header: '创建者',
        cell: ({ row }) => <span className="font-mono">{String(row.original.creator_id ?? '-')}</span>,
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
              onClick={() => setSelectedAlbumId(String(row.original.id))}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canDeleteAlbum && (
              <Button
                variant="ghost"
                size="icon"
                title="删除相册"
                onClick={() => setConfirmDeleteAlbumId(String(row.original.id))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteAlbum]
  )

  const albums = data?.items || []
  const table = useReactTable({
    data: albums,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群相册数据..." />
  }

  if (error) {
    return <ErrorState message="加载群相册数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群相册管理"
        description={`群组 ${gid} 的相册列表与治理操作`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>相册列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedAlbumId(String(row.id))}
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
          <CardTitle>相册详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedAlbumId && (
            <p className="text-sm text-muted-foreground">点击列表行可查看相册详情</p>
          )}

          {selectedAlbumId && isDetailLoading && (
            <LoadingState message="加载相册详情..." />
          )}

          {selectedAlbumId && detailError && (
            <ErrorState message="加载相册详情失败" onRetry={() => refetchDetail()} />
          )}

          {selectedAlbumId && detail && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">主键ID</dt>
                <dd className="font-mono">{String(detail.id)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">相册ID</dt>
                <dd className="font-mono text-xs">{detail.album_id}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">相册名</dt>
                <dd className="font-medium">{detail.album_name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建者</dt>
                <dd className="font-mono">{String(detail.creator_id ?? '-')}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">图片数</dt>
                <dd>{detail.photo_count ?? 0}</dd>
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
        open={canDeleteAlbum && confirmDeleteAlbumId.length > 0}
        onOpenChange={(open) => setConfirmDeleteAlbumId(open ? confirmDeleteAlbumId : '')}
        title="确认删除相册"
        description={`确定要删除相册 ${confirmDeleteAlbumId} 吗？该操作将执行软删除。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(confirmDeleteAlbumId)}
      />
    </div>
  )
}
