import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { ChannelDetailPage } from './ChannelDetailPage'
import client from '../../services/api/client'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  put: AnyFn
  delete: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

function renderChannelDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8']}>
        <Routes>
          <Route path="/channels/:id" element={<ChannelDetailPage />} />
          <Route path="/channels" element={<div>channels-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.put = originalPut
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('covers detail load, edit save and delete confirm interactions', async () => {
    const getCalls: string[] = []
    const putCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const deleteCalls: Array<{ url: string; data?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      getCalls.push(url)

      if (url === '/channel/detail/8') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              id: 8,
              name: 'channel-8',
              owner_id: 1001,
              custom_id: 'tech_news',
              description: 'tech channel',
              avatar: null,
              type: 0,
              status: 1,
              subscriber_count: 12,
              created_at: '2026-02-28 10:00:00',
              updated_at: '2026-02-28 10:00:00',
            },
          },
        }
      }

      if (url === '/channel/detail/8/stats') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              channel_id: 8,
              subscriber_count: 12,
              total_messages: 200,
              total_views: 300,
              total_reactions: 25,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
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
    const view = renderChannelDetailPage()

    await waitFor(() => {
      expect(getCalls.includes('/channel/detail/8')).toBe(true)
      expect(getCalls.includes('/channel/detail/8/stats')).toBe(true)
    })

    await view.findByText('频道详情')
    await view.findByText('channel-8')

    await user.click(view.getByRole('button', { name: '编辑频道' }))

    const nameInput = view.getByLabelText('频道名称') as HTMLInputElement
    expect(nameInput.value).toBe('channel-8')

    await user.clear(nameInput)
    await user.type(nameInput, 'channel-8-new')

    await waitFor(() => {
      expect((view.getByLabelText('频道名称') as HTMLInputElement).value).toBe('channel-8-new')
    })

    await user.click(view.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(putCalls.length).toBe(1)
    })

    expect(putCalls[0].url).toBe('/channel/detail/8')
    expect(putCalls[0].body.name).toBe('channel-8-new')

    await waitFor(() => {
      expect(view.getByRole('button', { name: '删除频道' })).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除频道' }))
    })

    await view.findByText('确认删除频道')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toEqual({
      url: '/channel/delete',
      data: { id: '8' },
    })

    await view.findByText('channels-route')
  })
})
