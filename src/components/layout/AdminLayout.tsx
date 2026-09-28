import { createContext, useContext, useState, useCallback } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { LicenseExpiryBanner } from './LicenseExpiryBanner'
import { QuotaWarningBanner } from './QuotaWarningBanner'
import { Breadcrumb, KeyboardShortcutsDialog } from '@/components/shared'

const SidebarContext = createContext<{
  mobileOpen: boolean
  toggleMobile: () => void
  closeMobile: () => void
}>({ mobileOpen: false, toggleMobile: () => {}, closeMobile: () => {} })

export function useSidebarMobile() {
  return useContext(SidebarContext)
}

export function AdminLayout() {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()

  // 将 mobileOpen 与打开时的 pathname 一起存储，路由切换时自动关闭侧边栏
  const [sidebarState, setSidebarState] = useState<{ open: boolean; openedAt: string }>({
    open: false,
    openedAt: location.pathname,
  })

  const mobileOpen = sidebarState.open && sidebarState.openedAt === location.pathname

  const toggleMobile = useCallback(() => {
    setSidebarState((prev) => ({
      open: !(prev.open && prev.openedAt === location.pathname),
      openedAt: location.pathname,
    }))
  }, [location.pathname])

  const closeMobile = useCallback(() => {
    setSidebarState((prev) => ({ ...prev, open: false }))
  }, [])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <SidebarContext.Provider value={{ mobileOpen, toggleMobile, closeMobile }}>
      {/* App Shell：整页锁定视口高度且不产生文档级滚动，侧边栏与内容区各自独立滚动 */}
      <div className="flex h-dvh overflow-hidden">
        {/* 桌面侧边栏 */}
        <div className="hidden h-full shrink-0 md:block">
          <Sidebar />
        </div>

        {/* 移动端侧边栏 overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={closeMobile}
            />
            <div className="fixed inset-y-0 left-0 z-50 md:hidden">
              <Sidebar />
            </div>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <LicenseExpiryBanner />
          <QuotaWarningBanner />
          <main className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6">
            <Breadcrumb />
            <div key={location.pathname} className="animate-fade-in">
              <Outlet />
            </div>
          </main>
          <KeyboardShortcutsDialog />
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
