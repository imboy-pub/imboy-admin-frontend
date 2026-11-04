// AI 助手管理页测试（TDD：#18 表单扩展字段 + 头像上传 + 分类筛选）
import '../../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import client from '@/services/api/client'
import { AiAgentListPage } from './AiAgentListPage'
import { useAuthStore } from '@/stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const listRow = {
  user_id: '1001',
  nickname: '医生助手',
  avatar: '',
  provider: 'bailian',
  model: 'qwen-flash',
  description: '专业医生',
  visibility: 1,
  status: 1,
  owner_uid: '0',
  category: 'medical',
  created_at: '2026-08-01 10:00:00',
}

const detailFixture = {
  user_id: '1001',
  provider: 'bailian',
  model: 'qwen-flash',
  role_id: 'doctor',
  system_prompt: '你是一名医生',
  owner_uid: '0',
  status: 1,
  description: '专业医生',
  visibility: 1,
  category: 'medical',
  voice_id: 'xiaoyan',
  greeting: '您好，我是您的健康顾问',
  capabilities: '{"knowledge":true,"proactive":false}',
  temperature: 0.7,
}

const envelope = (payload: unknown) => ({ data: { code: 0, msg: 'ok', payload } })

function renderPage(initialEntries = ['/ai_agent']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AiAgentListPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  cleanup()
})

describe('AiAgentListPage 列表与分类筛选', () => {
  it('加载并渲染列表行（含分类）', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.getAllByText('医生助手').length).toBeGreaterThan(0)
    })
  })

  it('分类筛选变化：请求带 category 且页码重置为 1', async () => {
    const listCalls: Array<{ params?: { category?: string; page?: number } }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/ai_agent/list') {
        listCalls.push({ params: config?.params as never })
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0))
    expect(view.getByTestId('category-filter').tagName).toBe('INPUT')

    // 模拟分页切到第 2 页后再筛选，验证筛选重置 page=1
    const user = userEvent.setup()
    await user.type(view.getByTestId('category-filter'), 'medical')

    await waitFor(() => {
      expect(
        listCalls.some(
          ({ params }) => params?.category === 'medical' && params?.page === 1,
        ),
      ).toBe(true)
    })
    expect(view).toBeTruthy()
  })

  it('重置分类筛选：请求回到第 1 页', async () => {
    const listCalls: Array<{ params?: { category?: string; page?: number } }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/ai_agent/list') {
        listCalls.push({ params: config?.params as never })
        return envelope({ list: [listRow], page: 3, size: 10, total: 30 })
      }
      throw new Error('unexpected GET: ' + url)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage(['/ai_agent?page=3&category=medical'])
    })
    await waitFor(() => expect(view.getByText('重置')).toBeTruthy())

    await act(async () => {
      fireEvent.click(view.getByText('重置'))
    })

    await waitFor(() => {
      const last = listCalls[listCalls.length - 1]
      expect(last?.params?.page).toBe(1)
      expect(last?.params?.category).toBeUndefined()
    })
  })
})

describe('AiAgentListPage 编辑对话框扩展字段', () => {
  it('编辑回显角色绑定和身份扩展字段，不提供自由能力输入', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      if (url === '/ai_agent/detail') {
        return envelope(detailFixture)
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('医生助手').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('编辑')[0])
    })

    await waitFor(() => {
      expect((view.getByTestId('f-category') as HTMLInputElement).value).toBe('medical')
      expect((view.getByTestId('f-voice') as HTMLInputElement).value).toBe('xiaoyan')
      expect((view.getByTestId('f-greeting') as HTMLInputElement).value).toBe(
        '您好，我是您的健康顾问'
      )
      expect((view.getByTestId('f-temperature') as HTMLInputElement).value).toBe('0.7')
      expect((view.getByTestId('f-role-id') as HTMLSelectElement).value).toBe('doctor')
      expect(view.queryByTestId('f-capabilities')).toBeNull()
      expect(view.queryByLabelText('角色提示词（system_prompt）')).toBeNull()
    })
  })

  it('保存透传扩展字段（capabilities 转对象）', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      if (url === '/ai_agent/detail') {
        return envelope(detailFixture)
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/update') {
        savedBody = body as Record<string, unknown>
        return envelope({ user_id: '1001' })
      }
      throw new Error(`unexpected POST: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('医生助手').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('编辑')[0])
    })
    await waitFor(() => expect(view.getByTestId('f-greeting')).toBeTruthy())

    // userEvent 触发真实受控 onChange（fireEvent.change/input 不触发受控 state 更新，
    // 见 SSOConfigPage.test.tsx 先例）
    const user = userEvent.setup()
    await user.clear(view.getByTestId('f-greeting'))
    await user.type(view.getByTestId('f-greeting'), '新的问候语')
    await act(async () => {
      fireEvent.click(view.getByText('保存'))
    })

    await waitFor(() => {
      expect(savedBody).toMatchObject({
        user_id: '1001',
        role_id: 'doctor',
        category: 'medical',
        voice_id: 'xiaoyan',
        greeting: '新的问候语',
        temperature: 0.7,
      })
      expect(savedBody?.system_prompt).toBeUndefined()
      expect(savedBody?.capabilities).toBeUndefined()
    })
  })

  it('上传头像成功后表单记录新 URL 并显示预览', async () => {
    localStorage.clear()
    useAuthStore.setState({ isAuthenticated: true, admin: { id: '42' } as never })
    Object.defineProperty(navigator, 'locks', { configurable: true,
      value: { request: async (_name: string, _opts: unknown, run: (_lock: object) => unknown) => run({}) } })
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      if (url === '/ai_agent/detail') {
        return envelope({ ...detailFixture, avatar: 'https://s3.example.com/old.png' })
      }
      throw new Error(`unexpected GET: ${url}`)
    }
    // C08（V3-13）direct-v1：mock avatar_direct 五步会话
    let uploadId = ''
    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/update') {
        savedBody = body as Record<string, unknown>
        return envelope({ user_id: '1001' })
      }
      if (url === '/ai_agent/avatar_direct') {
        const op = (body as { op?: string }).op
        if (op === 'register') {
          uploadId = String((body as Record<string, unknown>).client_upload_id)
          return envelope({ object_key: 'app1001/avatar/a.png', state: 'RESERVED' })
        }
        if (op === 'declare') return envelope({})
        if (op === 'grant') {
          return envelope({
            state: 'GRANTED',
            attempt_id: 1,
            grant: {
              transport: 's3_put',
              url: 'https://s3.invalid/staging/a.png',
              method: 'PUT',
              required_headers: [
                { key: 'Content-Type', value: 'image/png' },
                { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' },
              ],
              expires_in: 3600,
            },
          })
        }
        if (op === 'finalize') return envelope({ state: 'CONFIRMED' })
        if (op === 'publish') return envelope({ public_url: 'https://public.example.com/new-avatar.png' })
        throw new Error(`unexpected avatar_direct op: ${op}`)
      }
      throw new Error(`unexpected POST: ${url}`)
    }
    const originalFetch = globalThis.fetch
    let finishUpload: ((_response: Response) => void) | undefined
    globalThis.fetch = (() => new Promise<Response>((resolve) => { finishUpload = resolve })) as typeof fetch

    try {
      let view: ReturnType<typeof renderPage>
      await act(async () => {
        view = renderPage()
      })
      await waitFor(() => expect(view.getAllByText('医生助手').length).toBeGreaterThan(0))

      await act(async () => {
        fireEvent.click(view.getAllByText('编辑')[0])
      })
      await waitFor(() => expect(view.getByTestId('avatar-input')).toBeTruthy())

      const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
      await act(async () => {
        fireEvent.change(view.getByTestId('avatar-input'), { target: { files: [file] } })
      })

      await waitFor(() => expect(finishUpload).toBeDefined())
      expect((view.getByText('保存') as HTMLButtonElement).disabled).toBeTrue()
      expect((view.getByText('取消') as HTMLButtonElement).disabled).toBeFalse()
      await act(async () => { finishUpload?.(new Response(null, { status: 200 })) })

      await waitFor(() => {
        // 预览图 src 更新为新 URL
        expect((view.getByTestId('avatar-preview') as HTMLImageElement).src).toContain(
          'new-avatar.png'
        )
      })

      // 私桶 403 → onError 回退到本地 blob 预览（不裂图）
      fireEvent.error(view.getByTestId('avatar-preview'))
      await waitFor(() => {
        const img = view.getByTestId('avatar-preview') as HTMLImageElement
        expect(img.src.startsWith('blob:')).toBeTrue()
      })

      await act(async () => {
        fireEvent.click(view.getByText('保存'))
      })
      await waitFor(() => expect(savedBody).toMatchObject({
        avatar: 'https://public.example.com/new-avatar.png',
        avatar_object_key: 'app1001/avatar/a.png',
        avatar_client_upload_id: uploadId,
      }))

    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('取消对话框时中止在途头像上传', async () => {
    localStorage.clear()
    useAuthStore.setState({ isAuthenticated: true, admin: { id: '42' } as never })
    Object.defineProperty(navigator, 'locks', { configurable: true,
      value: { request: async (_name: string, _opts: unknown, run: (_lock: object) => unknown) => run({}) } })
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [listRow], page: 1, size: 10, total: 1 })
      }
      if (url === '/ai_agent/detail') {
        return envelope({ ...detailFixture, avatar: 'https://s3.example.com/old.png' })
      }
      throw new Error(`unexpected GET: ${url}`)
    }
    // C08（V3-13）direct-v1：mock avatar_direct 五步会话
    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/update') {
        savedBody = body as Record<string, unknown>
        return envelope({ user_id: '1001' })
      }
      if (url === '/ai_agent/avatar_direct') {
        const op = (body as { op?: string }).op
        if (op === 'register') {
          return envelope({ object_key: 'app1001/avatar/a.png', state: 'RESERVED' })
        }
        if (op === 'declare') return envelope({})
        if (op === 'grant') {
          return envelope({
            state: 'GRANTED',
            attempt_id: 1,
            grant: {
              transport: 's3_put',
              url: 'https://s3.invalid/staging/a.png',
              method: 'PUT',
              required_headers: [
                { key: 'Content-Type', value: 'image/png' },
                { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' },
              ],
              expires_in: 3600,
            },
          })
        }
        if (op === 'finalize') return envelope({ state: 'CONFIRMED' })
        if (op === 'publish') return envelope({ public_url: 'https://public.example.com/new-avatar.png' })
        throw new Error(`unexpected avatar_direct op: ${op}`)
      }
      throw new Error(`unexpected POST: ${url}`)
    }
    const originalFetch = globalThis.fetch
    let uploadSignal: AbortSignal | undefined
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      uploadSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        uploadSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }) as typeof fetch

    try {
      let view: ReturnType<typeof renderPage>
      await act(async () => {
        view = renderPage()
      })
      await waitFor(() => expect(view.getAllByText('医生助手').length).toBeGreaterThan(0))

      await act(async () => {
        fireEvent.click(view.getAllByText('编辑')[0])
      })
      await waitFor(() => expect(view.getByTestId('avatar-input')).toBeTruthy())

      const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
      await act(async () => {
        fireEvent.change(view.getByTestId('avatar-input'), { target: { files: [file] } })
      })

      await waitFor(() => expect(uploadSignal).toBeDefined())
      expect((view.getByText('保存') as HTMLButtonElement).disabled).toBeTrue()
      await act(async () => { fireEvent.click(view.getByText('取消')) })
      expect(uploadSignal?.aborted).toBeTrue()
      await waitFor(() => expect(view.queryByTestId('avatar-input')).toBeNull())
      expect(savedBody).toBeNull()

    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('旧头像裸 URL 加载失败时降级占位并展示已存 URL', async () => {
    // 编辑回显的 avatar 取自列表行 row.avatar（AiAgentDetail 无 avatar 字段）
    const rowWithAvatar = { ...listRow, avatar: 'https://s3.example.com/old.png' }
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/list') {
        return envelope({ list: [rowWithAvatar], page: 1, size: 10, total: 1 })
      }
      if (url === '/ai_agent/detail') {
        return envelope(detailFixture)
      }
      throw new Error(`unexpected GET: ${url}`)
    }
    mutableClient.post = async (url: string) => {
      throw new Error(`unexpected POST: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('医生助手').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('编辑')[0])
    })
    await waitFor(() => expect(view.getByTestId('avatar-input')).toBeTruthy())

    // 编辑回显首选服务端 URL
    const img = view.getByTestId('avatar-preview') as HTMLImageElement
    expect(img.src).toContain('old.png')

    // 403 失败且无本地 blob → 降级占位符，并以文本展示已保存 URL
    fireEvent.error(img)
    await waitFor(() => expect(view.getByTestId('avatar-preview-fallback').textContent).toBe('不可预览'))
    expect(view.queryByTestId('avatar-preview')).toBeNull()
    expect(view.getByTestId('avatar-url-fallback').textContent).toContain('old.png')
  })
})
