import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Users,
  Wifi,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatsCard,
} from '@/components/shared'
import { getSystemHealthStats } from '@/services/api/systemHealth'

export function SystemHealthPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealthStats,
    refetchInterval: 15_000, // 15 秒自动刷新
  })

  if (isLoading) {
    return <LoadingState message="加载系统健康数据..." />
  }

  if (error || !data) {
    return <ErrorState message="加载系统健康数据失败" onRetry={() => refetch()} />
  }

  const poolTotal = data.dbPoolFree + data.dbPoolInUse
  const poolUsagePercent = poolTotal > 0
    ? Math.round((data.dbPoolInUse / poolTotal) * 100)
    : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="系统健康"
        description="实时监控后端服务运行状态"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {dataUpdatedAt
                ? `更新于 ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      {/* 核心指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="在线用户"
          value={data.onlineUsers}
          icon={Users}
          description="当前通过 WebSocket 在线的用户"
        />
        <StatsCard
          title="WebSocket 连接"
          value={data.wsConnections}
          icon={Wifi}
          description="活跃 TCP/WebSocket 连接数"
        />
        <StatsCard
          title="Erlang 进程数"
          value={data.processCount.toLocaleString()}
          icon={Activity}
        />
        <StatsCard
          title="总内存"
          value={`${data.memoryTotalMB} MB`}
          icon={HardDrive}
          description={`进程: ${data.memoryProcessesMB} MB / ETS: ${data.memoryEtsMB} MB`}
        />
      </div>

      {/* 数据库连接池 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            数据库连接池
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">空闲连接</p>
              <p className="text-2xl font-bold text-green-600">{data.dbPoolFree}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">使用中</p>
              <p className="text-2xl font-bold text-blue-600">{data.dbPoolInUse}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">使用率</p>
              <p className={`text-2xl font-bold ${poolUsagePercent > 80 ? 'text-red-600' : 'text-gray-900'}`}>
                {poolUsagePercent}%
              </p>
            </div>
          </div>
          {/* 简易进度条 */}
          <div className="mt-4 h-2 rounded-full bg-gray-100">
            <div
              className={`h-2 rounded-full transition-all ${
                poolUsagePercent > 80 ? 'bg-red-500' : poolUsagePercent > 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${poolUsagePercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 内存分布 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            内存分布
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">总内存</p>
              <p className="text-xl font-semibold">{data.memoryTotalMB} MB</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">进程内存</p>
              <p className="text-xl font-semibold">{data.memoryProcessesMB} MB</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ETS 内存</p>
              <p className="text-xl font-semibold">{data.memoryEtsMB} MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 应用级计数器 */}
      {Object.keys(data.appCounters).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">应用计数器</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.appCounters)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="truncate font-mono text-sm text-muted-foreground" title={key}>
                      {key}
                    </span>
                    <span className="ml-2 font-semibold">{value.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
