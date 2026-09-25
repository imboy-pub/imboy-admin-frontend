/**
 * 组织列表页测试（ENT-ADM-04 / T-P2-4 Organization Profile 最小补差配套）：
 * - Profile Drawer 消费 ENT-FND-01 EntityDrawer sections（profile 事实分区 +
 *   relationship 合同背书关系导航），对齐 OrganizationMembersPage.test 模式；
 * - 权限分权：organizations:write 缺失时写入口（创建/归档/恢复/治理）不渲染；
 * - 旧 URL 可达：名称链接导航 /organizations/:id（App.tsx 既有路由）。
 *
 * ⚠️ 替身与反污染约定同 OrganizationMembersPage.test.tsx：不用 mock.module；
 * 权限源经真实 useAdminPermission 的权威端点 `GET /rbac/me` 供料，sidebar
 * 模板走全局 fetch stub；client.get 内存 responder（`{data: 信封}`）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import client from '@/services/api/client'
import { t } from '@/i18n'
import { OrganizationListPage } from './OrganizationListPage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

// 大 TSID：> 2^53，行键 / 关系导航 / Drawer 字段全程 string（EntityId）
const ORG_ID = '8800487111111111111'
const OWNER_ID = '7700487999999999999'

const ORG_ROW = {
  id: ORG_ID,
  name: 'imboy-org',
  owner_id: OWNER_ID,
  owner_nickname: 'alice',
  owner_account: 'alice@imboy',
  status: 'active',
  member_count: 5,
  workspace_count: 2,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
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

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function orgListEnvelope() {
  return envelope({ list: [ORG_ROW], page: 1, size: 10, total: 1, total_page: 1 })
}

/** 组装权限可控的 get responder：/rbac/me 按 permissions 供料 */
function makeGet(permissions: string[]) {
  return async (url: string) => {
    if (url === '/rbac/me') {
      return envelope({
        role_id: '2',
        role_ids: ['2'],
        permissions,
        menu_paths: [],
      })
    }
    if (url === '/organizations') return orgListEnvelope()
    throw new Error(`unexpected GET url: ${url}`)
  }
}

const READ_WRITE = ['organizations:read', 'organizations:write']
const READ_ONLY = ['organizations:read']

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organizations']}>
        <Routes>
          <Route path="/organizations" element={<OrganizationListPage />} />
          <Route path="/organizations/:organizationId" element={<div>organization-detail-probe</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OrganizationListPage + profile drawer (ENT-ADM-04)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stubSidebarFetch(READ_WRITE)
    mutableClient.post = (() => Promise.resolve(envelope({}))) as AnyFn
  })

  afterEach(() => {
    mutableClient.get = realGet
    mutableClient.post = realPost
    globalThis.fetch = realFetch
    cleanup()
  })

  it('loads organization list with row facts and write entries when permitted', async () => {
    mutableClient.get = makeGet(READ_WRITE) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })
    expect(view.container.textContent).toContain(ORG_ID)
    expect(view.container.textContent).toContain('alice')

    // 写权限齐备：创建入口 + 治理 + 归档（active 组织）渲染
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="org-create-entry"]')).toBeDefined()
    })
    expect(view.container.textContent).toContain('治理')
    expect(view.container.querySelector('[data-testid="org-archive-btn"]')).toBeDefined()
  })

  it('read-only admin: write entries not rendered, profile drawer still reachable', async () => {
    stubSidebarFetch(READ_ONLY)
    mutableClient.get = makeGet(READ_ONLY) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })

    // 权限不足 → 写入口不进 DOM（不是 disabled 按钮；§9-2 合同）
    expect(view.container.querySelector('[data-testid="org-create-entry"]')).toBeNull()
    expect(view.container.querySelector('[data-testid="org-archive-btn"]')).toBeNull()
    expect(view.container.querySelector('[data-testid="org-restore-btn"]')).toBeNull()
    expect(view.container.textContent).toContain(`只读（无 organizations:write 权限）`)

    // 档案 Drawer 是只读投影：read-only 账号仍可用
    const profileBtn = view.container.querySelector('[data-testid="org-profile-btn"]')
    expect(profileBtn).toBeDefined()
  })

  it('opens profile drawer with facts section and contract-backed relation links', async () => {
    mutableClient.get = makeGet(READ_WRITE) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })

    await act(async () => {
      const profileBtns = view.container.querySelectorAll('[data-testid="org-profile-btn"]')
      fireEvent.click(profileBtns[0])
    })

    // profile 分区：行内既有事实只读投影（不新发请求——get 仅 /rbac/me + /organizations）
    await waitFor(() => {
      expect(document.body.textContent).toContain('组织档案')
    })
    const drawerText = document.body.textContent ?? ''
    expect(drawerText).toContain('组织 TSID')
    expect(drawerText).toContain(ORG_ID)
    expect(drawerText).toContain('Workspace 数')

    // relationship 分区：合同背书路由（App.tsx 既有 URL，不造新路由）
    const orgBase = `/organizations/${ORG_ID}`
    const relationLinks = Array.from(document.body.querySelectorAll('a[data-relation-id]'))
    const hrefs = relationLinks.map((anchor) => anchor.getAttribute('href'))
    expect(hrefs).toContain(orgBase)
    expect(hrefs).toContain(`${orgBase}/members`)
    expect(hrefs).toContain(`${orgBase}/invitations`)
    expect(hrefs).toContain(`${orgBase}/departments`)
    expect(hrefs).toContain(`/users/${OWNER_ID}`)

    // Escape 关闭（EntityDrawer 既有键盘语义，消费方零额外代码）
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    })
    await waitFor(() => {
      expect(document.body.textContent ?? '').not.toContain('组织 TSID')
    })
  })

  it('navigates to organization detail via name link (old URL reachable)', async () => {
    mutableClient.get = makeGet(READ_WRITE) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })

    // 名称按钮（行内既有交互）→ /organizations/:id 既有路由可达
    await act(async () => {
      const nameBtn = Array.from(view.container.querySelectorAll('button')).find(
        (btn) => btn.textContent === 'imboy-org'
      )
      if (!nameBtn) throw new Error('组织名称按钮未找到')
      fireEvent.click(nameBtn)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('organization-detail-probe')
    })
  })
})

describe('OrganizationListPage 文案经 t() 输出（ENT-UX-01 i18n 入键门）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stubSidebarFetch(READ_WRITE)
    mutableClient.post = (() => Promise.resolve(envelope({}))) as AnyFn
  })

  afterEach(() => {
    mutableClient.get = realGet
    mutableClient.post = realPost
    globalThis.fetch = realFetch
    cleanup()
  })

  it('页面标题/表头/主按钮渲染文本与键表严格一致', async () => {
    mutableClient.get = makeGet(READ_WRITE) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })

    // 页面标题/描述：经 t() 插权限参数后的完整键值原样渲染
    expect(view.container.textContent).toContain(t('ent.orgList.pageTitle'))
    expect(view.container.textContent).toContain(
      t('ent.orgList.pageDescription', { readPermission: 'organizations:read', writePermission: 'organizations:write' })
    )

    // 表头单元格逐格严格相等（值只能来自键表，不允许字面量旁路）
    const headers = Array.from(view.container.querySelectorAll('th')).map((cell) => cell.textContent ?? '')
    for (const key of [
      'ent.orgList.colName',
      'ent.orgList.colOrgId',
      'ent.orgList.colOwner',
      'ent.orgList.colMemberWorkspace',
      'ent.orgList.colStatus',
      'ent.orgList.colCreatedAt',
      'ent.orgList.colActions',
    ] as const) {
      expect(headers).toContain(t(key))
    }

    // 主按钮：创建组织 / 搜索
    const createBtn = view.container.querySelector('[data-testid="org-create-entry"]')
    expect(createBtn?.textContent).toBe(t('ent.orgList.createOrg'))
    const searchBtn = view.container.querySelector('[data-testid="org-search-submit"]')
    expect(searchBtn?.textContent).toContain(t('ent.orgList.search'))
  })

  it('归档确认弹层文案（标题/描述/确认按钮）经 t() 渲染', async () => {
    mutableClient.get = makeGet(READ_WRITE) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain('imboy-org')
    })
    const archiveBtn = view.container.querySelector('[data-testid="org-archive-btn"]')
    expect(archiveBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(archiveBtn)
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain(t('ent.orgList.archiveTitle', { name: 'imboy-org' }))
    })
    expect(document.body.textContent).toContain(t('ent.orgList.archiveDescription'))
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === t('ent.orgList.archiveConfirm')
    )
    expect(confirmBtn).toBeDefined()
  })

  it('空态文案经 t() 渲染（键表 empty 键直达用户）', async () => {
    mutableClient.get = (async (url: string) => {
      if (url === '/rbac/me') {
        return envelope({ role_id: '2', role_ids: ['2'], permissions: READ_WRITE, menu_paths: [] })
      }
      if (url === '/organizations') {
        return envelope({ list: [], page: 1, size: 10, total: 0, total_page: 0 })
      }
      throw new Error(`unexpected GET url: ${url}`)
    }) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain(t('ent.orgList.empty'))
    })
  })
})
