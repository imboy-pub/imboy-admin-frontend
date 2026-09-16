/**
 * W2 平台 CS session 列表（冻结合同 C1）单元测试。
 *
 * 覆盖验收点：
 * - CS-03-A01：只调 `/customer-service/organizations/*`（client baseURL 即 /api/adm），
 *   任何路径不得出现 `/api/v1`；
 * - C1 查询串：workspace_id 必填、status 白名单过滤（非法值不下发）、after_id 游标+
 *   limit 分页拼接；
 * - CS-03-A03：TSID 全程 string；
 * - CS-03-A05：C1 列表投影白名单（禁止 visit_token_id / close_reason / 任何
 *   digest/secret/cipher 出现在产出视图）；
 * - 列表错误态映射（401/403/404/422）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  buildCsSessionListQuery,
  classifyListFailure,
  csSessionListStatusLabel,
  listFailureMessage,
  parseCsSessionStatusFilter,
  toCsSessionListPage,
  toCsSessionSummary,
} from './pureFunctions'
import { getPlatformCsSessions } from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

function captureGets(payload: unknown) {
  const calls: Array<{ url: string; params: Record<string, unknown> }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    calls.push({
      url: String(url),
      params: ((config as { params?: Record<string, unknown> })?.params ?? {}) as Record<string, unknown>,
    })
    return { data: { code: 0, msg: 'success', payload } }
  }
  return calls
}

const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }

/** 19 位 TSID：若经 Number() 会丢精度（…234 → …200），用于断言 string 直传。 */
const BIG_TSID = '1942412345678901234'

const RAW_SESSION = {
  id: BIG_TSID,
  organization_id: SCOPE.organizationId,
  workspace_id: SCOPE.workspaceId,
  contact_id: '4444444444444444444',
  business_identity_id: '3333333333333333333',
  status: 'active',
  rating: null,
  queued_at: 1700000000,
  claimed_at: 1700000060,
  closed_at: null,
  version: 2,
}

// ---------------------------------------------------------------------------
// CS-03-A01：/api/adm 单一出口（baseURL 相对路径），禁止 /api/v1
// ---------------------------------------------------------------------------
describe('platform cs session list api paths (A01)', () => {
  it('GET 落在 /customer-service/organizations/:org/sessions 且不带 /api/v1', async () => {
    const calls = captureGets({ sessions: [RAW_SESSION], next_after_id: null })
    await getPlatformCsSessions(SCOPE, { status: 'all', afterId: null, limit: 50 })

    expect(calls.length).toBe(1)
    const url = calls[0]?.url ?? ''
    expect(url).toBe(`/customer-service/organizations/${SCOPE.organizationId}/sessions`)
    expect(url.includes('/api/v1')).toBe(false)
    expect(url.includes('/api/adm')).toBe(false) // baseURL 已是 /api/adm，不得重复拼接
  })

  it('workspace_id 必填；after_id 游标与 limit、status 全部正确拼接进查询串', async () => {
    const calls = captureGets({ sessions: [], next_after_id: null })
    await getPlatformCsSessions(SCOPE, { status: 'queued', afterId: BIG_TSID, limit: 25 })

    const params = calls[0]?.params ?? {}
    expect(params.workspace_id).toBe(SCOPE.workspaceId)
    expect(params.status).toBe('queued')
    expect(params.after_id).toBe(BIG_TSID)
    expect(params.limit).toBe(25)

    await getPlatformCsSessions(SCOPE, { status: 'all', afterId: null })
    const allParams = calls[1]?.params ?? {}
    expect(allParams.status).toBeUndefined() // status=all 不下发
    expect(allParams.after_id).toBeUndefined() // 无游标不下发
    expect(allParams.limit).toBeUndefined() // 未指定 limit 不下发，交由后端缺省 50
  })

  it('缺 scope / 空 workspace_id fail-closed：直接抛错且零网络调用', async () => {
    const calls = captureGets({ sessions: [], next_after_id: null })
    await getPlatformCsSessions({ organizationId: '', workspaceId: '1' }, { status: 'all' }).catch(
      () => undefined
    )
    await getPlatformCsSessions(SCOPE, { status: 'all', limit: 0 }).catch(() => undefined)
    expect(calls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// C1 查询串构造纯函数：status 白名单 / 游标拼接 / limit 钳制
// ---------------------------------------------------------------------------
describe('cs session list query builders', () => {
  it('parseCsSessionStatusFilter：白名单外一律归 all（不把非法值发给后端）', () => {
    expect(parseCsSessionStatusFilter('queued')).toBe('queued')
    expect(parseCsSessionStatusFilter('active')).toBe('active')
    expect(parseCsSessionStatusFilter('closed')).toBe('closed')
    expect(parseCsSessionStatusFilter('all')).toBe('all')
    expect(parseCsSessionStatusFilter('hacker')).toBe('all')
    expect(parseCsSessionStatusFilter('')).toBe('all')
    expect(parseCsSessionStatusFilter(null)).toBe('all')
    expect(parseCsSessionStatusFilter(undefined)).toBe('all')
  })

  it('buildCsSessionListQuery：all 不下发 status，游标为空不下发 after_id', () => {
    expect(buildCsSessionListQuery({ status: 'all', afterId: null })).toEqual({})
    expect(buildCsSessionListQuery({ status: 'closed', afterId: '42', limit: 10 })).toEqual({
      status: 'closed',
      after_id: '42',
      limit: 10,
    })
  })

  it('buildCsSessionListQuery：limit 钳制到 1..200（客户端防呆，服务端越界仍 422）', () => {
    expect(buildCsSessionListQuery({ status: 'all', afterId: null, limit: 0 }).limit).toBe(1)
    expect(buildCsSessionListQuery({ status: 'all', afterId: null, limit: 999 }).limit).toBe(200)
    expect(buildCsSessionListQuery({ status: 'all', afterId: null, limit: Number.NaN }).limit).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// CS-03-A03：TSID 全程 string；C1 白名单投影（A05 列表级熔断）
// ---------------------------------------------------------------------------
describe('cs session summary projection (A03/A05)', () => {
  it('id/organization/workspace/contact 均为 string 且逐位一致（19 位不丢精度）', () => {
    const summary = toCsSessionSummary(RAW_SESSION)
    expect(summary).not.toBeNull()
    expect(summary?.id).toBe(BIG_TSID)
    expect(typeof summary?.id).toBe('string')
    expect(summary?.id.endsWith('234')).toBe(true) // Number 化会变 …200
    expect(summary?.organization_id).toBe(SCOPE.organizationId)
    expect(summary?.workspace_id).toBe(SCOPE.workspaceId)
    expect(summary?.contact_id).toBe('4444444444444444444')
    expect(summary?.business_identity_id).toBe('3333333333333333333')
    expect(summary?.status).toBe('active')
    expect(summary?.version).toBe(2)
  })

  it('visit_token_id / close_reason / 任何 digest·secret·cipher 绝不进入产出视图', () => {
    const summary = toCsSessionSummary({
      ...RAW_SESSION,
      visit_token_id: '8888888888888888888',
      close_reason: 'operator_closed',
      key_digest: 'DIGEST',
      token_digest: 'TOKEN-DIGEST',
      secret: 'SECRET',
      body_cipher: 'CIPHER',
      object_key: 'bucket/object',
    })
    expect(summary).not.toBeNull()
    const json = JSON.stringify(summary)
    expect(json.includes('8888888888888888888')).toBe(false)
    expect(json.includes('operator_closed')).toBe(false)
    expect(json.includes('DIGEST')).toBe(false)
    expect(json.includes('TOKEN-DIGEST')).toBe(false)
    expect(json.includes('SECRET')).toBe(false)
    expect(json.includes('CIPHER')).toBe(false)
    expect(json.includes('bucket/object')).toBe(false)
    expect('visit_token_id' in (summary as object)).toBe(false)
    expect('close_reason' in (summary as object)).toBe(false)
  })

  it('缺 id 的行 fail-closed 返回 null；非数组 sessions 归一空列表', () => {
    expect(toCsSessionSummary({ broken: true })).toBeNull()
    expect(toCsSessionSummary(null)).toBeNull()
    const page = toCsSessionListPage({ sessions: [{ broken: true }, RAW_SESSION], next_after_id: null }, 50)
    expect(page.sessions.length).toBe(1)
    expect(toCsSessionListPage({ sessions: 'not-an-array', next_after_id: null }, 50).sessions).toEqual([])
  })

  it('next_after_id 优先取响应值；缺失时回退页尾 id；不足一页返回 null', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...RAW_SESSION, id: String(1000 + i) }))
    expect(toCsSessionListPage({ sessions: rows, next_after_id: 'CURSOR' }, 50).next_after_id).toBe('CURSOR')
    expect(toCsSessionListPage({ sessions: rows }, 3).next_after_id).toBe('1002') // 回退页尾
    expect(toCsSessionListPage({ sessions: rows.slice(0, 2) }, 3).next_after_id).toBeNull()
    expect(toCsSessionListPage({ sessions: [], next_after_id: null }, 50).next_after_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 错误态映射（401/403/404/422）与状态标签
// ---------------------------------------------------------------------------
describe('cs list failure mapping and status labels', () => {
  it('401/403/404/422 分别映射为 unauthenticated/permission_missing/not_found/validation', () => {
    expect(classifyListFailure({ code: 401, msg: 'unauthenticated' })).toBe('unauthenticated')
    expect(classifyListFailure({ code: 403, msg: 'permission_missing' })).toBe('permission_missing')
    expect(classifyListFailure({ code: 404, msg: 'session_not_found' })).toBe('not_found')
    expect(classifyListFailure({ code: 422, msg: 'invalid_limit' })).toBe('validation')
    expect(classifyListFailure({ code: 422, msg: 'invalid_after_id' })).toBe('validation')
    expect(classifyListFailure(new Error('network'))).toBe('unknown')
  })

  it('每个失败分类都有非空用户文案', () => {
    for (const kind of ['unauthenticated', 'permission_missing', 'not_found', 'validation', 'unknown'] as const) {
      expect(listFailureMessage(kind).length).toBeGreaterThan(0)
    }
    expect(listFailureMessage('unauthenticated')).toContain('登录')
  })

  it('状态标签覆盖 C1 三种白名单状态', () => {
    expect(csSessionListStatusLabel('queued')).toBe('排队中')
    expect(csSessionListStatusLabel('active')).toBe('服务中')
    expect(csSessionListStatusLabel('closed')).toBe('已关闭')
    expect(csSessionListStatusLabel('weird')).toBe('weird')
  })
})
