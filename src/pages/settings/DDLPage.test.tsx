import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DDLPage } from './DDLPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const ddlFixture = {
  id: 1,
  ddl: 'CREATE TABLE test (id INT PRIMARY KEY);',
  down_ddl: 'DROP TABLE test;',
  old_vsn: 0,
  new_vsn: 1,
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
      <MemoryRouter initialEntries={['/settings/ddl']}>
        <Routes>
          <Route path="/settings/ddl" element={<DDLPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DDLPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays DDL list', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/app_ddl/index') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [ddlFixture],
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
      expect(view.container.textContent).toContain('DDL 管理')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载 DDL 数据失败')
    })
  })

  it('shows empty state when no DDL records', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/app_ddl/index') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 50, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('DDL 管理')
    })
  })
})
