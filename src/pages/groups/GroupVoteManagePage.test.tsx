import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { GroupVoteManagePage } from './GroupVoteManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function GroupDetailProbe() {
  const { id = '' } = useParams()
  return <div>group-detail:{id}</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groups/77/votes']}>
        <Routes>
          <Route path="/groups/:id/votes" element={<GroupVoteManagePage />} />
          <Route path="/groups/:id" element={<GroupDetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const voteFixture = {
  id: 401,
  group_id: 77,
  title: 'test-vote-title',
  options: [{ text: 'Option A', vote_count: 3 }, { text: 'Option B', vote_count: 1 }],
  status: 1,
  created_by: '9001',
  created_at: '2026-01-10 08:00:00',
  ended_at: null,
}

describe('GroupVoteManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays group votes', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })

      if (url === '/group/vote/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [voteFixture],
              page: 1,
              size: 10,
              total: 1,
              total_pages: 1,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/group/vote/list')).toBe(true)
    })

    expect(getCalls.find((c) => c.url === '/group/vote/list')?.params).toMatchObject({ gid: '77' })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群投票管理')
      expect(view.container.textContent).toContain('test-vote-title')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => {
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群投票数据失败')
    })
  })

  it('shows empty state for no votes', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/vote/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群投票管理')
    })
  })
})
