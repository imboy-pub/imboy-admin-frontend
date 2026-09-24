/**
 * 部门管理页单测（ENT-ADM-01 验收）：搜索定位（匹配高亮 + 命中路径自动展开 +
 * 无匹配提示）、前端排序、左树右详情布局（选中节点事实面板）、非法移动目标
 * 置灰（服务端成环守卫的前端镜像）。治理动作（create/rename/move/archive
 * CAS mutation）逻辑零改动——仅验证入口可达与 expected_version 呈现。
 *
 * 替身约定同 OrganizationMembersPage.test.tsx：不用 mock.module；权限源经
 * 真实 useAdminPermission 的 `GET /rbac/me` 供料，sidebar 模板走全局 fetch
 * stub；client.get 内存 responder。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationDepartmentsPage } from './OrganizationDepartmentsPage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const OWNER_ID = '7700487999999999999'

const DEPARTMENTS = [
  { id: '100', organization_id: ORG_ID, parent_id: null, name: '研发部', status: 'active', version: 3, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  { id: '200', organization_id: ORG_ID, parent_id: '100', name: '后端组', status: 'active', version: 2, created_at: '2026-08-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' },
  { id: '300', organization_id: ORG_ID, parent_id: '200', name: 'Erlang 小队', status: 'active', version: 1, created_at: '2026-08-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z' },
  { id: '400', organization_id: ORG_ID, parent_id: '100', name: '前端组', status: 'active', version: 1, created_at: '2026-08-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z' },
  { id: '500', organization_id: ORG_ID, parent_id: null, name: '运营部', status: 'archived', version: 5, created_at: '2026-08-05T00:00:00Z', updated_at: '2026-09-05T00:00:00Z' },
]

function stubSidebarFetch() {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1.0',
          rbac: {
            roles: [
              { id: '1', name: 'super_admin', description: '', permissions: ['organizations:read', 'organizations:write'] },
            ],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

beforeEach(() => {
  stubSidebarFetch()
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') {
      return Promise.resolve(
        envelope({
          role_id: '1',
          role_ids: ['1'],
          permissions: ['organizations:read', 'organizations:write'],
          menu_paths: [],
        })
      )
    }
    if (url === `/organizations/${ORG_ID}`) {
      return Promise.resolve(
        envelope({
          id: ORG_ID,
          name: 'imboy',
          owner_id: OWNER_ID,
          status: 'active',
          member_count: 3,
          workspace_count: 0,
        })
      )
    }
    if (url === `/organizations/${ORG_ID}/departments`) return Promise.resolve(envelope(DEPARTMENTS))
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
  mutableClient.post = (() => Promise.resolve(envelope({}))) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  cleanup()
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/organizations/${ORG_ID}/departments`]}>
        <Routes>
          <Route path="/organizations/:organizationId/departments" element={<OrganizationDepartmentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function waitTreeReady(view: ReturnType<typeof renderPage>) {
  await waitFor(() => expect(view.getAllByText('研发部').length).toBeGreaterThan(0))
}

describe('OrganizationDepartmentsPage — 左树右详情布局', () => {
  it('树与详情面板并排呈现；未选择时详情面板给出引导空态', async () => {
    const view = renderPage()
    await waitTreeReady(view)
    expect(view.getByTestId('department-tree')).toBeTruthy()
    const panel = view.getByTestId('dept-detail-panel')
    expect(panel).toBeTruthy()
    expect(view.getAllByText('未选择部门').length).toBeGreaterThan(0)
  })

  it('点击树节点：右侧详情呈现节点事实（TSID/名称/版本/层级路径/后代数）并标记 aria-selected', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    const user = userEvent.setup()
    await user.click(view.getByTestId('dept-node-200'))
    await waitFor(() => expect(view.getByTestId('dept-detail-content')).toBeTruthy())
    expect(view.getByTestId('dept-detail-id').textContent).toBe('200')
    expect(view.getByTestId('dept-detail-name').textContent).toBe('后端组')
    // 层级路径：研发部 / 后端组；直接子 1 个（Erlang 小队）
    expect(view.getByTestId('dept-detail-path').textContent).toBe('研发部 / 后端组')
    expect(view.getByTestId('dept-detail-descendants').textContent).toBe('1')
    // 选中态：树节点 aria-selected
    expect(view.getByTestId('dept-node-200').closest('li')?.getAttribute('aria-selected')).toBe('true')
    expect(view.getByTestId('dept-node-100').closest('li')?.getAttribute('aria-selected')).toBe('false')
    // 治理入口镜像（writeGate）：详情面板与树行内同款动作
    expect(view.getByTestId('dept-detail-rename-btn')).toBeTruthy()
    expect(view.getByTestId('dept-detail-move-btn')).toBeTruthy()
    expect(view.getByTestId('dept-detail-archive-btn')).toBeTruthy()
    // 树行内动作保留（e2e 契约兼容）
    expect(view.getAllByTestId('dept-archive-btn').length).toBeGreaterThan(0)
  })

  it('详情面板动作入口与树行内共用同一 mutation 流：改名 dialog 呈现 expected_version（CAS 逻辑零改动）', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    const user = userEvent.setup()
    await user.click(view.getByTestId('dept-node-200'))
    await user.click(view.getByTestId('dept-detail-rename-btn'))
    await waitFor(() => expect(view.getByText('部门改名（expected_version = 2）')).toBeTruthy())
  })
})

describe('OrganizationDepartmentsPage — 搜索定位（ENT-ADM-01）', () => {
  it('匹配节点名称高亮（mark）且命中路径自动展开（折叠态被覆盖）', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    const user = userEvent.setup()
    // 先手动折叠「研发部」（孙节点 Erlang 小队随之隐藏）
    const rootChevron = view.getAllByLabelText('折叠')[0]
    await user.click(rootChevron)
    await waitFor(() => expect(view.queryByText('Erlang 小队')).toBeNull())

    // 搜索命中孙节点：命中路径（研发部 → 后端组 → Erlang 小队）自动展开
    await user.type(view.getByTestId('dept-search-input'), 'erlang')
    await waitFor(() => expect(view.getAllByTestId('dept-node-match').length).toBeGreaterThan(0))
    expect(view.getByTestId('dept-node-name-300').textContent).toBe('Erlang 小队')
    // 高亮段为命中片段本身
    expect(view.getByTestId('dept-node-match').textContent).toBe('Erlang')
    // 未命中子树隐藏：前端组 / 运营部不再出现
    expect(view.queryByText('前端组')).toBeNull()
    expect(view.queryByText('运营部')).toBeNull()

    // 清空搜索：恢复完整树与手动折叠态（研发部仍折叠 → 前端组 / Erlang 小队保持隐藏）
    // happy-dom 下 fireEvent.input/user.clear 不触发受控 onChange，逐键退格清空
    await user.type(view.getByTestId('dept-search-input'), '{backspace}'.repeat('erlang'.length))
    await waitFor(() => expect(view.getAllByText('运营部').length).toBeGreaterThan(0))
    expect(view.queryByTestId('dept-node-name-300')).toBeNull()
    expect(view.queryByTestId('dept-node-name-400')).toBeNull()
  })

  it('无匹配：呈现提示与清空入口；TSID 也可命中', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    const user = userEvent.setup()
    await user.type(view.getByTestId('dept-search-input'), '不存在部门')
    await waitFor(() => expect(view.getByTestId('dept-search-empty')).toBeTruthy())

    await user.click(view.getByTestId('dept-search-clear'))
    await waitFor(() => expect(view.queryByTestId('dept-search-empty')).toBeNull())
    await waitFor(() => expect(view.getAllByText('研发部').length).toBeGreaterThan(0))

    // TSID 命中：搜索 300 → Erlang 小队路径保留
    await user.type(view.getByTestId('dept-search-input'), '300')
    await waitFor(() => expect(view.getByTestId('dept-node-name-300').textContent).toBe('Erlang 小队'))
    expect(view.queryByText('前端组')).toBeNull()
  })
})

describe('OrganizationDepartmentsPage — 前端排序（纯展示）', () => {
  it('默认目录序（TSID 升序）；名称降序后兄弟顺序反转', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    // 默认 directory：根 = 100 研发部、500 运营部
    const tree = view.getByTestId('department-tree')
    const rootNames = () => Array.from(tree.querySelectorAll(':scope > li')).map((li) => li.textContent ?? '')
    expect(rootNames()[0]).toContain('研发部')
    expect(rootNames()[1]).toContain('运营部')

    const user = userEvent.setup()
    await user.selectOptions(view.getByTestId('dept-sort-select'), 'name-desc')
    await waitFor(() => {
      expect(rootNames()[0]).toContain('运营部')
      expect(rootNames()[1]).toContain('研发部')
    })
    // 名称降序下子部门顺序：前端组 在 后端组 前
    const firstRootChildren = () =>
      Array.from(tree.querySelectorAll(':scope > li > ul > li')).map((li) => li.textContent ?? '')
    expect(firstRootChildren()[0]).toContain('前端组')
    expect(firstRootChildren()[1]).toContain('后端组')
  })
})

describe('OrganizationDepartmentsPage — 非法移动目标置灰（服务端成环守卫的前端镜像）', () => {
  it('移动 dialog：自身与后代目标选项显示但 disabled，合法目标可选', async () => {
    const view = renderPage()
    await waitTreeReady(view)

    const user = userEvent.setup()
    await user.click(view.getByTestId('dept-node-100'))
    await user.click(view.getByTestId('dept-detail-move-btn'))
    const select = await waitFor(() => document.querySelector('#dept-move-parent') as HTMLSelectElement | null)
    expect(select).toBeTruthy()

    const optionOf = (value: string) => select?.querySelector(`option[value="${value}"]`) as HTMLOptionElement | null
    // 研发部(100) 的后代：后端组 200 / Erlang 小队 300 / 前端组 400 —— 全部置灰
    expect(optionOf('200')?.disabled).toBe(true)
    expect(optionOf('300')?.disabled).toBe(true)
    expect(optionOf('400')?.disabled).toBe(true)
    expect(optionOf('200')?.textContent).toContain('不可选（自身或后代，服务端成环守卫）')
    // 运营部(500，archived)不在 activeParents；无其它合法 active 目标 → 除根外全部置灰
    expect(optionOf('500')).toBeNull()
  })
})
