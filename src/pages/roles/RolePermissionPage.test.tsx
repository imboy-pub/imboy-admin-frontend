import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RolePermissionPage } from './RolePermissionPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

const adminFixture = {
  id: 'admin-1',
  account: 'admin',
  nickname: 'Admin',
  avatar: '',
  role_id: 1,
  status: 1,
  login_count: 1,
  last_login_ip: '127.0.0.1',
  last_login_at: '2026-01-10 08:00:00',
  created_at: '2026-01-01 00:00:00',
}

const roleFixture = {
  id: 1,
  name: 'super_admin',
  description: 'Super Admin',
  permissions: ['*'],
  status: 1,
  created_at: '2026-01-01 00:00:00',
}

const rbacFixture = {
  role_id: 1,
  role_ids: [1],
  role_name: 'super_admin',
  permissions: ['*'],
  menu_paths: [],
}

function mockSidebarFetch() {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input instanceof URL ? input.href : input)
    // Always return empty sidebar config
    const sidebarConfig = { code: 0, msg: 'ok', payload: { menus: [], version: '1.0' } }
    return new Response(JSON.stringify(sidebarConfig), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/roles']}>
        <Routes>
          <Route path="/roles" element={<RolePermissionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RolePermissionPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockSidebarFetch()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('loads and displays role permission page', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/current') return { data: { code: 0, msg: 'ok', payload: adminFixture } }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: rbacFixture } }
      if (url === '/role/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [roleFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      // Silently handle other calls
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('角色权限')
    })
  })

  it('shows error state when admin API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/current') throw new Error('network error')
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载角色权限配置失败')
    })
  })

  it('displays role data from API fixture', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/current') return { data: { code: 0, msg: 'ok', payload: adminFixture } }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: rbacFixture } }
      if (url === '/role/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: { items: [roleFixture], page: 1, size: 10, total: 1, total_pages: 1 },
          },
        }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('角色权限')
      expect(view.container.textContent).toContain('super_admin')
    })
  })
})
