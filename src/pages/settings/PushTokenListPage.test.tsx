import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PushTokenListPage } from './PushTokenListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

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
    const input = view.getByPlaceholderText('搜索用户 ID、设备类型、平台...') as HTMLInputElement

    await user.clear(input)
    await user.type(input, '9001')

    await waitFor(() => {
      expect((view.getByPlaceholderText('搜索用户 ID、设备类型、平台...') as HTMLInputElement).value).toBe('9001')
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('9001')
      // 9002 should be filtered out from the table
      const tableBody = view.container.querySelector('tbody')
      expect(tableBody?.textContent).not.toContain('9002')
    })
  })
})
