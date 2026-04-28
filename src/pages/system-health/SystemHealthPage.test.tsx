import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SystemHealthPage } from './SystemHealthPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const metricsFixture = {
  counters: {
    erlang_process_count: 120,
    erlang_memory_total_bytes: 104857600,
    erlang_memory_processes_bytes: 52428800,
    erlang_memory_ets_bytes: 10485760,
    imboy_online_users: 42,
    ws_connections_current: 30,
    db_pool_free: 5,
    db_pool_in_use: 3,
    msg_sent_total: 9999,
  },
  histograms: {},
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/system-health']}>
        <Routes>
          <Route path="/system-health" element={<SystemHealthPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SystemHealthPage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays system health stats', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/metrics') {
        return { data: { code: 0, msg: 'ok', payload: metricsFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('系统健康')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载系统健康数据失败')
    })
  })

  it('displays specific metric values from fixture', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/metrics') {
        return { data: { code: 0, msg: 'ok', payload: metricsFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('系统健康')
      expect(view.container.textContent).toContain('42')
    })
  })
})
