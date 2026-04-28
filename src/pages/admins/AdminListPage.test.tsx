import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminListPage } from './AdminListPage'
import client from '../../services/api/client'
import { useAuthStore } from '../../stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admins']}>
        <Routes>
          <Route path="/admins" element={<AdminListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const adminFixture = {
  id: 'admin-100',
  account: 'test-admin',
  nickname: '测试管理员',
  avatar: '',
  role_id: 2,
  status: 1,
  login_count: 10,
  last_login_ip: '127.0.0.1',
  last_login_at: '2026-01-10 08:00:00',
  created_at: '2026-01-01 00:00:00',
}

const roleFixture = {
  id: 2,
  name: 'operator',
  description: '运营',
  permissions: ['reports:read'],
}

function makeMockGet() {
  return async (url: string) => {
    if (url === '/admin/list' || url === '/admins/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [adminFixture],
            page: 1,
            size: 10,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    if (url === '/role/list' || url === '/roles/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [roleFixture],
            roles: [roleFixture],
          },
        },
      }
    }

    if (url === '/rbac/me') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            role_id: 1,
            role_ids: [1],
            role_name: 'super_admin',
            permissions: ['admins:create', 'admins:update'],
            menu_paths: [],
          },
        },
      }
    }

    throw new Error(`unexpected GET url: ${url}`)
  }
}

describe('AdminListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useAuthStore.getState().setAdmin({
      id: 'admin-1',
      account: 'admin',
      nickname: 'admin',
      avatar: '',
      role_id: 1,
      login_count: 1,
      last_login_ip: '127.0.0.1',
      last_login_at: '2026-02-28 10:00:00',
      status: 1,
      created_at: '2026-02-28 10:00:00',
    })
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    useAuthStore.getState().logout()
    cleanup()
  })

  it('loads and displays admin list', async () => {
    const getCalls: string[] = []

    mutableClient.get = async (url: string) => {
      getCalls.push(url)
      return (makeMockGet())(url)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((url) => url === '/admin/list' || url === '/admins/list')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('管理员')
      expect(view.container.textContent).toContain('test-admin')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/role/list' || url === '/roles/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { items: [roleFixture], roles: [roleFixture] },
          },
        }
      }
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载管理员列表失败')
    })
  })

  it('shows empty state when no admins exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/list' || url === '/admins/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
      }
      if (url === '/role/list' || url === '/roles/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [] } } }
      }
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('管理员')
      expect(view.container.textContent).toContain('暂无管理员数据')
    })
  })
})
