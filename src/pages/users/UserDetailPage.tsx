import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, UserX, UserCheck, Loader2, Smartphone, Users, MessageSquare, Tags, Bookmark, Shield, Clock, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge } from '@/components/shared'
import { getUserDetailPayload, banUser, unbanUser } from '@/modules/identity/api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

type DetailTab = 'profile' | 'stats' | 'actions'

function TabButton({ active, onClick, children, icon: Icon }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uid = id ?? ''
  const [activeTab, setActiveTab] = useState<DetailTab>('profile')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user', uid],
    queryFn: () => getUserDetailPayload(uid),
    enabled: uid.length > 0,
  })

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
    return (
      <div className="space-y-6">
        <PageHeader title="用户详情" description="加载中..." />
        <LoadingState message="加载用户详情..." />
      </div>
    )
  }

  const user = data

  if (error || !user) {
    return (
      <div className="space-y-6">
        <PageHeader title="用户详情" description="加载失败" />
        <ErrorState message="加载用户详情失败" onRetry={() => refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.nickname || user.account}
        description={`UID: ${user.id}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/users')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回列表
            </Button>
            {user.status === 1 ? (
              <Button
                variant="destructive"
                onClick={() => banMutation.mutate(uid)}
                disabled={banMutation.isPending}
              >
                {banMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserX className="h-4 w-4 mr-2" />
                )}
                封禁
              </Button>
            ) : user.status === 0 ? (
              <Button
                onClick={() => unbanMutation.mutate(uid)}
                disabled={unbanMutation.isPending}
              >
                {unbanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4 mr-2" />
                )}
                解封
              </Button>
            ) : null}
          </div>
        }
      />

      {/* 状态概览横幅 */}
      <Card>
        <CardContent className="flex items-center gap-6 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold">
            {(user.nickname || user.account).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{user.nickname || user.account}</h2>
              <StatusBadge
                status={user.status}
                labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user.email || user.mobile || `ID: ${user.id}`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <div className="text-center">
              <p className="text-2xl font-bold">{user.device_count || 0}</p>
              <p className="text-muted-foreground">设备</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{user.friend_count || 0}</p>
              <p className="text-muted-foreground">好友</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{user.group_count || 0}</p>
              <p className="text-muted-foreground">群组</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab 导航 */}
      <div className="border-b">
        <div className="flex gap-1">
          <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={Shield}>
            基本信息
          </TabButton>
          <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={Activity}>
            运营统计
          </TabButton>
          <TabButton active={activeTab === 'actions'} onClick={() => setActiveTab('actions')} icon={Clock}>
            关联操作
          </TabButton>
        </div>
      </div>

      {/* Tab 内容 */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>用户资料</CardTitle>
            <CardDescription>查看用户基本注册信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              <InfoRow label="用户 ID">
                <span className="font-mono">{user.id}</span>
              </InfoRow>
              <InfoRow label="账号">
                <span className="font-medium">{user.account}</span>
              </InfoRow>
              <InfoRow label="昵称">
                {user.nickname || '-'}
              </InfoRow>
              <InfoRow label="邮箱">
                {user.email || '-'}
              </InfoRow>
              <InfoRow label="手机">
                {user.mobile || '-'}
              </InfoRow>
              <InfoRow label="性别">
                {user.gender === 1 ? '男' : user.gender === 2 ? '女' : '未知'}
              </InfoRow>
              <InfoRow label="地区">
                {user.region || '-'}
              </InfoRow>
              <InfoRow label="签名">
                {user.sign || '-'}
              </InfoRow>
              <InfoRow label="注册时间">
                {formatDate(user.created_at)}
              </InfoRow>
              <InfoRow label="更新时间">
                {formatDate(user.updated_at ?? '')}
              </InfoRow>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'stats' && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">设备数</p>
                <p className="text-2xl font-bold">{user.device_count || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">好友数</p>
                <p className="text-2xl font-bold">{user.friend_count || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">群组数</p>
                <p className="text-2xl font-bold">{user.group_count || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>数据治理</CardTitle>
              <CardDescription>管理该用户的关联数据</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate(`/users/${uid}/tags`)}
              >
                <Tags className="h-4 w-4 mr-3" />
                用户标签治理
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate(`/users/${uid}/collects`)}
              >
                <Bookmark className="h-4 w-4 mr-3" />
                用户收藏治理
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>账号操作</CardTitle>
              <CardDescription>对该用户执行管理操作</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {user.status === 1 ? (
                <Button
                  variant="destructive"
                  className="w-full justify-start"
                  onClick={() => banMutation.mutate(uid)}
                  disabled={banMutation.isPending}
                >
                  {banMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                  ) : (
                    <UserX className="h-4 w-4 mr-3" />
                  )}
                  封禁用户
                </Button>
              ) : user.status === 0 ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => unbanMutation.mutate(uid)}
                  disabled={unbanMutation.isPending}
                >
                  {unbanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4 mr-3" />
                  )}
                  解封用户
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">该用户已删除，无法执行操作</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
