/**
 * GZAPP-06 待激活 Owner——纯函数单测（契约回归）。
 *
 * 覆盖：
 * ① 手机号归一化（+86 / 分隔符 / 国际号 / 非法形状）与脱敏（前3后4）；
 * ② buildCreateOrganizationPendingBody 严格四键（owner_mode 恒 pending_phone）；
 * ③ TTL 剩余计算与展示（剩余 / 已过期 / 负值不吞）；
 * ④ 状态标签（pending | sms_failed | reactivated | superseded + activated/expired）；
 * ⑤ 错误 hint（409 引导已注册模式等可行动文案）；
 * ⑥ 响应归一化（mobile 明文永不进入视图；TSID string；token 只经 activation_token）。
 */
import { describe, expect, it } from 'bun:test'
import {
  buildCreateOrganizationPendingBody,
  formatTtl,
  inviteLabel,
  isInviteExpired,
  maskMobile,
  normalizeMobileInput,
  pendingOwnerErrorHint,
  pendingOwnerStatusLabel,
  toCreatePendingOwnerResult,
  toPendingOwnerStatusView,
  toRotateInviteResult,
  toTransferOwnerByPhoneResult,
  ttlRemainingSeconds,
} from './pendingOwnerPure'
import { classifyOrgError, type OrgFailure } from './pureFunctions'

// ---------------------------------------------------------------------------
// ① 手机号归一化 / 脱敏
// ---------------------------------------------------------------------------
describe('normalizeMobileInput — 与后端 imboy_mobile 同口径', () => {
  it('+86 前缀剥离', () => {
    expect(normalizeMobileInput('+8613811112222')).toEqual({ ok: true, mobile: '13811112222' })
  })
  it('86 + 恰 11 位剥区号；852 国际号不剥', () => {
    expect(normalizeMobileInput('8613811112222')).toEqual({ ok: true, mobile: '13811112222' })
    expect(normalizeMobileInput('+852 1234 5678')).toEqual({ ok: true, mobile: '85212345678' })
  })
  it('空白 / 连字符 / 圆括号剥离', () => {
    expect(normalizeMobileInput(' 138-1111 (2222) ')).toEqual({ ok: true, mobile: '13811112222' })
  })
  it('非数字 / 过短 / 过长 → 非法', () => {
    expect(normalizeMobileInput('138abc2222').ok).toBe(false)
    expect(normalizeMobileInput('1234').ok).toBe(false)
    expect(normalizeMobileInput('1'.repeat(21)).ok).toBe(false)
    expect(normalizeMobileInput('').ok).toBe(false)
  })
})

describe('maskMobile — 前3后4', () => {
  it('11 位国内号', () => {
    expect(maskMobile('13811112222')).toBe('138****2222')
  })
  it('短号全掩码', () => {
    expect(maskMobile('1234567')).toBe('****')
    expect(maskMobile('')).toBe('****')
  })
})

// ---------------------------------------------------------------------------
// ② 创建请求体：严格四键
// ---------------------------------------------------------------------------
describe('buildCreateOrganizationPendingBody — 严格四键', () => {
  it('仅含 {name, owner_mode, default_workspace_name, owner_mobile}，mobile 归一化', () => {
    const body = buildCreateOrganizationPendingBody({
      name: '  广州企业  ',
      ownerMobile: '+86 138-1111-2222',
      defaultWorkspaceName: '默认区',
    })
    expect(Object.keys(body).sort()).toEqual(
      ['default_workspace_name', 'name', 'owner_mobile', 'owner_mode'].sort()
    )
    expect(body.name).toBe('广州企业')
    expect(body.owner_mode).toBe('pending_phone')
    expect(body.owner_mobile).toBe('13811112222')
    expect(body.default_workspace_name).toBe('默认区')
  })
  it('缺字段 / 非法手机号 → 抛错', () => {
    expect(() =>
      buildCreateOrganizationPendingBody({ name: '', ownerMobile: '13811112222', defaultWorkspaceName: 'ws' })
    ).toThrow()
    expect(() =>
      buildCreateOrganizationPendingBody({ name: 'n', ownerMobile: 'abc', defaultWorkspaceName: 'ws' })
    ).toThrow(/手机号/)
    expect(() =>
      buildCreateOrganizationPendingBody({ name: 'n', ownerMobile: '13811112222', defaultWorkspaceName: ' ' })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ③ TTL
// ---------------------------------------------------------------------------
describe('TTL 计算与展示', () => {
  it('剩余秒数（可整除向下取整）', () => {
    expect(ttlRemainingSeconds(1_000_000 + 90, 1_000_000)).toBe(90)
    expect(ttlRemainingSeconds(1_000_000 - 5, 1_000_000)).toBe(-5)
    expect(ttlRemainingSeconds(null, 1_000_000)).toBeNull()
  })
  it('过期谓词（<=0 即过期）', () => {
    expect(isInviteExpired(1_000_000 - 1, 1_000_000)).toBe(true)
    expect(isInviteExpired(1_000_000 + 1, 1_000_000)).toBe(false)
    expect(isInviteExpired(null, 1_000_000)).toBe(false)
  })
  it('展示：剩 N 天 M 时 / 已过期 N 天', () => {
    expect(formatTtl(29 * 86400 + 23 * 3600)).toBe('剩 29 天 23 时')
    expect(formatTtl(5 * 3600)).toBe('剩 5 时')
    expect(formatTtl(-3 * 86400)).toBe('已过期 3 天')
    expect(formatTtl(-10)).toBe('已过期')
    expect(formatTtl(null)).toBe('未知')
  })
})

// ---------------------------------------------------------------------------
// ④ 状态标签
// ---------------------------------------------------------------------------
describe('pendingOwnerStatusLabel / inviteLabel', () => {
  it('四状态 + reactivated + expired 派生', () => {
    expect(pendingOwnerStatusLabel('pending')).toBe('待激活')
    expect(pendingOwnerStatusLabel('sms_failed')).toBe('短信发送失败（可重发）')
    expect(pendingOwnerStatusLabel('activated')).toBe('已激活')
    expect(pendingOwnerStatusLabel('superseded')).toBe('已作废（Owner 已更换）')
    expect(pendingOwnerStatusLabel('reactivated')).toBe('已重新激活（TTL 已重置 30 天）')
    expect(pendingOwnerStatusLabel('pending', true)).toBe('待激活（已过期，可重新激活）')
  })
  it('inviteLabel：pending+expired 叠加过期提示；无 invite → 占位', () => {
    expect(
      inviteLabel({
        inviteId: '1',
        organizationId: '1',
        ownerUserId: '1',
        status: 'pending',
        mobileMasked: '138****2222',
        expiresAt: 1,
        lastSentAt: null,
        resendCount: 0,
        consumedAt: null,
        createdAt: null,
        ttlRemainingSeconds: -1,
        expired: true,
      })
    ).toBe('待激活（已过期，可重新激活）')
    expect(inviteLabel(null)).toBe('无待处理邀请')
  })
})

// ---------------------------------------------------------------------------
// ⑤ 错误 hint
// ---------------------------------------------------------------------------
describe('pendingOwnerErrorHint — 可行动文案', () => {
  const failureOf = (err: unknown): OrgFailure => classifyOrgError(err)
  it('409 conflict 引导已注册模式', () => {
    const hint = pendingOwnerErrorHint(failureOf({ code: 409, msg: '该手机号已是注册活跃用户' }))
    expect(hint).toContain('409')
    expect(hint).toContain('已注册用户')
  })
  it('403 → 权限文案', () => {
    expect(pendingOwnerErrorHint(failureOf({ code: 403, msg: 'denied' }))).toContain('organizations:write')
  })
  it('400 → 手机号校验指引', () => {
    expect(pendingOwnerErrorHint(failureOf({ code: 400, msg: 'bad' }))).toContain('5-20 位数字')
  })
})

// ---------------------------------------------------------------------------
// ⑥ 响应归一化
// ---------------------------------------------------------------------------
const CREATE_PAYLOAD = {
  organization: { id: '8800000000000000001', name: '广州企业', owner_id: '7700000000000000001', status: 'active' },
  default_workspace: { id: '8800000000000000002', name: '默认区', status: 'active' },
  created: true,
  sms_sent: false,
  owner_activation: {
    invite_id: '9900000000000000001',
    organization_id: '8800000000000000001',
    owner_user_id: '7700000000000000001',
    status: 'sms_failed',
    mobile_masked: '138****2222',
    expires_at: 1_900_000_000,
    resend_count: 0,
    activation_token: 'a'.repeat(64),
  },
}

describe('toCreatePendingOwnerResult — D12 成功分叉（sms_failed）', () => {
  it('sms_sent=false + owner_activation.status=sms_failed；org 已建非错误态', () => {
    const result = toCreatePendingOwnerResult(CREATE_PAYLOAD)
    expect(result.created).toBe(true)
    expect(result.smsSent).toBe(false)
    expect(result.organizationId).toBe('8800000000000000001')
    expect(result.workspaceId).toBe('8800000000000000002')
    expect(result.ownerActivation?.status).toBe('sms_failed')
    expect(result.ownerActivation?.mobileMasked).toBe('138****2222')
    expect(result.ownerActivation?.activationToken).toBe('a'.repeat(64))
    // mobile 明文永不进入视图（键面根本不存在）
    expect(JSON.stringify(result)).not.toContain('13811112222')
  })
  it('幂等命中（owner_activation=null）归一为 null', () => {
    const result = toCreatePendingOwnerResult({
      ...CREATE_PAYLOAD,
      created: false,
      owner_activation: null,
      sms_sent: false,
    })
    expect(result.created).toBe(false)
    expect(result.ownerActivation).toBeNull()
  })
})

describe('toPendingOwnerStatusView — 状态卡', () => {
  it('invite 嵌套归一化 + owner_activated', () => {
    const view = toPendingOwnerStatusView({
      organization_id: '8800000000000000001',
      organization_name: '广州企业',
      organization_status: 'active',
      owner_user_id: '7700000000000000001',
      owner_activated: false,
      invite: {
        invite_id: '9900000000000000001',
        organization_id: '8800000000000000001',
        owner_user_id: '7700000000000000001',
        status: 'pending',
        mobile_masked: '138****2222',
        expires_at: 1_900_000_000,
        last_sent_at: 1_800_000_000,
        resend_count: 1,
        consumed_at: null,
        created_at: 1_700_000_000,
        ttl_remaining_seconds: 86400,
        expired: false,
      },
    })
    expect(view.ownerActivated).toBe(false)
    expect(view.invite?.status).toBe('pending')
    expect(view.invite?.resendCount).toBe(1)
    expect(view.invite?.ttlRemainingSeconds).toBe(86400)
  })
})

describe('toRotateInviteResult / toTransferOwnerByPhoneResult', () => {
  it('resend 响应：sms_sent + 轮换后 token', () => {
    const rotated = toRotateInviteResult({
      invite: {
        invite_id: '9900000000000000001',
        organization_id: '8800000000000000001',
        owner_user_id: '7700000000000000001',
        status: 'pending',
        mobile_masked: '138****2222',
        expires_at: 1_900_000_000,
        resend_count: 1,
        activation_token: 'b'.repeat(64),
      },
      sms_sent: true,
    })
    expect(rotated.smsSent).toBe(true)
    expect(rotated.invite?.resendCount).toBe(1)
    expect(rotated.invite?.activationToken).toBe('b'.repeat(64))
  })
  it('direct_transfer：invite=null；pending_transfer：invite 带 token', () => {
    const direct = toTransferOwnerByPhoneResult({
      organization_id: '8800000000000000001',
      owner_user_id: '7700000000000000002',
      previous_owner_id: '7700000000000000001',
      mode: 'direct_transfer',
      invite: null,
      sms_sent: false,
    })
    expect(direct.mode).toBe('direct_transfer')
    expect(direct.invite).toBeNull()
    const pending = toTransferOwnerByPhoneResult({
      organization_id: '8800000000000000001',
      owner_user_id: '7700000000000000003',
      previous_owner_id: '7700000000000000001',
      mode: 'pending_transfer',
      sms_sent: true,
      invite: {
        invite_id: '9900000000000000002',
        organization_id: '8800000000000000001',
        owner_user_id: '7700000000000000003',
        status: 'pending',
        mobile_masked: '139****3333',
        expires_at: 1_900_000_000,
        resend_count: 0,
        activation_token: 'c'.repeat(64),
      },
    })
    expect(pending.mode).toBe('pending_transfer')
    expect(pending.invite?.activationToken).toBe('c'.repeat(64))
  })
})
