/**
 * GZAPP-06 待激活 Owner API client 单测（契约回归）。
 *
 * ⚠️ 替身：client.get/post 用内存 responder，形状必须与真实 client 一致
 * （`{data: 信封}`，信封 = {code, msg, payload}）——否则 requireApiPayload
 * 取不到 payload，链路假红。四铁律之「client 替身返回 {data:信封}」。
 *
 * 覆盖：
 * ① createOrganizationWithPendingOwner：POST /organizations + 四键 body
 *    （owner_mode=pending_phone，mobile 归一化后发送）；
 * ② getPendingOwnerStatus：GET .../owner-activation；
 * ③ resendOwnerActivationSms / reactivateOwner：POST 对应子路径；
 * ④ replaceOwnerByPhone：POST .../owner-transfer-by-phone + {owner_mobile}；
 *    非法手机号在客户端即拒（不出请求）；
 * ⑤ 响应归一化：sms_sent / invite / activation_token 一次性字段。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  createOrganizationWithPendingOwner,
  getPendingOwnerStatus,
  reactivateOwner,
  replaceOwnerByPhone,
  resendOwnerActivationSms,
} from './pendingOwnerApi'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post

const ORG_ID = '8800000000000000001'

const CREATE_PAYLOAD = {
  organization: { id: ORG_ID, name: '广州企业', owner_id: '7700000000000000001', status: 'active' },
  default_workspace: { id: '8800000000000000002', name: '默认区', status: 'active' },
  created: true,
  sms_sent: true,
  owner_activation: {
    invite_id: '9900000000000000001',
    organization_id: ORG_ID,
    owner_user_id: '7700000000000000001',
    status: 'pending',
    mobile_masked: '138****2222',
    expires_at: 1_900_000_000,
    resend_count: 0,
    activation_token: 'a'.repeat(64),
  },
}

type Captured = { url: string; body: unknown } | null
let capturedPost: Captured = null
let capturedGetUrl: string | null = null
let postResponder: (_url: string, _body: unknown) => unknown = () => ({
  code: 0,
  msg: 'ok',
  payload: CREATE_PAYLOAD,
})

beforeEach(() => {
  capturedPost = null
  capturedGetUrl = null
  mutableClient.get = ((url: string) => {
    capturedGetUrl = url
    return Promise.resolve({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          organization_id: ORG_ID,
          organization_name: '广州企业',
          organization_status: 'active',
          owner_user_id: '7700000000000000001',
          owner_activated: false,
          invite: {
            invite_id: '9900000000000000001',
            organization_id: ORG_ID,
            owner_user_id: '7700000000000000001',
            status: 'pending',
            mobile_masked: '138****2222',
            expires_at: 1_900_000_000,
            last_sent_at: null,
            resend_count: 0,
            consumed_at: null,
            created_at: null,
            ttl_remaining_seconds: 86400,
            expired: false,
          },
        },
      },
    })
  }) as AnyFn
  mutableClient.post = ((url: string, body: unknown) => {
    capturedPost = { url, body }
    return Promise.resolve({ data: postResponder(url, body) })
  }) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
})

// ---------------------------------------------------------------------------
// ① 创建（pending_phone）：POST /organizations + 严格四键
// ---------------------------------------------------------------------------
describe('createOrganizationWithPendingOwner', () => {
  it('POST /organizations，body 四键且 owner_mode=pending_phone，mobile 归一化', async () => {
    const result = await createOrganizationWithPendingOwner({
      name: '广州企业',
      ownerMobile: '+86 138-1111-2222',
      defaultWorkspaceName: '默认区',
    })
    expect(capturedPost?.url).toBe('/organizations')
    const body = capturedPost?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(
      ['default_workspace_name', 'name', 'owner_mobile', 'owner_mode'].sort()
    )
    expect(body['owner_mode']).toBe('pending_phone')
    expect(body['owner_mobile']).toBe('13811112222')
    expect(result.created).toBe(true)
    expect(result.smsSent).toBe(true)
    expect(result.ownerActivation?.status).toBe('pending')
    expect(result.ownerActivation?.activationToken).toBe('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// ② 状态卡
// ---------------------------------------------------------------------------
describe('getPendingOwnerStatus', () => {
  it('GET /organizations/:id/owner-activation 并归一化 invite', async () => {
    const view = await getPendingOwnerStatus(ORG_ID)
    expect(capturedGetUrl).toBe(`/organizations/${ORG_ID}/owner-activation`)
    expect(view.organizationId).toBe(ORG_ID)
    expect(view.ownerActivated).toBe(false)
    expect(view.invite?.status).toBe('pending')
    expect(view.invite?.ttlRemainingSeconds).toBe(86400)
  })
})

// ---------------------------------------------------------------------------
// ③ resend / reactivate
// ---------------------------------------------------------------------------
describe('resendOwnerActivationSms / reactivateOwner', () => {
  it('resend POST 子路径 /resend，响应带轮换 token 与 resend_count', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        invite: {
          invite_id: '9900000000000000001',
          organization_id: ORG_ID,
          owner_user_id: '7700000000000000001',
          status: 'pending',
          mobile_masked: '138****2222',
          expires_at: 1_900_000_000,
          resend_count: 1,
          activation_token: 'b'.repeat(64),
        },
        sms_sent: true,
      },
    })
    const rotated = await resendOwnerActivationSms(ORG_ID)
    expect(capturedPost?.url).toBe(`/organizations/${ORG_ID}/owner-activation/resend`)
    expect(rotated.smsSent).toBe(true)
    expect(rotated.invite?.resendCount).toBe(1)
    expect(rotated.invite?.activationToken).toBe('b'.repeat(64))
  })

  it('reactivate POST 子路径 /reactivate', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        invite: {
          invite_id: '9900000000000000001',
          organization_id: ORG_ID,
          owner_user_id: '7700000000000000001',
          status: 'pending',
          mobile_masked: '138****2222',
          expires_at: 1_900_100_000,
          resend_count: 1,
          activation_token: 'c'.repeat(64),
        },
        sms_sent: true,
      },
    })
    const rotated = await reactivateOwner(ORG_ID)
    expect(capturedPost?.url).toBe(`/organizations/${ORG_ID}/owner-activation/reactivate`)
    expect(rotated.invite?.status).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// ④ 按手机号换 Owner
// ---------------------------------------------------------------------------
describe('replaceOwnerByPhone', () => {
  it('POST .../owner-transfer-by-phone，body {owner_mobile}（归一化）', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        organization_id: ORG_ID,
        owner_user_id: '7700000000000000009',
        previous_owner_id: '7700000000000000001',
        mode: 'pending_transfer',
        sms_sent: true,
        invite: {
          invite_id: '9900000000000000002',
          organization_id: ORG_ID,
          owner_user_id: '7700000000000000009',
          status: 'pending',
          mobile_masked: '139****3333',
          expires_at: 1_900_000_000,
          resend_count: 0,
          activation_token: 'd'.repeat(64),
        },
      },
    })
    const result = await replaceOwnerByPhone(ORG_ID, '+8613900003333')
    expect(capturedPost?.url).toBe(`/organizations/${ORG_ID}/owner-transfer-by-phone`)
    expect(capturedPost?.body).toEqual({ owner_mobile: '13900003333' })
    expect(result.mode).toBe('pending_transfer')
    expect(result.invite?.mobileMasked).toBe('139****3333')
  })

  it('direct_transfer：invite=null 归一化', async () => {
    postResponder = () => ({
      code: 0,
      msg: 'ok',
      payload: {
        organization_id: ORG_ID,
        owner_user_id: '7700000000000000010',
        previous_owner_id: '7700000000000000001',
        mode: 'direct_transfer',
        invite: null,
        sms_sent: false,
      },
    })
    const result = await replaceOwnerByPhone(ORG_ID, '13800001234')
    expect(result.mode).toBe('direct_transfer')
    expect(result.invite).toBeNull()
  })

  it('非法手机号客户端即拒（不发出请求）', async () => {
    await expect(replaceOwnerByPhone(ORG_ID, 'not-a-mobile')).rejects.toThrow(/手机号/)
    expect(capturedPost).toBeNull()
  })
})
