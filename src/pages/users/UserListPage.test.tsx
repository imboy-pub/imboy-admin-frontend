import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { UserListPage } from './UserListPage'
import client from '../../services/api/client'
import { useAuthStore } from '../../stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function UserDetailProbe() {
  const { id = '' } = useParams()
  return <div>user-detail:{id}</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route path="/users" element={<UserListPage />} />
          <Route path="/users/:id" element={<UserDetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const userFixture = {
  id: '9001',
  account: 'alice',
  nickname: 'Alice',
  avatar: '',
  gender: 1,
  status: 1,
  login_count: 5,
  last_login_ip: '127.0.0.1',
  last_login_at: '2026-01-10 08:00:00',
  created_at: '2026-01-01 00:00:00',
}

function makeUserListResponse(items = [userFixture]) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: {
        items,
        page: 1,
        size: 10,
        total: items.length,
        total_pages: 1,
      },
    },
  }
}

describe('UserListPage flow', () => {
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

  it('loads and displays user list', async () => {
    const getCalls: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push(url)
      if (url === '/user/list') return makeUserListResponse()
      if (url === '/rbac/me') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] },
          },
        }
      }
      // Ignore other calls silently
      return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((url) => url === '/user/list')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('用户管理')
      expect(view.container.textContent).toContain('Alice')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载用户数据失败')
    })
  })

  it('shows empty state when no users exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/list') return makeUserListResponse([])
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('用户管理')
      expect(view.container.textContent).toContain('暂无数据')
    })
  })
})
