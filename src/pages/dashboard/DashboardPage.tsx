import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, MessageSquare, UsersRound, Activity } from 'lucide-react'
import { PageHeader, StatsCard, LoadingState, ErrorState } from '@/components/shared'
import { getOverviewStatsPayload, getUserStatsPayload, getMessageStatsPayload, DailyCount } from '@/services/api/stats'
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
} from 'recharts'

export function DashboardPage() {
  // 获取总览统计
  const { data: stats, isLoading: overviewLoading, error: overviewError, refetch } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => getOverviewStatsPayload(),
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

  if (overviewLoading) {
    return <LoadingState message="加载统计数据..." />
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="仪表盘"
        description="欢迎使用 Imboy 管理后台"
      />

      {/* Stats Grid */}
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

      {/* Trend Charts */}
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

      {/* System Status */}
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
                <p className="text-sm text-muted-foreground">在线 {stats?.online_users || 0} 用户</p>
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
    </div>
  )
}
