import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Search, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
  deleteUserTag,
  getUserTagListPayload,
  UserTagItem,
  UserTagListParams,
} from '@/modules/social_graph/api'
import { formatDate } from '@/lib/utils'

const SCENE_OPTIONS = [
  { value: 'friend', label: '好友标签' },
  { value: 'collect', label: '收藏标签' },
] as const

function formatDateSafe(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

function toSceneLabel(scene: number | string): string {
  if (scene === 1 || scene === '1') return '收藏'
  if (scene === 2 || scene === '2') return '好友'
  return '-'
}

export function UserTagManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uid = id ?? ''

  const [params, setParams] = useState<UserTagListParams>({
    uid,
    scene: 'friend',
    page: 1,
    size: 10,
    keyword: undefined,
  })
  const [searchKeyword, setSearchKeyword] = useState('')
  const [confirmDeleteTagName, setConfirmDeleteTagName] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-tags', params],
    queryFn: () => getUserTagListPayload(params),
    enabled: uid.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUserTag,
    onSuccess: async () => {
      toast.success('标签已删除')
      setConfirmDeleteTagName('')
      await queryClient.invalidateQueries({ queryKey: ['user-tags', uid] })
    },
    onError: (err: Error) => {
      toast.error(`删除标签失败: ${err.message}`)
    },
  })

  const handleSearch = () => {
    const keyword = searchKeyword.trim()
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: keyword.length > 0 ? keyword : undefined,
    }))
  }

  const handleSceneChange = (scene: 'collect' | 'friend') => {
    setParams((prev) => ({
      ...prev,
      scene,
      page: 1,
      keyword: undefined,
    }))
    setSearchKeyword('')
  }

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const columns: ColumnDef<UserTagItem>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id ?? '-')}</span>,
      },
      {
        accessorKey: 'name',
        header: '标签名',
        cell: ({ row }) => <span className="font-medium">{row.original.name || '-'}</span>,
      },
      {
        accessorKey: 'subtitle',
        header: '副标题',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.subtitle || '-'}</span>,
      },
      {
        accessorKey: 'scene',
        header: '场景',
        cell: ({ row }) => toSceneLabel(row.original.scene),
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
        accessorKey: 'updated_at',
        header: '更新时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateSafe(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            title="删除标签"
            onClick={() => setConfirmDeleteTagName(row.original.name)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ),
      },
    ],
    []
  )

  const tags = data?.items || []
  const table = useReactTable({
    data: tags,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载用户标签数据..." />
  }

  if (error) {
    return <ErrorState message="加载用户标签数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户标签治理"
        description={`用户 ${uid} 的标签列表、搜索与删除治理`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/users/${uid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回用户详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {SCENE_OPTIONS.map((scene) => (
                <Button
                  key={scene.value}
                  variant={params.scene === scene.value ? 'default' : 'outline'}
                  onClick={() => handleSceneChange(scene.value)}
                >
                  <Tags className="h-4 w-4 mr-2" />
                  {scene.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="relative w-full lg:w-[280px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索标签名/副标题..."
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch}>搜索</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="mb-4 text-base">
            标签列表（共 {data?.total ?? tags.length} 项）
          </CardTitle>
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

      <ConfirmDialog
        open={confirmDeleteTagName.length > 0}
        onOpenChange={(open) => setConfirmDeleteTagName(open ? confirmDeleteTagName : '')}
        title="确认删除标签"
        description={`确定要删除标签 ${confirmDeleteTagName} 吗？`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate({
            uid,
            scene: params.scene,
            tag: confirmDeleteTagName,
          })
        }
      />
    </div>
  )
}
