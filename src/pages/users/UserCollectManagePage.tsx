import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Bookmark, Search, Trash2 } from 'lucide-react'
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
  getUserCollectListPayload,
  removeUserCollect,
  UserCollectItem,
  UserCollectListParams,
} from '@/modules/social_graph/api'
import { formatDate } from '@/lib/utils'

const COLLECT_KIND_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 1, label: '消息' },
  { value: 2, label: '好友/用户' },
  { value: 3, label: '群组' },
  { value: 4, label: '文件' },
  { value: 5, label: '链接' },
  { value: 6, label: '动态' },
] as const

function formatDateSafe(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

function toKindLabel(kind: number): string {
  const matched = COLLECT_KIND_OPTIONS.find((item) => item.value === kind)
  return matched ? `${matched.label}(${kind})` : `未知(${kind})`
}

function buildInfoPreview(info?: Record<string, unknown>): string {
  if (!info || typeof info !== 'object') return '-'
  const raw = JSON.stringify(info)
  if (raw.length <= 80) return raw
  return `${raw.slice(0, 80)}...`
}

export function UserCollectManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uid = id ?? ''

  const [params, setParams] = useState<UserCollectListParams>({
    uid,
    page: 1,
    size: 10,
    kind: 0,
    keyword: undefined,
    tag: undefined,
    order: 'recent_use',
  })
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchTag, setSearchTag] = useState('')
  const [confirmRemoveKindId, setConfirmRemoveKindId] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-collects', params],
    queryFn: () => getUserCollectListPayload(params),
    enabled: uid.length > 0,
  })

  const removeMutation = useMutation({
    mutationFn: removeUserCollect,
    onSuccess: async () => {
      toast.success('收藏项已移除')
      setConfirmRemoveKindId('')
      await queryClient.invalidateQueries({ queryKey: ['user-collects', uid] })
    },
    onError: (err: Error) => {
      toast.error(`移除收藏失败: ${err.message}`)
    },
  })

  const handleSearch = () => {
    const keyword = searchKeyword.trim()
    const tag = searchTag.trim()
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: keyword.length > 0 ? keyword : undefined,
      tag: tag.length > 0 ? tag : undefined,
    }))
  }

  const handleKindChange = (kind: number) => {
    setParams((prev) => ({
      ...prev,
      kind,
      page: 1,
    }))
  }

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const columns: ColumnDef<UserCollectItem>[] = useMemo(
    () => [
      {
        accessorKey: 'kind',
        header: '类型',
        cell: ({ row }) => toKindLabel(row.original.kind),
      },
      {
        accessorKey: 'kind_id',
        header: '对象ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.kind_id}</span>,
      },
      {
        accessorKey: 'source',
        header: '来源',
        cell: ({ row }) => (
          <span className="block max-w-[260px] truncate text-muted-foreground" title={row.original.source || ''}>
            {row.original.source || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'tag',
        header: '标签串',
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.tag || '-'}</span>,
      },
      {
        accessorKey: 'info',
        header: '扩展信息',
        cell: ({ row }) => (
          <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={JSON.stringify(row.original.info ?? {})}>
            {buildInfoPreview(row.original.info)}
          </span>
        ),
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
            title="移除收藏"
            onClick={() => setConfirmRemoveKindId(row.original.kind_id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ),
      },
    ],
    []
  )

  const collects = data?.items || []
  const table = useReactTable({
    data: collects,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载用户收藏数据..." />
  }

  if (error) {
    return <ErrorState message="加载用户收藏数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户收藏治理"
        description={`用户 ${uid} 的收藏列表、筛选与移除治理`}
        actions={(
          <Button variant="outline" onClick={() => navigate(`/users/${uid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回用户详情
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Bookmark className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">收藏类型</span>
              <select
                value={String(params.kind ?? 0)}
                onChange={(event) => handleKindChange(Number(event.target.value))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {COLLECT_KIND_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-end xl:w-auto">
              <div className="relative w-full lg:w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索 source/remark/info..."
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Input
                placeholder="标签筛选（可选）"
                value={searchTag}
                onChange={(event) => setSearchTag(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                className="w-full lg:w-[220px]"
              />
              <Button onClick={handleSearch}>搜索</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="mb-4 text-base">
            收藏列表（共 {data?.total ?? collects.length} 项）
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
        open={confirmRemoveKindId.length > 0}
        onOpenChange={(open) => setConfirmRemoveKindId(open ? confirmRemoveKindId : '')}
        title="确认移除收藏"
        description={`确定要移除收藏对象 ${confirmRemoveKindId} 吗？`}
        confirmText="移除"
        variant="destructive"
        loading={removeMutation.isPending}
        onConfirm={() =>
          removeMutation.mutate({
            uid,
            kind_id: confirmRemoveKindId,
          })
        }
      />
    </div>
  )
}
