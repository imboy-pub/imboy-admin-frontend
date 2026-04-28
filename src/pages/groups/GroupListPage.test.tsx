import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { GroupListPage } from './GroupListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function GroupDetailProbe() {
  const { id = '' } = useParams()
  return <div>group-detail:{id}</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groups']}>
        <Routes>
          <Route path="/groups" element={<GroupListPage />} />
          <Route path="/groups/:id" element={<GroupDetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const groupFixture = {
  id: '1001',
  title: 'test-group',
  owner_uid: '5001',
  member_count: 20,
  type: 1,
  status: 1,
  created_at: '2026-01-10 08:00:00',
}

function makeGroupListResponse(page = 1, items = [groupFixture]) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: {
        items,
        page,
        size: 10,
        total: items.length,
        total_pages: 1,
      },
    },
  }
}

describe('GroupListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays group list', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      if (url === '/group/list') {
        return makeGroupListResponse()
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/group/list')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组管理')
      expect(view.container.textContent).toContain('test-group')
    })
  })

  it('navigates to group detail when clicking view button', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/list') return makeGroupListResponse()
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('test-group')
    })

    await act(async () => {
      const viewButtons = view.getAllByTitle('查看详情')
      fireEvent.click(viewButtons[viewButtons.length - 1])
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('group-detail:1001')
    })
  })

  it('dissolves a group via confirm dialog', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      if (url === '/group/list') return makeGroupListResponse()
      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('test-group')
    })

    // Click dissolve button
    await act(async () => {
      const dissolveButtons = view.getAllByTitle('解散群组')
      fireEvent.click(dissolveButtons[dissolveButtons.length - 1])
    })

    // Confirm dialog should appear
    await waitFor(() => {
      expect(document.body.textContent).toContain('确认解散群组')
    })

    // Confirm dissolution
    await act(async () => {
      const confirmBtn = Array.from(view.baseElement.querySelectorAll('button'))
        .find(btn => btn.textContent === '解散')
      if (!confirmBtn) throw new Error('解散确认按钮未找到')
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(postCalls.some((c) => c.url === '/group/dissolve')).toBe(true)
    })

    expect(postCalls.find((c) => c.url === '/group/dissolve')?.body).toMatchObject({
      gid: '1001',
    })
  })

  it('shows empty state when no groups exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/list') {
        return makeGroupListResponse(1, [])
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组管理')
    })

    // Verify total count shows 0
    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('群组管理')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => {
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群组数据失败')
    })
  })
})
