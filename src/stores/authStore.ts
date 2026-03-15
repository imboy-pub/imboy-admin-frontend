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
      partialize: (_state) => ({ admin: _state.admin, isAuthenticated: _state.isAuthenticated }),
    }
  )
)
