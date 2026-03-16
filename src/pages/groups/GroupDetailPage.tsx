import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileSearch, Trash2, Users, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, ConfirmDialog } from '@/components/shared'
import { getGroupDetailPayload, dissolveGroup } from '@/modules/groups/api'
import { formatDate } from '@/lib/utils'
import { useState } from 'react'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { isAdminFeatureEnabled } from '@/services/api/features'

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''
  const [showConfirm, setShowConfirm] = useState(false)
  const { data: featureFlags } = useAdminFeatures()

  // 获取群组详情
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group', gid],
    queryFn: () => getGroupDetailPayload(gid),
    enabled: gid.length > 0,
  })

  // 解散群组
  const dissolveMutation = useMutation({
    mutationFn: dissolveGroup,
    onSuccess: () => {
      toast.success('群组已解散')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate('/groups')
    },
    onError: (error: Error) => {
      toast.error(`解散失败: ${error.message}`)
    },
  })

  if (isLoading) {
    return <LoadingState message="加载群组详情..." />
  }

  const group = data

  if (error || !group) {
    return <ErrorState message="加载群组详情失败" onRetry={() => refetch()} />
  }

  const voteEnabled = isAdminFeatureEnabled(featureFlags, 'group_vote')
  const scheduleEnabled = isAdminFeatureEnabled(featureFlags, 'group_schedule')
  const taskEnabled = isAdminFeatureEnabled(featureFlags, 'group_task')

  return (
    <div className="space-y-6">
      <PageHeader
        title="群组详情"
        description={`查看群组「${group.title}」的详细信息`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/groups')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回列表
            </Button>
            {voteEnabled && (
              <Button
                variant="outline"
                onClick={() => navigate(`/groups/${gid}/votes`)}
              >
                投票管理
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/notices`)}
            >
              公告管理
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/tags`)}
            >
              标签管理
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/categories`)}
            >
              分组分类管理
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/files`)}
            >
              文件管理
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/albums`)}
            >
              相册管理
            </Button>
            {scheduleEnabled && (
              <Button
                variant="outline"
                onClick={() => navigate(`/groups/${gid}/schedules`)}
              >
                日程管理
              </Button>
            )}
            {taskEnabled && (
              <Button
                variant="outline"
                onClick={() => navigate(`/groups/${gid}/tasks`)}
              >
                任务管理
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate(`/groups/${gid}/governance-logs`)}
            >
              <FileSearch className="h-4 w-4 mr-2" />
              治理日志
            </Button>
            {group.status === 1 && (
              <Button
                variant="destructive"
                onClick={() => setShowConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                解散群组
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* 基本信息 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">群组 ID</dt>
                <dd className="font-mono">{group.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">群名称</dt>
                <dd className="font-medium">{group.title}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">群主 ID</dt>
                <dd className="font-mono">{group.owner_uid}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">群简介</dt>
                <dd>{group.introduction || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">群类型</dt>
                <dd>
                  <StatusBadge
                    status={group.type}
                    labels={{ 1: '普通群', 2: '私有群' }}
                    variants={{ 1: 'info', 2: 'warning' }}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">状态</dt>
                <dd>
                  <StatusBadge
                    status={group.status}
                    labels={{ 1: '正常', 0: '已解散' }}
                    variants={{ 1: 'success', 0: 'error' }}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">创建时间</dt>
                <dd>{formatDate(group.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 统计信息 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                成员统计
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">当前成员</span>
                <span className="text-2xl font-bold">{group.member_count || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">最大成员数</span>
                <span className="font-mono">{group.member_max || 500}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `${Math.min(
                      ((group.member_count || 0) / (group.member_max || 500)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                群组设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">加群限制</span>
                <span>{group.join_limit === 1 ? '需要审核' : '自由加入'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="确认解散群组"
        description={`确定要解散群组「${group.title}」吗？此操作将移除所有成员并删除群组数据，不可恢复。`}
        confirmText="解散"
        variant="destructive"
        loading={dissolveMutation.isPending}
        onConfirm={() => dissolveMutation.mutate(gid)}
      />
    </div>
  )
}
