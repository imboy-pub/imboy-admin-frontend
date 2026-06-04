import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HardDrive, Image, FileVideo, FileText, File, Upload, RefreshCw, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, LoadingState, StatsCard, DataTablePagination, StatusBadge, ConfirmDialog } from '@/components/shared'
import {
  getStorageStats, getStorageList, formatFileSize, type StorageItem,
  disableAttachment, enableAttachment, deleteAttachment,
  getOrphanStats, cleanupOrphans,
} from '@/services/api/storage'
import { formatDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'

function mimeGroup(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('sheet')) return 'document'
  return 'other'
}

export function StorageOverviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [mimeFilter, setMimeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [ageDays, setAgeDays] = useState(30)
  const [orphanQueryEnabled, setOrphanQueryEnabled] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: 'disable' | 'enable' | 'delete'; id: string } | null>(null)

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['storage', 'stats'],
    queryFn: () => getStorageStats(),
  })

  const { data: listData, isLoading: listLoading, refetch: refetchList, dataUpdatedAt: listDataUpdatedAt } = useQuery({
    queryKey: ['storage', 'list', { page, pageSize, mimeFilter, keyword }],
    queryFn: () => getStorageList({
      page,
      size: pageSize,
      mime_type: mimeFilter || undefined,
      keyword: keyword.trim() || undefined,
    }),
  })

  const { data: orphanData, isLoading: orphanLoading, refetch: refetchOrphan } = useQuery({
    queryKey: ['storage', 'orphan', ageDays],
    queryFn: () => getOrphanStats(ageDays),
    enabled: orphanQueryEnabled,
  })

  const invalidateStorage = () => {
    void queryClient.invalidateQueries({ queryKey: ['storage'] })
  }

  const disableMutation = useMutation({
    mutationFn: (id: string) => disableAttachment(id),
    onSuccess: () => { toast.success('已禁用'); invalidateStorage() },
    onError: (err: unknown) => { toast.error(`禁用失败: ${getErrorMessage(err)}`) },
  })

  const enableMutation = useMutation({
    mutationFn: (id: string) => enableAttachment(id),
    onSuccess: () => { toast.success('已启用'); invalidateStorage() },
    onError: (err: unknown) => { toast.error(`启用失败: ${getErrorMessage(err)}`) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => { toast.success('已软删除'); invalidateStorage() },
    onError: (err: unknown) => { toast.error(`删除失败: ${getErrorMessage(err)}`) },
  })

  const cleanupMutation = useMutation({
    mutationFn: () => cleanupOrphans(ageDays),
    onSuccess: (result) => {
      const msg = result.errors > 0
        ? `已物理删除 ${result.cleaned} 个，${result.errors} 个 S3 操作失败`
        : `已物理删除 ${result.cleaned} 个文件`
      toast.success(msg)
      setOrphanQueryEnabled(false)
      invalidateStorage()
    },
    onError: (err: unknown) => { toast.error(`清理失败: ${getErrorMessage(err)}`) },
  })

  const handleActionConfirm = () => {
    if (!pendingAction) return
    const { type, id } = pendingAction
    if (type === 'disable') disableMutation.mutate(id)
    else if (type === 'enable') enableMutation.mutate(id)
    else if (type === 'delete') deleteMutation.mutate(id)
    setPendingAction(null)
  }

  const actionLoading = disableMutation.isPending || enableMutation.isPending || deleteMutation.isPending

  if (statsLoading && !stats) return <LoadingState message="加载存储统计..." />

  return (
    <div className="space-y-6">
      <PageHeader
        title="存储管理"
        description="管理系统中用户上传的文件和附件资源"
        actions={
          <Button variant="outline" size="sm" onClick={() => { refetchStats(); refetchList() }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/settings')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回设置
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="总文件数" value={stats?.total_files ?? 0} description={`今日上传 ${stats?.today_uploads ?? 0}`} icon={HardDrive} />
        <StatsCard title="总存储量" value={formatFileSize(stats?.total_size ?? 0)} description={`今日 ${formatFileSize(stats?.today_size ?? 0)}`} icon={HardDrive} />
        <StatsCard title="图片" value={stats?.image_count ?? 0} description="图片文件" icon={Image} />
        <StatsCard title="视频" value={stats?.video_count ?? 0} description="视频文件" icon={FileVideo} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard title="文档" value={stats?.document_count ?? 0} description="文档文件" icon={FileText} />
        <StatsCard title="其他" value={stats?.other_count ?? 0} description="其他文件" icon={File} />
        <StatsCard title="今日上传" value={stats?.today_uploads ?? 0} description={`共 ${formatFileSize(stats?.today_size ?? 0)}`} icon={Upload} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>文件类型分布</CardTitle>
          <CardDescription>各类型文件占比</CardDescription>
        </CardHeader>
        <CardContent>
          {stats && stats.total_files > 0 ? (
            <div className="space-y-3">
              {[
                { label: '图片', count: stats.image_count, color: 'bg-blue-500' },
                { label: '视频', count: stats.video_count, color: 'bg-purple-500' },
                { label: '文档', count: stats.document_count, color: 'bg-green-500' },
                { label: '其他', count: stats.other_count, color: 'bg-gray-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-12 text-sm font-medium">{item.label}</span>
                  <div className="flex-1">
                    <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-500`}
                        style={{ width: `${Math.max(2, (item.count / stats.total_files) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-20 text-right text-sm text-muted-foreground">
                    {item.count} ({Math.round((item.count / stats.total_files) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">暂无文件数据</p>
          )}
        </CardContent>
      </Card>

      {/* 文件浏览列表 */}
      <Card>
        <CardHeader>
          <CardTitle>文件浏览</CardTitle>
          <CardDescription>浏览和管理系统中的文件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="搜索文件名或路径..."
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              className="max-w-xs"
            />
            <select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={mimeFilter}
              onChange={(e) => { setMimeFilter(e.target.value); setPage(1) }}
            >
              <option value="">全部类型</option>
              <option value="image/">图片</option>
              <option value="video/">视频</option>
              <option value="application/pdf">PDF</option>
            </select>
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">加载中...</div>
          ) : listData && listData.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 text-left font-medium text-muted-foreground">文件</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">类型</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">大小</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">上传时间</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">状态</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.items.map((item: StorageItem) => {
                      const group = mimeGroup(item.mime_type)
                      return (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {group === 'image' ? (
                                <Image className="h-4 w-4 text-blue-500 shrink-0" />
                              ) : group === 'video' ? (
                                <FileVideo className="h-4 w-4 text-purple-500 shrink-0" />
                              ) : group === 'document' ? (
                                <FileText className="h-4 w-4 text-green-500 shrink-0" />
                              ) : (
                                <File className="h-4 w-4 text-gray-500 shrink-0" />
                              )}
                              <span className="truncate max-w-48 font-mono text-xs" title={item.path}>
                                {item.path.split('/').pop() || item.path}
                              </span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="text-xs text-muted-foreground">{item.mime_type}</span>
                          </td>
                          <td className="py-3 text-right font-mono text-xs">{formatFileSize(item.size)}</td>
                          <td className="py-3 text-xs text-muted-foreground">{formatDate(item.created_at)}</td>
                          <td className="py-3">
                            <StatusBadge
                              status={item.status}
                              labels={{ 1: '正常', 0: '已禁用', [-1]: '已删除' }}
                              variants={{ 1: 'success', 0: 'warning', [-1]: 'error' }}
                            />
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-xs text-primary hover:underline px-1"
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  下载
                                </a>
                              )}
                              {item.status === 1 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={actionLoading}
                                  onClick={() => setPendingAction({ type: 'disable', id: item.id })}
                                >
                                  禁用
                                </Button>
                              )}
                              {item.status === 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={actionLoading}
                                  onClick={() => setPendingAction({ type: 'enable', id: item.id })}
                                >
                                  启用
                                </Button>
                              )}
                              {item.status !== -1 && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={actionLoading}
                                  onClick={() => setPendingAction({ type: 'delete', id: item.id })}
                                >
                                  删
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <DataTablePagination
                page={listData.page}
                pageSize={listData.size}
                total={listData.total}
                onPageChange={setPage}
                onPageSizeChange={(newSize) => { setPageSize(newSize); setPage(1) }}
                dataUpdatedAt={listDataUpdatedAt}
                onRefresh={() => refetchList()}
              />
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {keyword || mimeFilter ? '没有匹配的文件' : '暂无文件数据'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 孤儿附件清理面板 */}
      <Card>
        <CardHeader>
          <CardTitle>孤儿附件清理</CardTitle>
          <CardDescription>清理引用计数为零且超过指定时限的孤儿文件（先删 S3，再删数据库）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">清理超过</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={ageDays}
              onChange={(e) => { setAgeDays(Number(e.target.value)); setOrphanQueryEnabled(false) }}
            >
              <option value={7}>7 天</option>
              <option value={30}>30 天</option>
              <option value={60}>60 天</option>
              <option value={90}>90 天</option>
            </select>
            <span className="text-sm text-muted-foreground">的孤儿文件</span>
            <Button
              variant="outline"
              size="sm"
              disabled={orphanLoading}
              onClick={() => { setOrphanQueryEnabled(true); void refetchOrphan() }}
            >
              {orphanLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              预览
            </Button>
          </div>

          {orphanQueryEnabled && orphanData && (
            <div className="rounded-md border border-muted bg-muted/30 p-4 space-y-3">
              <p className="text-sm">
                发现 <span className="font-bold text-foreground">{orphanData.count}</span> 个孤儿文件，
                占用 <span className="font-bold text-foreground">{formatFileSize(orphanData.total_size)}</span>
              </p>
              {orphanData.count > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={cleanupMutation.isPending}
                >
                  {cleanupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  一键物理删除 ⚠
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 单条操作确认弹窗 */}
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null) }}
        title={
          pendingAction?.type === 'disable' ? '确认禁用'
          : pendingAction?.type === 'enable' ? '确认启用'
          : '确认删除'
        }
        description={
          pendingAction?.type === 'delete'
            ? '将软删除此附件（数据库标记 status=-1），文件在 S3 中暂时保留，可通过孤儿清理彻底删除。'
            : undefined
        }
        confirmText={pendingAction?.type === 'delete' ? '删除' : pendingAction?.type === 'disable' ? '禁用' : '启用'}
        variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
        onConfirm={handleActionConfirm}
        loading={actionLoading}
      />

      {/* 孤儿物理删除确认弹窗 */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="确认物理删除"
        description={`将永久删除 ${orphanData?.count ?? 0} 个孤儿文件（S3 对象 + 数据库行），此操作不可撤销。`}
        confirmText="确认物理删除"
        variant="destructive"
        onConfirm={() => { void cleanupMutation.mutateAsync() }}
        loading={cleanupMutation.isPending}
      />
    </div>
  )
}
