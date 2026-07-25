import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getLicenseStatus } from '@/services/api/stats'

// ponytail: 用户数达 max_users 80% 时提醒升级；max_users=0(不限量)或未达阈值不显示。
// 复用 LicenseExpiryBanner 的 ['license-status'] queryKey，共享缓存零额外请求。
// 上限：单档 80% 阈值、不可关闭、共享 staleTime 5min 使配额数字最多滞后 5 分钟——
// 从 80% 冲到上限的整个过程只有这一次提示，且真正触顶的瞬间横幅不会立刻升级为红色。
// 升级触发：出现「运营方看到 80% 提示但没来得及升级就触达上限、新用户被拒」的实际事故，
// 改为分级阈值(80/90/95)并在 >=95% 时缩短 staleTime；收到「横幅长期占屏」反馈再加按会话 dismiss。
export function QuotaWarningBanner() {
  const { data } = useQuery({
    queryKey: ['license-status'],
    queryFn: getLicenseStatus,
    staleTime: 5 * 60_000,
    // ponytail: 错误态由 LicenseExpiryBanner 统一渲染，本组件失败时保持静默 —— 二者共用同一个
    // ['license-status'] 查询，一次失败在两处各渲染一条会得到一字不差的重复提示。
    // 上限：依赖 LicenseExpiryBanner 在 AdminLayout 中一同挂载；若它被摘掉，需把那段
    // isError 灰色「授权状态未知」条搬到这里，否则配额通道又会退回静默失败。
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
