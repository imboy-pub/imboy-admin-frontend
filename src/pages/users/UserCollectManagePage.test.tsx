import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import client from '../../services/api/client'
import { UserCollectManagePage } from './UserCollectManagePage'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

type CollectListCall = {
  page: number
  size: number
  uid: string
  kind: number
  keyword?: string
  tag?: string
  order?: string
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function UserRouteProbe() {
  const { id = '' } = useParams()
  return <div>user-detail-route:{id}</div>
}

function renderUserCollectManagePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/users/88/collects']}>
        <Routes>
          <Route path="/users/:id/collects" element={<UserCollectManagePage />} />
          <Route path="/users/:id" element={<UserRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UserCollectManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('covers load, filter, remove and pagination interactions', async () => {
    const getCalls: CollectListCall[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/user/collect/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const uid = String(config?.params?.uid ?? '')
      const kind = Number(config?.params?.kind ?? 0)
      const keyword =
        typeof config?.params?.keyword === 'string' && config.params.keyword.length > 0
          ? String(config.params.keyword)
          : undefined
      const tag =
        typeof config?.params?.tag === 'string' && config.params.tag.length > 0
          ? String(config.params.tag)
          : undefined
      const order =
        typeof config?.params?.order === 'string' && config.params.order.length > 0
          ? String(config.params.order)
          : undefined

      getCalls.push({ page, size, uid, kind, keyword, tag, order })

      const kindForRow = kind > 0 ? kind : 5

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                kind: kindForRow,
                kind_id: `collect-${kindForRow}-${page}`,
                source: `source-${keyword ?? 'default'}-${page}`,
                tag: tag ?? 'tag-a',
                info: {
                  note: `note-${keyword ?? 'default'}`,
                  page,
                },
                created_at: '2026-03-01 10:00:00',
                updated_at: '2026-03-01 10:00:00',
              },
            ],
            page,
            size,
            total: 18,
            total_pages: Math.ceil(18 / size),
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
    const view = renderUserCollectManagePage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({
      page: 1,
      size: 10,
      uid: '88',
      kind: 0,
      keyword: undefined,
      tag: undefined,
      order: 'recent_use',
    })

    await view.findByText('用户收藏治理')
    await view.findByText('source-default-1')

    const keywordInput = view.getByPlaceholderText('搜索 source/remark/info...') as HTMLInputElement
    const tagInput = view.getByPlaceholderText('标签筛选（可选）') as HTMLInputElement

    await user.clear(keywordInput)
    await user.type(keywordInput, 'alpha')

    await user.clear(tagInput)
    await user.type(tagInput, 't1')

    const kindSelect = view.getAllByRole('combobox')[0] as HTMLSelectElement
    await act(async () => {
      fireEvent.change(kindSelect, {
        target: { value: '2' },
      })
    })

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 &&
            call.size === 10 &&
            call.uid === '88' &&
            call.kind === 2 &&
            call.keyword === undefined &&
            call.tag === undefined &&
            call.order === 'recent_use'
        )
      ).toBe(true)
    })

    const searchButton = await view.findByRole('button', { name: '搜索' })
    await user.click(searchButton)

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 &&
            call.size === 10 &&
            call.uid === '88' &&
            call.kind === 2 &&
            call.keyword === 'alpha' &&
            call.tag === 't1' &&
            call.order === 'recent_use'
        )
      ).toBe(true)
    })

    await view.findByText('source-alpha-1')

    await act(async () => {
      fireEvent.click(view.getByTitle('移除收藏'))
    })

    await view.findByText('确认移除收藏')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '移除' }))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })

    expect(postCalls[0]).toEqual({
      url: '/user/collect/remove',
      body: {
        uid: '88',
        kind_id: 'collect-2-1',
      },
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10 && call.kind === 2)).toBe(true)
    })

    const pageSizeSelect = view
      .getAllByRole('combobox')
      .find((node) => (node as HTMLSelectElement).value === '10')
    expect(pageSizeSelect).toBeTruthy()

    await act(async () => {
      fireEvent.change(pageSizeSelect as Element, {
        target: { value: '50' },
      })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50 && call.kind === 2)).toBe(true)
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '返回用户详情' }))
    })

    await view.findByText('user-detail-route:88')
  })
})
