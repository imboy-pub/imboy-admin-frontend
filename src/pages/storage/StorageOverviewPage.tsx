import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HardDrive, Image, FileVideo, FileText, File, Upload, RefreshCw, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, LoadingState, StatsCard, DataTablePagination, StatusBadge } from '@/components/shared'
import { getStorageStats, getStorageList, formatFileSize, type StorageItem } from '@/services/api/storage'
import { formatDate } from '@/lib/utils'

function mimeGroup(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('sheet')) return 'document'
  return 'other'
}

export function StorageOverviewPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [mimeFilter, setMimeFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

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

  const refetchAll = () => {
    refetchStats()
    refetchList()
  }

  if (statsLoading && !stats) return <LoadingState message="加载存储统计..." />

  return (
    <div className="space-y-6">
      <PageHeader
        title="存储管理"
        description="管理系统中用户上传的文件和附件资源"
        actions={
          <Button variant="outline" size="sm" onClick={refetchAll}>
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

      {/* 概览指标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="总文件数"
          value={stats?.total_files ?? 0}
          description={`今日上传 ${stats?.today_uploads ?? 0}`}
          icon={HardDrive}
        />
        <StatsCard
          title="总存储量"
          value={formatFileSize(stats?.total_size ?? 0)}
          description={`今日 ${formatFileSize(stats?.today_size ?? 0)}`}
          icon={HardDrive}
        />
        <StatsCard
          title="图片"
          value={stats?.image_count ?? 0}
          description="图片文件"
          icon={Image}
        />
        <StatsCard
          title="视频"
          value={stats?.video_count ?? 0}
          description="视频文件"
          icon={FileVideo}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="文档"
          value={stats?.document_count ?? 0}
          description="文档文件"
          icon={FileText}
        />
        <StatsCard
          title="其他"
          value={stats?.other_count ?? 0}
          description="其他文件"
          icon={File}
        />
        <StatsCard
          title="今日上传"
          value={stats?.today_uploads ?? 0}
          description={`共 ${formatFileSize(stats?.today_size ?? 0)}`}
          icon={Upload}
        />
      </div>

      {/* 文件类型分布 */}
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
          {/* 筛选栏 */}
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

          {/* 文件表格 */}
          {listLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              加载中...
            </div>
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
                          <td className="py-3 text-right font-mono text-xs">
                            {formatFileSize(item.size)}
                          </td>
                          <td className="py-3 text-xs text-muted-foreground">
                            {formatDate(item.created_at)}
                          </td>
                          <td className="py-3">
                            <StatusBadge
                              status={item.status}
                              labels={{ 1: '正常', 0: '已删除' }}
                              variants={{ 1: 'success', 0: 'error' }}
                            />
                          </td>
                          <td className="py-3 text-right">
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs text-primary hover:underline"
                              >
                                <Download className="mr-1 h-3 w-3" />
                                下载
                              </a>
                            )}
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
                onPageSizeChange={(_size) => {
                  setPage(1)
                }}
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
    </div>
  )
}
