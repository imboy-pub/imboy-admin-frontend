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
    // ponytail: silent on error — layout must not crash on license fetch failure
    // 上限：接口失败时 data 为 undefined → 直接 return null，横幅整条消失，
    // 「拉不到授权」与「授权健康」在界面上完全不可区分；配额已超但接口挂掉时零提示。
    // 升级触发：后端一旦对超配额做真实功能降级（拒绝新用户注册/建群），或线上出现一次
    // 「超配额无提示」事故，就改为 isError 时渲染灰色「授权状态未知」条，
    // 对齐 DashboardPage SystemStatusPanel「不假绿」的既有约定。
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
