import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, XCircle, HelpCircle } from 'lucide-react'
import { getLicenseStatus } from '@/services/api/stats'
import { daysUntilExpiry } from '@/lib/licenseExpiry'

export function LicenseExpiryBanner() {
  const { data, isError } = useQuery({
    queryKey: ['license-status'],
    queryFn: getLicenseStatus,
    staleTime: 5 * 60_000,
    // ponytail: 失败不再静默 —— isError 时渲染灰色「授权状态未知」条（下方），
    // 对齐 DashboardPage SystemStatusPanel「健康接口未响应时显示灰色未知而非假绿」的既有约定。
    // 上限：不区分 401/网络中断/后端 5xx，也不提供重试按钮；只告诉运营方「这条通道当前不可信」。
    // 升级触发：出现「明明有权限却长期显示未知」的误报，再按 error 分类文案 / 加重试入口。
  })

  // 挂载时取一次当前时间（useState 惰性初始化器，仅运行一次）：到期天数无需渲染期实时刷新
  const [nowMs] = useState(() => Date.now())

  // ponytail: 「未知」条只在本组件渲染一条。QuotaWarningBanner 共用同一个 ['license-status']
  // 查询，同一次失败若两处都渲染会得到两条一字不差的重复提示；错误源只有一个，提示就只该有一条。
  // 上限：本条与 QuotaWarningBanner 的「静默」是一对约定，两者在 AdminLayout 里相邻挂载；
  // 若将来 LicenseExpiryBanner 被摘掉，需把这段错误态搬到留下的那个横幅里。
  if (isError) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-sm bg-muted text-muted-foreground border-b">
        <HelpCircle className="h-4 w-4 shrink-0" />
        <span>授权状态未知：暂时无法获取授权信息，到期与配额预警当前均不可用，请检查后端服务</span>
      </div>
    )
  }

  if (!data || !data.expires_at) return null

  // B-20：expires_at 是**毫秒**，此前这里额外乘了 1000 → 时间戳大 1000 倍 →
  // daysLeft 巨大 → 下面 `> 30` 恒成立 → **横幅永不显示**。
  // 换算收进 lib/licenseExpiry，三处调用方不再各写一遍。
  const daysLeft = daysUntilExpiry(data.expires_at, nowMs)

  if (daysLeft > 30) return null

  const expired = daysLeft <= 0
  const msg = expired
    ? '授权已过期，请联系续费以恢复全部功能'
    : `授权将在 ${daysLeft} 天后到期，请及时联系续费`

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
        expired
          ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
          : 'bg-yellow-50 text-yellow-800 border-b border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300'
      }`}
    >
      {expired
        ? <XCircle className="h-4 w-4 shrink-0" />
        : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span>{msg}</span>
    </div>
  )
}
