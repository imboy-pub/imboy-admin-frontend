import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { GroupTagManagePage } from './GroupTagManagePage'
import client from '../../services/api/client'
import { useAuthStore } from '../../stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

function GroupRouteProbe() {
  const { id = '' } = useParams()
  return <div>group-detail-route:{id}</div>
}

function renderGroupTagManagePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groups/88/tags']}>
        <Routes>
          <Route path="/groups/:id/tags" element={<GroupTagManagePage />} />
          <Route path="/groups/:id" element={<GroupRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupTagManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useAuthStore.getState().setAdmin({
      id: 'admin-1',
      account: 'admin',
      nickname: 'admin',
      avatar: '',
      role_id: 1,
      login_count: 1,
      last_login_ip: '127.0.0.1',
      last_login_at: '2026-02-28 10:00:00',
      status: 1,
      created_at: '2026-02-28 10:00:00',
    })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    useAuthStore.getState().logout()
    cleanup()
  })

  it('covers load, delete and back navigation interactions', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })

      if (url === '/group/tag/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                {
                  id: 100,
                  group_id: 88,
                  tag_name: 'tag-a',
                  created_by: 3001,
                  created_at: '2026-02-28 10:00:00',
                },
              ],
              total: 1,
            },
          },
        }
      }

      if (url === '/rbac/me') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              role_id: 1,
              role_ids: [1],
              role_name: 'super_admin',
              permissions: ['groups:tag:delete'],
              menu_paths: ['/groups/:id/tags'],
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
          rbac: {
            roles: [
              {
                id: 1,
                name: 'super_admin',
                description: 'all',
                permissions: ['groups:tag:delete'],
              },
            ],
          },
        }),
      } as Response
    }

    const view = renderGroupTagManagePage()

    await waitFor(() => {
      expect(getCalls.some((call) => call.url === '/group/tag/list')).toBe(true)
    })

    expect(getCalls.find((call) => call.url === '/group/tag/list')?.params).toEqual({ gid: '88' })

    await view.findByText('群标签管理')
    await view.findByText('tag-a')

    await act(async () => {
      fireEvent.click(view.getByTitle('删除标签'))
    })

    await view.findByText('确认删除标签')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })

    expect(postCalls[0]).toEqual({
      url: '/group/tag/delete',
      body: {
        gid: '88',
        tag_name: 'tag-a',
      },
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '返回群详情' }))
    })

    await view.findByText('group-detail-route:88')
  })
})
