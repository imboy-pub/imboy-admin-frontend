import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { ChannelDetailPage } from './ChannelDetailPage'
import client from '../../services/api/client'
import { useAuthStore } from '@/stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  put: AnyFn
  delete: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete
const originalFetch = globalThis.fetch

// sidebar 兜底 mock：bun 并行执行测试文件，其他文件（如 rbac404）的
// mock.module('@/services/api/rbac') 窗口可能与本文件并发重叠，劫持 rbac
// 主路径；useAdminPermission 随即走 sidebar 模板兜底——真实 fetchSidebarMenuConfig
// 发全局 fetch 且本测试未 mock 时兜底必失败 → 权限拒绝 → 编辑按钮不渲染。
// 页面其余请求走 axios client，全局 fetch 仅服务于 sidebar，可整体替换。
function mockSidebarFetch() {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1.0',
          rbac: {
            roles: [
              {
                id: 1,
                name: 'super_admin',
                description: '',
                permissions: ['channels:read', 'channels:update', 'channels:delete'],
              },
            ],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
}

function renderChannelDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8']}>
        <Routes>
          <Route path="/channels/:id" element={<ChannelDetailPage />} />
          <Route path="/channels" element={<div>channels-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockSidebarFetch()
    // 自持 authStore：权限门 useAdminPermission({ roles: ['1','2'] }) 在 rbac 主路径
    // 被并行文件的 mock.module 劫持（永远 throw）时，effectiveRoleIds 回落
    // authStore.admin.role_id——空 store 会让 roleAllowed 恒 false、按钮不渲染。
    useAuthStore.setState({
      admin: {
        id: '106791271148029952',
        account: 'e2e_admin',
        nickname: 'e2e_admin',
        avatar: '',
        role_id: [1],
        status: 1,
        created_at: 0,
        last_login_at: 0,
        last_login_ip: '',
        login_count: 0,
      },
      isAuthenticated: true,
    })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.put = originalPut
    mutableClient.delete = originalDelete
    globalThis.fetch = originalFetch
    useAuthStore.getState().logout()
    cleanup()
  })

  it('covers detail load, edit save and delete confirm interactions', async () => {
    const getCalls: string[] = []
    const putCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const deleteCalls: Array<{ url: string; data?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      getCalls.push(url)

      if (url === '/rbac/me') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              role_id: 1,
              role_ids: [1],
              role_name: 'super_admin',
              permissions: ['channels:update', 'channels:delete'],
              menu_paths: [],
            },
          },
        }
      }

      if (url === '/channel/detail/8') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              id: 8,
              name: 'channel-8',
              owner_id: 1001,
              custom_id: 'tech_news',
              description: 'tech channel',
              avatar: null,
              type: 0,
              status: 1,
              subscriber_count: 12,
              created_at: '2026-02-28 10:00:00',
              updated_at: '2026-02-28 10:00:00',
            },
          },
        }
      }

      if (url === '/channel/8/stats') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              channel_id: 8,
              subscriber_count: 12,
              total_messages: 200,
              total_views: 300,
              total_reactions: 25,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      putCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    mutableClient.delete = async (url: string, config?: { data?: Record<string, unknown> }) => {
      deleteCalls.push({ url, data: config?.data })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const user = userEvent.setup()
    const view = renderChannelDetailPage()

    await waitFor(() => {
      expect(getCalls.includes('/channel/detail/8')).toBe(true)
      expect(getCalls.includes('/channel/8/stats')).toBe(true)
    })

    await view.findByText('频道详情')
    await view.findByText('channel-8')

    // 等待式查询：编辑按钮受权限门（useAdminPermission 异步判定）控制，套件
    // 全量并行运行时判定可能晚于详情渲染完成——同步 getBy 在此竞态下偶发失败。
    await user.click(await view.findByRole('button', { name: '编辑频道' }))

    const nameInput = view.getByLabelText('频道名称') as HTMLInputElement
    expect(nameInput.value).toBe('channel-8')

    await user.clear(nameInput)
    await user.type(nameInput, 'channel-8-new')

    await waitFor(() => {
      expect((view.getByLabelText('频道名称') as HTMLInputElement).value).toBe('channel-8-new')
    })

    await user.click(view.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(putCalls.length).toBe(1)
    })

    expect(putCalls[0].url).toBe('/channel/detail/8')
    expect(putCalls[0].body.name).toBe('channel-8-new')

    await waitFor(() => {
      expect(view.getByRole('button', { name: '删除频道' })).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除频道' }))
    })

    await view.findByText('确认删除频道')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toEqual({
      url: '/channel/delete',
      data: { id: '8' },
    })

    await view.findByText('channels-route')
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    const view = renderChannelDetailPage()

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载频道详情失败')
    })
  })

  it('displays channel stats from API data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/channel/detail/8') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              id: 8, name: 'channel-8', owner_id: 1001, custom_id: 'tech_news',
              description: 'tech channel', avatar: null, type: 0, status: 1,
              subscriber_count: 12, created_at: '2026-02-28 10:00:00', updated_at: '2026-02-28 10:00:00',
            },
          },
        }
      }
      if (url === '/channel/8/stats') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              channel_id: 8, subscriber_count: 12, total_messages: 200,
              total_views: 300, total_reactions: 25,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    const view = renderChannelDetailPage()

    await waitFor(() => {
      expect(view.container.textContent).toContain('频道详情')
      expect(view.container.textContent).toContain('tech_news')
    })
  })
})
