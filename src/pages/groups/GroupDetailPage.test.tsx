import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupDetailPage } from './GroupDetailPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const groupDetailFixture = {
  id: '42',
  title: 'test-group-title',
  introduction: 'group intro',
  owner_uid: '9001',
  owner: { id: '9001', nickname: 'owner-user', avatar: '' },
  member_count: 5,
  member_max: 500,
  type: 1,
  status: 1,
  join_limit: 0,
  created_at: '2026-01-01 00:00:00',
}

function makeGroupDetailResponse(detail = groupDetailFixture) {
  return { data: { code: 0, msg: 'ok', payload: detail } }
}

function renderPage(gid = '42') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}`]}>
        <Routes>
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/groups" element={<div>groups-list</div>} />
          <Route path="/groups/:id/members" element={<div>members-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays group detail', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/detail') return makeGroupDetailResponse()
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: null } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组详情')
      expect(view.container.textContent).toContain('test-group-title')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: null } }
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群组详情失败')
    })
  })

  it('navigates back to group list when back button is clicked', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/detail') return makeGroupDetailResponse()
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: null } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('test-group-title')
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /返回列表/ }))
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('groups-list')
    })
  })
})
