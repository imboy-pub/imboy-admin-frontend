import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, ErrorState, StatsCard, DashboardSkeleton } from '@/components/shared'
import {
  getOverviewStatsPayload,
  getUserStatsPayload,
  getMessageStatsPayload,
  getGroupStatsPayload,
  getRankingStatsPayload,
  type DailyCount,
  type RankingItem,
} from '@/services/api/stats'
import { Users, MessageSquare, UserPlus, TrendingUp, UsersRound, RefreshCw, Download } from 'lucide-react'
import { toast } from 'sonner'
import { exportCsv } from '@/lib/csvExport'

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ef4444']

type TimeRange = 7 | 30

const pieLabel = ({ name, percent }: { name?: string; percent?: number }) =>
  `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`

function RankingCard({ title, items, getLabel }: { title: string; items: RankingItem[]; getLabel: (_item: RankingItem) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                }`}>
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{getLabel(item)}</span>
                <span className="shrink-0 text-sm font-medium text-muted-foreground">{item.metric.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">暂无数据</p>
        )}
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const [days, setDays] = useState<TimeRange>(7)

  const { data: overview, isLoading: oLoading, error: oError, refetch } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => getOverviewStatsPayload(),
  })

  const { data: userStats } = useQuery({
    queryKey: ['stats', 'user', days],
    queryFn: () => getUserStatsPayload(days),
  })

  const { data: messageStats } = useQuery({
    queryKey: ['stats', 'message', days],
    queryFn: () => getMessageStatsPayload(days),
  })

  const { data: groupStats } = useQuery({
    queryKey: ['stats', 'group', days],
    queryFn: () => getGroupStatsPayload(days),
  })

  const { data: userMsgRanking } = useQuery({
    queryKey: ['stats', 'ranking', 'user', 'message', 10],
    queryFn: () => getRankingStatsPayload('user', 'message', 10),
  })

  const { data: groupMemberRanking } = useQuery({
    queryKey: ['stats', 'ranking', 'group', 'member', 10],
    queryFn: () => getRankingStatsPayload('group', 'member', 10),
  })

  const { data: groupMsgRanking } = useQuery({
    queryKey: ['stats', 'ranking', 'group', 'message', 10],
    queryFn: () => getRankingStatsPayload('group', 'message', 10),
  })

  if (oLoading) return <DashboardSkeleton />
  if (oError) return <ErrorState message="加载分析数据失败" onRetry={() => refetch()} />

  // 数据转换
  const userTrend = userStats?.daily_new?.map((d: DailyCount) => ({ date: d.date, 新用户: d.count })) ?? []
  const msgTrend = messageStats?.daily_c2c?.map((d: DailyCount, i: number) => ({
    date: d.date, 单聊: d.count, 群聊: messageStats?.daily_c2g?.[i]?.count ?? 0,
  })) ?? []
  const groupTrend = groupStats?.daily_new?.map((d: DailyCount) => ({ date: d.date, 新群组: d.count })) ?? []

  // 消息总量趋势
  const totalMsgTrend = msgTrend.map((d) => ({ date: d.date, 总消息: (d.单聊 ?? 0) + (d.群聊 ?? 0) }))

  // 用户状态分布
  const userDistribution = [
    { name: '活跃', value: userStats?.active_users ?? 0 },
    { name: '封禁', value: userStats?.banned_users ?? 0 },
    { name: '已注销', value: userStats?.deleted_users ?? 0 },
  ].filter((d) => d.value > 0)

  // 群组类型分布
  const groupDistribution = [
    { name: '公开群组', value: groupStats?.public_groups ?? 0 },
    { name: '私有群组', value: groupStats?.private_groups ?? 0 },
  ].filter((d) => d.value > 0)

  const handleExportOverview = () => {
    const columns = [
      { header: '指标', accessor: 'metric' as const },
      { header: '数值', accessor: 'value' as const },
    ]
    const rows = [
      { metric: '总用户', value: String(overview?.total_users ?? 0) },
      { metric: '今日新增用户', value: String(overview?.today_users ?? 0) },
      { metric: '在线用户', value: String(overview?.online_users ?? 0) },
      { metric: '在线设备', value: String(overview?.online_devices ?? 0) },
      { metric: '总群组', value: String(overview?.total_groups ?? 0) },
      { metric: '今日新群组', value: String(overview?.today_groups ?? 0) },
      { metric: '今日消息', value: String(overview?.today_messages ?? 0) },
      { metric: '今日单聊', value: String(overview?.today_c2c ?? 0) },
      { metric: '今日群聊', value: String(overview?.today_c2g ?? 0) },
      { metric: '活跃用户', value: String(userStats?.active_users ?? 0) },
      { metric: '封禁用户', value: String(userStats?.banned_users ?? 0) },
    ]
    exportCsv(columns, rows, 'analytics_overview')
    toast.success('已导出运营概览数据')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="运营分析"
        description="用户增长、消息趋势、群组活跃度等多维度运营数据分析"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportOverview}>
              <Download className="mr-2 h-4 w-4" />
              导出概览
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      {/* 时间范围选择 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">时间范围：</span>
        <Button variant={days === 7 ? 'default' : 'outline'} size="sm" onClick={() => setDays(7)}>近 7 天</Button>
        <Button variant={days === 30 ? 'default' : 'outline'} size="sm" onClick={() => setDays(30)}>近 30 天</Button>
      </div>

      {/* 核心指标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="总用户" value={overview?.total_users ?? 0} description={`今日 +${overview?.today_users ?? 0}`} icon={Users} />
        <StatsCard title="在线用户" value={overview?.online_users ?? 0} description={`设备 ${overview?.online_devices ?? 0}`} icon={UserPlus} />
        <StatsCard title="今日消息" value={overview?.today_messages ?? 0} description={`C2C ${overview?.today_c2c ?? 0} / C2G ${overview?.today_c2g ?? 0}`} icon={MessageSquare} />
        <StatsCard title="总群组" value={overview?.total_groups ?? 0} description={`今日 +${overview?.today_groups ?? 0}`} icon={UsersRound} />
      </div>

      {/* 用户分析 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>用户增长趋势</CardTitle>
            <CardDescription>每日新增注册用户</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={userTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="新用户" stroke="#8884d8" fill="#8884d8" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>用户状态分布</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {userDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={userDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={pieLabel}>
                    {userDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 消息分析 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>消息量趋势</CardTitle>
            <CardDescription>C2C 单聊 vs C2G 群聊</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={msgTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="单聊" fill="#8884d8" />
                <Bar dataKey="群聊" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>消息总量趋势</CardTitle>
            <CardDescription>每日总消息量</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={totalMsgTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="总消息" stroke="#ffc658" strokeWidth={2} dot={{ fill: '#ffc658' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 群组分析 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>群组增长趋势</CardTitle>
            <CardDescription>每日新建群组数</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={groupTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="新群组" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>群组类型分布</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {groupDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={groupDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={pieLabel}>
                    {groupDistribution.map((_, i) => <Cell key={i} fill={COLORS[i + 2]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 排行榜 */}
      <div className="grid gap-4 md:grid-cols-3">
        <RankingCard title="用户消息量 Top 10" items={userMsgRanking?.list ?? []} getLabel={(item) => item.nickname ?? item.account ?? `#${item.id}`} />
        <RankingCard title="群组成员数 Top 10" items={groupMemberRanking?.list ?? []} getLabel={(item) => item.title ?? item.name ?? `#${item.id}`} />
        <RankingCard title="群组消息量 Top 10" items={groupMsgRanking?.list ?? []} getLabel={(item) => item.title ?? item.name ?? `#${item.id}`} />
      </div>
    </div>
  )
}
