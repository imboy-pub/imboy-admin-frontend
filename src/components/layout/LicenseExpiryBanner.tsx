import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, XCircle } from 'lucide-react'
import { getLicenseStatus } from '@/services/api/stats'

export function LicenseExpiryBanner() {
  const { data } = useQuery({
    queryKey: ['license-status'],
    queryFn: getLicenseStatus,
    staleTime: 5 * 60_000,
    // ponytail: silent on error — layout must not crash on license fetch failure
  })

  // 挂载时取一次当前时间（useState 惰性初始化器，仅运行一次）：到期天数无需渲染期实时刷新
  const [nowMs] = useState(() => Date.now())

  if (!data || !data.expires_at) return null

  const daysLeft = Math.ceil((data.expires_at * 1000 - nowMs) / 86400000)

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
