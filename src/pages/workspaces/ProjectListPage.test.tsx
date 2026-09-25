import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectListPage } from './ProjectListPage'
import { PermissionRoute } from '../../components/auth/PermissionRoute'
import { filterByRbac, flattenLeafItems, toSidebarMenuItems } from '../../components/layout/sidebarFilters'
import { defaultConfig } from '../../components/layout/sidebarSchema'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

// 大 TSID：> 2^53，行键/导航/参数全程 string（EntityId），禁 Number 回转
const BIG_TSID_STR = '9007199254740993'

const projectFixture = {
  id: BIG_TSID_STR,
  workspace_id: '800001',
  workspace_name: 'ops-ws',
  owner_id: '900001',
  owner_nickname: 'alice',
  name: 'governance-project',
  description: 'fixture',
  status: 'active',
  created_at: '2026-08-01 10:00:00',
  task_total: 4,
  task_done: 2,
}

function projectListEnvelope(items: unknown[] = [projectFixture], total = items.length) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: { list: items, page: 1, size: 10, total, total_page: Math.max(1, Math.ceil(total / 10)) },
    },
  }
}

function orgOptionsEnvelope() {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: { list: [{ id: '880001', name: 'acme-org' }], page: 1, size: 100, total: 1, total_page: 1 },
    },
  }
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

function renderListPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/:id" element={<div>project-detail-probe</div>} />
          <Route path="/forbidden" element={<div>forbidden-probe</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** 组装 /project/list + /organizations（组织筛选下拉数据源）均可控的 get mock */
function makeGet(options: { total?: number } = {}) {
  return async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/project/list') {
      return projectListEnvelope([projectFixture], options.total ?? 1)
    }
    if (url === '/organizations') {
      return orgOptionsEnvelope()
    }
    throw new Error(`unexpected GET url: ${url} (${JSON.stringify(config?.params ?? {})})`)
  }
}

describe('ProjectListPage flow', () => {
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

  it('loads and displays read-only project list with default pagination', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      return makeGet()(url, config)
    }

    let view: ReturnType<typeof renderListPage>
    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('governance-project')
    })

    // 行内容：工作区归属、Owner、任务（完成/总数）、状态徽标
    expect(view.container.textContent).toContain('ops-ws')
    expect(view.container.textContent).toContain('800001')
    expect(view.container.textContent).toContain('alice')
    expect(view.container.textContent).toContain('2 / 4')
    expect(view.container.textContent).toContain('进行中')

    // 默认分页参数（DataTablePagination 契约：page=1 / size=10）
    const listCall = getCalls.find((c) => c.url === '/project/list')
    expect(listCall?.params?.page).toBe(1)
    expect(listCall?.params?.size).toBe(10)
    // 组织筛选下拉数据源（useEnterpriseOrganizationOptions）
    expect(getCalls.some((c) => c.url === '/organizations')).toBe(true)

    // 运营只读：不提供项目写操作
    expect(view.container.textContent).not.toContain('删除项目')
    expect(view.container.textContent).not.toContain('编辑项目')
  })

  it('resets page to 1 and passes status when filter re-applied', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/project/list') {
        getCalls.push({ url, params: config?.params })
        return projectListEnvelope([projectFixture], 25)
      }
      if (url === '/organizations') return orgOptionsEnvelope()
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderListPage>
    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThanOrEqual(1)
    })
    expect(getCalls[0].params?.page).toBe(1)

    // 翻到第 2 页
    await waitFor(() => {
      expect(view.getByRole('button', { name: '2' })).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '2' }))
    })

    const pageTwoCall = await waitFor(() => {
      const call = getCalls.find((c) => c.url === '/project/list' && c.params?.page === 2)
      expect(call).toBeDefined()
      return call
    })
    expect(pageTwoCall?.params?.size).toBe(10)

    // 切 status 筛选 → 点击「搜索」→ page 必须复位 1 且 status 透传
    await act(async () => {
      const statusSelect = view.container.querySelector('select') as HTMLSelectElement
      fireEvent.change(statusSelect, { target: { value: 'done' } })
    })
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '搜索' }))
    })

    await waitFor(() => {
      const doneCalls = getCalls.filter((c) => c.url === '/project/list' && c.params?.status === 'done')
      expect(doneCalls.length).toBeGreaterThan(0)
    })
    const doneCall = getCalls.filter((c) => c.url === '/project/list' && c.params?.status === 'done').pop()
    expect(doneCall?.params?.page).toBe(1)
  })

  it('navigates to /projects/:id via 查看详情 action (old URL reachable)', async () => {
    mutableClient.get = makeGet()

    let view: ReturnType<typeof renderListPage>
    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('governance-project')
    })

    // DataTable 桌面表格 + 移动卡片双布局会渲染两份操作按钮，取任一触发导航
    await act(async () => {
      const detailButtons = view.getAllByTitle('查看详情')
      fireEvent.click(detailButtons[0])
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('project-detail-probe')
    })
  })

  it('shows loading state then error state with retry', async () => {
    // loading：list 挂起
    mutableClient.get = async (url: string) => {
      if (url === '/project/list') return new Promise(() => {}) as never
      if (url === '/organizations') return orgOptionsEnvelope()
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderListPage>
    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载项目数据')
    })

    cleanup()
    document.body.innerHTML = ''

    // error：list reject → ErrorState + 重试；重试成功恢复
    let calls = 0
    mutableClient.get = async (url: string) => {
      if (url === '/project/list') {
        calls += 1
        if (calls === 1) throw new Error('boom')
        return projectListEnvelope()
      }
      if (url === '/organizations') return orgOptionsEnvelope()
      throw new Error(`unexpected GET url: ${url}`)
    }

    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载项目数据失败')
    })

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /重试/ }))
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('governance-project')
    })
  })

  it('shows empty state when project list is empty', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/project/list') return projectListEnvelope([])
      if (url === '/organizations') return orgOptionsEnvelope()
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderListPage>
    await act(async () => {
      view = renderListPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无数据')
    })
  })

  it('fail-closed: direct route redirects to /forbidden when workspaces:read missing', async () => {
    // 权限源经真实 useAdminPermission 供料：/rbac/me 无 workspaces:read → fail-closed
    stubSidebarFetch(['users:read'])
    let listRequested = false
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
      if (url === '/project/list') {
        listRequested = true
        return projectListEnvelope()
      }
      if (url === '/organizations') return orgOptionsEnvelope()
      throw new Error(`unexpected GET url: ${url}`)
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
    })

    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/projects']}>
            <Routes>
              <Route
                path="/projects"
                element={(
                  <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                    <ProjectListPage />
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
    expect(listRequested).toBe(false)
  })
})

describe('ProjectListPage sidebar fail-closed (menu not rendered)', () => {
  it('filters /projects and /workspaces leaves out for role without access', () => {
    // 侧栏 fail-closed：角色不在叶子 roles 白名单（workspaces 菜单 = ['1','2']）
    // → 菜单项不渲染（filterByRbac 移除叶子，而非渲染禁用项）。
    const items = toSidebarMenuItems(defaultConfig.items)
    const enterpriseLeaves = flattenLeafItems(items).filter((leaf) =>
      ['/projects', '/workspaces', '/organizations'].includes(leaf.path ?? '')
    )
    expect(enterpriseLeaves).toHaveLength(3)

    const denied = flattenLeafItems(filterByRbac(items, 6)).map((leaf) => leaf.path)
    expect(denied).not.toContain('/projects')
    expect(denied).not.toContain('/workspaces')

    // 授权角色仍可见（roles ['1','2'] 命中）
    const allowed = flattenLeafItems(filterByRbac(items, 2)).map((leaf) => leaf.path)
    expect(allowed).toContain('/projects')
    expect(allowed).toContain('/workspaces')
  })

  it('keeps sidebar top-level groups unchanged (no new primary navigation)', () => {
    // 验收约束：不新增一级导航——defaultConfig 顶级分组保持现状（8 组，
    // 含「企业管理」九叶与「客服」入口所在分组；本卡零 sidebar 改动）
    const groups = defaultConfig.items.map((item) => item.label)
    expect(groups).toContain('企业管理')
    expect(groups).toHaveLength(8)
  })
})
