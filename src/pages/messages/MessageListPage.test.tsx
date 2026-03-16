import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { MessageListPage } from '@/modules/messages'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
}

type MessageListCall = {
  page: number
  size: number
  msg_scope: string
  uid?: string
  conversation?: string
  keyword?: string
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderMessageListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route path="/messages" element={<MessageListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function createMockMessageItem(suffix: string, scope: string = 'c2c') {
  return {
    scope,
    msg_id: `msg-${suffix}`,
    from_id: 1001,
    to_id: 2001,
    msg_type: 'text',
    action: 'send',
    payload: '{"content": "hello world"}',
    created_at: '2026-03-15 10:00:00',
    server_ts: '2026-03-15 10:00:00',
  }
}

describe('MessageListPage flow', () => {
  let clipboardWriteMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    clipboardWriteMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: clipboardWriteMock,
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
    vi.restoreAllMocks()
  })

  it('covers load, search, pagination and detail drawer', async () => {
    const getCalls: MessageListCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/message/list') {
        const page = Number(config?.params?.page ?? 1)
        const size = Number(config?.params?.size ?? 10)
        const msg_scope = String(config?.params?.msg_scope ?? 'all')
        const uid =
          config?.params?.uid !== undefined && String(config.params.uid).length > 0
            ? String(config.params.uid)
            : undefined
        const conversation =
          config?.params?.conversation !== undefined && String(config.params.conversation).length > 0
            ? String(config.params.conversation)
            : undefined
        const keyword =
          config?.params?.keyword !== undefined && String(config.params.keyword).length > 0
            ? String(config.params.keyword)
            : undefined

        getCalls.push({ page, size, msg_scope, uid, conversation, keyword })

        const keywordForDisplay = keyword ?? 'default'

        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [createMockMessageItem(keywordForDisplay, msg_scope === 'all' ? 'c2c' : msg_scope)],
              page,
              size,
              total: 45,
              total_pages: Math.ceil(45 / size),
            },
          },
        }
      }

      if (url === '/message/detail') {
        const msgId = String(config?.params?.msg_id ?? 'unknown')
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              scope: 'c2c',
              msg_id: msgId,
              from_id: 1001,
              to_id: 2001,
              msg_type: 'text',
              action: 'send',
              payload: '{"content": "detail content here"}',
              created_at: '2026-03-15 10:00:00',
              server_ts: '2026-03-15 10:00:00',
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    const user = userEvent.setup()
    const view = renderMessageListPage()

    // 1. 初始加载列表
    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({
      page: 1,
      size: 10,
      msg_scope: 'all',
      uid: undefined,
      conversation: undefined,
      keyword: undefined,
    })
    await view.findByText('消息管理')
    await view.findByText('msg-default')

    // 2. 基于 scope/uid/conversation/keyword 的查询触发
    const scopeSelect = view.container.querySelector('select') as HTMLSelectElement
    const uidInput = view.getByPlaceholderText('UID') as HTMLInputElement
    const conversationInput = view.getByPlaceholderText('会话(12:34 或 7)') as HTMLInputElement
    const keywordInput = view.getByPlaceholderText('关键词(匹配 payload)') as HTMLInputElement

    await user.selectOptions(scopeSelect, 'c2c')
    await user.clear(uidInput)
    await user.type(uidInput, '1001')
    await user.clear(conversationInput)
    await user.type(conversationInput, '12:34')
    await user.clear(keywordInput)
    await user.type(keywordInput, 'alpha')

    await waitFor(() => {
      expect((view.getByPlaceholderText('UID') as HTMLInputElement).value).toBe('1001')
      expect((view.getByPlaceholderText('会话(12:34 或 7)') as HTMLInputElement).value).toBe('12:34')
      expect((view.getByPlaceholderText('关键词(匹配 payload)') as HTMLInputElement).value).toBe('alpha')
    })

    await user.click(view.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(
        getCalls.some(
          (call) =>
            call.page === 1 &&
            call.msg_scope === 'c2c' &&
            call.uid === '1001' &&
            call.conversation === '12:34' &&
            call.keyword === 'alpha'
        )
      ).toBe(true)
    })

    await view.findByText('msg-alpha')

    // 3. 分页 - 下一页
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    // 4. 分页 - page size 变化
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

    // 5. 打开消息详情抽屉
    await act(async () => {
      fireEvent.click(view.getByTitle('查看详情'))
    })

    await view.findByText('消息详情')
  })

  it('covers copy row JSON action', async () => {
    const getCalls: MessageListCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/message/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const msg_scope = String(config?.params?.msg_scope ?? 'all')

      getCalls.push({ page, size, msg_scope })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                scope: 'c2g',
                msg_id: 'msg-copy-test',
                from_id: 3001,
                to_id: 4001,
                msg_type: 'image',
                action: 'send',
                payload: '{"url": "https://example.com/img.png"}',
                created_at: '2026-03-15 11:00:00',
                server_ts: '2026-03-15 11:00:00',
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

    const view = renderMessageListPage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    await view.findByText('msg-copy-test')

    // 点击复制整行JSON按钮
    await act(async () => {
      fireEvent.click(view.getByTitle('复制整行JSON'))
    })

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalled()
      const copiedText = clipboardWriteMock.mock.calls[0][0]
      expect(copiedText).toContain('msg-copy-test')
      expect(copiedText).toContain('c2g')
    })
  })

  it('covers CSV export with mocked fetch and URL.createObjectURL', async () => {
    const getCalls: MessageListCall[] = []

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalFetch = global.fetch

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['mock,csv,data'], { type: 'text/csv' }),
    })

    URL.createObjectURL = createObjectURLMock
    URL.revokeObjectURL = revokeObjectURLMock
    global.fetch = fetchMock as typeof fetch

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/message/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      const msg_scope = String(config?.params?.msg_scope ?? 'all')

      getCalls.push({ page, size, msg_scope })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                scope: 'c2c',
                msg_id: 'msg-export-test',
                from_id: 1001,
                to_id: 2001,
                msg_type: 'text',
                action: 'send',
                payload: 'export test',
                created_at: '2026-03-15 10:00:00',
                server_ts: '2026-03-15 10:00:00',
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

    const view = renderMessageListPage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    await view.findByText('msg-export-test')

    // 点击导出按钮
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '导出全部 CSV' }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      expect(createObjectURLMock).toHaveBeenCalled()
    })

    // 恢复原始函数
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    global.fetch = originalFetch
  })
})
