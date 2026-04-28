import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsHomePage } from './SettingsHomePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const overviewFixture = {
  total_users: 1000,
  today_users: 10,
  total_groups: 50,
  today_groups: 2,
  online_users: 42,
  online_devices: 55,
  today_messages: 200,
  today_c2c: 150,
  today_c2g: 50,
}

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsHomePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SettingsHomePage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays settings home with overview stats', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/stats/overview') return { data: { code: 0, msg: 'ok', payload: overviewFixture } }
      if (url === '/current') return { data: { code: 0, msg: 'ok', payload: adminFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('系统设置')
      expect(text).toContain('在线用户')
      expect(text).toContain('42')
      expect(text).toContain('总用户数')
    })
  })

  it('shows settings modules navigation links', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/stats/overview') return { data: { code: 0, msg: 'ok', payload: overviewFixture } }
      if (url === '/current') return { data: { code: 0, msg: 'ok', payload: adminFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('功能开关')
      expect(text).toContain('能力配置')
      expect(text).toContain('版本管理')
      expect(text).toContain('角色权限')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('server error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载系统配置失败')
    })
  })
})
