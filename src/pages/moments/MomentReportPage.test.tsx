import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { MomentReportPage } from './MomentReportPage'
import client from '../../services/api/client'
import { useAuthStore } from '../../stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

type ReportApiCall = {
  page: number
  size: number
  status: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPrompt = window.prompt

function MomentDetailRouteProbe() {
  const { id = '' } = useParams()
  return <div>moment-detail-route:{id}</div>
}

function renderMomentReportPage(
  permissionOverride: { allowed: boolean; loading?: boolean } = { allowed: true, loading: false }
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  ;(queryClient as unknown as { invalidateQueries: AnyFn }).invalidateQueries = async () => undefined

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/moments/reports']}>
        <Routes>
          <Route
            path="/moments/reports"
            element={<MomentReportPage permissionOverride={permissionOverride} />}
          />
          <Route path="/moments/:id" element={<MomentDetailRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function flushReactUpdates() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('MomentReportPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useAuthStore.getState().setAdmin({
      id: 'admin-1',
      account: 'admin',
      nickname: 'admin',
      avatar: '',
      role_id: 1,
      login_count: 1,
      last_login_ip: '127.0.0.1',
      last_login_at: '2026-02-28 10:00:00',
      status: 1,
      created_at: '2026-02-28 10:00:00',
    })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    window.prompt = originalPrompt
    cleanup()
    useAuthStore.getState().logout()
  })

  it('covers filter, pagination, single resolve and detail navigation', async () => {
    const getCalls: ReportApiCall[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const promptMessages: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/moment/report/list') {
        const page = Number(config?.params?.page ?? 1)
        const size = Number(config?.params?.size ?? 10)
        const status = Number(config?.params?.status ?? -1)
        getCalls.push({ page, size, status })

        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                {
                  id: 701,
                  post_id: 9901,
                  reporter_uid: 3001,
                  reason: status === 1 ? 'appeal' : 'spam',
                  description: 'contains ad links',
                  status: status === 1 ? 1 : 0,
                  handled_by: status === 1 ? 1001 : '',
                  handled_at: status === 1 ? '2026-02-26 09:00:00' : null,
                  created_at: '2026-02-26 08:00:00',
                  updated_at: '2026-02-26 08:00:00',
                },
              ],
              page,
              size,
              total: 23,
              total_pages: Math.ceil(23 / size),
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    window.prompt = (message?: string) => {
      const text = String(message ?? '')
      promptMessages.push(text)
      return promptMessages.length === 1 ? '驳回备注' : '违规备注'
    }

    const view = renderMomentReportPage({ allowed: true, loading: false })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 10 && call.status === -1)).toBe(true)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10, status: -1 })
    await view.findByText('朋友圈举报处理')
    await view.findByText('spam')
    await view.findByText('当前模式：可处理举报')

    await act(async () => {
      fireEvent.change(view.getByLabelText('举报状态筛选'), {
        target: { value: '0' },
      })
      fireEvent.click(view.getByRole('button', { name: '应用筛选' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 10 && call.status === 0)).toBe(true)
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10 && call.status === 0)).toBe(true)
    })

    const pageSizeSelect = view
      .getAllByRole('combobox')
      .find((node) =>
        Array.from((node as HTMLSelectElement).options).some((option) => option.value === '50')
      )

    expect(pageSizeSelect).toBeTruthy()

    await act(async () => {
      fireEvent.change(pageSizeSelect as HTMLSelectElement, {
        target: { value: '50' },
      })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50 && call.status === 0)).toBe(true)
    })

    await act(async () => {
      fireEvent.click(view.getByTitle('驳回举报'))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })
    await flushReactUpdates()

    expect(postCalls[0]).toEqual({
      url: '/moment/report/resolve',
      body: {
        report_id: 701,
        result: 1,
        note: '驳回备注',
      },
    })

    await act(async () => {
      fireEvent.click(view.getByTitle('确认违规'))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(2)
    })
    await flushReactUpdates()

    expect(postCalls[1]).toEqual({
      url: '/moment/report/resolve',
      body: {
        report_id: 701,
        result: 2,
        note: '违规备注',
      },
    })
    expect(promptMessages[0]).toContain('驳回')
    expect(promptMessages[1]).toContain('违规确认')

    await act(async () => {
      fireEvent.click(view.getByTitle('查看动态'))
    })

    await view.findByText('moment-detail-route:9901')
  })

  it('shows read-only mode and disables resolve actions without handle permission', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      if (url === '/moment/report/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                {
                  id: 701,
                  post_id: 9901,
                  reporter_uid: 3001,
                  reason: 'spam',
                  description: 'contains ad links',
                  status: 0,
                  handled_by: '',
                  handled_at: null,
                  created_at: '2026-02-26 08:00:00',
                  updated_at: '2026-02-26 08:00:00',
                },
              ],
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

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const view = renderMomentReportPage({ allowed: false, loading: false })

    await view.findByText('朋友圈举报处理')
    await waitFor(() => {
      expect(
        view.getByText((_, node) => node?.textContent === '当前模式：只读查看')
      ).toBeTruthy()
    })

    const rejectButton = view.getByTitle('驳回举报') as HTMLButtonElement
    const confirmButton = view.getByTitle('确认违规') as HTMLButtonElement
    const selectCheckbox = view.getByLabelText('选择举报 701') as HTMLInputElement

    expect(rejectButton.disabled).toBe(true)
    expect(confirmButton.disabled).toBe(true)
    expect(selectCheckbox.disabled).toBe(true)
    expect(view.queryByRole('button', { name: /批量驳回/ })).toBeNull()

    await act(async () => {
      fireEvent.click(rejectButton)
      fireEvent.click(confirmButton)
    })

    expect(postCalls.length).toBe(0)
  })

  it('supports keyboard shortcuts for focus switch and quick resolve', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const promptMessages: string[] = []

    mutableClient.get = async (url: string) => {
      if (url === '/moment/report/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                {
                  id: 701,
                  post_id: 9901,
                  reporter_uid: 3001,
                  reason: 'spam',
                  description: 'contains ad links',
                  status: 0,
                  handled_by: '',
                  handled_at: null,
                  created_at: '2026-02-26 08:00:00',
                  updated_at: '2026-02-26 08:00:00',
                },
                {
                  id: 702,
                  post_id: 9902,
                  reporter_uid: 3002,
                  reason: 'abuse',
                  description: 'abusive words',
                  status: 0,
                  handled_by: '',
                  handled_at: null,
                  created_at: '2026-02-26 08:02:00',
                  updated_at: '2026-02-26 08:02:00',
                },
              ],
              page: 1,
              size: 10,
              total: 2,
              total_pages: 1,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    window.prompt = (message?: string) => {
      const text = String(message ?? '')
      promptMessages.push(text)
      return promptMessages.length === 1 ? '快捷驳回备注' : '快捷违规备注'
    }

    const view = renderMomentReportPage({ allowed: true, loading: false })

    await view.findByText('朋友圈举报处理')
    await waitFor(() => {
      expect(view.getByText('当前焦点：#701')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'j' })
    })

    await waitFor(() => {
      expect(view.getByText('当前焦点：#702')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k' })
    })

    await waitFor(() => {
      expect(view.getByText('当前焦点：#701')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'r' })
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })
    await flushReactUpdates()

    expect(postCalls[0]).toEqual({
      url: '/moment/report/resolve',
      body: {
        report_id: 701,
        result: 1,
        note: '快捷驳回备注',
      },
    })

    await waitFor(() => {
      expect(view.getByText('当前焦点：#702')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'v' })
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(2)
    })
    await flushReactUpdates()

    expect(postCalls[1]).toEqual({
      url: '/moment/report/resolve',
      body: {
        report_id: 702,
        result: 2,
        note: '快捷违规备注',
      },
    })

    expect(promptMessages[0]).toContain('驳回')
    expect(promptMessages[1]).toContain('违规确认')
  })
})
