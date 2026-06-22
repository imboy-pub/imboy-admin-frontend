import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, ErrorState, LoadingState } from '@/components/shared'
import { getFinanceReport } from '@/services/api/stats'

const MONTH_OPTIONS = [3, 6, 12] as const

function fenToYuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function formatYuanAxis(value: number) {
  const yuan = value / 100
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`
  return `¥${yuan.toFixed(0)}`
}

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}

function YuanTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm text-sm space-y-1">
      <p className="font-medium text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ¥{fenToYuan(p.value)}
        </p>
      ))}
    </div>
  )
}

function CountTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm text-sm space-y-1">
      <p className="font-medium text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value} 笔
        </p>
      ))}
    </div>
  )
}

export function FinanceReportPage() {
  const [months, setMonths] = useState<3 | 6 | 12>(6)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['finance-report', months],
    queryFn: () => getFinanceReport(months),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <LoadingState message="加载财务报表..." />
  if (error || !data) return <ErrorState message="加载财务报表失败" onRetry={() => refetch()} />

  const rows = data.data ?? []

  const totalRecharge = rows.reduce((s, r) => s + r.recharge_amount, 0)
  const totalSubscription = rows.reduce((s, r) => s + r.subscription_amount, 0)
  const totalCount = rows.reduce((s, r) => s + r.recharge_count + r.subscription_count, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="财务报表"
          description="月度收入趋势与订单统计"
        />
        <div className="flex gap-2">
          {MONTH_OPTIONS.map((m) => (
            <Button
              key={m}
              variant={months === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMonths(m)}
            >
              近 {m} 个月
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">充值总收入</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{fenToYuan(totalRecharge)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">订阅总收入</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{fenToYuan(totalSubscription)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总订单数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalCount.toLocaleString()} 笔</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            月度收入趋势
          </CardTitle>
          <CardDescription>充值收入 vs 订阅收入（元）</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecharge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSub" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatYuanAxis} tick={{ fontSize: 12 }} width={60} />
              <Tooltip content={<YuanTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="recharge_amount"
                name="充值收入"
                stroke="hsl(var(--primary))"
                fill="url(#gradRecharge)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="subscription_amount"
                name="订阅收入"
                stroke="hsl(142 76% 36%)"
                fill="url(#gradSub)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>月度订单量</CardTitle>
          <CardDescription>充值订单 vs 订阅账单（笔）</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CountTooltip />} />
              <Legend />
              <Bar dataKey="recharge_count" name="充值笔数" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="subscription_count" name="订阅笔数" fill="hsl(142 76% 36%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
