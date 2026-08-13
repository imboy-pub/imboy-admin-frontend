import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingState } from '@/components/shared'
import { useState, useEffect } from 'react'
import { getCurrentAdminPayload } from '@/modules/identity'
import { AUTH_EXPIRED_EVENT } from '@/services/api/client'

export function ProtectedRoute() {
  const location = useLocation()
  const { isAuthenticated, setAdmin, logout } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    // 首次进入受保护路由时始终向服务端验证会话，避免仅依赖本地持久化状态
    const checkAuth = async () => {
      try {
        const admin = await getCurrentAdminPayload()
        setAdmin(admin)
      } catch (error) {
        // 只有明确的 401（会话失效）才登出；429/5xx/网络抖动属于瞬态故障，
        // 回退到本地持久化的登录态，避免限流把管理员踢回登录页
        const code = (error as { code?: number })?.code
        if (code === 401) {
          logout()
        }
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    checkAuth()
    return () => {
      active = false
    }
  }, [setAdmin, logout])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleAuthExpired = () => {
      logout()
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [logout])

  if (checking) {
    return <LoadingState message="验证登录状态..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
