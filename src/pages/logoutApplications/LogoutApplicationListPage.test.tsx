import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LogoutApplicationListPage } from './LogoutApplicationListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const applicationFixture = {
  uid: '9001',
  account: 'user-alice',
  nickname: 'Alice',
  user_status: 2,
  app_vsn: '1.0.0',
  did: 'device-001',
  dtype: 'ios',
  ip: '127.0.0.1',
  created_at: '2026-01-10 08:00:00',
  body: 'reason for logout',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/logout-applications']}>
        <Routes>
          <Route path="/logout-applications" element={<LogoutApplicationListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LogoutApplicationListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays logout applications', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/logout_apply/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [applicationFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('注销申请')
      expect(view.container.textContent).toContain('user-alice')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载注销申请数据失败')
    })
  })

  it('shows empty state when no logout applications', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/logout_apply/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无数据')
    })
  })
})
