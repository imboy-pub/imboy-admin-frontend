import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getLicenseStatus } from '@/services/api/stats'

// ponytail: 用户数达 max_users 80% 时提醒升级；max_users=0(不限量)或未达阈值不显示。
// 复用 LicenseExpiryBanner 的 ['license-status'] queryKey，共享缓存零额外请求。
export function QuotaWarningBanner() {
  const { data } = useQuery({
    queryKey: ['license-status'],
    queryFn: getLicenseStatus,
    staleTime: 5 * 60_000,
    // ponytail: silent on error — layout must not crash on license fetch failure
  })

  if (!data || !data.max_users || data.max_users <= 0) return null

  const usage = data.current_users / data.max_users
  if (usage < 0.8) return null

  const percent = Math.round(usage * 100)

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-yellow-50 text-yellow-800 border-b border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        用户数已达授权配额 {percent}%（{data.current_users} / {data.max_users}），建议联系升级 License 以免触达上限
      </span>
    </div>
  )
}
