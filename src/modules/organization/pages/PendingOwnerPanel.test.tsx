/**
 * GZAPP-06 待激活 Owner 面板组件级单测。
 *
 * ⚠️ 测试四铁律（eadm 血泪，勿退回）：
 *  1) user-event 驱动受控输入（fireEvent.change 在 RTL16.3+React19 无效）；
 *  2) 禁 mock.module rbac——权限源走真端点 GET /rbac/me 供料；
 *  3) client 替身返回 {data: 信封}；
 *  4) import '../../../test/setupDom'。
 *
 * 覆盖验收点：
 *  ① 状态卡渲染：状态标签 / 脱敏手机号 / TTL 倒计时 / 重发次数 / Owner 激活徽标；
 *  ② 过期派生态：expired=true → 「已过期，可重新激活」标签 + 重新激活按钮高亮可用；
 *  ③ 重发：POST .../owner-activation/resend → 展示一次性轮换 token + 计数刷新；
 *  ④ 重新激活：POST .../reactivate（TTL 重置）；
 *  ⑤ 按手机号换 Owner：POST .../owner-transfer-by-phone + {owner_mobile}（归一化）；
 *    非法手机号按钮禁用；
 *  ⑥ 终态（activated/superseded）：重发/重激活禁用（无 live invite）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import client from '@/services/api/client'
import { PendingOwnerPanel } from './PendingOwnerPanel'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const OWNER_ID = '7700487999999999999'
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

function invitePayload(overrides: Record<string, unknown> = {}) {
  return {
    invite_id: INVITE_ID,
    organization_id: ORG_ID,
    owner_user_id: OWNER_ID,
    status: 'pending',
    mobile_masked: '138****2222',
    expires_at: Math.floor(Date.now() / 1000) + 29 * 86400,
    last_sent_at: null,
    resend_count: 0,
    consumed_at: null,
    created_at: null,
    ttl_remaining_seconds: 29 * 86400,
    expired: false,
    ...overrides,
  }
}

let statusPayload: Record<string, unknown> = {}
type Captured = { url: string; body: unknown }[]
let posts: Captured = []
let postResponder: (_url: string, _body: unknown) => unknown = () => ({ code: 0, msg: 'ok', payload: {} })

beforeEach(() => {
  stubSidebarFetch()
  posts = []
  statusPayload = {
    organization_id: ORG_ID,
    organization_name: '广州企业',
    organization_status: 'active',
    owner_user_id: OWNER_ID,
    owner_activated: false,
    invite: invitePayload(),
  }
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') {
      return Promise.resolve({ data: { code: 0, msg: 'ok', payload: RBAC_PROFILE } })
    }
    if (url === `/organizations/${ORG_ID}/owner-activation`) {
      return Promise.resolve({ data: { code: 0, msg: 'ok', payload: statusPayload } })
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

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingOwnerPanel organizationId={ORG_ID} />
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// ① 状态卡渲染
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — 状态卡', () => {
  it('pending：标签 + 脱敏手机号 + TTL + 计数 + 未激活徽标', async () => {
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('pending-owner-invite')).not.toBeNull())
    expect(view.getByTestId('invite-status-label').textContent).toBe('待激活')
    expect(view.getByTestId('invite-mobile-masked').textContent).toBe('138****2222')
    expect(view.getByTestId('invite-ttl').textContent).toContain('剩')
    expect(view.getByTestId('invite-resend-count').textContent).toBe('0')
    expect(view.queryByTestId('owner-pending-badge')).not.toBeNull()
    // mobile 明文绝不出现
    expect(view.getByTestId('pending-owner-panel').textContent).not.toContain('13811112222')
  })

  it('Owner 已激活（consume 后）→ activated 徽标', async () => {
    statusPayload = { ...statusPayload, owner_activated: true }
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('owner-activated-badge')).not.toBeNull())
  })
})

// ---------------------------------------------------------------------------
// ② 过期派生态
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — TTL 过期', () => {
  it('expired invite → 「已过期，可重新激活」标签；重激活按钮可用', async () => {
    statusPayload = {
      ...statusPayload,
      invite: invitePayload({ ttl_remaining_seconds: -3600, expired: true, resend_count: 2 }),
    }
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('invite-status-label')).not.toBeNull())
    expect(view.getByTestId('invite-status-label').textContent).toBe('待激活（已过期，可重新激活）')
    expect(view.getByTestId('invite-ttl').textContent).toContain('已过期')
    expect((view.getByTestId('reactivate-btn') as HTMLButtonElement).disabled).toBe(false)
    expect((view.getByTestId('resend-btn') as HTMLButtonElement).disabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ③ 重发
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — 重发', () => {
  it('POST /owner-activation/resend → 一次性轮换 token 展示 + 状态刷新', async () => {
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('resend-btn')).not.toBeNull())
    postResponder = (url: string) => {
      if (url.endsWith('/owner-activation/resend')) {
        return {
          code: 0,
          msg: 'ok',
          payload: {
            invite: {
              invite_id: INVITE_ID,
              organization_id: ORG_ID,
              owner_user_id: OWNER_ID,
              status: 'pending',
              mobile_masked: '138****2222',
              expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
              resend_count: 1,
              activation_token: 'b'.repeat(64),
            },
            sms_sent: true,
          },
        }
      }
      return { code: 0, msg: 'ok', payload: {} }
    }
    // 覆盖刷新后的状态（resend_count=1）
    statusPayload = { ...statusPayload, invite: invitePayload({ resend_count: 1 }) }
    const user = userEvent.setup()
    await user.click(view.getByTestId('resend-btn'))
    const resend = posts.find((p) => p.url.endsWith('/owner-activation/resend'))
    expect(resend).toBeTruthy()
    expect(resend!.body).toEqual({})
    await waitFor(() => expect(view.queryByTestId('activation-token-once')).not.toBeNull())
    expect((view.getByTestId('activation-token-once') as HTMLInputElement).value).toBe('b'.repeat(64))
    await waitFor(() => expect(view.getByTestId('invite-resend-count').textContent).toBe('1'))
  })
})

// ---------------------------------------------------------------------------
// ④ 重新激活
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — 重新激活', () => {
  it('POST /owner-activation/reactivate（TTL 重置）', async () => {
    statusPayload = {
      ...statusPayload,
      invite: invitePayload({ ttl_remaining_seconds: -60, expired: true }),
    }
    const view = renderPanel()
    await waitFor(() => expect((view.getByTestId('reactivate-btn') as HTMLButtonElement).disabled).toBe(false))
    const user = userEvent.setup()
    await user.click(view.getByTestId('reactivate-btn'))
    await waitFor(() => {
      const reactivated = posts.find((p) => p.url.endsWith('/owner-activation/reactivate'))
      expect(reactivated).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// ⑤ 按手机号换 Owner
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — 按手机号换 Owner', () => {
  it('POST /owner-transfer-by-phone + {owner_mobile}（+86 归一化）', async () => {
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('replace-owner-btn')).not.toBeNull())
    const user = userEvent.setup()
    await user.type(view.getByTestId('replace-owner-mobile'), '+8613900003333')
    await waitFor(() => expect((view.getByTestId('replace-owner-btn') as HTMLButtonElement).disabled).toBe(false))
    await user.click(view.getByTestId('replace-owner-btn'))
    await waitFor(() => {
      const transfer = posts.find((p) => p.url.endsWith('/owner-transfer-by-phone'))
      expect(transfer).toBeTruthy()
      expect(transfer!.body).toEqual({ owner_mobile: '13900003333' })
    })
  })

  it('非法手机号 → 更换按钮禁用', async () => {
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('replace-owner-mobile')).not.toBeNull())
    const user = userEvent.setup()
    await user.type(view.getByTestId('replace-owner-mobile'), 'not-mobile')
    expect((view.getByTestId('replace-owner-btn') as HTMLButtonElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ⑥ 终态：无 live invite → 动作禁用
// ---------------------------------------------------------------------------
describe('PendingOwnerPanel — 终态', () => {
  it.each([
    ['activated', '已激活'],
    ['superseded', '已作废（Owner 已更换）'],
  ])('status=%s → 标签 %s；重发/重激活禁用', async (status, label) => {
    statusPayload = { ...statusPayload, invite: invitePayload({ status }) }
    const view = renderPanel()
    await waitFor(() => expect(view.getByTestId('invite-status-label').textContent).toBe(label))
    expect((view.getByTestId('resend-btn') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('reactivate-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('无邀请（invite=null）→ 占位文案', async () => {
    statusPayload = { ...statusPayload, invite: null, owner_activated: true }
    const view = renderPanel()
    await waitFor(() => expect(view.queryByTestId('invite-none')).not.toBeNull())
    expect((view.getByTestId('resend-btn') as HTMLButtonElement).disabled).toBe(true)
  })
})
