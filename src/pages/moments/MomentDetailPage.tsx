import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Flag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ConfirmDialog, ErrorState, LoadingState, PageHeader, StatusBadge } from '@/components/shared'
import { deleteMoment, getMomentDetailPayload, MomentReport } from '@/modules/moments/api'
import { formatDate } from '@/lib/utils'

const visibilityLabels: Record<number, string> = {
  0: '公开',
  1: '仅好友',
  2: '仅自己',
  3: '部分可见',
  4: '不给谁看',
}

export function MomentDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id = '' } = useParams()

  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['moment-detail', id],
    queryFn: () => getMomentDetailPayload(id),
    enabled: id.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteMoment(id, 'admin_delete_from_detail'),
    onSuccess: () => {
      toast.success('动态已删除')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      queryClient.invalidateQueries({ queryKey: ['moment-reports'] })
      navigate('/moments')
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })

  const reports = useMemo(() => (Array.isArray(data?.reports) ? (data?.reports as MomentReport[]) : []), [data])
  const acl = data?.acl
  const media = Array.isArray(data?.media) ? data?.media : []

  if (isLoading) {
    return <LoadingState message="加载动态详情..." />
  }

  if (error || !data) {
    return <ErrorState message="加载动态详情失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`动态详情 #${data.id}`}
        description="查看动态正文、媒体、ACL 与举报记录"
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/moments/reports')}>
              <Flag className="mr-2 h-4 w-4" />
              举报处理
            </Button>
            <Button variant="outline" onClick={() => navigate('/moments')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回列表
            </Button>
            {data.status === 1 && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                删除动态
              </Button>
            )}
          </div>
        )}
      />

      <Card>
        <CardHeader className="text-sm text-muted-foreground">
          作者 UID: <span className="font-mono">{data.author_uid}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">可见性</div>
              <StatusBadge
                status={data.visibility}
                labels={visibilityLabels}
                variants={{ 0: 'success', 1: 'info', 2: 'warning', 3: 'secondary', 4: 'error' }}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">状态</div>
              <StatusBadge
                status={data.status}
                labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                variants={{ 1: 'success', 0: 'warning', '-1': 'secondary' }}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">点赞数</div>
              <div className="font-medium">{data.stats?.like_count ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">评论数</div>
              <div className="font-medium">{data.stats?.comment_count ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">发布时间</div>
              <div className="font-medium">{formatDate(data.created_at)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">更新时间</div>
              <div className="font-medium">{formatDate(data.updated_at)}</div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">内容</div>
            <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap">
              {data.content || '-'}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">媒体 ({media.length})</div>
            {media.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">无媒体</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {media.map((item, index) => {
                  const url = String((item as Record<string, unknown>).url ?? '')
                  const type = String((item as Record<string, unknown>).type ?? '')
                  return (
                    <div key={`media-${index}`} className="rounded-md border p-2">
                      <div className="mb-1 text-xs text-muted-foreground">{type || 'unknown'}</div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 text-xs break-all text-blue-600 hover:underline"
                      >
                        {url || '-'}
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">ACL allow_uids</div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                {acl?.allow_uids?.length ? acl.allow_uids.join(', ') : '-'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">ACL deny_uids</div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                {acl?.deny_uids?.length ? acl.deny_uids.join(', ') : '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="font-medium">关联举报 ({reports.length})</CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">暂无举报记录</div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <div key={String(report.id)} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">举报ID: {report.id}</span>
                    <StatusBadge
                      status={report.status}
                      labels={{ 0: '待处理', 1: '已驳回', 2: '违规确认' }}
                      variants={{ 0: 'warning', 1: 'secondary', 2: 'error' }}
                    />
                  </div>
                  <div className="text-sm">举报人 UID: {report.reporter_uid}</div>
                  <div className="text-sm">原因: {report.reason || '-'}</div>
                  <div className="text-sm text-muted-foreground">描述: {report.description || '-'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">时间: {formatDate(report.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="确认删除动态"
        description="删除后动态将从用户时间线移除且不可恢复。"
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
