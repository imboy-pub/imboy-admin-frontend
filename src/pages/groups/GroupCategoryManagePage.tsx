import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Trash2 } from 'lucide-react'

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
  deleteGroupCategory,
  getGroupCategoriesPayload,
  GroupCategory,
} from '@/services/api/groupEnhancements'
import { getGroupDetailPayload } from '@/modules/groups/api'
import { useAdminPermission } from '@/hooks/useAdminPermission'

export function GroupCategoryManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [targetUid, setTargetUid] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string>('')
  const [confirmDeleteCategoryName, setConfirmDeleteCategoryName] = useState<string>('')

  const { allowed: canDeleteCategory } = useAdminPermission({
    permission: 'groups:category:delete',
    roles: [1, 2],
  })

  const { data: groupDetail } = useQuery({
    queryKey: ['groups', gid, 'detail'],
    queryFn: () => getGroupDetailPayload(gid),
    enabled: gid.length > 0,
  })

  useEffect(() => {
    if (targetUid.trim()) return
    const ownerId = groupDetail?.owner?.id
    if (ownerId) {
      setTargetUid(String(ownerId))
    }
  }, [groupDetail?.owner?.id, targetUid])

  const uid = targetUid.trim()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-categories', gid, uid, page, size, keyword],
    queryFn: () =>
      getGroupCategoriesPayload({
        gid,
        uid,
        page,
        size,
        keyword: keyword.trim() || undefined,
      }),
    enabled: gid.length > 0 && uid.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupCategory,
    onSuccess: async () => {
      toast.success('分类已删除')
      setConfirmDeleteCategoryId('')
      setConfirmDeleteCategoryName('')
      await queryClient.invalidateQueries({ queryKey: ['group-categories', gid, uid] })
    },
    onError: (err: Error) => {
      toast.error(`删除分类失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupCategory>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: '分类ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id)}</span>,
      },
      {
        accessorKey: 'category_name',
        header: '分类名称',
        cell: ({ row }) => <span className="font-medium">{row.original.category_name || '-'}</span>,
      },
      {
        accessorKey: 'sort_order',
        header: '排序',
        cell: ({ row }) => <span>{row.original.sort_order ?? 0}</span>,
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const categoryId = String(row.original.id)
          const categoryName = row.original.category_name || categoryId
          return (
            <div className="flex items-center gap-1">
              {canDeleteCategory && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="删除分类"
                  onClick={() => {
                    setConfirmDeleteCategoryId(categoryId)
                    setConfirmDeleteCategoryName(categoryName)
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [canDeleteCategory]
  )

  const categories = data?.items || []
  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群分组分类数据..." />
  }

  if (error) {
    return <ErrorState message="加载群分组分类失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群分组分类管理"
        description={`群组 ${gid} 的用户分组分类治理`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>目标用户</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            群分组分类是用户私有数据，请指定需要治理的用户 UID。默认填充群主 UID。
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={targetUid}
              onChange={(event) => {
                setTargetUid(event.target.value)
                setPage(1)
              }}
              placeholder="输入用户 UID"
              className="md:max-w-sm"
            />
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
              placeholder="分类名称关键词（可选）"
              className="md:max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分类列表（UID: {uid || '-'})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {uid.length === 0 ? (
            <p className="text-sm text-muted-foreground">请先输入目标用户 UID。</p>
          ) : (
            <>
              <DataTable table={table} />
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
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canDeleteCategory && confirmDeleteCategoryId.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteCategoryId('')
            setConfirmDeleteCategoryName('')
          }
        }}
        title="确认删除分类"
        description={`确定要删除分类「${confirmDeleteCategoryName}」吗？该用户该分类下的群会迁移到“未分类”。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!uid || !confirmDeleteCategoryId) return
          deleteMutation.mutate({
            gid,
            uid,
            category_id: confirmDeleteCategoryId,
          })
        }}
      />
    </div>
  )
}
