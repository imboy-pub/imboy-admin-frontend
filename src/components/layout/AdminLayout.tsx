import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  // 路由变化时关闭移动端侧边栏
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <SidebarContext.Provider value={{ mobileOpen, toggleMobile, closeMobile }}>
      <div className="flex h-screen">
        {/* 桌面侧边栏 */}
        <div className="hidden md:block">
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

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
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
