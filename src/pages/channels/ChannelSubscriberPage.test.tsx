import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelSubscriberPage } from './ChannelSubscriberPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  delete: AnyFn
}

type SubscriberApiCall = {
  page: number
  size: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalDelete = mutableClient.delete

function renderChannelSubscriberPage() {
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
      <MemoryRouter initialEntries={['/channels/8/subscribers']}>
        <Routes>
          <Route path="/channels/:id/subscribers" element={<ChannelSubscriberPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelSubscriberPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('covers load, remove and pagination interactions', async () => {
    const getCalls: SubscriberApiCall[] = []
    const deleteCalls: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/detail/8/subscribers') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      getCalls.push({ page, size })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: page,
                channel_id: 8,
                user_id: 2001,
                is_pinned: false,
                unread_count: 3,
                last_read_at: '2026-02-22 12:00:00',
                subscribed_at: '2026-02-21 10:00:00',
                user: {
                  id: 2001,
                  nickname: 'sub-user',
                },
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

    mutableClient.delete = async (url: string) => {
      deleteCalls.push(url)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    let view: ReturnType<typeof renderChannelSubscriberPage>
    await act(async () => {
      view = renderChannelSubscriberPage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })
    await waitFor(() => {
      expect(view.container.textContent).toContain('频道订阅者治理')
      expect(view.container.textContent).toContain('sub-user')
    })

    await act(async () => {
      const removeButtons = view.getAllByTitle('移除订阅者')
      fireEvent.click(removeButtons[removeButtons.length - 1])
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认移除订阅者')
    })

    await act(async () => {
      const removeButton = Array.from(view.baseElement.querySelectorAll('button'))
        .find(btn => btn.textContent === '移除')
      if (!removeButton) {
        throw new Error('移除按钮未找到')
      }
      fireEvent.click(removeButton)
    })

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toBe('/channel/detail/8/subscriber/2001')

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
  })
})
