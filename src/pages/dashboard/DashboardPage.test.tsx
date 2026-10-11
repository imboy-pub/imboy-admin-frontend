import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
import client from '../../services/api/client'
import { clearRbacUnavailable } from '../../services/api/rbac'

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

const emptyDailyStats = { daily_new: [], active_users: 0, banned_users: 0, deleted_users: 0 }
const emptyMessageStats = { daily_c2c: [], daily_c2g: [] }
const emptyGroupStats = { daily_new: [], public_groups: 0, private_groups: 0 }
const emptyRankingStats = { items: [] }

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DashboardPage flow', () => {
  beforeEach(() => { document.body.innerHTML = ''; clearRbacUnavailable() })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays dashboard stats', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/stats/overview') return { data: { code: 0, msg: 'ok', payload: overviewFixture } }
      if (url === '/stats/user') return { data: { code: 0, msg: 'ok', payload: emptyDailyStats } }
      if (url === '/stats/message') return { data: { code: 0, msg: 'ok', payload: emptyMessageStats } }
      if (url === '/stats/group') return { data: { code: 0, msg: 'ok', payload: emptyGroupStats } }
      if (url === '/stats/ranking') return { data: { code: 0, msg: 'ok', payload: emptyRankingStats } }
      // Silently ignore other calls (notifications, features, etc.)
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('仪表盘')
    })
  })

  it('shows error state when overview API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/stats/overview') throw new Error('network error')
      // Other stats calls should succeed or be silent
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载统计数据失败')
    })
  })

  it('displays specific stats from fixture data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/stats/overview') return { data: { code: 0, msg: 'ok', payload: overviewFixture } }
      if (url === '/stats/user') return { data: { code: 0, msg: 'ok', payload: emptyDailyStats } }
      if (url === '/stats/message') return { data: { code: 0, msg: 'ok', payload: emptyMessageStats } }
      if (url === '/stats/group') return { data: { code: 0, msg: 'ok', payload: emptyGroupStats } }
      if (url === '/stats/ranking') return { data: { code: 0, msg: 'ok', payload: emptyRankingStats } }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('仪表盘')
      expect(view.container.textContent).toContain('1,000')
      expect(view.container.textContent).toContain('50')
    })
  })
  for (const [roleId, permissions, expected] of [
    ['3', [], false],
    ['1', [], false],
    ['3', ['finance:read'], false],
    ['1', ['finance:read'], true],
    ['2', ['finance:read'], true],
  ] as const) {
    it(`aligns finance cards and requests with role ${roleId} / ${permissions}`, async () => {
      const calls: string[] = []
      mutableClient.get = async (url: string) => {
        calls.push(url)
        const payload = url === '/stats/overview' ? overviewFixture
          : url === '/rbac/me' ? { role_id: roleId, role_ids: [roleId], permissions }
          : url === '/stats/user' ? emptyDailyStats
          : url === '/stats/message' ? emptyMessageStats
          : url === '/stats/group' ? emptyGroupStats
          : url === '/stats/ranking' ? emptyRankingStats
          : { active_subscriptions: 2, pending_withdrawals: 3 }
        return { data: { code: 0, msg: 'ok', payload } }
      }
      let view: ReturnType<typeof renderPage>
      await act(async () => { view = renderPage() })
      await waitFor(() => expect(view.container.textContent).toContain('1,000'))
      // Flush settled RBAC/query notifications before checking denied requests.
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
      expect(calls.includes('/stats/finance')).toBe(expected)
      expect(view.container.textContent?.includes('提现审核')).toBe(expected)
      expect(view.container.textContent?.includes('有效订阅')).toBe(expected)
      expect(view.container.querySelector('a[href="/billing-invoices"]') !== null).toBe(expected)
    })
  }

  it('waits for resolved finance authorization before querying or showing cards', async () => {
    let resolveProfile: (_value: unknown) => void = () => {}
    const calls: string[] = []
    mutableClient.get = async (url: string) => {
      calls.push(url)
      if (url === '/rbac/me') return new Promise(resolve => { resolveProfile = resolve })
      const payload = url === '/stats/overview' ? overviewFixture
        : url === '/stats/user' ? emptyDailyStats
        : url === '/stats/message' ? emptyMessageStats
        : url === '/stats/group' ? emptyGroupStats
        : url === '/stats/ranking' ? emptyRankingStats
        : { active_subscriptions: 2, pending_withdrawals: 3 }
      return { data: { code: 0, msg: 'ok', payload } }
    }
    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await waitFor(() => expect(calls).toContain('/rbac/me'))
    expect(calls).not.toContain('/stats/finance')
    expect(view.container.textContent).not.toContain('提现审核')
    await act(async () => {
      resolveProfile({ data: { code: 0, msg: 'ok', payload: {
        role_id: '2', role_ids: ['2'], permissions: ['finance:read'],
      } } })
    })
    await waitFor(() => expect(calls).toContain('/stats/finance'))
    await waitFor(() => expect(view.container.textContent).toContain('提现审核'))
  })

})
