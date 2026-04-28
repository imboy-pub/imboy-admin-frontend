import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupScheduleManagePage } from './GroupScheduleManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderPage(gid = '88') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/schedules`]}>
        <Routes>
          <Route path="/groups/:id/schedules" element={<GroupScheduleManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const scheduleFixture = {
  id: 601,
  group_id: 88,
  title: 'schedule-title-text',
  description: 'schedule description',
  start_time: '2026-02-01 10:00:00',
  end_time: '2026-02-01 12:00:00',
  created_by: '9001',
  created_at: '2026-01-10 08:00:00',
}

describe('GroupScheduleManagePage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays group schedules', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/schedule/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [scheduleFixture],
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
      expect(view.container.textContent).toContain('群日程管理')
      expect(view.container.textContent).toContain('schedule-title-text')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群日程数据失败')
    })
  })

  it('shows empty state when no schedules exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/schedule/list') {
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
