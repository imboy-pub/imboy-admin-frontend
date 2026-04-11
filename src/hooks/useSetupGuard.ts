import { useEffect, useState } from 'react'
import { getSetupStatus } from '@/modules/identity'

/**
 * useSetupGuard — 首启向导守卫（P0-5）
 *
 * 行为：
 *   - 组件挂载时调用 GET /adm/setup/status
 *   - initialized === false  → 需要跳转 /setup
 *   - initialized === true   → 正常流程
 *   - 网络错误时不阻塞，默认视为"已初始化"，避免误导流量
 *
 * 典型用法：
 *   const { loading, needSetup } = useSetupGuard()
 *   if (loading) return <LoadingState />
 *   if (needSetup) return <Navigate to="/setup" replace />
 */
export interface SetupGuardState {
  loading: boolean
  needSetup: boolean
  error: string | null
}

export function useSetupGuard(): SetupGuardState {
  const [loading, setLoading] = useState(true)
  const [needSetup, setNeedSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const status = await getSetupStatus()
        if (!active) return
        setNeedSetup(!status.initialized)
        setError(null)
      } catch (e: unknown) {
        if (!active) return
        // 网络错误时不阻塞：假设已初始化，走正常登录流程
        const msg = e instanceof Error ? e.message : '首启状态检查失败'
        setError(msg)
        setNeedSetup(false)
      } finally {
        if (active) setLoading(false)
      }
    }

    check()
    return () => {
      active = false
    }
  }, [])

  return { loading, needSetup, error }
}
