/**
 * 成员治理页集成单测（ENT-FND-01 验收）：真实 Organization 页面消费两项新增
 * 共享能力——useColumnState 列持久化（toggle → localStorage → 重挂载仍生效 →
 * 重置）与 EntityDrawer sections（行点击打开成员详情关系 Drawer：profile
 * 事实分区 + relationship 关系导航）。
 *
 * ⚠️ 替身与反污染约定同 OrganizationInvitationsPage.test.tsx：不用 mock.module；
 * 权限源经真实 useAdminPermission 的权威端点 `GET /rbac/me` 供料，sidebar
 * 模板走全局 fetch stub；client.get 内存 responder（`{data: 信封}`）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationMembersPage } from './OrganizationMembersPage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const OWNER_ID = '7700487999999999999'
const COLUMN_STORAGE_KEY = 'imboy_admin_column_state:organization-members'

const MEMBER = {
  organization_id: ORG_ID,
  user_id: '6600487333333333333',
  role: 'member',
  status: 'active',
  invited_by: OWNER_ID,
  joined_at: '2026-09-01T10:00:00Z',
  nickname: '白鹭',
  account: 'egret_account',
}

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

function membersEnvelope() {
  return envelope({ list: [MEMBER], page: 1, size: 10, total: 1, total_page: 1 })
}

beforeEach(() => {
  stubSidebarFetch()
  globalThis.localStorage?.removeItem(COLUMN_STORAGE_KEY)
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
          member_count: 1,
          workspace_count: 0,
        })
      )
    }
    if (url === `/organizations/${ORG_ID}/members`) return Promise.resolve(membersEnvelope())
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
  mutableClient.post = (() => Promise.resolve(envelope({}))) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  globalThis.localStorage?.removeItem(COLUMN_STORAGE_KEY)
  cleanup()
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/organizations/${ORG_ID}/members`]}>
        <Routes>
          <Route path="/organizations/:organizationId/members" element={<OrganizationMembersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function waitPageReady(view: ReturnType<typeof renderPage>) {
  await waitFor(() => expect(view.getAllByText('白鹭').length).toBeGreaterThan(0))
}

/** 等待成员表格数据就绪（不依赖 nickname 列可见性，用 userId TSID 判定）。 */
async function waitMemberRow(view: ReturnType<typeof renderPage>) {
  await waitFor(() => expect(view.getAllByText(MEMBER.user_id).length).toBeGreaterThan(0))
}

describe('OrganizationMembersPage — 列持久化（useColumnState 消费）', () => {
  it('列面板 toggle 隐藏列并落盘；重挂载（模拟刷新）仍生效；重置恢复', async () => {
    const view = renderPage()
    await waitPageReady(view)
    expect(view.getAllByText('白鹭').length).toBe(2) // 桌面表格 + 移动端卡片

    const user = userEvent.setup()
    await user.click(view.getByTestId('members-column-panel-btn'))
    await user.click(view.getByTestId('members-column-toggle-nickname'))

    // 列隐藏后：桌面与移动端卡片都不再渲染该列
    await waitFor(() => expect(view.queryAllByText('白鹭')).toHaveLength(0))
    const stored = globalThis.localStorage?.getItem(COLUMN_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored as string).nickname).toBe(false)

    // 重挂载 = 模拟刷新页面：持久化状态生效（昵称列仍隐藏，账号文案不再出现）
    cleanup()
    const second = renderPage()
    await waitMemberRow(second)
    await waitFor(() => expect(second.queryByText('egret_account')).toBeNull())
    await waitFor(() => expect(second.queryByText('白鹭')).toBeNull())

    // 重置列显示：恢复默认并清除存储条目
    const user2 = userEvent.setup()
    await user2.click(second.getByTestId('members-column-panel-btn'))
    await user2.click(second.getByTestId('members-column-reset-btn'))
    await waitFor(() => expect(second.getAllByText('白鹭').length).toBeGreaterThan(0))
    expect(globalThis.localStorage?.getItem(COLUMN_STORAGE_KEY)).toBeNull()
    expect(second.getByTestId('members-column-panel-btn').textContent).toContain('7/7')
  })
})

describe('OrganizationMembersPage — 成员详情关系 Drawer（EntityDrawer sections 消费）', () => {
  it('行点击打开 Drawer：profile 事实分区 + relationship 关系导航；Escape 关闭', async () => {
    const view = renderPage()
    await waitPageReady(view)

    // 点击桌面表格行（第一个「白鹭」出现在桌面单元格内）
    const desktopCell = view.getAllByText('白鹭')[0]
    const row = desktopCell.closest('tr') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    const sections = await waitFor(() => view.getByTestId('entity-drawer-sections'))
    expect(sections).toBeTruthy()
    // profile 分区：成员事实（scoped 到 Drawer 内，避免与表格单元格重复命中）
    expect(view.getAllByText('成员事实').length).toBeGreaterThan(0)
    const tsidField = sections.querySelector('[data-field-label="用户 TSID"]')
    expect(tsidField?.textContent).toBe(MEMBER.user_id)
    const joinedField = sections.querySelector('[data-field-label="加入时间"]')
    expect(joinedField?.textContent).toBe(MEMBER.joined_at)
    // relationship 分区：合同背书的关系导航（Link href）
    const orgLink = sections.querySelector('a[data-relation-id="relation-organization"]')
    expect(orgLink?.getAttribute('href')).toBe(`/organizations/${ORG_ID}`)
    const userLink = sections.querySelector('a[data-relation-id="relation-user-detail"]')
    expect(userLink?.getAttribute('href')).toBe(`/users/${MEMBER.user_id}`)
    const inviterLink = sections.querySelector('a[data-relation-id="relation-inviter"]')
    expect(inviterLink?.getAttribute('href')).toBe(`/users/${OWNER_ID}`)

    // 键盘：Escape 关闭 Drawer
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(view.queryByTestId('entity-drawer-sections')).toBeNull())
  })
})

// ---------------------------------------------------------------------------
// 复合筛选（ENT-ADM-01）：角色 + 关键词客户端组合筛选、筛选变化重置 page=1、
// 覆盖范围如实标注（adm 合同 members 端点无服务端筛选参数）
// ---------------------------------------------------------------------------
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.search}</div>
}

function renderPageWithProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/organizations/${ORG_ID}/members`]}>
        <Routes>
          <Route
            path="/organizations/:organizationId/members"
            element={
              <>
                <OrganizationMembersPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const MEMBER_ADMIN = {
  ...MEMBER,
  user_id: '6600487444444444444',
  role: 'admin',
  nickname: '夜鸦',
  account: 'crow_account',
}
const MEMBER_OWNER = {
  ...MEMBER,
  user_id: OWNER_ID,
  role: 'owner',
  nickname: '鲲',
  account: 'kun_account',
}

/** 记录型 members GET responder：非筛选模式服务端分页（page 感知）；聚合模式 size=100 逐页。 */
function installMembersResponder(options: { serverPageSizeTotal: number }) {
  const allRows = [MEMBER, MEMBER_ADMIN, MEMBER_OWNER]
  const calls: Array<{ page: number; size: number }> = []
  mutableClient.get = ((url: string, config?: { params?: { page?: number; size?: number } }) => {
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
    if (url === `/organizations/${ORG_ID}/members`) {
      const page = config?.params?.page ?? 1
      const size = config?.params?.size ?? 10
      calls.push({ page, size })
      // 服务端分页（非筛选模式）：页内 slice；聚合模式 size=100 一次取全
      const start = (page - 1) * size
      const items = allRows.slice(start, start + size)
      return Promise.resolve(
        envelope({
          list: items,
          page,
          size,
          total: options.serverPageSizeTotal ?? allRows.length,
          total_page: Math.ceil((options.serverPageSizeTotal ?? allRows.length) / size),
        })
      )
    }
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
  return calls
}

describe('OrganizationMembersPage — 复合筛选（ENT-ADM-01）', () => {
  it('角色筛选：admin 档仅显示 admin 行，并以覆盖范围标注呈现客户端筛选事实', async () => {
    const calls = installMembersResponder({ serverPageSizeTotal: 3 })
    const view = renderPageWithProbe()
    await waitFor(() => expect(view.getAllByText('白鹭').length).toBeGreaterThan(0))

    const user = userEvent.setup()
    await user.selectOptions(view.getByTestId('member-role-filter'), 'admin')

    // admin 档：只余「夜鸦」，白鹭（member）与鲲（owner）从两个视图（桌面+卡片）消失
    await waitFor(() => expect(view.getAllByText('夜鸦').length).toBeGreaterThan(0))
    await waitFor(() => expect(view.queryByText('白鹭')).toBeNull())
    await waitFor(() => expect(view.queryByText('鲲')).toBeNull())

    // 覆盖范围标注：命中 1 行 / 已加载 3 行 / 服务端 3 行
    const note = await waitFor(() => view.getByTestId('members-filter-scope-note'))
    expect(note.textContent).toContain('命中 1 行')
    expect(note.textContent).toContain('已加载 3 行')
    expect(note.textContent).toContain('adm 合同 members 端点无服务端筛选参数')

    // 筛选激活 → 聚合模式以 size=100 拉取（服务端上限）
    const aggregateCall = calls.find((call) => call.size === 100)
    expect(aggregateCall).toBeTruthy()

    // 重置：恢复全量并清空标注
    await user.click(view.getByTestId('member-filter-reset'))
    await waitFor(() => expect(view.getAllByText('白鹭').length).toBeGreaterThan(0))
    await waitFor(() => expect(view.queryByTestId('members-filter-scope-note')).toBeNull())
  })

  it('关键词筛选（提交式）+ 组合筛选交集语义', async () => {
    installMembersResponder({ serverPageSizeTotal: 3 })
    const view = renderPageWithProbe()
    await waitFor(() => expect(view.getAllByText('白鹭').length).toBeGreaterThan(0))

    const user = userEvent.setup()
    // 关键词命中账号（大小写不敏感）：crow_account
    await user.type(view.getByTestId('member-keyword-input'), 'CROW')
    await user.click(view.getByTestId('member-filter-submit'))
    await waitFor(() => expect(view.getAllByText('夜鸦').length).toBeGreaterThan(0))
    await waitFor(() => expect(view.queryByText('白鹭')).toBeNull())

    // 组合：role=owner AND keyword=crow → 空集 → 「无匹配成员」空态
    await user.selectOptions(view.getByTestId('member-role-filter'), 'owner')
    await waitFor(() => expect(view.getAllByText('无匹配成员（当前筛选条件下）').length).toBeGreaterThan(0))
    const note = view.getByTestId('members-filter-scope-note')
    expect(note.textContent).toContain('命中 0 行')
  })

  it('筛选变化重置 page=1（根级规范）：翻页后激活筛选，URL page 回到 1', async () => {
    // 服务端报告 total=13（> 默认 size 10 → 有第 2 页），聚合上限内实际加载 3 行
    const calls = installMembersResponder({ serverPageSizeTotal: 13 })
    const view = renderPageWithProbe()
    await waitFor(() => expect(view.getAllByText('白鹭').length).toBeGreaterThan(0))

    const user = userEvent.setup()
    // 翻到第 2 页：非筛选模式走服务端分页（page=2）
    await user.click(view.getByRole('button', { name: '2' }))
    await waitFor(() => {
      const probe = view.getByTestId('location-probe').textContent ?? ''
      expect(probe).toContain('page=2')
      expect(calls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    // 激活筛选（角色档变化）→ URL page 重置为 1，聚合从第 1 页拉取
    await user.selectOptions(view.getByTestId('member-role-filter'), 'member')
    await waitFor(() => {
      const probe = view.getByTestId('location-probe').textContent ?? ''
      expect(probe).toContain('page=1')
      expect(probe).toContain('role=member')
    })
    await waitFor(() => expect(calls.some((call) => call.page === 1 && call.size === 100)).toBe(true))

    // 关键词提交同样重置 page=1
    await user.type(view.getByTestId('member-keyword-input'), '白')
    await user.click(view.getByTestId('member-filter-submit'))
    await waitFor(() => {
      const probe = view.getByTestId('location-probe').textContent ?? ''
      expect(probe).toContain('page=1')
      expect(probe).toContain('keyword=%E7%99%BD')
    })
  })
})
