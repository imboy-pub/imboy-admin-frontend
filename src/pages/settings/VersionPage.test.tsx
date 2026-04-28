import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VersionPage } from './VersionPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const versionFixture = {
  id: '1001',
  version: '1.2.3',
  platform: 'ios',
  download_url: 'https://example.com/app.ipa',
  force_update: false,
  description: 'version description',
  status: 1,
  created_at: '2026-01-10 08:00:00',
  updated_at: '2026-01-10 08:00:00',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/versions']}>
        <Routes>
          <Route path="/settings/versions" element={<VersionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('VersionPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays version list', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/app_version/index') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [versionFixture],
              page: 1, size: 50, total: 1, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('版本管理')
      expect(view.container.textContent).toContain('1.2.3')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载版本数据失败')
    })
  })

  it('shows empty state with create prompt when no versions', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/app_version/index') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 50, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('版本管理')
      expect(view.container.textContent).toContain('新建版本')
    })
  })
})
