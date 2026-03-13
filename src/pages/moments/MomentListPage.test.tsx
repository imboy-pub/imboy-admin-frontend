import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { MomentListPage } from './MomentListPage'
import client from '../../services/api/client'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

type MomentListCall = {
  page: number
  size: number
  status: number
  keyword?: string
  uid?: string
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function MomentRouteProbe({ prefix }: { prefix: string }) {
  const { id = '' } = useParams()
  return <div>{prefix}:{id}</div>
}

function renderMomentListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/moments']}>
        <Routes>
          <Route path="/moments" element={<MomentListPage />} />
          <Route path="/moments/:id" element={<MomentRouteProbe prefix="moment-detail-route" />} />
          <Route path="/moments/reports" element={<div>moment-reports-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MomentListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('covers load, search, delete, pagination and report navigation', async () => {
    const getCalls: MomentListCall[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/moment/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const status = Number(config?.params?.status ?? -2)
      const keyword =
        typeof config?.params?.keyword === 'string' && config.params.keyword.length > 0
          ? String(config.params.keyword)
          : undefined
      const uid =
        typeof config?.params?.uid === 'string' && config.params.uid.length > 0
          ? String(config.params.uid)
          : undefined

      getCalls.push({ page, size, status, keyword, uid })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: 9001,
                author_uid: uid ?? 3001,
                content: `moment-${keyword ?? 'default'}-${page}`,
                media: [],
                visibility: 0,
                allow_comment: true,
                stats: {
                  like_count: 2,
                  comment_count: 1,
                },
                status: 1,
                created_at: '2026-02-28 10:00:00',
                updated_at: '2026-02-28 10:00:00',
              },
            ],
            page,
            size,
            total: 22,
            total_pages: Math.ceil(22 / size),
          },
        },
      }
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

    const user = userEvent.setup()
    const view = renderMomentListPage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10, status: -2, keyword: undefined, uid: undefined })
    await view.findByText('朋友圈治理')
    await view.findByText('moment-default-1')

    const keywordInput = view.getByPlaceholderText('搜索动态内容...') as HTMLInputElement
    const uidInput = view.getByPlaceholderText('作者 UID（可选）') as HTMLInputElement

    await user.clear(keywordInput)
    await user.type(keywordInput, 'alpha')
    await user.clear(uidInput)
    await user.type(uidInput, '3011')

    await waitFor(() => {
      expect((view.getByPlaceholderText('搜索动态内容...') as HTMLInputElement).value).toBe('alpha')
      expect((view.getByPlaceholderText('作者 UID（可选）') as HTMLInputElement).value).toBe('3011')
    })

    await user.click(view.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 &&
            call.size === 10 &&
            call.status === -2 &&
            call.keyword === 'alpha' &&
            call.uid === '3011'
        )
      ).toBe(true)
    })

    await view.findByText('moment-alpha-1')

    await act(async () => {
      fireEvent.click(view.getByTitle('删除动态'))
    })

    await view.findByText('确认删除动态')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })

    expect(postCalls[0]).toEqual({
      url: '/moment/delete',
      body: {
        moment_id: 9001,
        reason: 'admin_delete',
      },
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    await act(async () => {
      fireEvent.change(view.getByRole('combobox'), {
        target: { value: '50' },
      })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50)).toBe(true)
    })

    await act(async () => {
      fireEvent.click(view.getByTitle('举报处理'))
    })

    await view.findByText('moment-reports-route')
  })
})
