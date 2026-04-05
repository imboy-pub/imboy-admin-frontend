import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import client from '../../services/api/client'
import { UserTagManagePage } from './UserTagManagePage'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

type TagListCall = {
  page: number
  size: number
  uid: string
  scene: string
  keyword?: string
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function UserRouteProbe() {
  const { id = '' } = useParams()
  return <div>user-detail-route:{id}</div>
}

function renderUserTagManagePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/users/88/tags']}>
        <Routes>
          <Route path="/users/:id/tags" element={<UserTagManagePage />} />
          <Route path="/users/:id" element={<UserRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UserTagManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('covers load, search, scene switch, delete and pagination interactions', async () => {
    const getCalls: TagListCall[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/user/tag/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const uid = String(config?.params?.uid ?? '')
      const scene = String(config?.params?.scene ?? 'friend')
      const keyword =
        typeof config?.params?.keyword === 'string' && config.params.keyword.length > 0
          ? String(config.params.keyword)
          : undefined

      getCalls.push({ page, size, uid, scene, keyword })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: scene === 'collect' ? 201 : 101,
                creator_user_id: 88,
                scene: scene === 'collect' ? 1 : 2,
                name: `tag-${scene}-${keyword ?? 'default'}-${page}`,
                subtitle: keyword ? `sub-${keyword}` : '',
                created_at: '2026-03-01 10:00:00',
                updated_at: '2026-03-01 10:00:00',
              },
            ],
            page,
            size,
            total: 12,
            total_pages: Math.ceil(12 / size),
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
    let view: ReturnType<typeof renderUserTagManagePage>
    await act(async () => {
      view = renderUserTagManagePage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({
      page: 1,
      size: 10,
      uid: '88',
      scene: 'friend',
      keyword: undefined,
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('用户标签治理')
      expect(view.container.textContent).toContain('tag-friend-default-1')
    })

    const keywordInput = view.getByPlaceholderText('搜索标签名/副标题...') as HTMLInputElement
    await user.clear(keywordInput)
    await user.type(keywordInput, 'alpha')
    await user.click(view.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 &&
            call.size === 10 &&
            call.uid === '88' &&
            call.scene === 'friend' &&
            call.keyword === 'alpha'
        )
      ).toBe(true)
    })

    await user.click(view.getByRole('button', { name: '收藏标签' }))

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 && call.size === 10 && call.uid === '88' && call.scene === 'collect' && call.keyword === undefined
        )
      ).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('tag-collect-default-1')
    })

    await act(async () => {
      const deleteButtons = view.getAllByTitle('删除标签')
      fireEvent.click(deleteButtons[deleteButtons.length - 1])
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认删除标签')
    })

    await act(async () => {
      const deleteButton = Array.from(view.baseElement.querySelectorAll('button'))
        .find(btn => btn.textContent === '删除')
      if (!deleteButton) {
        throw new Error('删除按钮未找到')
      }
      fireEvent.click(deleteButton)
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })

    expect(postCalls[0]).toEqual({
      url: '/user/tag/delete',
      body: {
        uid: '88',
        scene: 'collect',
        tag: 'tag-collect-default-1',
      },
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10 && call.scene === 'collect')).toBe(true)
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
      expect(getCalls.some((call) => call.page === 1 && call.size === 50 && call.scene === 'collect')).toBe(true)
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '返回用户详情' }))
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('user-detail-route:88')
    })
  })
})
