/**
 * GZAPP-06 创建组织对话框 V2 组件级单测（双模式 + D12 成功分叉）。
 *
 * ⚠️ 测试四铁律（eadm 血泪，勿退回）：
 *  1) user-event 驱动受控输入（RTL16.3 + React19.2 下 fireEvent.change 无效）；
 *  2) 权限门不 mock.module('@/services/api/rbac')——真实 useAdminPermission 的
 *     权威源是 GET /rbac/me，本文件直接给该端点供料（organizations:read/write）；
 *  3) client 替身返回 {data: 信封}（code/msg/payload），否则 requireApiPayload 假红；
 *  4) import '../../../test/setupDom'。
 *
 * 覆盖验收点：
 *  ① 双模式切换（registered 默认 = 搜索选择；pending_phone = 手机号输入）；
 *  ② pending 模式提交 → 成功（sms_sent=true）→ onCreated + 关闭（无警示态）；
 *  ③ D12 成功分叉：sms_sent=false + owner_activation.status=sms_failed →
 *     警示态（org 已建 + 重发按钮），onCreated 已发出（企业是既成事实，非错误）；
 *     点重发 → POST /owner-activation/resend → 成功提示；
 *  ④ 手机号非法 → 前端 hint + 禁止进入下一步；
 *  ⑤ registered 模式行为保持（搜索选择路径）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationCreateDialogV2 } from './OrganizationCreateDialogV2'

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
const INVITE_ID = '9900487333333333333'

const RBAC_PROFILE = {
  role_id: '1',
  role_ids: ['1'],
  permissions: ['organizations:read', 'organizations:write'],
  menu_paths: [],
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

function pendingCreatePayload(smsSent: boolean) {
  return {
    code: 0,
    msg: 'ok',
    payload: {
      organization: { id: ORG_ID, name: '广州企业', owner_id: OWNER.id, status: 'active' },
      default_workspace: { id: WS_ID, name: '默认区', status: 'active' },
      created: true,
      sms_sent: smsSent,
      owner_activation: {
        invite_id: INVITE_ID,
        organization_id: ORG_ID,
        owner_user_id: OWNER.id,
        status: smsSent ? 'pending' : 'sms_failed',
        mobile_masked: '138****2222',
        expires_at: 1_900_000_000,
        resend_count: 0,
        activation_token: 'a'.repeat(64),
      },
    },
  }
}

type Captured = { url: string; body: unknown }[]
let posts: Captured = []
let postResponder: (_url: string, _body: unknown) => unknown = () => pendingCreatePayload(true)

beforeEach(() => {
  stubSidebarFetch()
  posts = []
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
  mutableClient.post = ((url: string, body: unknown) => {
    posts.push({ url, body })
    return Promise.resolve({ data: postResponder(url, body) })
  }) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  cleanup()
})

function renderDialog(props: Partial<React.ComponentProps<typeof OrganizationCreateDialogV2>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onCreated =
    props.onCreated ??
    (() => {})
  const view = render(
    <QueryClientProvider client={queryClient}>
      <OrganizationCreateDialogV2 open onOpenChange={() => {}} onCreated={onCreated} {...props} />
    </QueryClientProvider>
  )
  return view
}

type View = ReturnType<typeof renderDialog>

/** 填表并走到确认页（pending_phone 模式）。 */
async function walkPendingToConfirm(view: View, user: ReturnType<typeof userEvent.setup>, mobile = '13811112222') {
  await user.click(view.getByTestId('mode-pending-phone'))
  await user.type(view.getByTestId('org-create2-name'), '广州企业')
  await user.type(view.getByTestId('org-create2-mobile'), mobile)
  await waitFor(() => expect((view.getByTestId('org-create2-next') as HTMLButtonElement).disabled).toBe(false))
  await user.click(view.getByTestId('org-create2-next'))
  await waitFor(() => expect(view.queryByTestId('create-summary')).not.toBeNull())
}

// ---------------------------------------------------------------------------
// ① 双模式
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialogV2 — 双模式', () => {
  it('默认 registered：提供搜索输入，无手机号输入', () => {
    const view = renderDialog()
    expect(view.getByTestId('owner-search-input')).toBeTruthy()
    expect(view.queryByTestId('org-create2-mobile')).toBeNull()
  })

  it('切到 pending_phone：出现手机号输入（无搜索输入）', async () => {
    const view = renderDialog()
    const user = userEvent.setup()
    await user.click(view.getByTestId('mode-pending-phone'))
    expect(view.getByTestId('org-create2-mobile')).toBeTruthy()
    expect(view.queryByTestId('owner-search-input')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ② pending 成功（sms_sent=true）
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialogV2 — pending 模式成功', () => {
  it('四键 body 提交；成功后 onCreated(activation) 且关闭（无警示态）', async () => {
    postResponder = () => pendingCreatePayload(true)
    let captured: { org: string; ws: string; created: boolean; activation?: unknown } | null = null
    const view = renderDialog({
      onCreated: (org, ws, created, activation) => {
        captured = { org, ws, created, activation }
      },
    })
    const user = userEvent.setup()
    await walkPendingToConfirm(view, user)
    await user.click(view.getByTestId('org-create2-confirm'))
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.org).toBe(ORG_ID)
    expect(captured!.ws).toBe(WS_ID)
    expect(captured!.created).toBe(true)
    expect((captured!.activation as Record<string, unknown>)['status']).toBe('pending')
    // 提交 body：四键 + 归一化手机号
    const create = posts.find((p) => p.url === '/organizations')
    expect(create).toBeTruthy()
    expect(create!.body).toEqual({
      name: '广州企业',
      owner_mode: 'pending_phone',
      default_workspace_name: '广州企业',
      owner_mobile: '13811112222',
    })
    // 成功即关闭：警示态不出现
    expect(view.queryByTestId('pending-sms-warning')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ③ D12 成功分叉：sms_failed 警示态 + 重发
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialogV2 — D12 成功分叉（短信失败不回滚）', () => {
  it('sms_sent=false → 警示态（org 已建 + 重发按钮）；onCreated 已发出（非错误）', async () => {
    postResponder = () => pendingCreatePayload(false)
    let captured: { org: string; created: boolean } | null = null
    const view = renderDialog({
      onCreated: (org, _ws, created) => {
        captured = { org, created }
      },
    })
    const user = userEvent.setup()
    await walkPendingToConfirm(view, user)
    await user.click(view.getByTestId('org-create2-confirm'))
    await waitFor(() => expect(view.queryByTestId('pending-sms-warning')).not.toBeNull())
    // 企业创建是既成事实：onCreated 已带 org
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.org).toBe(ORG_ID)
    expect(captured!.created).toBe(true)
    // 警示态非错误呈现
    expect(view.queryByText(/创建失败|事务失败|无权限/)).toBeNull()
    // 脱敏手机号展示
    expect(view.getByTestId('pending-sms-warning').textContent).toContain('138****2222')
  })

  it('警示态点重发 → POST /owner-activation/resend → 成功后更新为已重发', async () => {
    postResponder = () => pendingCreatePayload(false)
    const view = renderDialog()
    const user = userEvent.setup()
    await walkPendingToConfirm(view, user)
    await user.click(view.getByTestId('org-create2-confirm'))
    await waitFor(() => expect(view.queryByTestId('resend-sms-btn')).not.toBeNull())
    // 切换 responder：重发成功
    postResponder = (url: string) => {
      if (url.endsWith('/owner-activation/resend')) {
        return {
          code: 0,
          msg: 'ok',
          payload: {
            invite: {
              invite_id: INVITE_ID,
              organization_id: ORG_ID,
              owner_user_id: OWNER.id,
              status: 'pending',
              mobile_masked: '138****2222',
              expires_at: 1_900_000_000,
              resend_count: 1,
              activation_token: 'b'.repeat(64),
            },
            sms_sent: true,
          },
        }
      }
      return pendingCreatePayload(false)
    }
    await user.click(view.getByTestId('resend-sms-btn'))
    await waitFor(() => {
      const resend = posts.find((p) => p.url.endsWith('/owner-activation/resend'))
      expect(resend).toBeTruthy()
    })
    // 重发后展示一次性 token（轮换后新值）
    await waitFor(() => expect(view.queryByTestId('activation-token-once')).not.toBeNull())
    expect((view.getByTestId('activation-token-once') as HTMLInputElement).value).toBe('b'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// ④ 手机号校验
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialogV2 — 手机号前端校验', () => {
  it('非法手机号 → hint + 下一步禁用', async () => {
    const view = renderDialog()
    const user = userEvent.setup()
    await user.click(view.getByTestId('mode-pending-phone'))
    await user.type(view.getByTestId('org-create2-name'), '广州企业')
    await user.type(view.getByTestId('org-create2-mobile'), 'abc')
    await waitFor(() => expect(view.queryByTestId('mobile-invalid-hint')).not.toBeNull())
    expect((view.getByTestId('org-create2-next') as HTMLButtonElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ⑤ registered 模式保持（搜索选择路径）
// ---------------------------------------------------------------------------
describe('OrganizationCreateDialogV2 — registered 模式保持', () => {
  it('搜索选择 Owner → 三键 body（owner_user_id）提交成功', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        organization: { id: ORG_ID, name: 'imboy', owner_id: OWNER.id, status: 'active' },
        default_workspace: { id: WS_ID, name: 'imboy', status: 'active' },
        created: true,
      },
    })
    let captured: { org: string; created: boolean; activation?: unknown } | null = null
    const view = renderDialog({
      onCreated: (org, _ws, created, activation) => {
        captured = { org, created, activation }
      },
    })
    const user = userEvent.setup()
    await user.type(view.getByTestId('org-create2-name'), 'imboy')
    await user.type(view.getByTestId('owner-search-input'), 'owner')
    await user.click(view.getByText('搜索'))
    await waitFor(() => expect(view.queryByTestId('owner-option')).not.toBeNull())
    await user.click(view.getByTestId('owner-option'))
    await waitFor(() => expect(view.queryByTestId('owner-selected')).not.toBeNull())
    await waitFor(() => expect((view.getByTestId('org-create2-next') as HTMLButtonElement).disabled).toBe(false))
    await user.click(view.getByTestId('org-create2-next'))
    await waitFor(() => expect(view.queryByTestId('create-summary')).not.toBeNull())
    await user.click(view.getByTestId('org-create2-confirm'))
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.created).toBe(true)
    expect(captured!.activation).toBeUndefined()
    const create = posts.find((p) => p.url === '/organizations')
    expect(create!.body).toEqual({
      name: 'imboy',
      owner_user_id: OWNER.id,
      default_workspace_name: 'imboy',
    })
  })
})
