import { useState } from 'react'
import { LogOut, User, Key, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { logout as logoutApi } from '@/modules/identity'

export function AdminProfilePanel() {
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {
      // 忽略服务端登出失败
    } finally {
      logout()
      navigate('/login')
    }
  }

  const roleLabel: Record<number, string> = {
    1: '超级管理员',
    2: '运营管理员',
    3: '审计管理员',
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
          {admin?.nickname?.charAt(0) || <User className="h-4 w-4" />}
        </div>
        <span className="text-sm font-medium hidden sm:inline">{admin?.nickname || '管理员'}</span>
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-background shadow-lg">
            <div className="border-b p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  {admin?.nickname?.charAt(0) || <User className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{admin?.nickname || '管理员'}</p>
                  <p className="text-xs text-muted-foreground truncate">{admin?.account || ''}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">{roleLabel[admin?.role_id ?? 0] || '未知角色'}</span>
                {admin?.last_login_at && (
                  <span>最近登录 {admin.last_login_at}</span>
                )}
              </div>
            </div>

            <div className="p-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors text-muted-foreground cursor-not-allowed"
                disabled
                title="修改密码功能开发中，需要后端支持 /adm/admin/password 接口"
              >
                <Key className="h-4 w-4" />
                修改密码
                <span className="ml-auto text-xs">待后端支持</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
