import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelMessagePage } from './ChannelMessagePage'
import client from '../../services/api/client'
import type { EntityId } from '@/types/common'

type AnyFn = (..._args: unknown[]) => unknown

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

function makeMessage(id: EntityId, page: number, isPinned = false) {
  return {
    id,
    channel_id: 8,
    author_id: 9,
    author_name: 'tester',
    content: `message-page-${page}`,
    msg_type: 'channel_text',
    is_pinned: isPinned,
    view_count: 12,
    created_at: '2026-02-22 10:00:00',
    updated_at: '2026-02-22 10:00:00',
  }
}

function makeGetResponse(page: number, size: number) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: {
        items: [makeMessage(page === 1 ? '101' : '201', page)],
        page,
        size,
        total: 25,
        total_pages: Math.ceil(25 / size),
      },
    },
  }
}

function renderChannelMessagePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
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
    // Default no-op stubs for mutations
    mutableClient.put = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    mutableClient.delete = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.put = originalPut
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('loads messages and displays the page title', async () => {
    const getCalls: MessageApiCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      if (url !== '/channel/8/messages') throw new Error(`unexpected GET url: ${url}`)
      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      getCalls.push({ page, size })
      return makeGetResponse(page, size)
    }

    let view: ReturnType<typeof renderChannelMessagePage>
    await act(async () => {
      view = renderChannelMessagePage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })

    await waitFor(() => {
      expect(view.container.textContent).toContain('频道消息治理')
      expect(view.container.textContent).toContain('message-page-1')
    })
  })

  it('pins a message', async () => {
    const putCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: ['channels:pin'], menu_paths: [] } } }
      }
      if (url !== '/channel/8/messages') throw new Error(`unexpected GET url: ${url}`)
      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      return makeGetResponse(page, size)
    }

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      putCalls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderChannelMessagePage>
    await act(async () => {
      view = renderChannelMessagePage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('message-page-1')
    })

    await act(async () => {
      const pinButtons = view.getAllByTitle('置顶消息')
      fireEvent.click(pinButtons[pinButtons.length - 1])
    })

    await waitFor(() => {
      expect(putCalls.length).toBe(1)
    })

    expect(putCalls[0]).toEqual({
      url: '/channel/8/message/101/pin',
      body: { pinned: true },
    })
  })

  it('deletes a message via confirm dialog', async () => {
    const deleteCalls: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/rbac/me') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              role_id: 1,
              role_ids: [1],
              role_name: 'super_admin',
              permissions: ['channels:delete', 'channels:pin'],
              menu_paths: [],
            },
          },
        }
      }
      if (url !== '/channel/8/messages') throw new Error(`unexpected GET url: ${url}`)
      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      return makeGetResponse(page, size)
    }

    mutableClient.delete = async (url: string) => {
      deleteCalls.push(url)
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderChannelMessagePage>
    await act(async () => {
      view = renderChannelMessagePage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('message-page-1')
    })

    // Click delete button without act() to avoid Radix portal/focus initialization hang
    const deleteButtons = view.getAllByTitle('删除消息')
    fireEvent.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认删除消息')
    })

    const deleteButton = Array.from(view.baseElement.querySelectorAll('button'))
      .find(btn => btn.textContent === '删除')
    if (!deleteButton) throw new Error('删除按钮未找到')
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toBe('/channel/8/message/101/delete')
  })

  it('covers pagination navigation and page size change', async () => {
    const getCalls: MessageApiCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      if (url !== '/channel/8/messages') throw new Error(`unexpected GET url: ${url}`)
      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      getCalls.push({ page, size })
      return makeGetResponse(page, size)
    }

    const view = renderChannelMessagePage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })

    await waitFor(() => {
      expect(view.container.textContent).toContain('频道消息治理')
    })

    // Navigate to next page
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    // Change page size
    await act(async () => {
      const pageSizeSelect = view
        .getAllByRole('combobox')
        .find((element) =>
          Array.from((element as HTMLSelectElement).options).some((option) => option.value === '50')
        )
      if (!pageSizeSelect) throw new Error('未找到分页大小下拉框')
      fireEvent.change(pageSizeSelect, { target: { value: '50' } })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50)).toBe(true)
    })
  })

  it('does not render remote images by default and loads them only on click', async () => {
    const imageUrl = 'https://evil.example.com/pixel.png'

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: 1, role_ids: [1], role_name: 'super_admin', permissions: [], menu_paths: [] } } }
      }
      if (url !== '/channel/8/messages') throw new Error(`unexpected GET url: ${url}`)
      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                ...makeMessage('301', 1),
                content: `check this ${imageUrl} out`,
                msg_type: 'channel_image',
              },
            ],
            page,
            size,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    let view: ReturnType<typeof renderChannelMessagePage>
    await act(async () => {
      view = renderChannelMessagePage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain(imageUrl)
    })

    // 默认不渲染 img（不向作者控制的服务器发请求），仅 URL 文本 + 加载按钮
    expect(view.container.querySelector('img')).toBeNull()
    const loadButtons = view.getAllByRole('button', { name: '加载图片' })
    expect(loadButtons.length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(loadButtons[0])
    })

    const img = view.container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe(imageUrl)
  })
})
