import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupNoticeManagePage } from './GroupNoticeManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderPage(gid = '66') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/notices`]}>
        <Routes>
          <Route path="/groups/:id/notices" element={<GroupNoticeManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail:{gid}</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const noticeFixture = {
  id: 501,
  group_id: 66,
  title: 'notice-title-text',
  body: 'notice-body-text',
  status: 1,
  pinned: false,
  read_count: 0,
  created_at: '2026-01-10 08:00:00',
}

describe('GroupNoticeManagePage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays group notices', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      if (url === '/group/notice/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [noticeFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群公告管理')
      expect(view.container.textContent).toContain('notice-title-text')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群公告数据失败')
    })
  })

  it('shows empty state when no notices exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/notice/list') {
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
