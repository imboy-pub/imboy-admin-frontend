import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
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
  beforeEach(() => { document.body.innerHTML = '' })

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
})
