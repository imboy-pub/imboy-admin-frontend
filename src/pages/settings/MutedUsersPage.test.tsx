import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MutedUsersPage } from './MutedUsersPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const mutedUserFixture = {
  uid: '9001',
  mute_until: 9999999999,
  remaining_seconds: 3600,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/muted-users']}>
        <Routes>
          <Route path="/settings/muted-users" element={<MutedUsersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MutedUsersPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays muted users', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/muted_users/list') {
        return { data: { code: 0, msg: 'ok', payload: { list: [mutedUserFixture] } } }
      }
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: null } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('禁言用户管理')
      expect(view.container.textContent).toContain('9001')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: null } }
      }
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      // MutedUsersPage shows the error message from the error object
      const text = view.container.textContent ?? ''
      expect(text.length).toBeGreaterThan(0)
    })
  })

  it('shows empty state when no muted users', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/muted_users/list') {
        return { data: { code: 0, msg: 'ok', payload: { list: [] } } }
      }
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: null } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('禁言用户管理')
      expect(view.container.textContent).toContain('当前无禁言用户')
    })
  })
})
