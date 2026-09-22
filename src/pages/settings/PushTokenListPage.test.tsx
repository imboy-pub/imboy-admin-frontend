import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PushTokenListPage } from './PushTokenListPage'
import client from '../../services/api/client'
import { readFileSync } from 'node:fs'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

/** 合成探针：**不是**任何真实设备凭据（FULL-04 追加必修项）。 */
const PROBE_TOKEN = 'SYNTHETIC-PUSH-TOKEN-PROBE-0001-not-a-real-device-credential'

const tokenFixtures = [
  {
    user_id: '9001',
    device_id: 'device-android-001',
    device_type: 'phone',
    platform: 'android',
    token: 'push-token-android-abc123',
    created_at: '2026-01-10 08:00:00',
    updated_at: '2026-01-10 08:00:00',
  },
  {
    user_id: '9002',
    device_id: 'device-ios-002',
    device_type: 'tablet',
    platform: 'ios',
    token: 'push-token-ios-xyz789',
    created_at: '2026-01-11 09:00:00',
    updated_at: '2026-01-11 09:00:00',
  },
]

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/push-tokens']}>
        <Routes>
          <Route path="/settings/push-tokens" element={<PushTokenListPage />} />
          <Route path="/settings" element={<div>settings-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PushTokenListPage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays token list with stats', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/push_token/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              list: tokenFixtures,
              page: 1, size: 10, total: 2,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('推送 Token 管理')
      expect(text).toContain('Token 总数')
      expect(text).toContain('Android')
      expect(text).toContain('iOS')
      expect(text).toContain('9001')
      expect(text).toContain('9002')
      expect(text).toContain('android')
      expect(text).toContain('ios')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('network error')
    })
  })

  it('filters list by search text client-side', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/push_token/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: { list: tokenFixtures, page: 1, size: 10, total: 2 },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('9001')
      expect(view.container.textContent).toContain('9002')
    })

    const user = userEvent.setup()
    const input = view.getByPlaceholderText('搜索本页用户 ID、设备类型、平台...') as HTMLInputElement

    await user.clear(input)
    await user.type(input, '9001')

    await waitFor(() => {
      expect((view.getByPlaceholderText('搜索本页用户 ID、设备类型、平台...') as HTMLInputElement).value).toBe('9001')
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('9001')
      // 9002 should be filtered out from the table
      const tableBody = view.container.querySelector('tbody')
      expect(tableBody?.textContent).not.toContain('9002')
    })
  })

  it('明文 token 永不进入 DOM / 属性（负例探针：后端仍回传 token 也不回显）', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/push_token/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              list: [{ ...tokenFixtures[0], token: PROBE_TOKEN }],
              page: 1, size: 10, total: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('9001')
    })

    // 1) 正文零命中
    expect(view.container.textContent ?? '').not.toContain(PROBE_TOKEN)
    // 2) 连明文片段也不得出现（截断展示同样是泄漏面）
    expect(view.container.textContent ?? '').not.toContain(PROBE_TOKEN.slice(0, 20))
    // 3) HTML 源（含 title / data-* 属性）零命中
    const html = view.container.innerHTML
    expect(html.indexOf(PROBE_TOKEN)).toBe(-1)
    expect(html).not.toContain(PROBE_TOKEN.slice(0, 20))
    // 4) 页面上任何元素的 title 属性都不得含明文
    const titled = Array.from(view.container.querySelectorAll('[title]'))
      .map((node) => node.getAttribute('title') ?? '')
      .join('|')
    expect(titled).not.toContain(PROBE_TOKEN)
    // 5) 只展示不可逆指纹（md5 前 8 位 + 原长）
    expect(view.container.textContent ?? '').toContain(`:${PROBE_TOKEN.length}`)
    expect(view.container.textContent ?? '').toContain('指纹')
  })

  it('页面源码不再引用明文 token 字段或截断展示函数（源码级断言）', async () => {
    const source = readFileSync(new URL('./PushTokenListPage.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('truncateToken')
    expect(source).not.toMatch(/item\.token\b/)
    expect(source).not.toContain('title={item.token}')
    expect(source).toContain('token_fingerprint')
  })
})
