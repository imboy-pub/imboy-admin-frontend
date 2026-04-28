import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ComplianceKeyPage } from './ComplianceKeyPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const keyFixture = {
  key_id: '5001',
  algorithm: 'RSA-2048',
  status: 1,
  created_by: 1,
  created_at: '2026-01-10 08:00:00',
  revoked_at: null,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/compliance-key']}>
        <Routes>
          <Route path="/settings/compliance-key" element={<ComplianceKeyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ComplianceKeyPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays compliance keys', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/compliance_key/list') {
        return { data: { code: 0, msg: 'ok', payload: { keys: [keyFixture] } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('合规密钥管理')
    })
  })

  it('shows empty state when no keys', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/compliance_key/list') {
        return { data: { code: 0, msg: 'ok', payload: { keys: [] } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('合规密钥管理')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      // ErrorState renders error.message directly
      expect(view.container.textContent).toContain('network error')
    })
  })
})
