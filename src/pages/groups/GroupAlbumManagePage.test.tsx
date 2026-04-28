import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupAlbumManagePage } from './GroupAlbumManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const albumFixture = {
  id: '201',
  group_id: '44',
  album_id: 'alb-001',
  album_name: 'test-album-name',
  photo_count: 5,
  status: 1,
  created_at: '2026-01-10 08:00:00',
}

function renderPage(gid = '44') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/albums`]}>
        <Routes>
          <Route path="/groups/:id/albums" element={<GroupAlbumManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupAlbumManagePage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays group albums', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/album/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [albumFixture],
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
      expect(view.container.textContent).toContain('群相册管理')
      expect(view.container.textContent).toContain('test-album-name')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群相册数据失败')
    })
  })

  it('shows empty state when no albums exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/album/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群相册管理')
      expect(view.container.textContent).toContain('暂无数据')
    })
  })
})
