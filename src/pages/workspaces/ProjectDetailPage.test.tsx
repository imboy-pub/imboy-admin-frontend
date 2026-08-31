import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectDetailPage } from './ProjectDetailPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

type GetCall = { url: string; params?: Record<string, unknown> }

// 大 TSID：> 2^53，全程 string 传递
const BIG_TSID_STR = '9007199254740993'

const projectDetailFixture = {
  id: BIG_TSID_STR,
  workspace_id: '800001',
  owner_id: '900001',
  owner_nickname: 'alice',
  name: 'governance-project',
  description: 'W2 governance fixture',
  status: 'active',
  created_at: '2026-08-01 10:00:00',
  task_stats: { todo: 1, doing: 1, review: 0, done: 2 },
  assignees: [{ assignee_id: '900001', nickname: 'alice', total: 4, done: 2 }],
}

function envelope(list: unknown[], total = list.length, totalPage = Math.max(1, Math.ceil(total / 10))) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: { list, page: 1, size: 10, total, total_page: totalPage },
    },
  }
}

const membersFixture = [
  {
    project_id: BIG_TSID_STR,
    user_id: BIG_TSID_STR,
    nickname: 'alice',
    account: 'alice@imboy',
    role: 'owner',
    joined_at: '2026-08-01 10:00:00',
  },
  {
    project_id: BIG_TSID_STR,
    user_id: '900002',
    nickname: 'bob',
    account: 'bob@imboy',
    role: 'member',
    joined_at: '2026-08-02 10:00:00',
  },
]

const milestonesPageFixture = (page: number) => ({
  list: Array.from({ length: 10 }, (_, i) => ({
    id: String(700000 + (page - 1) * 10 + i),
    project_id: BIG_TSID_STR,
    name: `milestone-${page}-${i}`,
    status: i % 2 === 0 ? 'planned' : 'reached',
  })),
  page,
  size: 10,
  total: 25,
  total_page: 3,
})

// 后端 /project/channels 行形状（实测 2026-08-31）：channel_id/workspace_id/linked_at/name/avatar/channel_status
const channelsFixture = [
  {
    channel_id: '600001',
    workspace_id: BIG_TSID_STR,
    name: 'proj-channel',
    channel_status: 1,
    linked_at: 1788096979827,
  },
]

function renderProjectDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${BIG_TSID_STR}`]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects" element={<div>projects-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** 组装一个 /project/detail + 各治理端点均可控的 get mock */
function mockGet(handlers: {
  members?: (_params?: Record<string, unknown>) => ReturnType<typeof envelope> | never
  milestones?: (_params?: Record<string, unknown>) => ReturnType<typeof envelope>
  channels?: (_params?: Record<string, unknown>) => ReturnType<typeof envelope>
  aggregations?: (_params?: Record<string, unknown>) => ReturnType<typeof envelope>
}) {
  return async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/project/detail') {
      return { data: { code: 0, msg: 'ok', payload: projectDetailFixture } }
    }
    if (url === '/project/members' && handlers.members) {
      return handlers.members(config?.params)
    }
    if (url === '/project/milestones' && handlers.milestones) {
      return handlers.milestones(config?.params)
    }
    if (url === '/project/channels' && handlers.channels) {
      return handlers.channels(config?.params)
    }
    if (url === '/project/aggregations' && handlers.aggregations) {
      return handlers.aggregations(config?.params)
    }
    throw new Error(`unexpected GET url: ${url}`)
  }
}

describe('ProjectDetailPage W2 governance', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('keeps W0 overview content and exposes governance tabs', async () => {
    mutableClient.get = mockGet({})

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('governance-project')
      expect(view.container.textContent).toContain(BIG_TSID_STR)
      expect(view.container.textContent).toContain('任务状态分布')
    })

    // 四个治理 tab 就位
    expect(view.getByRole('tab', { name: '成员' })).toBeDefined()
    expect(view.getByRole('tab', { name: '里程碑' })).toBeDefined()
    expect(view.getByRole('tab', { name: '频道' })).toBeDefined()
    expect(view.getByRole('tab', { name: '聚合' })).toBeDefined()
  })

  it('renders read-only member list with EntityId strings and no write actions', async () => {
    const getCalls: GetCall[] = []
    mutableClient.get = mockGet({
      members: (params) => {
        getCalls.push({ url: '/project/members', params })
        return envelope(membersFixture)
      },
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const membersTab = await view.findByRole('tab', { name: '成员' })
      await act(async () => {
        fireEvent.click(membersTab)
      })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/project/members')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('alice')
      expect(view.container.textContent).toContain('alice@imboy')
    })
    // TSID 全程 string（禁 Number 回转）
    expect(view.container.textContent).toContain(BIG_TSID_STR)

    // 默认分页参数
    const membersCall = getCalls.find((c) => c.url === '/project/members')
    expect(membersCall?.params?.page).toBe(1)
    expect(membersCall?.params?.size).toBe(10)
    expect(membersCall?.params?.project_id).toBe(BIG_TSID_STR)

    // 后端无治理写端点：不得渲染假按钮
    expect(view.container.textContent).not.toContain('移除成员')
  })

  it('resets page to 1 when milestone status filter changes', async () => {
    const getCalls: GetCall[] = []
    mutableClient.get = mockGet({
      milestones: (params) => {
        getCalls.push({ url: '/project/milestones', params })
        const page = Number(params?.page ?? 1)
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              ...milestonesPageFixture(page),
              list:
                params?.status === 'reached'
                  ? milestonesPageFixture(page).list.filter((m) => (m as { status: string }).status === 'reached')
                  : milestonesPageFixture(page).list,
            },
          },
        }
      },
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const milestonesTab = await view.findByRole('tab', { name: '里程碑' })
      await act(async () => {
        fireEvent.click(milestonesTab)
      })

    await waitFor(() => {
      expect(getCalls.length).toBe(1)
    })
    // 默认 status=all + page=1
    expect(getCalls[0].params?.status).toBe('all')
    expect(getCalls[0].params?.page).toBe(1)

    // 翻到第 2 页
    await waitFor(() => {
      expect(view.container.textContent).toContain('milestone-1-0')
    })
    await act(async () => {
      const pageTwo = view.getByRole('button', { name: '2' })
      fireEvent.click(pageTwo)
    })

    await waitFor(() => {
      expect(getCalls.length).toBe(2)
    })
    expect(getCalls[1].params?.page).toBe(2)

    await waitFor(() => {
      expect(view.container.textContent).toContain('milestone-2-0')
    })

    // 切 status 筛选 → page 必须复位 1
    await act(async () => {
      const statusSelect = view.container.querySelector('select[data-testid="milestone-status-filter"]') as HTMLSelectElement
      fireEvent.change(statusSelect, { target: { value: 'reached' } })
    })

    await waitFor(() => {
      expect(getCalls.length).toBe(3)
    })
    expect(getCalls[2].params?.status).toBe('reached')
    expect(getCalls[2].params?.page).toBe(1)
  })

  it('renders read-only channel list', async () => {
    const getCalls: GetCall[] = []
    mutableClient.get = mockGet({
      channels: (params) => {
        getCalls.push({ url: '/project/channels', params })
        return envelope(channelsFixture)
      },
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const channelsTab = await view.findByRole('tab', { name: '频道' })
      await act(async () => {
        fireEvent.click(channelsTab)
      })

    await waitFor(() => {
      expect(view.container.textContent).toContain('proj-channel')
    })
    // 行键与 ID 列对齐后端 channel_id（此前读 c.id undefined 触发 React key error）
    expect(view.container.textContent).toContain('600001')
    expect(getCalls[0].params?.project_id).toBe(BIG_TSID_STR)
  })

  it('passes aggregation type param and resets page to 1 on type switch', async () => {
    const getCalls: GetCall[] = []
    mutableClient.get = mockGet({
      aggregations: (params) => {
        getCalls.push({ url: '/project/aggregations', params })
        const page = Number(params?.page ?? 1)
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              list: [
                {
                  id: String(500000 + page),
                  project_id: BIG_TSID_STR,
                  type: (params?.type as string) ?? 'pinned',
                  title: `${String(params?.type)}-row-${page}`,
                },
              ],
              page,
              size: 10,
              total: 25,
              total_page: 3,
            },
          },
        }
      },
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const aggregationsTab = await view.findByRole('tab', { name: '聚合' })
      await act(async () => {
        fireEvent.click(aggregationsTab)
      })

    await waitFor(() => {
      expect(getCalls.length).toBe(1)
    })
    // 默认 type=pinned + page=1
    expect(getCalls[0].params?.type).toBe('pinned')
    expect(getCalls[0].params?.page).toBe(1)

    await waitFor(() => {
      expect(view.container.textContent).toContain('pinned-row-1')
    })

    // 翻到第 2 页
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '2' }))
    })
    await waitFor(() => {
      expect(getCalls.length).toBe(2)
    })
    expect(getCalls[1].params?.page).toBe(2)

    await waitFor(() => {
      expect(view.container.textContent).toContain('pinned-row-2')
    })

    // 切 type → page 复位 1 且 type 正确传参
    await act(async () => {
      const typeSelect = view.container.querySelector('select[data-testid="aggregation-type-filter"]') as HTMLSelectElement
      fireEvent.change(typeSelect, { target: { value: 'resources' } })
    })

    await waitFor(() => {
      expect(getCalls.length).toBe(3)
    })
    expect(getCalls[2].params?.type).toBe('resources')
    expect(getCalls[2].params?.page).toBe(1)

    await waitFor(() => {
      expect(view.container.textContent).toContain('resources-row-1')
    })
  })

  it('shows empty states for members, milestones, channels and aggregations', async () => {
    mutableClient.get = mockGet({
      members: () => envelope([]),
      milestones: () => envelope([]),
      channels: () => envelope([]),
      aggregations: () => envelope([]),
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const membersTab = await view.findByRole('tab', { name: '成员' })
      await act(async () => {
        fireEvent.click(membersTab)
      })
    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无项目成员')
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const milestonesTab = await view.findByRole('tab', { name: '里程碑' })
      await act(async () => {
        fireEvent.click(milestonesTab)
      })
    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无里程碑')
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const channelsTab = await view.findByRole('tab', { name: '频道' })
      await act(async () => {
        fireEvent.click(channelsTab)
      })
    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无关联频道')
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const aggregationsTab = await view.findByRole('tab', { name: '聚合' })
      await act(async () => {
        fireEvent.click(aggregationsTab)
      })
    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无聚合记录')
    })
  })

  it('shows permission-denied state with retry entry on 403 without blanking the page', async () => {
    let memberCalls = 0
    mutableClient.get = mockGet({
      members: () => {
        memberCalls += 1
        throw { code: 403, msg: '您无权访问此资源' }
      },
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const membersTab = await view.findByRole('tab', { name: '成员' })
      await act(async () => {
        fireEvent.click(membersTab)
      })

    // 403 → 明确无权限态（fail-closed），不白屏
    await waitFor(() => {
      expect(view.container.textContent).toContain('无权限')
    })
    expect(view.container.textContent).toContain('governance-project')

    // 可重试入口
    const retryBtn = view.container.querySelector('button[data-testid="members-forbidden-retry"]') as HTMLButtonElement
    expect(retryBtn).toBeDefined()

    await act(async () => {
      fireEvent.click(retryBtn)
    })

    await waitFor(() => {
      expect(memberCalls).toBe(2)
    })
  })

  it('shows loading and error states for governance panels', async () => {
    // loading：members 挂起 → 面板显示加载态
    mutableClient.get = mockGet({
      members: () => new Promise(() => {}) as never,
    })

    let view: ReturnType<typeof renderProjectDetailPage>
    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
      const membersTab = await view.findByRole('tab', { name: '成员' })
      await act(async () => {
        fireEvent.click(membersTab)
      })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载项目成员')
    })

    cleanup()

    // error：members reject → 面板错误态 + 重试
    document.body.innerHTML = ''
    mutableClient.get = mockGet({
      members: () => {
        throw new Error('boom')
      },
    })

    await act(async () => {
      view = renderProjectDetailPage()
    })

    // 详情查询 resolve 后治理 Tabs 才渲染，findByRole 等待式获取
    const errorMembersTab = await view.findByRole('tab', { name: '成员' })
    await act(async () => {
      fireEvent.click(errorMembersTab)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载项目成员失败')
    })
    expect(view.getByRole('button', { name: '重试' })).toBeDefined()
  })
})
