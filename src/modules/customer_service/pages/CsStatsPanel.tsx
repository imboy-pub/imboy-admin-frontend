/**
 * CS-ADM-02（CS-GOV-03B）：客服运营统计面板（平台治理面）。
 *
 * 纪律（验收口径）：
 * - UI 数值与 API 响应**逐项相等**——不聚合、不推导、不填默认指标值；
 *   均值无样本时按服务端 null 诚实显示「无样本」，禁止伪装成 0；
 * - 时间范围与时区**可见**：日期 + 时区偏移输入；窗口按服务端回显的
 *   window_start/window_end（epoch 秒）展示为 UTC 时刻——展示回显值
 *   不是重算；
 * - loading / error / empty / permission 四态完整；
 * - 统计端点是 org 作用域（org_source=path）：未选定企业时显示空态
 *   引导，不发请求；
 * - 只调 /api/adm 域（CS-03-A01：严禁接入 /api/v1）。
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { getCsSessionStats, type CsSessionStats } from '../api/public'

type Props = {
  /** 统计端点是 org 作用域；null = 未选定企业（空态引导，不发请求）。 */
  orgId: EntityId | null
  canRead: boolean
}

/** 今日（本地日历日）的 YYYY-MM-DD，作为 date 输入缺省值。 */
function todayLocalIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 服务端回显窗口（epoch 秒）→ UTC 可读时刻（展示回显值，非重算）。 */
function formatWindowSeconds(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

function formatAvgSeconds(avgSeconds: number | null): string {
  if (avgSeconds === null) return '无样本'
  return `${Math.round(avgSeconds)} 秒`
}

export function CsStatsPanel({ orgId, canRead }: Props) {
  const [date, setDate] = useState<string>(todayLocalIsoDate)
  const [tzOffset, setTzOffset] = useState<number>(0)

  const query = useQuery({
    queryKey: ['customer_service', 'stats', orgId ?? '', date, tzOffset],
    queryFn: () => getCsSessionStats({ organizationId: orgId ?? '', date, tzOffset }),
    enabled: orgId !== null && canRead,
  })

  const stats = query.data ?? null
  const isEmptyFacts = useMemo(
    () =>
      stats !== null &&
      stats.newSessions === 0 &&
      stats.closedSessions === 0 &&
      stats.firstResponse.count === 0 &&
      stats.rating.count === 0 &&
      stats.current.queued === 0 &&
      stats.current.active === 0,
    [stats]
  )

  let body: ReactElement
  if (orgId === null) {
    body = (
      <EmptyState
        icon={<BarChart3 className="h-8 w-8" />}
        title="统计按企业维度查看"
        description="在上方企业过滤中选择一个企业后，将显示该企业的客服运营统计。"
      />
    )
  } else if (!canRead) {
    body = <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="无客服读取权限" />
  } else if (query.isLoading) {
    body = <LoadingState message="正在加载运营统计…" />
  } else if (query.error) {
    body = (
      <ErrorState
        message={`加载运营统计失败：${getErrorMessage(query.error)}`}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (stats === null || isEmptyFacts) {
    body = (
      <EmptyState
        icon={<BarChart3 className="h-8 w-8" />}
        title="该时间窗内无客服会话事实"
        description="服务端按所选日期与时区窗口现算，无会话时如实为空。"
      />
    )
  } else {
    body = <StatsFacts stats={stats} />
  }

  return (
    <Card data-testid="cs-stats-panel">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">运营统计</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cs-stats-date" className="text-xs text-muted-foreground">
              日期（服务端窗口按此日历日）
            </Label>
            <Input
              id="cs-stats-date"
              type="date"
              className="w-[170px]"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-stats-tz" className="text-xs text-muted-foreground">
              时区偏移（分钟，ISO 8601）
            </Label>
            <Input
              id="cs-stats-tz"
              type="number"
              className="w-[130px]"
              min={-840}
              max={840}
              step={15}
              value={tzOffset}
              onChange={(event) => {
                const next = Number(event.target.value)
                setTzOffset(Number.isFinite(next) ? Math.max(-840, Math.min(840, next)) : 0)
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  )
}

/** 五指标事实卡：每个数值逐字来自响应投影字段（CS-GOV-03B 逐项相等）。 */
function StatsFacts({ stats }: { stats: CsSessionStats }) {
  return (
    <div className="space-y-3">
      {stats.windowStart >= 0 && stats.windowEnd >= 0 && (
        <p className="text-xs text-muted-foreground" data-testid="cs-stats-window">
          统计窗口：{formatWindowSeconds(stats.windowStart)} →{' '}
          {formatWindowSeconds(stats.windowEnd)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FactCard label="新会话" value={String(stats.newSessions)} sub={`窗口内开始`} />
        <FactCard
          label="首次响应"
          value={`${stats.firstResponse.count} 次`}
          sub={`平均 ${formatAvgSeconds(stats.firstResponse.avgSeconds)}`}
        />
        <FactCard label="关闭会话" value={String(stats.closedSessions)} sub="窗口内关闭" />
        <FactCard
          label="评分"
          value={
            stats.rating.avg === null ? '无样本' : String(stats.rating.avg)
          }
          sub={`${stats.rating.count} 条评价`}
        />
        <FactCard
          label="当前"
          value={`${stats.current.queued} 排队 / ${stats.current.active} 接待`}
          sub="实时计数（不看窗口）"
        />
      </div>
    </div>
  )
}

function FactCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3 space-y-1" data-testid="cs-stats-fact">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
