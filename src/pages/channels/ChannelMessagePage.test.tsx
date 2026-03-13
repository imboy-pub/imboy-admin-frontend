import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelMessagePage } from './ChannelMessagePage'
import client from '../../services/api/client'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  put: AnyFn
  delete: AnyFn
}

type MessageApiCall = {
  page: number
  size: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

function renderChannelMessagePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8/messages']}>
        <Routes>
          <Route path="/channels/:id/messages" element={<ChannelMessagePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelMessagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.put = originalPut
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('covers load, pin, delete and pagination interactions', async () => {
    const getCalls: MessageApiCall[] = []
    const putCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const deleteCalls: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/detail/8/messages') {
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
                id: page === 1 ? 101 : 201,
                channel_id: 8,
                author_id: 9,
                author_name: 'tester',
                content: `message-page-${page}`,
                msg_type: 'channel_text',
                is_pinned: page !== 1,
                view_count: 12,
                created_at: '2026-02-22 10:00:00',
                updated_at: '2026-02-22 10:00:00',
              },
            ],
            page,
            size,
            total: 25,
            total_pages: Math.ceil(25 / size),
          },
        },
      }
    }

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      putCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
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

    const view = renderChannelMessagePage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })
    await view.findByText('频道消息治理')
    await view.findByText('message-page-1')

    await act(async () => {
      fireEvent.click(view.getByTitle('置顶消息'))
    })

    await waitFor(() => {
      expect(putCalls.length).toBe(1)
    })

    expect(putCalls[0]).toEqual({
      url: '/channel/detail/8/message/101/pin',
      body: { pinned: true },
    })

    await act(async () => {
      fireEvent.click(view.getByTitle('删除消息'))
    })

    await view.findByText('确认删除消息')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toBe('/channel/detail/8/message/101/delete')

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
  })
})
