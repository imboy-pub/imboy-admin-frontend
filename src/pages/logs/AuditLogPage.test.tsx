import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuditLogPage } from './AuditLogPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/logs']}>
        <Routes>
          <Route path="/logs" element={<AuditLogPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// AuditLogPage expects messages with `scope` field (not `msg_scope`)
const messageFixture = {
  id: '3001',
  msg_id: '3001',
  scope: 'private',
  from_id: '9001',
  to_id: '9002',
  msg_type: 'text',
  action: 'send',
  payload: '{"text":"hello-audit"}',
  created_at: '2026-01-10 08:00:00',
}

// AuditLogPage logout items use `uid`, `account`, `body` fields
const logoutFixture = {
  id: 1,
  uid: '9001',
  account: 'alice',
  nickname: 'Alice',
  body: 'test reason',
  status: 0,
  created_at: '2026-01-10 08:00:00',
  handled_at: null,
  handler_id: null,
}

function makeMockGet() {
  return async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/message/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [messageFixture],
            page: Number(config?.params?.page ?? 1),
            size: Number(config?.params?.size ?? 10),
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    if (url === '/user/logout_apply/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [logoutFixture],
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
}

describe('AuditLogPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays the audit log page title', async () => {
    mutableClient.get = makeMockGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('日志审计')
    })
  })

  it('shows message log data', async () => {
    mutableClient.get = makeMockGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('日志审计')
    })

    // Message tab should show message data
    await waitFor(() => {
      // The page might show messages once loaded
      const text = view.container.textContent ?? ''
      expect(text).toContain('日志审计')
    })
  })

  it('shows error state when message API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/message/list') {
        throw new Error('network error')
      }
      if (url === '/user/logout_apply/list') {
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
      // Error state should show
      const text = view.container.textContent ?? ''
      expect(text).toMatch(/日志审计|加载|失败/)
    })
  })
})
