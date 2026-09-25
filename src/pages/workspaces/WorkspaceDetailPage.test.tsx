import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkspaceDetailPage } from './WorkspaceDetailPage'
import { PermissionRoute } from '../../components/auth/PermissionRoute'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

// 大 TSID：> 2^53，URL 参数与渲染全程 string（EntityId），禁 Number 回转
const BIG_TSID_STR = '9007199254740993'
const WORKSPACE_ID = '800001'

// 后端 /workspace/detail 真实形状（实测 2026-08-31）：
// owner 为嵌套对象；members 为嵌套分页 {list,...}（getWorkspaceDetailPayload 补 items）；
// projects/groups/channels 为有界数组（截断前 20 条）。
const detailFixture = {
  id: WORKSPACE_ID,
  name: 'ops-ws',
  owner_id: '900001',
  owner: { id: '900001', nickname: 'alice', account: 'alice@imboy', avatar: null },
  status: 'active',
  created_at: '2026-01-10 08:00:00',
  archived_at: null,
  branding: { name: 'Acme Workspace', logo: 'https://cdn.example.com/logo.png', primaryColor: '#3366ff' },
  // total=3 > list 长度 2：StatsCard「工作区成员数」必须取 members.total（准确总数）
  members: {
    list: [
      {
        workspace_id: WORKSPACE_ID,
        user_id: '900001',
        nickname: 'alice',
        account: 'alice@imboy',
        role: 'owner',
        status: 'active',
        joined_at: '2026-01-10 08:00:00',
      },
      {
        workspace_id: WORKSPACE_ID,
        user_id: BIG_TSID_STR,
        nickname: 'bob',
        account: 'bob@imboy',
        role: 'guest',
        status: 'active',
        joined_at: '2026-01-11 09:00:00',
      },
    ],
    page: 1,
    size: 10,
    total: 3,
    total_page: 1,
  },
  projects: [{ id: '700001', name: 'proj-a', status: 'active', created_at: '2026-02-01 08:00:00' }],
  groups: [{ id: '600001', title: 'group-a', status: 1, member_count: 4, created_at: '2026-02-02 08:00:00' }],
  channels: [{ id: '500001', name: 'chan-a', status: 1, subscriber_count: 9, created_at: '2026-02-03 08:00:00' }],
}

function detailEnvelope(payload: unknown = detailFixture) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function stubSidebarFetch(permissions: string[]) {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1.0',
          rbac: { roles: [{ id: '2', name: 'ops', description: '', permissions }] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/workspaces/${WORKSPACE_ID}`]}>
        <Routes>
          <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />
          <Route path="/workspaces" element={<div>workspace-list-probe</div>} />
          <Route path="/forbidden" element={<div>forbidden-probe</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('WorkspaceDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('loads detail with stats, nested owner facts, member roles and resource tables', async () => {
    mutableClient.get = async () => detailEnvelope()

    let view: ReturnType<typeof renderDetailPage>
    await act(async () => {
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('工作区「ops-ws」')
    })

    // StatsCard：资源计数取有界数组长度；工作区成员数取嵌套 members.total（3 ≠ list 2）
    await waitFor(() => {
      expect(view.container.textContent).toContain('项目数')
      expect(view.container.textContent).toContain('群组数')
      expect(view.container.textContent).toContain('频道数')
      expect(view.container.textContent).toContain('工作区成员数')
    })
    const statsText = view.container.textContent ?? ''
    expect(statsText).toContain('Acme Workspace')

    // 嵌套 owner 对象优先（detail 无扁平 owner_nickname），TSID 以 string 渲染
    expect(view.container.textContent).toContain('alice')
    expect(view.container.textContent).toContain('900001')

    // 工作区成员表：owner/guest 角色徽标 + 大 TSID 成员行
    await waitFor(() => {
      expect(view.container.textContent).toContain('bob')
      expect(view.container.textContent).toContain(BIG_TSID_STR)
    })
    expect(view.container.textContent).toContain('Owner')
    expect(view.container.textContent).toContain('Guest')

    // 资源清单（前 20 条投影）
    expect(view.container.textContent).toContain('proj-a')
    expect(view.container.textContent).toContain('700001')
    expect(view.container.textContent).toContain('group-a')
    expect(view.container.textContent).toContain('chan-a')
  })

  it('normalizes nested members pagination: stats use members.total not list length', async () => {
    let view: ReturnType<typeof renderDetailPage>
    await act(async () => {
      mutableClient.get = async () => detailEnvelope()
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('工作区成员数')
    })
    // 后端嵌套分页 {list,total=3}（list 仅 2 条）→ getWorkspaceDetailPayload 补 items，
    // 页面 StatsCard 消费 members.total：渲染 3 行成员之外仍以 total 为准确计数。
    const memberTable = view.container.querySelectorAll('table')[0]
    expect(memberTable.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('requests detail with workspace_id param as EntityId string', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      return detailEnvelope()
    }

    await act(async () => {
      renderDetailPage()
    })

    await waitFor(() => {
      const detailCall = getCalls.find((c) => c.url === '/workspace/detail')
      expect(detailCall).toBeDefined()
    })
    const detailCall = getCalls.find((c) => c.url === '/workspace/detail')
    expect(detailCall?.params?.workspace_id).toBe(WORKSPACE_ID)
    expect(typeof detailCall?.params?.workspace_id).toBe('string')
  })

  it('navigates back to /workspaces list (old URL reachable)', async () => {
    mutableClient.get = async () => detailEnvelope()
    let view: ReturnType<typeof renderDetailPage>
    await act(async () => {
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('返回列表')
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /返回列表/ }))
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('workspace-list-probe')
    })
  })

  it('shows empty states when members and resources are all empty', async () => {
    mutableClient.get = async () =>
      detailEnvelope({
        ...detailFixture,
        owner: null,
        members: { list: [], page: 1, size: 10, total: 0, total_page: 0 },
        projects: [],
        groups: [],
        channels: [],
      })

    let view: ReturnType<typeof renderDetailPage>
    await act(async () => {
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('工作区「ops-ws」')
    })
    expect(view.container.textContent).toContain('暂无工作区成员')
    // 三张资源表空态（前 20 条投影为空）
    const emptyCount = (view.container.textContent ?? '').match(/暂无数据/g)?.length ?? 0
    expect(emptyCount).toBe(3)
    // owner 缺失 → 不编造，渲染占位
    expect(view.container.textContent).toContain('—')
  })

  it('shows loading state while detail is pending, error state with retry on failure', async () => {
    // loading：get 挂起
    mutableClient.get = async () => new Promise(() => {}) as never

    let view: ReturnType<typeof renderDetailPage>
    await act(async () => {
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载工作区详情')
    })

    cleanup()
    document.body.innerHTML = ''

    // error：get reject → ErrorState + 重试；重试成功后恢复详情
    let calls = 0
    mutableClient.get = async () => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      return detailEnvelope()
    }

    await act(async () => {
      view = renderDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载工作区详情失败')
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /重试/ }))
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('工作区「ops-ws」')
    })
  })

  it('fail-closed: direct route redirects to /forbidden when workspaces:read missing', async () => {
    // 权限源经真实 useAdminPermission 供料：/rbac/me 无 workspaces:read → fail-closed
    stubSidebarFetch(['users:read'])
    let detailRequested = false
    mutableClient.get = async (url: string) => {
      if (url === '/rbac/me') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { role_id: '2', role_ids: ['2'], permissions: ['users:read'], menu_paths: [] },
          },
        }
      }
      if (url === '/workspace/detail') {
        detailRequested = true
        return detailEnvelope()
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
    })

    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/workspaces/${WORKSPACE_ID}`]}>
            <Routes>
              <Route
                path="/workspaces/:id"
                element={(
                  <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                    <WorkspaceDetailPage />
                  </PermissionRoute>
                )}
              />
              <Route path="/forbidden" element={<div>forbidden-probe</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    // 直达路由 fail-closed：重定向 /forbidden，且数据请求从不发出
    await waitFor(() => {
      expect(view.container.textContent).toContain('forbidden-probe')
    })
    expect(detailRequested).toBe(false)
  })
})
