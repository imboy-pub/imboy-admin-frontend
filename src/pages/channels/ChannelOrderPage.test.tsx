import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelOrderPage } from './ChannelOrderPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
}

type OrderApiCall = {
  page: number
  size: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderChannelOrderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8/orders']}>
        <Routes>
          <Route path="/channels/:id/orders" element={<ChannelOrderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelOrderPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('covers load and pagination interactions', async () => {
    const getCalls: OrderApiCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/detail/8/orders') {
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
                user_id: 5001,
                order_no: `CH20260222${page.toString().padStart(4, '0')}`,
                amount: '9.90',
                currency: 'CNY',
                status: 1,
                payment_method: 'wechat',
                payment_no: 'WX20260222001',
                payment_at: '2026-02-22 10:10:00',
                subscription_start_at: '2026-02-22 10:10:00',
                subscription_end_at: '2026-03-22 10:10:00',
                expires_at: '2026-03-22 10:10:00',
                refund_reason: null,
                refund_at: null,
                created_at: '2026-02-22 10:00:00',
                updated_at: '2026-02-22 10:10:00',
                user: {
                  id: 5001,
                  nickname: 'order-user',
                },
              },
            ],
            page,
            size,
            total: 41,
            total_pages: Math.ceil(41 / size),
          },
        },
      }
    }

    const view = renderChannelOrderPage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })
    await view.findByText('频道订单治理')
    await view.findByText('order-user')

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
