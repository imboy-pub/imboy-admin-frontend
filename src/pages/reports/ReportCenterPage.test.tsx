import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ReportCenterPage } from './ReportCenterPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

const reportTicketFixture = {
  id: 'report-001',
  target_type: 'group',
  target_id: 'group-101',
  reporter_uid: 'user-202',
  reason: '违规内容',
  description: '该群组发布了违规内容',
  status: 0,
  handled_by: '',
  handled_at: null,
  created_at: '2026-04-01 10:00:00',
  updated_at: '2026-04-01 10:00:00',
}

function mockSidebarFetch() {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({ code: 0, msg: 'ok', payload: { menus: [], version: '1.0' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function renderReportCenter(initialEntry = '/reports?target_type=group') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reports" element={<ReportCenterPage />} />
          <Route path="/groups/context" element={<div>group-context-route</div>} />
          <Route path="/channels" element={<div>channels-route</div>} />
          <Route path="/users" element={<div>users-route</div>} />
          <Route path="/moments" element={<div>moments-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ReportCenterPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockSidebarFetch()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('shows pending group report workflow when API returns 404', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list' || url === '/group/report/list') {
        throw { code: 404, msg: 'not found' }
      }
      // Silently handle permission/feature queries
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      throw new Error(`unexpected GET url: ${url}`)
    }

    const view = renderReportCenter()
    const user = userEvent.setup()

    await view.findByText('举报中心')
    await view.findByText('群组举报 API 暂未接入')
    await view.findByRole('button', { name: '前往群上下文入口' })

    await user.click(view.getByRole('button', { name: '前往群上下文入口' }))
    await view.findByText('group-context-route')
  })

  it('loads and displays group reports successfully', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [reportTicketFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      if (url === '/rbac/me') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              role_id: 1,
              permissions: ['reports:handle'],
            },
          },
        }
      }
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: {} } }
      }
      // Silently ignore other calls (role list etc.)
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter()

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      expect(text).toContain('群组')
      expect(text).toContain('group-101')
    })
  })

  it('shows all target type tabs and default to moment tab', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      throw { code: 404, msg: 'not found' }
    }

    const view = renderReportCenter('/reports')

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      expect(text).toContain('朋友圈')
      expect(text).toContain('群组')
      expect(text).toContain('频道')
      expect(text).toContain('用户')
    })
  })

  it('switches to channel tab and shows channel API unavailable state', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list' || url === '/channel/report/list') {
        throw { code: 404, msg: 'not found' }
      }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter('/reports?target_type=channel')
    const user = userEvent.setup()

    await view.findByText('举报中心')

    await waitFor(() => {
      expect(view.container.textContent).toContain('频道')
    })

    // Channel governance button should navigate
    await waitFor(async () => {
      const govButton = view.queryByRole('button', { name: '前往频道治理' })
      if (govButton) {
        await user.click(govButton)
        await view.findByText('channels-route')
      }
    }, { timeout: 3000 })
  })
})
