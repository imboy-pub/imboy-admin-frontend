import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { GroupMemberManagePage } from './GroupMemberManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function GroupRouteProbe() {
  const { id = '' } = useParams()
  return <div>group-detail-route:{id}</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groups/42/members']}>
        <Routes>
          <Route path="/groups/:id/members" element={<GroupMemberManagePage />} />
          <Route path="/groups/:id" element={<GroupRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const memberFixture = {
  id: 1001,
  group_id: 42,
  user_id: 9001,
  nickname: 'alice',
  avatar: '',
  role: 3,
  status: 1,
  joined_at: '2026-01-10 08:00:00',
}

describe('GroupMemberManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays group members', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })

      if (url === '/group/members') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [memberFixture],
              page: 1,
              size: 10,
              total: 1,
              total_pages: 1,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/group/members')).toBe(true)
    })

    // Verify gid parameter is passed correctly
    expect(getCalls.find((c) => c.url === '/group/members')?.params).toMatchObject({ gid: '42' })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组成员')
      expect(view.container.textContent).toContain('alice')
      expect(view.container.textContent).toContain('成员') // role label
    })
  })

  it('shows owner and admin role labels correctly', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/members') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                { ...memberFixture, id: 1001, user_id: 9001, role: 1, nickname: 'owner-user' },
                { ...memberFixture, id: 1002, user_id: 9002, role: 2, nickname: 'admin-user' },
                { ...memberFixture, id: 1003, user_id: 9003, role: 3, nickname: 'member-user' },
              ],
              page: 1, size: 10, total: 3, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('owner-user')
      expect(view.container.textContent).toContain('群主')
      expect(view.container.textContent).toContain('admin-user')
      expect(view.container.textContent).toContain('管理员')
      expect(view.container.textContent).toContain('member-user')
    })
  })

  it('shows empty state with total 0', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/members') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组成员')
      expect(view.container.textContent).toContain('0 人')
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
      expect(view.container.textContent).toContain('加载群组成员失败')
    })
  })

  it('navigates back to group detail on back button click', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/group/members') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { items: [memberFixture], page: 1, size: 10, total: 1, total_pages: 1 },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群组成员')
    })

    await act(async () => {
      const backButton = view.getByRole('button', { name: '返回群组详情' })
      backButton.click()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('group-detail-route:42')
    })
  })
})
