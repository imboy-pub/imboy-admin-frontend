/**
 * EADM-04 W3 修复：组织详情页「默认 Workspace 只读事实 + 跨面直达入口」组件级单测。
 *
 * 覆盖验收点：
 *  ① 默认 Workspace 区域渲染（名称 + 状态，来源 = URL 的 ws 成立事实；无 ws 时如实降级）；
 *  ② 直达链接携带正确的 org/ws（开通客服 / 查看坐席 / 查看会话 / Widget / 企业业务 /
 *     成员 / 部门 / 默认 Workspace）；
 *  ③ 既有 Owner 展示保留（owner_id / owner 昵称账号）。
 *
 * ⚠️ 反污染：本文件不使用 bun mock.module（进程级全局、无法可靠还原，曾污染同进程
 * 后续文件的权限判定）。权限源经真实 useAdminPermission 的权威端点 `GET /rbac/me`
 * 供料（services/api/rbac.ts:101），sidebar 模板走全局 fetch stub。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationDetailPage } from './OrganizationDetailPage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn }
const realGet = mutableClient.get
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const WS_ID = '8800487222222222222'
const WS_OTHER_ID = '8800487333333333333'

/** 权威权限源（GET /rbac/me）：授予 organizations:read/write。 */
const RBAC_PROFILE = {
  role_id: '1',
  role_ids: ['1'],
  permissions: ['organizations:read', 'organizations:write'],
  menu_paths: [],
}

const ORG_DETAIL = {
  id: ORG_ID,
  name: 'imboy',
  owner_id: '7700487999999999999',
  owner_nickname: '组织所有者',
  owner_account: 'owner_account',
  status: 'active',
  member_count: 3,
  workspace_count: 2,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  branding: {},
  settings: {},
}

const WORKSPACE_ROWS = [
  {
    id: WS_ID,
    name: 'imboy 默认工作区',
    owner_id: '7700487999999999999',
    organization_id: ORG_ID,
    status: 'active',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
  },
  {
    id: WS_OTHER_ID,
    name: '支持工作区',
    owner_id: '7700487999999999999',
    organization_id: ORG_ID,
    status: 'archived',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
  },
]

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

/** sidebar 模板 stub：权限判定实际由 /rbac/me 决定，这里只为让兜底查询快速落地。 */
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
              {
                id: '1',
                name: 'super_admin',
                description: '',
                permissions: ['organizations:read', 'organizations:write'],
              },
            ],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

beforeEach(() => {
  stubSidebarFetch()
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') return Promise.resolve(envelope(RBAC_PROFILE))
    if (url === `/organizations/${ORG_ID}`) return Promise.resolve(envelope(ORG_DETAIL))
    if (url === `/organizations/${ORG_ID}/workspaces`) {
      return Promise.resolve(
        envelope({ list: WORKSPACE_ROWS, page: 1, size: 100, total: WORKSPACE_ROWS.length, total_page: 1 })
      )
    }
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  globalThis.fetch = realFetch
  cleanup()
})

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/organizations/:organizationId" element={<OrganizationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

type View = ReturnType<typeof renderPage>

async function waitDetailReady(view: View) {
  await waitFor(() => expect(view.queryByTestId('org-default-workspace')).not.toBeNull())
}

// ---------------------------------------------------------------------------
// ① 默认 Workspace 区域渲染
// ---------------------------------------------------------------------------
describe('OrganizationDetailPage — 默认 Workspace 只读事实', () => {
  it('URL 携带 ws 成立事实时：展示默认 Workspace 名称 + 状态，并列出全部工作区事实', async () => {
    const view = renderPage(`/organizations/${ORG_ID}?org=${ORG_ID}&ws=${WS_ID}`)
    await waitDetailReady(view)

    // 默认指针：名称与状态来自只读端点 GET /organizations/:id/workspaces
    expect(view.getByTestId('org-default-workspace-id').textContent).toContain(WS_ID)
    expect(view.getByTestId('org-default-workspace-name').textContent).toContain('imboy 默认工作区')
    expect(view.getByTestId('org-default-workspace-status').textContent).toContain('active')
    expect(view.getByTestId('org-default-workspace-source').textContent).toContain('URL 上下文')

    // 组织工作区列表事实（名称 + 状态）
    const rows = view.getAllByTestId('org-workspace-row')
    expect(rows).toHaveLength(2)
    expect(view.getByText('支持工作区')).toBeTruthy()
    // 仅 URL 指认的那一条被标注为默认，另一条不标
    expect(view.getAllByTestId('org-workspace-row-is-default')).toHaveLength(1)

    // 未降级
    expect(view.queryByTestId('org-default-workspace-degraded')).toBeNull()
  })

  it('URL 无 ws 时如实降级：不推导默认指针，仍列出工作区事实并写明依据', async () => {
    const view = renderPage(`/organizations/${ORG_ID}?org=${ORG_ID}`)
    await waitDetailReady(view)

    expect(view.getByTestId('org-default-workspace-degraded')).toBeTruthy()
    // 不编造：没有默认指针就不渲染默认指针 ID / 状态
    expect(view.queryByTestId('org-default-workspace-id')).toBeNull()
    expect(view.queryByTestId('org-default-workspace-status')).toBeNull()
    expect(view.queryByTestId('org-workspace-row-is-default')).toBeNull()
    expect(view.getByTestId('org-default-workspace-source').textContent).toContain('降级')
    // 只读端点仍被调用，工作区事实照常展示
    expect(view.getAllByTestId('org-workspace-row')).toHaveLength(2)
  })

  it('保留 Owner 展示（owner_id + 昵称/账号）', async () => {
    const view = renderPage(`/organizations/${ORG_ID}?org=${ORG_ID}&ws=${WS_ID}`)
    await waitDetailReady(view)
    const page = view.getByTestId('org-workspace-facts').closest('[data-page="organization-detail"]')
    expect(page?.textContent).toContain(ORG_DETAIL.owner_id)
    expect(page?.textContent).toContain('组织所有者')
    expect(page?.textContent).toContain('owner_account')
  })
})

// ---------------------------------------------------------------------------
// ② 直达链接携带正确的 org/ws
// ---------------------------------------------------------------------------
describe('OrganizationDetailPage — 跨面直达链接的 org/ws 上下文', () => {
  const EXPECTED: Array<[string, string]> = [
    ['org-link-cs-provisioning', '/customer-service/provisioning'],
    ['org-link-cs-seats', '/customer-service'],
    ['org-link-cs-sessions', '/customer-service/sessions'],
    ['org-link-cs-widgets', '/customer-service/widgets'],
    ['org-link-enterprise-business', '/enterprise-business'],
    ['org-link-members', `/organizations/${ORG_ID}/members`],
    ['org-link-departments', `/organizations/${ORG_ID}/departments`],
    ['org-link-default-workspace', '/enterprise-business'],
  ]

  it('8 个直达入口均存在，且 href 携带 org 与 ws 查询参数', async () => {
    const view = renderPage(`/organizations/${ORG_ID}?org=${ORG_ID}&ws=${WS_ID}`)
    await waitDetailReady(view)

    for (const [testId, path] of EXPECTED) {
      const href = view.getByTestId(testId).getAttribute('href')
      expect(href).not.toBeNull()
      const url = new URL(href as string, 'http://localhost')
      expect(url.pathname).toBe(path)
      expect(url.searchParams.get('org')).toBe(ORG_ID)
      expect(url.searchParams.get('ws')).toBe(WS_ID)
    }
  })

  it('无 ws 成立事实时：ws 参数如实省略，org 仍携带，且不渲染「默认 Workspace」假入口', async () => {
    const view = renderPage(`/organizations/${ORG_ID}?org=${ORG_ID}`)
    await waitDetailReady(view)

    expect(view.queryByTestId('org-link-default-workspace')).toBeNull()

    for (const [testId, path] of EXPECTED.filter(([id]) => id !== 'org-link-default-workspace')) {
      const url = new URL(view.getByTestId(testId).getAttribute('href') as string, 'http://localhost')
      expect(url.pathname).toBe(path)
      expect(url.searchParams.get('org')).toBe(ORG_ID)
      expect(url.searchParams.get('ws')).toBeNull()
    }
  })
})
