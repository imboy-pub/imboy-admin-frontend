/**
 * Unit tests for authStore (Zustand state)
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { useAuthStore } from './authStore'
import type { Admin } from '@/types/admin'

const mockAdmin: Admin = {
  id: '1',
  account: 'admin',
  nickname: 'Admin User',
  avatar: null,
  status: 1,
  role_ids: [1],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

afterEach(() => {
  // Reset store state between tests
  useAuthStore.setState({ admin: null, isAuthenticated: false })
})

describe('useAuthStore', () => {
  it('initializes with null admin and false isAuthenticated', () => {
    const state = useAuthStore.getState()
    expect(state.admin).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('setAdmin sets admin and marks authenticated', () => {
    useAuthStore.getState().setAdmin(mockAdmin)
    const state = useAuthStore.getState()
    expect(state.admin).toEqual(mockAdmin)
    expect(state.isAuthenticated).toBe(true)
  })

  it('setAdmin(null) clears admin and marks unauthenticated', () => {
    useAuthStore.getState().setAdmin(mockAdmin)
    useAuthStore.getState().setAdmin(null)
    const state = useAuthStore.getState()
    expect(state.admin).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('logout clears admin and isAuthenticated', () => {
    useAuthStore.getState().setAdmin(mockAdmin)
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.admin).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('isAuthenticated is true when admin is set', () => {
    useAuthStore.setState({ admin: mockAdmin, isAuthenticated: true })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('stores account and role_ids correctly', () => {
    useAuthStore.getState().setAdmin(mockAdmin)
    const admin = useAuthStore.getState().admin
    expect(admin?.account).toBe('admin')
    expect(admin?.role_ids).toEqual([1])
  })
})
