import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { ChannelListPage } from '@/modules/channels'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  delete: AnyFn
}

type ChannelListCall = {
  page: number
  size: number
  status: number
  keyword?: string
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalDelete = mutableClient.delete

function RouteProbe({ prefix }: { prefix: string }) {
  const { id = '' } = useParams()
  return <div>{prefix}:{id}</div>
}

function renderChannelListPage() {
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
      <MemoryRouter initialEntries={['/channels']}>
        <Routes>
          <Route path="/channels" element={<ChannelListPage />} />
          <Route path="/channels/:id" element={<RouteProbe prefix="channel-detail-route" />} />
          <Route path="/channels/:id/messages" element={<RouteProbe prefix="channel-messages-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('covers load, search, delete, pagination and message navigation', async () => {
    const getCalls: ChannelListCall[] = []
    const deleteCalls: Array<{ url: string; data?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const status = Number(config?.params?.status ?? -1)
      const keyword =
        typeof config?.params?.keyword === 'string' && config.params.keyword.length > 0
          ? String(config.params.keyword)
          : undefined

      getCalls.push({ page, size, status, keyword })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: 8,
                name: `channel-${keyword ?? 'default'}-${page}`,
                type: 0,
                owner_id: 1001,
                custom_id: 'tech_news',
                description: 'desc',
                avatar: 'https://i.imboy.pub/channel/flutter_dev.png',
                subscriber_count: 12,
                status: 1,
                created_at: '2026-02-28 10:00:00',
                updated_at: '2026-02-28 10:00:00',
              },
            ],
            page,
            size,
            total: 26,
            total_pages: Math.ceil(26 / size),
          },
        },
      }
    }

    mutableClient.delete = async (url: string, config?: { data?: Record<string, unknown> }) => {
      deleteCalls.push({ url, data: config?.data })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const user = userEvent.setup()
    let view: ReturnType<typeof renderChannelListPage>
    await act(async () => {
      view = renderChannelListPage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10, status: -1, keyword: undefined })
    await waitFor(() => {
      expect(view.container.textContent).toContain('频道管理')
      expect(view.container.textContent).toContain('channel-default-1')
    })
    await waitFor(() => {
      expect(view.getAllByTestId('channel-avatar-fallback').length).toBeGreaterThan(0)
    })
    expect(view.queryByTestId('channel-avatar-image')).toBeNull()

    const keywordInput = view.getByPlaceholderText('搜索频道名称...') as HTMLInputElement

    await user.clear(keywordInput)
    await user.type(keywordInput, 'alpha')

    await waitFor(() => {
      expect((view.getByPlaceholderText('搜索频道名称...') as HTMLInputElement).value).toBe('alpha')
    })

    await user.click(view.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 10 && call.keyword === 'alpha')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('channel-alpha-1')
    })

    await act(async () => {
      const deleteButtons = view.getAllByTitle('删除频道')
      fireEvent.click(deleteButtons[deleteButtons.length - 1])
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认删除频道')
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
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toEqual({
      url: '/channel/delete',
      data: { id: 8 },
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    await act(async () => {
      const pageSizeSelect = view
        .getAllByRole('combobox')
        .find((element) =>
          Array.from((element as HTMLSelectElement).options).some((option) => option.value === '50')
        )

      if (!pageSizeSelect) {
        throw new Error('未找到分页大小下拉框')
      }

      fireEvent.change(pageSizeSelect, {
        target: { value: '50' },
      })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50)).toBe(true)
    })

    await act(async () => {
      const messageButtons = view.getAllByTitle('消息治理')
      fireEvent.click(messageButtons[messageButtons.length - 1])
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('channel-messages-route:8')
    })
  })
})
