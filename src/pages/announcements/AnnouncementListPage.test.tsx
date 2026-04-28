import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AnnouncementListPage } from './AnnouncementListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = (mutableClient as Record<string, unknown>).put as AnyFn | undefined

const announcementFixture = {
  id: 1,
  adm_user_id: 1,
  title: 'test-announcement-title',
  body: 'announcement body text',
  type: 'info',
  status: 1,
  pinned: 0,
  published_at: '2026-01-10 09:00:00',
  expired_at: null,
  created_at: '2026-01-10 08:00:00',
  updated_at: null,
}

function makeListResponse(items = [announcementFixture]) {
  return {
    data: {
      code: 0, msg: 'ok',
      payload: {
        list: items,
        page: 1, size: 10, total: items.length,
      },
    },
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/announcements']}>
        <Routes>
          <Route path="/announcements" element={<AnnouncementListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AnnouncementListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    ;(mutableClient as Record<string, unknown>).put = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    if (originalPut) {
      ;(mutableClient as Record<string, unknown>).put = originalPut
    }
    cleanup()
  })

  it('loads and displays announcement list', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/announcement/index') return makeListResponse()
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('全局公告')
      expect(view.container.textContent).toContain('test-announcement-title')
    })
  })

  it('shows empty state when no announcements', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/announcement/index') return makeListResponse([])
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无公告')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载公告列表失败')
    })
  })
})
