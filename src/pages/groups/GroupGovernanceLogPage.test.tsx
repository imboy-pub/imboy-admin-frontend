import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupGovernanceLogPage } from './GroupGovernanceLogPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function GroupContextProbe() {
  return <div>group-context-page</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groups/55/governance-log']}>
        <Routes>
          <Route path="/groups/:id/governance-log" element={<GroupGovernanceLogPage />} />
          <Route path="/groups/context" element={<GroupContextProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const logFixture = {
  id: 1,
  group_id: 55,
  operator_id: 'admin-1',
  operator_account: 'admin',
  action: 'dissolve',
  target_uid: null,
  reason: 'test reason',
  created_at: '2026-01-10 08:00:00',
}

describe('GroupGovernanceLogPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays governance log', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })

      if (url === '/group/governance/log/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [logFixture],
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
      expect(getCalls.some((c) => c.url === '/group/governance/log/list')).toBe(true)
    })

    // Verify gid is passed correctly
    expect(getCalls.find((c) => c.url === '/group/governance/log/list')?.params).toMatchObject({ group_id: '55' })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群治理审计日志')
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
      expect(view.container.textContent).toContain('加载群治理日志失败')
    })
  })

  it('navigates back to group detail', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/governance/log/list') {
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
      expect(view.container.textContent).toContain('群治理审计日志')
    })

    await act(async () => {
      const backButton = view.getByRole('button', { name: '返回群上下文入口' })
      backButton.click()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('group-context-page')
    })
  })
})
