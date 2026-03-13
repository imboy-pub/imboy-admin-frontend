import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, UserX, UserCheck, Loader2, Smartphone, Users, MessageSquare, Tags, Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge } from '@/components/shared'
import { getUserDetailPayload, banUser, unbanUser } from '@/services/api/users'
import { formatDate } from '@/lib/utils'

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uid = id ?? ''

  // 获取用户详情
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user', uid],
    queryFn: () => getUserDetailPayload(uid),
    enabled: uid.length > 0,
  })

  // 封禁用户
  const banMutation = useMutation({
    mutationFn: banUser,
    onSuccess: () => {
      toast.success('用户已封禁')
      queryClient.invalidateQueries({ queryKey: ['user', uid] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => {
      toast.error(`封禁失败: ${error.message}`)
    },
  })

  // 解封用户
  const unbanMutation = useMutation({
    mutationFn: unbanUser,
    onSuccess: () => {
      toast.success('用户已解封')
      queryClient.invalidateQueries({ queryKey: ['user', uid] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => {
      toast.error(`解封失败: ${error.message}`)
    },
  })

  if (isLoading) {
    return <LoadingState message="加载用户详情..." />
  }

  const user = data

  if (error || !user) {
    return <ErrorState message="加载用户详情失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户详情"
        description={`查看用户 ${user.nickname || user.account} 的详细信息`}
        actions={
          <Button variant="outline" onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
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
                <dt className="text-sm text-muted-foreground">用户 ID</dt>
                <dd className="font-mono">{user.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">账号</dt>
                <dd className="font-medium">{user.account}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">昵称</dt>
                <dd>{user.nickname || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">邮箱</dt>
                <dd>{user.email || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">手机</dt>
                <dd>{user.mobile || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">性别</dt>
                <dd>
                  {user.gender === 1 ? '男' : user.gender === 2 ? '女' : '未知'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">地区</dt>
                <dd>{user.region || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">签名</dt>
                <dd>{user.sign || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">状态</dt>
                <dd>
                  <StatusBadge
                    status={user.status}
                    labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                    variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">注册时间</dt>
                <dd>{formatDate(user.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 统计信息 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>统计信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span>设备数</span>
                </div>
                <span className="font-bold">{user.device_count || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>好友数</span>
                </div>
                <span className="font-bold">{user.friend_count || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span>群组数</span>
                </div>
                <span className="font-bold">{user.group_count || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* 操作 */}
          <Card>
            <CardHeader>
              <CardTitle>操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/users/${uid}/tags`)}
              >
                <Tags className="h-4 w-4 mr-2" />
                用户标签治理
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/users/${uid}/collects`)}
              >
                <Bookmark className="h-4 w-4 mr-2" />
                用户收藏治理
              </Button>
              {user.status === 1 ? (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => banMutation.mutate(uid)}
                  disabled={banMutation.isPending}
                >
                  {banMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserX className="h-4 w-4 mr-2" />
                  )}
                  封禁用户
                </Button>
              ) : user.status === 0 ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => unbanMutation.mutate(uid)}
                  disabled={unbanMutation.isPending}
                >
                  {unbanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4 mr-2" />
                  )}
                  解封用户
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
