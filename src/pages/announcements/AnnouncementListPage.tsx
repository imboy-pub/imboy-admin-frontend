import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Megaphone, Eye, EyeOff, Trash2, Pin, Edit, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState, ConfirmDialog, DataTablePagination, EmptyState } from '@/components/shared'
import {
  getAnnouncementList,
  deleteAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  type Announcement,
} from '@/services/api/announcements'
import { exportCsv } from '@/lib/csvExport'
import { AnnouncementFormDialog } from './AnnouncementFormDialog'
import { getErrorMessage } from '@/lib/errorUtils'
import { useListQueryState } from '@/hooks/useListQueryState'

const STATUS_MAP: Record<number, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [-1]: { label: '已删除', variant: 'destructive' },
  0: { label: '草稿', variant: 'secondary' },
  1: { label: '已发布', variant: 'default' },
  2: { label: '已撤回', variant: 'outline' },
}

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  info: { label: '通知', color: 'bg-blue-100 text-blue-700' },
  warning: { label: '警告', color: 'bg-amber-100 text-amber-700' },
  important: { label: '重要', color: 'bg-red-100 text-red-700' },
}

type AnnouncementListQuery = {
  page: number
  size: number
  keyword: string
}

export function AnnouncementListPage() {
  const queryClient = useQueryClient()

  const { state: params, setState: setParams } = useListQueryState<AnnouncementListQuery>({
    page: 1,
    size: 10,
    keyword: '',
  })
  const [localKeyword, setLocalKeyword] = useState(params.keyword || '')

  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Announcement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
  // 发布/撤回影响全体用户，属对外可见操作，提交前二次确认
  const [publishTarget, setPublishTarget] = useState<{
    item: Announcement
    action: 'publish' | 'unpublish'
  } | null>(null)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['announcements', params.page, params.size, params.keyword],
    queryFn: () => getAnnouncementList({ page: params.page, size: params.size, keyword: params.keyword || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      toast.success('公告已删除')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: unknown) => toast.error(`删除失败: ${getErrorMessage(err)}`),
  })

  const publishMutation = useMutation({
    mutationFn: publishAnnouncement,
    onSuccess: () => {
      toast.success('公告已发布')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: unknown) => toast.error(`发布失败: ${getErrorMessage(err)}`),
  })

  const unpublishMutation = useMutation({
    mutationFn: unpublishAnnouncement,
    onSuccess: () => {
      toast.success('公告已撤回')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: unknown) => toast.error(`撤回失败: ${getErrorMessage(err)}`),
  })

  const handleSearch = useCallback(() => {
    setParams({ keyword: localKeyword, page: 1 })
  }, [localKeyword, setParams])

  const handleFormSuccess = useCallback(() => {
    setShowForm(false)
    setEditingItem(null)
    queryClient.invalidateQueries({ queryKey: ['announcements'] })
  }, [queryClient])

  const items: Announcement[] = data?.items ?? []

  const handleExportCsv = useCallback(() => {
    const currentItems: Announcement[] = data?.items ?? []
    const columns = [
      { header: 'ID', accessor: (row: Announcement) => String(row.id) },
      { header: '标题', accessor: (row: Announcement) => row.title },
      { header: '类型', accessor: (row: Announcement) => TYPE_MAP[row.type]?.label || row.type },
      { header: '状态', accessor: (row: Announcement) => STATUS_MAP[row.status]?.label || String(row.status) },
      { header: '置顶', accessor: (row: Announcement) => row.pinned === 1 ? '是' : '否' },
      { header: '创建时间', accessor: (row: Announcement) => row.created_at || '-' },
    ]
    exportCsv(columns, currentItems, 'announcements_export')
    toast.success(`已导出 ${currentItems.length} 条公告数据`)
  }, [data])

  if (isLoading) return <LoadingState message="加载公告列表..." />
  if (error) return <ErrorState message="加载公告列表失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="全局公告"
        description="管理系统全局公告，支持创建、发布、撤回和置顶操作"
      />

      {/* 搜索与操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={localKeyword}
              onChange={(e) => setLocalKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索公告标题"
              className="h-9 w-64 rounded-md border pl-8 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>搜索</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={items.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            导出 CSV
          </Button>
        </div>
        <Button onClick={() => { setEditingItem(null); setShowForm(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          创建公告
        </Button>
      </div>

      {/* 公告列表 */}
      {items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-12 w-12 text-muted-foreground opacity-30" />}
          title="暂无公告"
          description="还没有创建任何全局公告"
          action={{ label: '创建公告', onClick: () => { setEditingItem(null); setShowForm(true) } }}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusInfo = STATUS_MAP[item.status] ?? STATUS_MAP[0]
            const typeInfo = TYPE_MAP[item.type] ?? TYPE_MAP.info
            return (
              <Card key={item.id} className={item.pinned === 1 ? 'border-amber-200 bg-amber-50/30' : ''}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.pinned === 1 && <Pin className="h-4 w-4 text-amber-500 shrink-0" />}
                      <span className="font-medium truncate">{item.title}</span>
                      <Badge variant={statusInfo.variant} className="text-xs shrink-0">{statusInfo.label}</Badge>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeInfo.color}`}>{typeInfo.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      创建于 {item.created_at}
                      {item.published_at && ` | 发布于 ${item.published_at}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(item.status === 0 || item.status === 2) && (
                      <Button variant="ghost" size="sm" onClick={() => { setEditingItem(item); setShowForm(true) }}>
                        <Edit className="mr-1 h-3.5 w-3.5" />编辑
                      </Button>
                    )}
                    {item.status === 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setPublishTarget({ item, action: 'publish' })} disabled={publishMutation.isPending}>
                        <Eye className="mr-1 h-3.5 w-3.5" />发布
                      </Button>
                    )}
                    {item.status === 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setPublishTarget({ item, action: 'unpublish' })} disabled={unpublishMutation.isPending}>
                        <EyeOff className="mr-1 h-3.5 w-3.5" />撤回
                      </Button>
                    )}
                    {item.status === 2 && (
                      <Button variant="ghost" size="sm" onClick={() => setPublishTarget({ item, action: 'publish' })} disabled={publishMutation.isPending}>
                        <Eye className="mr-1 h-3.5 w-3.5" />重新发布
                      </Button>
                    )}
                    {item.status !== -1 && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 分页 */}
      <DataTablePagination
        page={params.page}
        pageSize={params.size}
        total={data?.total ?? 0}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => void refetch()}
      />

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="确认删除公告"
        description={`确定要删除公告「${deleteTarget?.title ?? ''}」吗？此操作不可恢复。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />

      {/* 发布/撤回确认对话框（影响全体用户） */}
      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={(open) => { if (!open) setPublishTarget(null) }}
        title={publishTarget?.action === 'unpublish' ? '确认撤回公告' : '确认发布公告'}
        description={
          publishTarget
            ? `公告「${publishTarget.item.title}」将${
                publishTarget.action === 'unpublish' ? '对全体用户撤回（不再展示）' : '对全体用户发布并展示'
              }，确认继续？`
            : ''
        }
        confirmText={publishTarget?.action === 'unpublish' ? '撤回' : '发布'}
        loading={publishMutation.isPending || unpublishMutation.isPending}
        onConfirm={() => {
          if (!publishTarget) return
          if (publishTarget.action === 'unpublish') {
            unpublishMutation.mutate(publishTarget.item.id)
          } else {
            publishMutation.mutate(publishTarget.item.id)
          }
          setPublishTarget(null)
        }}
      />

      {/* 创建/编辑对话框：条件挂载，关闭即卸载，每次打开按当前 item 重新初始化表单，
          避免「编辑→创建」或切换不同公告时残留上一次的值 */}
      {showForm && (
        <AnnouncementFormDialog
          item={editingItem}
          open={showForm}
          onOpenChange={(open) => {
            if (!open) { setShowForm(false); setEditingItem(null) }
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}
