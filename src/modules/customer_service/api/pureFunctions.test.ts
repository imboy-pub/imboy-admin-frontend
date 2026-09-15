/**
 * CS-03 客服平台面单元测试。
 *
 * 覆盖验收点：
 * - CS-03-A01：所有 API 调用只落 `/customer-service/organizations/*`（client baseURL
 *   即 `/api/adm`），任何路径都不得出现 `/api/v1`；
 * - CS-03-A03：TSID 全程 string（coerceEntityId 口径），64-bit 大数不丢精度；
 * - CS-03-A04：交接失败分类（stale_version 可重试 / offboarding_required 不可重试）；
 * - CS-03-A05：敏感键熔断（secret/cipher/hmac/hash/token/object_key 即便误入白名单
 *   也不得进入展示视图）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  actionFailureMessage,
  assertScope,
  classifyActionFailure,
  csSessionStatusLabel,
  isRetryableFailure,
  isSensitiveKey,
  paginateClientSide,
  pickSafeFields,
  toCsSeat,
  toCsSeatList,
  toCsSession,
  type CsSeat,
} from './pureFunctions'
import {
  closeCsSession,
  getCsSeats,
  getCsSession,
  resumeCsSeat,
  suspendCsSeat,
  transferCsSession,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

function captureCalls() {
  const calls: Array<{ method: string; url: string; config: Record<string, unknown> }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    calls.push({ method: 'GET', url: String(url), config: (config ?? {}) as Record<string, unknown> })
    return { data: { code: 0, msg: 'success', payload: [] } }
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    calls.push({ method: 'POST', url: String(url), config: { body } })
    return { data: { code: 0, msg: 'success', payload: {} } }
  }
  return calls
}

const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }

// ---------------------------------------------------------------------------
// CS-03-A01：/api/adm 单一出口，禁止 /api/v1
// ---------------------------------------------------------------------------
describe('customer_service api paths (A01)', () => {
  it('平台面 6 条路径全部落在 /customer-service/organizations 下且无 /api/v1', async () => {
    const calls = captureCalls()
    await getCsSeats(SCOPE)
    await suspendCsSeat({ ...SCOPE, identityId: '111111111111111111', reason: '离职' })
    await resumeCsSeat({ ...SCOPE, identityId: '111111111111111111' })
    await getCsSession({ ...SCOPE, sessionId: '222222222222222222' })
    await transferCsSession({ ...SCOPE, sessionId: '222222222222222222', toIdentityId: '333333333333333333', expectedVersion: 3 })
    await closeCsSession({ ...SCOPE, sessionId: '222222222222222222', expectedVersion: 4 })

    expect(calls.length).toBe(6)
    for (const call of calls) {
      expect(call.url.startsWith('/customer-service/organizations/')).toBe(true)
      expect(call.url.includes('/api/v1')).toBe(false)
      expect(call.url.includes('/api/adm')).toBe(false) // baseURL 已是 /api/adm，不得重复拼接
    }
    expect(calls[0]?.url).toBe(`/customer-service/organizations/${SCOPE.organizationId}/seats`)
    expect(calls[1]?.url).toBe('/customer-service/organizations/1234567890123456789/seats/111111111111111111/suspend')
    expect(calls[2]?.url).toBe('/customer-service/organizations/1234567890123456789/seats/111111111111111111/resume')
    expect(calls[3]?.url).toBe('/customer-service/organizations/1234567890123456789/sessions/222222222222222222')
    expect(calls[4]?.url).toBe('/customer-service/organizations/1234567890123456789/sessions/222222222222222222/transfer')
    expect(calls[5]?.url).toBe('/customer-service/organizations/1234567890123456789/sessions/222222222222222222/close')
  })

  it('workspace_id 是必填参数：GET 走查询串，POST 走正文', async () => {
    const calls = captureCalls()
    await getCsSeats(SCOPE)
    await suspendCsSeat({ ...SCOPE, identityId: '111111111111111111' })

    const queryParams = calls[0]?.config.params as Record<string, unknown>
    expect(queryParams.workspace_id).toBe(SCOPE.workspaceId)
    const postBody = calls[1]?.config.body as Record<string, unknown>
    expect(postBody.workspace_id).toBe(SCOPE.workspaceId)
    expect(postBody.reason).toBeUndefined()
  })

  it('transfer/close 的 expected_version 走 number，to_identity_id 保持 string TSID', async () => {
    const calls = captureCalls()
    await transferCsSession({ ...SCOPE, sessionId: '222222222222222222', toIdentityId: '333333333333333333', expectedVersion: 7 })
    const body = calls[0]?.config.body as Record<string, unknown>
    expect(body.to_identity_id).toBe('333333333333333333')
    expect(body.expected_version).toBe(7)
    expect(typeof body.expected_version).toBe('number')
  })

  it('非法入参 fail-closed：缺 scope / 空 ID / 非法 version 直接抛错且零网络调用', async () => {
    const calls = captureCalls()
    expect(() => assertScope({ organizationId: '', workspaceId: '1' })).toThrow()
    expect(() => assertScope({ organizationId: '1', workspaceId: '' })).toThrow()
    await getCsSeats({ organizationId: '', workspaceId: '1' }).catch(() => undefined)
    await transferCsSession({ ...SCOPE, sessionId: '1', toIdentityId: '', expectedVersion: 1 }).catch(() => undefined)
    await transferCsSession({ ...SCOPE, sessionId: '1', toIdentityId: '2', expectedVersion: 0 }).catch(() => undefined)
    await closeCsSession({ ...SCOPE, sessionId: '1', expectedVersion: Number.NaN }).catch(() => undefined)
    expect(calls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// CS-03-A03：TSID 全程 string，无精度损失
// ---------------------------------------------------------------------------
describe('customer_service TSID handling (A03)', () => {
  const RAW_SEAT = {
    organization_id: '1234567890123456789',
    business_identity_id: '1942412345678901234',
    function_key: 'customer_service',
    enabled: true,
    max_concurrent: 5,
    active_count: 2,
    version: 3,
  }

  it('seat 的 *_id 保持 string 且逐位一致', () => {
    const seat = toCsSeat(RAW_SEAT)
    expect(seat).not.toBeNull()
    expect(seat?.business_identity_id).toBe('1942412345678901234')
    expect(typeof seat?.business_identity_id).toBe('string')
    expect(seat?.organization_id).toBe('1234567890123456789')
    expect(seat?.version).toBe(3)
  })

  it('19 位 TSID 不会被 Number 化丢精度', () => {
    const seat = toCsSeat(RAW_SEAT) as CsSeat
    // 1942412345678901234 若经 Number() 会变成 1942412345678901200 —— 必须原样保留
    expect(seat.business_identity_id).not.toBe(String(Number(seat.business_identity_id)))
    expect(seat.business_identity_id.endsWith('234')).toBe(true)
  })

  it('缺 business_identity_id 的行返回 null（fail-closed，不渲染半行）', () => {
    expect(toCsSeat({ ...RAW_SEAT, business_identity_id: '' })).toBeNull()
    expect(toCsSeat(null)).toBeNull()
    expect(toCsSeat('nope')).toBeNull()
    expect(toCsSeatList({ not: 'an array' })).toEqual([])
    expect(toCsSeatList([RAW_SEAT, { broken: true }]).length).toBe(1)
  })

  it('session 的 id/contact/conversation 为 string，rating/version 为 number，空 close_reason 归一 null', () => {
    const session = toCsSession({
      id: '222222222222222222',
      organization_id: '1234567890123456789',
      workspace_id: '9876543210987654321',
      contact_id: '4444444444444444444',
      conversation_id: '5555555555555555555',
      business_identity_id: null,
      status: 'active',
      rating: null,
      queued_at: 1700000000,
      close_reason: '',
      version: 9,
    })
    expect(session?.id).toBe('222222222222222222')
    expect(session?.contact_id).toBe('4444444444444444444')
    expect(session?.conversation_id).toBe('5555555555555555555')
    expect(session?.business_identity_id).toBeNull()
    expect(session?.rating).toBeNull()
    expect(session?.close_reason).toBeNull()
    expect(session?.version).toBe(9)
    expect(toCsSession({ missing: 'id' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CS-03-A04：交接失败分类 / 重试 / 空态
// ---------------------------------------------------------------------------
describe('customer_service action failure classification (A04)', () => {
  it('409 stale_version/conflict → 可重试', () => {
    expect(classifyActionFailure({ code: 409, msg: 'stale_version' })).toBe('stale_version')
    expect(classifyActionFailure({ code: 409, msg: 'conflict' })).toBe('stale_version')
    expect(classifyActionFailure({ code: 409, msg: 'cas_mismatch' })).toBe('stale_version')
    expect(isRetryableFailure('stale_version')).toBe(true)
  })

  it('offboarding_required（冻结契约标签）→ 不可重试并给出离岗指引', () => {
    const failure = classifyActionFailure({ code: 409, msg: 'offboarding_required' })
    expect(failure).toBe('offboarding_required')
    expect(isRetryableFailure(failure)).toBe(false)
    expect(actionFailureMessage(failure)).toContain('离岗')
  })

  it('403 seat_disabled / permission_missing 与 404/422 均不可重试', () => {
    expect(classifyActionFailure({ code: 403, msg: 'seat_disabled' })).toBe('seat_disabled')
    expect(classifyActionFailure({ code: 403, msg: 'permission_missing' })).toBe('permission_missing')
    expect(classifyActionFailure({ code: 404, msg: 'session_not_found' })).toBe('not_found')
    expect(classifyActionFailure({ code: 422, msg: 'missing_param.to_identity_id' })).toBe('validation')
    for (const kind of ['seat_disabled', 'permission_missing', 'not_found', 'validation'] as const) {
      expect(isRetryableFailure(kind)).toBe(false)
    }
  })

  it('非 ApiError 形状 → unknown（可重试）', () => {
    expect(classifyActionFailure(new Error('network'))).toBe('unknown')
    expect(isRetryableFailure('unknown')).toBe(true)
  })

  it('客户端分页：默认 size=10，空页安全', () => {
    const items = Array.from({ length: 23 }, (_, i) => i)
    expect(paginateClientSide(items, 1, 10).length).toBe(10)
    expect(paginateClientSide(items, 3, 10).length).toBe(3)
    expect(paginateClientSide(items, 4, 10)).toEqual([])
    expect(paginateClientSide([], 1, 0)).toEqual([])
  })

  it('会话状态标签覆盖契约三种状态', () => {
    expect(csSessionStatusLabel('queued')).toBe('排队中')
    expect(csSessionStatusLabel('active')).toBe('服务中')
    expect(csSessionStatusLabel('closed')).toBe('已关闭')
    expect(csSessionStatusLabel('')).toBe('未知')
  })
})

// ---------------------------------------------------------------------------
// CS-03-A05：敏感键熔断
// ---------------------------------------------------------------------------
describe('customer_service sensitive key guard (A05)', () => {
  it('熔断模式命中 cipher/hmac/hash/secret/token/object_key/storage', () => {
    for (const key of ['body_cipher', 'profile_cipher', 'subject_hmac', 'aad_hash', 'content_hash', 'object_key', 'visit_token_id', 'shop_secret', 'storage_url', 'presign_url', 'api_key']) {
      expect(isSensitiveKey(key)).toBe(true)
    }
    for (const key of ['display_name', 'status', 'version', 'business_identity_id', 'close_reason']) {
      expect(isSensitiveKey(key)).toBe(false)
    }
  })

  it('即便调用方把敏感键写进白名单，pickSafeFields 也必须丢弃', () => {
    const raw = {
      id: '1',
      body_cipher: 'BASE64CIPHER',
      aad_hash: 'HASH',
      display_name: 'ok',
    }
    const view = pickSafeFields(raw, ['id', 'body_cipher', 'aad_hash', 'display_name'])
    expect(view.display_name).toBe('ok')
    expect('body_cipher' in view).toBe(false)
    expect('aad_hash' in view).toBe(false)
    expect(JSON.stringify(view).includes('BASE64CIPHER')).toBe(false)
  })

  it('会话/坐席投影函数产出的视图不含任何敏感字段', () => {
    const sessionView = toCsSession({
      id: '1',
      visit_token_id: '999',
      status: 'queued',
      close_reason: 'x',
      version: 1,
    })
    expect(sessionView).not.toBeNull()
    expect(JSON.stringify(sessionView).includes('visit_token')).toBe(false)
    const seatView = toCsSeat({
      organization_id: '1',
      business_identity_id: '2',
      function_key: 'customer_service',
      enabled: false,
      max_concurrent: 1,
      active_count: 0,
      version: 1,
    })
    expect(JSON.stringify(seatView)).not.toMatch(/secret|cipher|hmac|token|hash/i)
  })
})
