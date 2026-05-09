import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FeedbackListPage } from './FeedbackListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/feedback']}>
        <Routes>
          <Route path="/feedback" element={<FeedbackListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const feedbackFixture = {
  id: 2001,
  user_id: '9001',
  content: 'this-is-feedback',
  status: 1,
  category: 'bug',
  platform: 'ios',
  app_version: '1.0.0',
  contact: '',
  reply: null,
  created_at: '2026-01-10 08:00:00',
  updated_at: '2026-01-10 08:00:00',
}

function makeFeedbackListResponse(items = [feedbackFixture]) {
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

function mockWorkflowConfigFetch() {
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        reply_templates: ['感谢反馈', '已记录'],
        sla_hours: 24,
      }),
    }) as Response
}

describe('FeedbackListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockWorkflowConfigFetch()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('loads and displays feedback list', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      if (url === '/feedback/index') {
        return makeFeedbackListResponse()
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/feedback/index')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('反馈管理')
      expect(view.container.textContent).toContain('this-is-feedback')
    })
  })

  it('shows loading state initially', async () => {
    // Delay the response to observe loading state
    let resolveGet: (_value: unknown) => void
    const pendingGet = new Promise((resolve) => { resolveGet = resolve })

    mutableClient.get = async (url: string) => {
      if (url === '/feedback/index') {
        await pendingGet
        return makeFeedbackListResponse()
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    // Loading message should appear
    expect(view.container.textContent).toContain('加载反馈数据')

    // Resolve the pending request
    resolveGet!(null)

    await waitFor(() => {
      expect(view.container.textContent).toContain('反馈管理')
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
      expect(view.container.textContent).toContain('加载反馈数据失败')
    })
  })

  it('shows empty state with no feedbacks', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/feedback/index') {
        return makeFeedbackListResponse([])
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('反馈管理')
    })
  })

  it('paginates feedback list correctly', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      if (url === '/feedback/index') {
        const page = Number((config?.params as Record<string, unknown>)?.page ?? 1)
        const size = Number((config?.params as Record<string, unknown>)?.size ?? 10)
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [{ ...feedbackFixture, content: `feedback-page-${page}` }],
              page,
              size,
              total: 25,
              total_pages: Math.ceil(25 / size),
            },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let _view: ReturnType<typeof renderPage>
    await act(async () => {
      _view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/feedback/index')).toBe(true)
    })

    const firstCall = getCalls.find((c) => c.url === '/feedback/index')
    expect(firstCall?.params).toMatchObject({ page: 1, size: 10 })
  })
})
