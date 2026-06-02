import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupCategoryManagePage } from './GroupCategoryManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const groupDetailFixture = {
  id: '55',
  title: 'test-group',
  owner_uid: '9001',
  member_count: 3,
  type: 1,
  status: 1,
  created_at: '2026-01-01 00:00:00',
}

const categoryFixture = {
  id: '301',
  category_name: 'test-category-name',
  sort_order: 1,
}

function renderPage(gid = '55') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/categories`]}>
        <Routes>
          <Route path="/groups/:id/categories" element={<GroupCategoryManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupCategoryManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads group detail and then displays categories', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/detail') {
        return { data: { code: 0, msg: 'ok', payload: groupDetailFixture } }
      }
      if (url === '/group/category/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [categoryFixture],
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
      expect(view.container.textContent).toContain('群分组分类管理')
    })
  })

  it('shows error when categories API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/detail') {
        return { data: { code: 0, msg: 'ok', payload: groupDetailFixture } }
      }
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群分组分类失败')
    })
  })

  it('shows UID prompt when no target uid is entered', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } },
    })

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群分组分类管理')
      // Requires UID input before fetching
      expect(view.container.textContent).toContain('目标用户')
    })
  })
})
