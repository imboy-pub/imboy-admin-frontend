import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupFileManagePage } from './GroupFileManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const fileFixture = {
  id: '101',
  group_id: '33',
  file_id: 'file-001',
  file_name: 'test-file-name.pdf',
  file_category: 'document',
  file_size: 1024,
  download_count: 2,
  status: 1,
  created_at: '2026-01-10 08:00:00',
}

function renderPage(gid = '33') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/files`]}>
        <Routes>
          <Route path="/groups/:id/files" element={<GroupFileManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupFileManagePage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays group files', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/file/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [fileFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群文件管理')
      expect(view.container.textContent).toContain('test-file-name.pdf')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群文件数据失败')
    })
  })

  it('shows empty state when no files exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/file/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无数据')
    })
  })
})
