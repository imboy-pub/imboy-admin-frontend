import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Admin } from '@/types/admin'

interface AuthState {
  admin: Admin | null
  isAuthenticated: boolean
  /** 认证域代次：setAdmin/logout 各自递增。在途登录响应以此做迟到守卫——
   * 终结（注销/401 过期）或切换后到达的迟到成功不得复活已清空的认证状态（A-06）。 */
  authEpoch: number
  setAdmin: (_admin: Admin | null) => void
  refreshAdmin: (_admin: Admin) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,
      authEpoch: 0,
      setAdmin: (admin) => set((state) => ({ admin, isAuthenticated: !!admin, authEpoch: state.authEpoch + 1 })),
      refreshAdmin: (admin) => set((state) => ({
        admin,
        isAuthenticated: true,
        authEpoch: state.admin && state.admin.id === admin.id ? state.authEpoch : state.authEpoch + 1,
      })),
      logout: () => set((state) => ({ admin: null as Admin | null, isAuthenticated: false, authEpoch: state.authEpoch + 1 })),
    }),
    {
      name: 'imboy-admin-auth',
      // 落盘脱敏：剔除 PII（email/mobile/last_login_ip/login_count），降低 XSS 读取 localStorage 的暴露面。
      // 运行时内存中的 admin 仍为完整对象；这些字段未被生产代码消费，刷新后为空不影响 UI。
      partialize: (_state) => ({
        admin: _state.admin
          ? {
              ..._state.admin,
              email: undefined,
              mobile: undefined,
              last_login_ip: '',
              login_count: 0,
            }
          : null,
        isAuthenticated: _state.isAuthenticated,
      }),
    }
  )
)
