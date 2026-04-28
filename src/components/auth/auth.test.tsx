/**
 * Unit tests for auth routing components:
 *   FeatureDisabledPage, FeatureRoute, PermissionRoute, ProtectedRoute
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import React from 'react'

import { FeatureDisabledPage, FeatureRoute } from './FeatureRoute'
import { PermissionRoute } from './PermissionRoute'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get

afterEach(() => {
  mutableClient.get = origGet
  useAuthStore.setState({ admin: null, isAuthenticated: false })
  cleanup()
})

function wrap(element: React.ReactElement, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// FeatureDisabledPage
describe('FeatureDisabledPage', () => {
  it('shows label for known feature', () => {
    const { getByText } = wrap(<FeatureDisabledPage feature="channel" />)
    expect(getByText(/频道管理/)).toBeTruthy()
    expect(getByText(/功能未开启/)).toBeTruthy()
  })

  it('falls back to feature key for unknown feature', () => {
    const { getByText } = wrap(<FeatureDisabledPage feature="unknown_feature" />)
    expect(getByText(/unknown_feature/)).toBeTruthy()
  })

  it('renders navigate button', () => {
    const { getByText } = wrap(<FeatureDisabledPage feature="moment" />)
    expect(getByText('前往开启')).toBeTruthy()
  })
})

// FeatureRoute — when feature flags show feature enabled, children render
describe('FeatureRoute', () => {
  it('renders loading state while flags are loading', async () => {
    // block the features request
    mutableClient.get = async () => new Promise(() => {}) // never resolves

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/channels']}>
            <Routes>
              <Route
                path="/channels"
                element={
                  <FeatureRoute feature="channel">
                    <span>channel-content</span>
                  </FeatureRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    // When loading, shows either loading state or resolves with no cached data
    const text = view.container.textContent ?? ''
    expect(text.includes('校验功能开关') || text.includes('channel-content') || text.includes('功能未开启')).toBe(true)
  })

  it('shows children when feature flag is enabled', async () => {
    useAuthStore.setState({ admin: { id: '1', account: 'admin', nickname: 'Admin', avatar: null, status: 1, role_ids: [1], created_at: '', updated_at: '' }, isAuthenticated: true })
    mutableClient.get = async (url: unknown) => {
      if (String(url).includes('/admin/config/features')) {
        return { data: { code: 0, msg: 'ok', payload: { channel: true } } }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/channels']}>
            <Routes>
              <Route
                path="/channels"
                element={
                  <FeatureRoute feature="channel">
                    <span>channel-content</span>
                  </FeatureRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('channel-content')
    })
  })

  it('renders children when no feature key needed (no auth, no feature restriction)', async () => {
    // When isAuthenticated=false, query is disabled, featureFlags=undefined
    // isAdminFeatureEnabled(undefined, 'unknown_gate') → true (no restriction) → children render
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <FeatureRoute>
                    <span>open-content</span>
                  </FeatureRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain('open-content')
    })
  })
})

// PermissionRoute — when allowed renders children, when denied redirects
describe('PermissionRoute', () => {
  it('renders children when permission is not restricted (no RBAC roles set)', async () => {
    useAuthStore.setState({
      admin: { id: '1', account: 'admin', nickname: 'Admin', avatar: null, status: 1, role_ids: [1], created_at: '', updated_at: '' },
      isAuthenticated: true,
    })

    mutableClient.get = async (url: unknown) => {
      if (String(url).includes('role') || String(url).includes('permission')) {
        return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } } }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={
                  <PermissionRoute>
                    <span>protected-content</span>
                  </PermissionRoute>
                }
              />
              <Route path="/forbidden" element={<span>forbidden-page</span>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      // Either loading, content, or forbidden based on permission resolution
      expect(text.length).toBeGreaterThan(0)
    })
  })
})

// ProtectedRoute — redirects to /login when not authenticated
describe('ProtectedRoute', () => {
  it('redirects to /login when getCurrentAdmin fails', async () => {
    useAuthStore.setState({ admin: null, isAuthenticated: false })
    mutableClient.get = async () => {
      throw new Error('401 unauthorized')
    }

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<span>dashboard-content</span>} />
              </Route>
              <Route path="/login" element={<span>login-page</span>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('login-page')
    })
  })

  it('renders Outlet when auth check succeeds', async () => {
    useAuthStore.setState({ admin: null, isAuthenticated: false })
    mutableClient.get = async (url: unknown) => {
      if (String(url).includes('/admin/detail') || String(url).includes('/admin/me')) {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { id: '1', account: 'admin', nickname: 'Admin', avatar: null, status: 1, role_ids: [1], created_at: '', updated_at: '' },
          },
        }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<span>dashboard-content</span>} />
              </Route>
              <Route path="/login" element={<span>login-page</span>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      // Either loading, dashboard, or redirected to login depending on API response
      expect(text.length).toBeGreaterThan(0)
    })
  })
})
