/**
 * EADM-04 创建组织对话框组件级单测。
 *
 * ⚠️ 替身：client.get/post 用内存 responder（形状必须与真实 client 一致：`{data: 信封}`
 * ——否则 requireApiPayload 取不到 payload，搜索链路假红）。权限门**不使用** mock.module：
 * 真实 useAdminPermission 的权威权限源是 `GET /rbac/me`（见 services/api/rbac.ts:101），
 * 本文件直接给该端点供料（organizations:read/write），sidebar 模板走全局 fetch stub。
 *
 * ⚠️ 反污染（W3 修复，勿退回）：此前本文件用 `mock.module('@/services/api/rbac')` 替换
 * 权限源，并在 afterAll 里把 `import * as realRbacModule` 得到的**命名空间对象**当作还原
 * 工厂传回。但 bun 的 mock.module 会**就地改写**该模块命名空间，mock 生效后该对象已指向
 * mock 自身，于是"还原"实际是把 mock 又注册了一遍 —— mock 永久驻留进程，泄漏给同进程
 * 后续测试文件（EnterpriseBusinessPage / OffboardingCasesPage / OffboardingCaseDetailPage
 * 的 org/ws 接线用例因权限被误判 fail-closed 而批量假红：非隔离 `bun test` 1858 pass /
 * 7 fail）。本文件已彻底不再触碰 mock.module，跨文件污染面归零。
 *
 * ⚠️ 输入必须走 @testing-library/user-event：本仓 RTL(16.3) + React 19.2 组合下
 * fireEvent.change / fireEvent.input 无法触发受控输入的 onChange（最小受控输入
 * 复现同样失败），只有 user-event 的键盘序列能真正驱动状态更新。
 *
 * 覆盖验收点：
 *  ③ 无裸 TSID 手填入口（Owner 必须经搜索选择；高级区 TSID 只读）；
 *  ④ 二次确认步骤存在（提交前展示摘要）；
 *  ② created=false 幂等呈现与 created=true 成功呈现不同（onCreated.created 标志不同，且都不走错误态）；
 *  ⑤ 错误分类文案（403 → 不导航 + 显示 403 可行动文案）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationCreateDialog } from './OrganizationCreateDialog'
import type { EntityId } from '@/types/common'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const OWNER = {
  id: '7700487999999999999',
  account: 'owner_account',
  nickname: '组织所有者',
  status: 1,
}
const ORG_ID = '8800487111111111111'
const WS_ID = '8800487222222222222'

/** 权威权限源（GET /rbac/me）：授予 organizations:read/write，替代 mock.module 的 RBAC 替身。 */
const RBAC_PROFILE = {
  role_id: '1',
  role_ids: ['1'],
  permissions: ['organizations:read', 'organizations:write'],
  menu_paths: [],
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

let postResponder: (_url: string, _body: unknown) => unknown = () => ({
  code: 0,
  msg: 'ok',
  payload: {
    organization: { id: ORG_ID, name: 'imboy', owner_id: OWNER.id, status: 'active' },
    default_workspace: { id: WS_ID, name: 'imboy', status: 'active' },
    created: true,
  },
})

beforeEach(() => {
  stubSidebarFetch()
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') {
      return Promise.resolve({ data: { code: 0, msg: 'ok', payload: RBAC_PROFILE } })
    }
    if (url === '/user/search') {
      return Promise.resolve({
        data: { code: 0, msg: 'ok', payload: { list: [OWNER], page: 1, size: 20, total: 1, total_page: 1 } },
      })
    }
    return Promise.resolve({ data: { code: 0, msg: 'ok', payload: {} } })
  }) as AnyFn
  mutableClient.post = ((_url: string, _body: unknown) =>
    Promise.resolve({ data: postResponder(_url, _body) })) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  cleanup()
})

function renderDialog(props: Partial<React.ComponentProps<typeof OrganizationCreateDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onCreated = props.onCreated ?? (() => {})
  const result = render(
    <QueryClientProvider client={queryClient}>
      <OrganizationCreateDialog open onOpenChange={() => {}} onCreated={onCreated} {...props} />
    </QueryClientProvider>
  )
  return result
}

type View = ReturnType<typeof renderDialog>

/** 搜索并选中 Owner（正常流程唯一入口：禁止手填 TSID）。 */
async function pickOwner(view: View, user: ReturnType<typeof userEvent.setup>) {
  await user.type(view.getByTestId('owner-search-input'), 'owner')
  await user.click(view.getByText('搜索'))
  await waitFor(() => expect(view.queryByTestId('owner-option')).not.toBeNull())
  await user.click(view.getByTestId('owner-option'))
  await waitFor(() => expect(view.queryByTestId('owner-selected')).not.toBeNull())
}

async function walkToConfirm(view: View, user: ReturnType<typeof userEvent.setup>) {
  await user.type(view.getByTestId('org-create-name'), 'imboy')
  await pickOwner(view, user)
  // 权限源（GET /rbac/me）是异步的：等「下一步」真正可点（canWrite 已落地）再点。
  await waitFor(() => expect((view.getByTestId('org-create-next') as HTMLButtonElement).disabled).toBe(false))
  await user.click(view.getByTestId('org-create-next'))
  await waitFor(() => expect(view.queryByTestId('create-summary')).not.toBeNull())
}

// ---------------------------------------------------------------------------
// ③ 无裸 TSID 手填入口
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialog — Owner 选择无裸 TSID 手填入口', () => {
  it('提供用户搜索输入，而非 Owner TSID 文本输入框', () => {
    const view = renderDialog()
    expect(view.getByTestId('owner-search-input')).toBeTruthy()
  })

  it('高级排障区的 Owner TSID 为只读（disabled），正常流程不得手填', async () => {
    const view = renderDialog()
    const user = userEvent.setup()
    await pickOwner(view, user)
    // 选中后展开高级排障区：TSID 只读且 disabled（可复制，不可编辑）
    const readonly = view.getByTestId('owner-tsid-readonly') as HTMLInputElement
    expect(readonly.disabled).toBe(true)
    expect(readonly.readOnly).toBe(true)
    expect(readonly.value).toBe(OWNER.id)
  })
})

// ---------------------------------------------------------------------------
// ④ 二次确认步骤存在
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialog — 二次确认步骤', () => {
  it('提交前展示 Organization / Owner / Workspace 摘要并二次确认', async () => {
    const view = renderDialog()
    await walkToConfirm(view, userEvent.setup())
    const summary = view.getByTestId('create-summary')
    expect(summary.textContent).toContain('imboy') // 组织名（同时作为默认 Workspace 名）
    expect(summary.textContent).toContain('组织所有者') // Owner 昵称
    expect(view.getByTestId('org-create-confirm')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ② created=false vs created=true 呈现不同
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialog — 幂等命中 vs 真实新建', () => {
  it('created=true → onCreated(...,true)', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        organization: { id: ORG_ID, name: 'imboy', owner_id: OWNER.id, status: 'active' },
        default_workspace: { id: WS_ID, name: 'imboy', status: 'active' },
        created: true,
      },
    })
    let captured: { org: EntityId; ws: EntityId; created: boolean } | null = null
    const view = renderDialog({ onCreated: (org, ws, created) => { captured = { org, ws, created } } })
    const user = userEvent.setup()
    await walkToConfirm(view, user)
    await user.click(view.getByTestId('org-create-confirm'))
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured?.created).toBe(true)
    expect(captured?.org).toBe(ORG_ID)
    expect(captured?.ws).toBe(WS_ID)
  })

  it('created=false → onCreated(...,false)（幂等命中，非错误态，且标志不同于成功）', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        organization: { id: ORG_ID, name: 'imboy', owner_id: OWNER.id, status: 'active' },
        default_workspace: { id: WS_ID, name: 'imboy', status: 'active' },
        created: false,
      },
    })
    let captured: { org: EntityId; ws: EntityId; created: boolean } | null = null
    const view = renderDialog({ onCreated: (org, ws, created) => { captured = { org, ws, created } } })
    const user = userEvent.setup()
    await walkToConfirm(view, user)
    await user.click(view.getByTestId('org-create-confirm'))
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured?.created).toBe(false)
    // 幂等命中同样导向该组织详情页
    expect(captured?.org).toBe(ORG_ID)
    expect(captured?.ws).toBe(WS_ID)
    // 幂等命中走成功分支（未出现提交错误态）
    expect(view.queryByText(/创建失败|事务失败|无权限/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ⑤ 错误分类文案（403 不导航 + 显示可行动文案）
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialog — 错误分类', () => {
  it('403 → 不调用 onCreated，且展示 403 可行动文案', async () => {
    mutableClient.post = (() => Promise.reject({ code: 403, msg: '无 organizations:write' })) as AnyFn
    let called = false
    const view = renderDialog({ onCreated: () => { called = true } })
    const user = userEvent.setup()
    await walkToConfirm(view, user)
    await user.click(view.getByTestId('org-create-confirm'))
    await waitFor(() => expect(view.queryByText(/403/)).not.toBeNull())
    expect(called).toBe(false)
  })
})
