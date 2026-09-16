/**
 * W2 平台 offboarding cases（冻结合同 W2-ADMIN 段）单元测试。
 *
 * 覆盖验收点：
 * - CS-03-A01：只调 `/enterprise-business/organizations/*`（baseURL 即 /api/adm），
 *   禁止 /api/v1；
 * - 列表查询：workspace_id 必填、status 白名单、after_id 游标 + limit 拼接；
 * - 详情：items_status 过滤（failed = 失败项查询）；
 * - execute 重试：POST 既有 execute 端点（幂等重试语义），expected_version 走 number，
 *   TSID（actor_user_id）走 string；
 * - CS-03-A03：TSID 全程 string；
 * - CS-03-A05：case/item 投影白名单——digest/secret/cipher/object_key 永不出站；
 * - 失败项徽标（失败项 N）与错误态映射（401/403/404/422）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  buildOffboardingDetailQuery,
  buildOffboardingListQuery,
  canRetryOffboardingCase,
  classifyListFailure,
  hasOffboardingFailures,
  listFailureMessage,
  offboardingFailedCount,
  offboardingStatusLabel,
  parseOffboardingItemsStatusFilter,
  parseOffboardingStatusFilter,
  toEbOffboardingCase,
  toEbOffboardingCaseDetail,
  toEbOffboardingCaseListPage,
  toEbOffboardingItem,
} from './pureFunctions'
import {
  executeEbOffboardingCase,
  getEbOffboardingCaseDetail,
  getEbOffboardingCases,
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

function capture(payload: unknown) {
  const calls: Array<{ method: 'GET' | 'POST'; url: string; config: Record<string, unknown> }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    calls.push({
      method: 'GET',
      url: String(url),
      config: (config ?? {}) as Record<string, unknown>,
    })
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    calls.push({ method: 'POST', url: String(url), config: { body } })
    return { data: { code: 0, msg: 'success', payload } }
  }
  return calls
}

const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }
const CASE_ID = '2222222222222222222'
const BIG_TSID = '1942412345678901234'

const RAW_CASE = {
  id: CASE_ID,
  organization_id: SCOPE.organizationId,
  workspace_id: SCOPE.workspaceId,
  leaver_user_id: '5555555555555555555',
  successor_user_id: '6666666666666666666',
  status: 'failed',
  reason: 'resignation',
  item_total: 3,
  item_success: 2,
  item_failed: 1,
  version: 7,
  created_at: '2026-09-16T02:03:29Z',
  updated_at: '2026-09-16T02:10:00Z',
}

const RAW_ITEM = {
  id: '7777777777777777777',
  kind: 'identity_assignee',
  status: 'failed',
  failure_reason: 'upstream timeout',
  attempt: 2,
  idempotency_key: 'case-2222:identity-3333',
}

// ---------------------------------------------------------------------------
// CS-03-A01：路径纪律
// ---------------------------------------------------------------------------
describe('offboarding api paths (A01)', () => {
  it('列表 GET 落在 /organizations/:org/offboarding/cases 且无 /api/v1', async () => {
    const calls = capture({ cases: [RAW_CASE], next_after_id: null })
    await getEbOffboardingCases(SCOPE, { status: 'all', afterId: null })

    expect(calls.length).toBe(1)
    const call = calls[0] ?? { url: '', config: {} }
    expect(call.url).toBe(`/enterprise-business/organizations/${SCOPE.organizationId}/offboarding/cases`)
    expect(call.url.includes('/api/v1')).toBe(false)
    expect((call.config.params as Record<string, unknown>).workspace_id).toBe(SCOPE.workspaceId)
  })

  it('详情 GET 携带 workspace_id；items_status=failed 过滤失败项', async () => {
    const calls = capture({ ...RAW_CASE, items: [RAW_ITEM] })
    await getEbOffboardingCaseDetail(SCOPE, CASE_ID)
    await getEbOffboardingCaseDetail(SCOPE, CASE_ID, 'failed')

    const base = calls[0] ?? { url: '', config: {} }
    expect(base.url).toBe(
      `/enterprise-business/organizations/${SCOPE.organizationId}/offboarding/cases/${CASE_ID}`
    )
    expect((base.config.params as Record<string, unknown>).workspace_id).toBe(SCOPE.workspaceId)
    expect((base.config.params as Record<string, unknown>).items_status).toBeUndefined()
    expect((calls[1]?.config.params as Record<string, unknown>).items_status).toBe('failed')
  })

  it('execute POST 走既有幂等端点：expected_version=number、TSID=string、workspace_id 必填', async () => {
    const calls = capture({ ...RAW_CASE, items: [] })
    await executeEbOffboardingCase(SCOPE, CASE_ID, {
      expectedVersion: 7,
      actorUserId: BIG_TSID,
    })

    const call = calls[0] ?? { url: '', config: {} }
    expect(call.method).toBe('POST')
    expect(call.url).toBe(
      `/enterprise-business/organizations/${SCOPE.organizationId}/offboarding/${CASE_ID}/execute`
    )
    expect(call.url.includes('/api/v1')).toBe(false)
    const body = call.config.body as Record<string, unknown>
    expect(body.workspace_id).toBe(SCOPE.workspaceId)
    expect(body.expected_version).toBe(7)
    expect(typeof body.expected_version).toBe('number')
    expect(body.actor_user_id).toBe(BIG_TSID)
  })

  it('非法入参 fail-closed：缺 scope / 空 case_id / 非法 version 零网络调用', async () => {
    const calls = capture({ cases: [], next_after_id: null })
    await getEbOffboardingCases({ organizationId: '', workspaceId: '1' }, { status: 'all' }).catch(
      () => undefined
    )
    await getEbOffboardingCaseDetail(SCOPE, '').catch(() => undefined)
    await executeEbOffboardingCase(SCOPE, CASE_ID, { expectedVersion: 0, actorUserId: '1' }).catch(
      () => undefined
    )
    await executeEbOffboardingCase(SCOPE, CASE_ID, { expectedVersion: 1, actorUserId: '' }).catch(
      () => undefined
    )
    expect(calls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 查询串构造纯函数
// ---------------------------------------------------------------------------
describe('offboarding query builders', () => {
  it('status 白名单：契约 6 态有效，非法值归 all', () => {
    for (const status of ['draft', 'frozen', 'transferring', 'verifying', 'completed', 'failed'] as const) {
      expect(parseOffboardingStatusFilter(status)).toBe(status)
    }
    expect(parseOffboardingStatusFilter('all')).toBe('all')
    expect(parseOffboardingStatusFilter('nope')).toBe('all')
    expect(parseOffboardingStatusFilter(null)).toBe('all')
  })

  it('列表查询拼接：all 不下发 status；limit 钳制 1..200', () => {
    expect(buildOffboardingListQuery({ status: 'all', afterId: null })).toEqual({})
    expect(
      buildOffboardingListQuery({ status: 'failed', afterId: '42', limit: 10 })
    ).toEqual({ status: 'failed', after_id: '42', limit: 10 })
    expect(buildOffboardingListQuery({ status: 'all', afterId: null, limit: 0 }).limit).toBe(1)
    expect(buildOffboardingListQuery({ status: 'all', afterId: null, limit: 500 }).limit).toBe(200)
  })

  it('详情 items_status：白名单 pending/success/failed，非法/全部不下发', () => {
    expect(parseOffboardingItemsStatusFilter('failed')).toBe('failed')
    expect(parseOffboardingItemsStatusFilter('weird')).toBe('all')
    expect(buildOffboardingDetailQuery('all')).toEqual({})
    expect(buildOffboardingDetailQuery('failed')).toEqual({ items_status: 'failed' })
  })
})

// ---------------------------------------------------------------------------
// CS-03-A03/A05：case/item 投影白名单 + TSID string
// ---------------------------------------------------------------------------
describe('offboarding case/item projection (A03/A05)', () => {
  it('case 契约字段全保留且 TSID 为 string 逐位一致', () => {
    const row = toEbOffboardingCase(RAW_CASE)
    expect(row).not.toBeNull()
    expect(row?.id).toBe(CASE_ID)
    expect(row?.organization_id).toBe(SCOPE.organizationId)
    expect(row?.workspace_id).toBe(SCOPE.workspaceId)
    expect(row?.leaver_user_id).toBe('5555555555555555555')
    expect(row?.successor_user_id).toBe('6666666666666666666')
    expect(row?.status).toBe('failed')
    expect(row?.reason).toBe('resignation')
    expect(row?.item_total).toBe(3)
    expect(row?.item_success).toBe(2)
    expect(row?.item_failed).toBe(1)
    expect(row?.version).toBe(7)
    expect(row?.created_at).toBe('2026-09-16T02:03:29Z')
    expect(row?.updated_at).toBe('2026-09-16T02:10:00Z')
  })

  it('item 投影只含 id/kind/status/failure_reason/attempt/idempotency_key', () => {
    const item = toEbOffboardingItem(RAW_ITEM)
    expect(item).not.toBeNull()
    expect(item?.id).toBe('7777777777777777777')
    expect(item?.kind).toBe('identity_assignee')
    expect(item?.status).toBe('failed')
    expect(item?.failure_reason).toBe('upstream timeout')
    expect(item?.attempt).toBe(2)
    expect(item?.idempotency_key).toBe('case-2222:identity-3333')
    expect(toEbOffboardingItem({ missing: 'id' })).toBeNull()
  })

  it('敏感键（digest/secret/cipher/object_key/token）绝不进入 case/item 视图', () => {
    const detail = toEbOffboardingCaseDetail({
      ...RAW_CASE,
      key_digest: 'DIGEST',
      token_digest: 'TOKEN-DIGEST',
      secret: 'SECRET',
      cipher: 'CIPHER',
      object_key: 'bucket/object',
      items: [
        { ...RAW_ITEM, audit_event_id: 1 },
        { id: '8', kind: 'k', status: 'success', failure_reason: null, attempt: 1, idempotency_key: 'x' },
      ],
    })
    expect(detail).not.toBeNull()
    expect(detail?.items.length).toBe(2)
    const json = JSON.stringify(detail)
    expect(json.includes('DIGEST')).toBe(false)
    expect(json.includes('TOKEN-DIGEST')).toBe(false)
    expect(json.includes('SECRET')).toBe(false)
    expect(json.includes('CIPHER')).toBe(false)
    expect(json.includes('bucket/object')).toBe(false)
  })

  it('列表整包解析：cases + next_after_id；缺 next_after_id 回退页尾 id', () => {
    const rows = [1, 2, 3].map((i) => ({ ...RAW_CASE, id: String(9000 + i) }))
    expect(toEbOffboardingCaseListPage({ cases: rows, next_after_id: 'CURSOR' }, 50).next_after_id).toBe('CURSOR')
    expect(toEbOffboardingCaseListPage({ cases: rows }, 3).next_after_id).toBe('9003')
    expect(toEbOffboardingCaseListPage({ cases: rows.slice(0, 1) }, 3).next_after_id).toBeNull()
    expect(toEbOffboardingCaseListPage(null, 50).cases).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 失败项徽标 / 重试门 / 错误态映射
// ---------------------------------------------------------------------------
describe('offboarding failure badge, retry gate and error mapping', () => {
  it('失败项徽标：item_failed>0 即有失败项，计数取自服务端聚合', () => {
    expect(offboardingFailedCount(RAW_CASE)).toBe(1)
    expect(hasOffboardingFailures(RAW_CASE)).toBe(true)
    expect(hasOffboardingFailures({ ...RAW_CASE, item_failed: 0 })).toBe(false)
    expect(offboardingFailedCount({ ...RAW_CASE, item_failed: null })).toBe(0)
  })

  it('重试门：需要 write 权限 + 有效 expected_version；未失败且仍在途的 case 允许续跑', () => {
    expect(canRetryOffboardingCase(RAW_CASE, false)).toBe(false)
    expect(canRetryOffboardingCase(RAW_CASE, true)).toBe(true)
    expect(canRetryOffboardingCase({ ...RAW_CASE, version: 0 }, true)).toBe(false)
    expect(canRetryOffboardingCase({ ...RAW_CASE, status: 'completed' }, true)).toBe(false)
    expect(canRetryOffboardingCase({ ...RAW_CASE, status: 'transferring' }, true)).toBe(true)
  })

  it('错误态映射 401/403/404/422 + 409 冲突，且每类都有文案', () => {
    expect(classifyListFailure({ code: 401, msg: 'unauthenticated' })).toBe('unauthenticated')
    expect(classifyListFailure({ code: 403, msg: 'permission_missing' })).toBe('permission_missing')
    expect(classifyListFailure({ code: 404, msg: 'case_not_found' })).toBe('not_found')
    expect(classifyListFailure({ code: 422, msg: 'invalid_status' })).toBe('validation')
    expect(classifyListFailure({ code: 409, msg: 'stale_version' })).toBe('conflict_stale')
    expect(classifyListFailure(new Error('network'))).toBe('unknown')
    for (const kind of [
      'unauthenticated',
      'permission_missing',
      'not_found',
      'validation',
      'conflict_stale',
      'unknown',
    ] as const) {
      expect(listFailureMessage(kind).length).toBeGreaterThan(0)
    }
    expect(listFailureMessage('permission_missing')).toContain('enterprise_business:write')
  })

  it('case 状态标签覆盖契约 6 态', () => {
    expect(offboardingStatusLabel('draft')).toBe('草稿')
    expect(offboardingStatusLabel('frozen')).toBe('已冻结')
    expect(offboardingStatusLabel('transferring')).toBe('交接中')
    expect(offboardingStatusLabel('verifying')).toBe('校验中')
    expect(offboardingStatusLabel('completed')).toBe('已完成')
    expect(offboardingStatusLabel('failed')).toBe('有失败项')
    expect(offboardingStatusLabel('other')).toBe('other')
  })
})
