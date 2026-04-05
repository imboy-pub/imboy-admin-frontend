import { Fragment, useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, MessageSquare, UsersRound, Activity, ShieldOff, UserCheck, BarChart3, TrendingUp, RefreshCw, Clock } from 'lucide-react'
import { PageHeader, StatsCard, ErrorState, DashboardSkeleton } from '@/components/shared'
import { loadNotifications, type AdminNotification, type NotificationType } from '@/components/shared/NotificationPanel'
import {
  getOverviewStatsPayload,
  getUserStatsPayload,
  getMessageStatsPayload,
  getGroupStatsPayload,
  getRankingStatsPayload,
  type DailyCount,
  type RankingItem,
} from '@/services/api/stats'
import { dashboardPanelRegistry } from '@/modules/dashboard/registry/dashboardPanelRegistry'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts'

dashboardPanelRegistry.register({
  id: 'system-status',
  render: ({ stats: panelStats }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          系统状态
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div>
              <p className="font-medium">API 服务</p>
              <p className="text-sm text-muted-foreground">运行正常</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div>
              <p className="font-medium">WebSocket 服务</p>
              <p className="text-sm text-muted-foreground">在线 {panelStats?.online_users || 0} 用户</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div>
              <p className="font-medium">数据库</p>
              <p className="text-sm text-muted-foreground">连接正常</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
})

const TYPE_ICON_MAP: Record<NotificationType, string> = {
  info: '🔵',
  success: '🟢',
  warning: '🟡',
  error: '🔴',
}

function QuickActionCard({ title, description, path, icon: Icon }: {
  title: string
  description: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <a
      href={path}
      className="group flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  )
}

function RecentActivityCard() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])

  useEffect(() => {
    setNotifications(loadNotifications().slice(0, 8))
    const handler = () => setNotifications(loadNotifications().slice(0, 8))
    window.addEventListener('admin-notifications-changed', handler)
    return () => window.removeEventListener('admin-notifications-changed', handler)
  }, [])

  const recentActivities = useMemo(() => {
    return notifications
      .filter((n) => n.type === 'warning' || n.type === 'info')
      .slice(0, 5)
  }, [notifications])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          最近操作
        </CardTitle>
        <CardDescription>管理操作活动记录</CardDescription>
      </CardHeader>
      <CardContent>
        {recentActivities.length > 0 ? (
          <div className="space-y-3">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
                <span className="mt-0.5 text-sm">{TYPE_ICON_MAP[activity.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.message}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(activity.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">暂无最近操作记录</p>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  // 获取总览统计 — 每 60 秒自动刷新
  const { data: stats, isLoading: overviewLoading, error: overviewError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => getOverviewStatsPayload(),
    refetchInterval: 60 * 1000,
  })

  // 获取用户趋势
  const { data: userStats } = useQuery({
    queryKey: ['stats', 'user', 7],
    queryFn: () => getUserStatsPayload(7),
  })

  // 获取消息趋势
  const { data: messageStats } = useQuery({
    queryKey: ['stats', 'message', 7],
    queryFn: () => getMessageStatsPayload(7),
  })

  // 获取群组趋势
  const { data: groupStats } = useQuery({
    queryKey: ['stats', 'group', 7],
    queryFn: () => getGroupStatsPayload(7),
  })

  // 获取消息排行
  const { data: rankingStats } = useQuery({
    queryKey: ['stats', 'ranking', 'user', 'message', 10],
    queryFn: () => getRankingStatsPayload('user', 'message', 10),
  })

  if (overviewLoading) {
    return <DashboardSkeleton />
  }

  if (overviewError) {
    return <ErrorState message="加载统计数据失败" onRetry={() => refetch()} />
  }

  // 处理趋势数据
  const userTrendData = userStats?.daily_new?.map((item: DailyCount) => ({
    date: item.date,
    新用户: item.count,
  })) || []

  const messageTrendData = messageStats?.daily_c2c?.map((item: DailyCount, index: number) => ({
    date: item.date,
    单聊: item.count,
    群聊: messageStats?.daily_c2g?.[index]?.count || 0,
  })) || []

  const groupTrendData = groupStats?.daily_new?.map((item: DailyCount) => ({
    date: item.date,
    新群组: item.count,
  })) || []

  const rankingList: RankingItem[] = rankingStats?.list ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="仪表盘"
        description="欢迎使用 Imboy 管理后台"
        actions={
          <div className="flex items-center gap-3">
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                最后更新：{new Date(dataUpdatedAt).toLocaleTimeString('zh-CN')}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新数据
            </Button>
          </div>
        }
      />

      {/* 核心指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="总用户数"
          value={stats?.total_users || 0}
          description={`今日新增 ${stats?.today_users || 0}`}
          icon={Users}
        />
        <StatsCard
          title="在线用户"
          value={stats?.online_users || 0}
          description={`在线设备 ${stats?.online_devices || 0}`}
          icon={Activity}
        />
        <StatsCard
          title="群组总数"
          value={stats?.total_groups || 0}
          description={`今日新建 ${stats?.today_groups || 0}`}
          icon={UsersRound}
        />
        <StatsCard
          title="今日消息"
          value={stats?.today_messages || 0}
          description={`单聊 ${stats?.today_c2c || 0} / 群聊 ${stats?.today_c2g || 0}`}
          icon={MessageSquare}
        />
      </div>

      {/* 补充指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="活跃用户"
          value={userStats?.active_users || 0}
          description="有消息交互的用户"
          icon={UserCheck}
        />
        <StatsCard
          title="封禁用户"
          value={userStats?.banned_users || 0}
          description={`已注销 ${userStats?.deleted_users || 0}`}
          icon={ShieldOff}
        />
        <StatsCard
          title="公开群组"
          value={groupStats?.public_groups || 0}
          description={`私有群组 ${groupStats?.private_groups || 0}`}
          icon={UsersRound}
        />
        <StatsCard
          title="消息占比"
          value={`${stats?.today_messages ? Math.round(((stats?.today_c2c || 0) / stats.today_messages) * 100) : 0}%`}
          description="单聊/总消息"
          icon={BarChart3}
        />
      </div>

      {/* 快捷操作入口 */}
      <div className="grid gap-4 md:grid-cols-4">
        <QuickActionCard
          title="用户管理"
          description="查看和管理用户账户"
          path="/users"
          icon={Users}
        />
        <QuickActionCard
          title="举报中心"
          description="处理用户举报内容"
          path="/reports"
          icon={ShieldOff}
        />
        <QuickActionCard
          title="反馈处理"
          description="回复用户反馈"
          path="/feedback"
          icon={MessageSquare}
        />
        <QuickActionCard
          title="消息审计"
          description="查看消息记录"
          path="/messages"
          icon={Activity}
        />
      </div>

      {/* 趋势图表 - 第一行 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>7日用户增长趋势</CardTitle>
            <CardDescription>每日新增用户数</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={userTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="新用户"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={{ fill: '#8884d8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7日消息量趋势</CardTitle>
            <CardDescription>每日消息发送量</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={messageTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="单聊" fill="#8884d8" />
                <Bar dataKey="群聊" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 趋势图表 - 第二行 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>7日群组增长趋势</CardTitle>
            <CardDescription>每日新建群组数</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={groupTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="新群组"
                  stroke="#82ca9d"
                  fill="#82ca9d"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 消息排行 Top 10 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              消息活跃排行 Top 10
            </CardTitle>
            <CardDescription>按消息发送量排名</CardDescription>
          </CardHeader>
          <CardContent>
            {rankingList.length > 0 ? (
              <div className="space-y-2">
                {rankingList.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.nickname || item.account || `#${item.id}`}</span>
                    <span className="shrink-0 text-sm font-medium text-muted-foreground">{item.metric}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无排行数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 注册面板 */}
      {/* 最近操作活动流 */}
      <RecentActivityCard />

      {dashboardPanelRegistry.list().map((panel) => (
        <Fragment key={panel.id}>
          {panel.render({
            stats,
            userTrendData,
            messageTrendData,
          })}
        </Fragment>
      ))}
    </div>
  )
}
