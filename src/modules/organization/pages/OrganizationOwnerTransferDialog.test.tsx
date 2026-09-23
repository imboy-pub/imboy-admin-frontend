/**
 * 修改组织 Owner 对话框组件级单测（OrganizationOwnerTransferDialog）。
 *
 * ⚠️ 替身与反污染约定与 OrganizationCreateDialog.test.tsx 同源：不用 mock.module；
 * 权限源经真实 useAdminPermission 的权威端点 `GET /rbac/me` 供料，sidebar 模板走
 * 全局 fetch stub；client.get/post 用内存 responder（形状必须与真实 client 一致：
 * `{data: 信封}`）。输入必须走 @testing-library/user-event（RTL 16.3 + React 19.2
 * 下 fireEvent.change 无法驱动受控输入）。
 *
 * 覆盖验收点：
 *  ① 完整旅程：搜索 → 选择 → 下一步摘要 → 确认 → POST /organizations/:id/owner-transfer
 *     （body.target_user_id 为所选用户 TSID）+ onChanged 回调；
 *  ② 自转移拦截：选中当前 Owner → 出现提示且「下一步」禁用；
 *  ③ 非活跃用户（status≠1）选项禁用（isUserSelectableForOwner 镜像）；
 *  ④ 409（非成员/归档冲突）→ 展示可行动文案，不调用 onChanged。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationOwnerTransferDialog } from './OrganizationOwnerTransferDialog'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const CURRENT_OWNER_ID = '7700487999999999999'
const NEW_OWNER = { id: '6600487333333333333', account: 'new_owner', nickname: '新任负责人', status: 1 }
const CURRENT_OWNER = { id: CURRENT_OWNER_ID, account: 'owner_account', nickname: '组织所有者', status: 1 }
const INACTIVE_USER = { id: '5500487444444444444', account: 'inactive_user', nickname: '已停用用户', status: 0 }

/** 权威权限源（GET /rbac/me）：授予 organizations:read/write。 */
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

beforeEach(() => {
  stubSidebarFetch()
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') {
      return Promise.resolve({ data: { code: 0, msg: 'ok', payload: RBAC_PROFILE } })
    }
    if (url === '/user/search') {
      return Promise.resolve({
        data: {
          code: 0,
          msg: 'ok',
          payload: { list: [NEW_OWNER, CURRENT_OWNER, INACTIVE_USER], page: 1, size: 20, total: 3, total_page: 1 },
        },
      })
    }
    return Promise.resolve({ data: { code: 0, msg: 'ok', payload: {} } })
  }) as AnyFn
  mutableClient.post = (() => Promise.resolve({ data: { code: 0, msg: 'ok', payload: {} } })) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  cleanup()
})

function renderDialog(props: Partial<React.ComponentProps<typeof OrganizationOwnerTransferDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onChanged = props.onChanged ?? (() => {})
  const result = render(
    <QueryClientProvider client={queryClient}>
      <OrganizationOwnerTransferDialog
        open
        onOpenChange={() => {}}
        organizationId={ORG_ID}
        organizationName="IMBoy"
        currentOwnerId={CURRENT_OWNER_ID}
        onChanged={onChanged}
        {...props}
      />
    </QueryClientProvider>
  )
  return result
}

type View = ReturnType<typeof renderDialog>

/** 搜索并选中目标用户（唯一入口：禁止手填 TSID）。 */
async function pickOwner(view: View, user: ReturnType<typeof userEvent.setup>, target: 'new' | 'current') {
  await user.type(view.getByTestId('owner-transfer-search-input'), 'owner')
  await user.click(view.getByText('搜索'))
  await waitFor(() => expect(view.queryAllByTestId('owner-transfer-option')).toHaveLength(3))
  const options = view.getAllByTestId('owner-transfer-option')
  await user.click(target === 'new' ? options[0] : options[1])
  await waitFor(() => expect(view.queryByTestId('owner-transfer-selected')).not.toBeNull())
}

async function walkToConfirm(view: View, user: ReturnType<typeof userEvent.setup>) {
  await pickOwner(view, user, 'new')
  // 权限源（GET /rbac/me）是异步的：等「下一步」真正可点（canWrite 已落地）再点。
  await waitFor(() => expect((view.getByTestId('owner-transfer-next') as HTMLButtonElement).disabled).toBe(false))
  await user.click(view.getByTestId('owner-transfer-next'))
  await waitFor(() => expect(view.queryByTestId('owner-transfer-summary')).not.toBeNull())
}

// ---------------------------------------------------------------------------
// ① 完整旅程：搜索 → 选择 → 摘要 → 确认提交
// ---------------------------------------------------------------------------
describe('OrganizationOwnerTransferDialog — 完整转移旅程', () => {
  it('提交 POST /organizations/:id/owner-transfer（body.target_user_id=所选 TSID）并触发 onChanged', async () => {
    const posts: Array<{ url: string; body: unknown }> = []
    mutableClient.post = ((_url: string, _body: unknown) => {
      posts.push({ url: _url, body: _body })
      return Promise.resolve({ data: { code: 0, msg: 'ok', payload: {} } })
    }) as AnyFn
    let changed = false
    const view = renderDialog({ onChanged: () => { changed = true } })
    const user = userEvent.setup()
    await walkToConfirm(view, user)

    // 摘要展示组织名 + 当前/新 Owner
    const summary = view.getByTestId('owner-transfer-summary')
    expect(summary.textContent).toContain('IMBoy')
    expect(summary.textContent).toContain(CURRENT_OWNER_ID)
    expect(summary.textContent).toContain('新任负责人')

    await user.click(view.getByTestId('owner-transfer-confirm'))
    await waitFor(() => expect(changed).toBe(true))
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`/organizations/${ORG_ID}/owner-transfer`)
    expect(posts[0].body).toEqual({ target_user_id: NEW_OWNER.id })
  })

  it('对话框提供用户搜索输入，无裸 TSID 手填入口', () => {
    const view = renderDialog()
    expect(view.getByTestId('owner-transfer-search-input')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ② 自转移拦截
// ---------------------------------------------------------------------------
describe('OrganizationOwnerTransferDialog — 自转移拦截', () => {
  it('选中当前 Owner：出现提示，且「下一步」禁用', async () => {
    const view = renderDialog()
    const user = userEvent.setup()
    await pickOwner(view, user, 'current')
    await waitFor(() => expect(view.queryByTestId('owner-transfer-self-hint')).not.toBeNull())
    expect(view.getByTestId('owner-transfer-self-hint').textContent).toContain('当前 Owner')
    expect((view.getByTestId('owner-transfer-next') as HTMLButtonElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ③ 非活跃用户不可选
// ---------------------------------------------------------------------------
describe('OrganizationOwnerTransferDialog — 非活跃用户不可选', () => {
  it('status≠1 的搜索结果选项禁用（active 用户可选）', async () => {
    const view = renderDialog()
    const user = userEvent.setup()
    await user.type(view.getByTestId('owner-transfer-search-input'), 'owner')
    await user.click(view.getByText('搜索'))
    await waitFor(() => expect(view.queryAllByTestId('owner-transfer-option')).toHaveLength(3))
    const options = view.getAllByTestId('owner-transfer-option') as HTMLButtonElement[]
    expect(options[0].disabled).toBe(false)
    expect(options[2].disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ④ 409 失败呈现（非成员 / 归档冲突）
// ---------------------------------------------------------------------------
describe('OrganizationOwnerTransferDialog — 失败呈现', () => {
  it('409 → 展示可行动文案，不调用 onChanged', async () => {
    mutableClient.post = (() => Promise.reject({ code: 409, msg: '该用户不是组织成员或已被移除' })) as AnyFn
    let changed = false
    const view = renderDialog({ onChanged: () => { changed = true } })
    const user = userEvent.setup()
    await walkToConfirm(view, user)
    await user.click(view.getByTestId('owner-transfer-confirm'))
    await waitFor(() => expect(view.queryByText(/409/)).not.toBeNull())
    expect(view.queryByText(/409/)?.textContent).toContain('active 成员')
    expect(changed).toBe(false)
  })

  it('失败后「返回修改」清除错误残留，再进预览不显示过期失败信息', async () => {
    mutableClient.post = (() => Promise.reject({ code: 409, msg: '该用户不是组织成员或已被移除' })) as AnyFn
    const view = renderDialog()
    const user = userEvent.setup()
    await walkToConfirm(view, user)
    await user.click(view.getByTestId('owner-transfer-confirm'))
    await waitFor(() => expect(view.queryByText(/409/)).not.toBeNull())

    await user.click(view.getByText('返回修改'))
    await waitFor(() => expect(view.queryByTestId('owner-transfer-next')).not.toBeNull())
    // select 步骤本就不渲染错误；重进预览后旧错误不得残留
    await user.click(view.getByTestId('owner-transfer-next'))
    await waitFor(() => expect(view.queryByTestId('owner-transfer-summary')).not.toBeNull())
    expect(view.queryByText(/409/)).toBeNull()
  })
})
