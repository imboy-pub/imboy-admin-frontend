import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Admin } from '@/types/admin'

interface AuthState {
  admin: Admin | null
  isAuthenticated: boolean
  setAdmin: (_admin: Admin | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,
      setAdmin: (admin) => set({ admin, isAuthenticated: !!admin }),
      logout: () => set({ admin: null as Admin | null, isAuthenticated: false }),
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
