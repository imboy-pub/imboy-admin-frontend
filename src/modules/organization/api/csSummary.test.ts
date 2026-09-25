/**
 * 组织客服摘要 API 单元测试（CS-ADM-01）。
 *
 * 覆盖验收点：
 * - 只调 `/customer-service/seats`（client baseURL 即 /api/adm），任何路径
 *   不得出现 `/api/v1`（Admin Cookie 面禁止混用 Seat JWT/Human JWT）；
 * - TSID lossless：organization_id / after_id 以 string 直传查询串；
 * - 键集分页：next_after_id 推进 after_id 游标，耗尽即停；
 * - 安全上限：触达页数上限即 truncated=true（不静默丢行）；
 * - 空 organization_id fail-closed（抛错不发请求）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { getOrgCsSummary, SEAT_PAGE_LIMIT, SEAT_PAGE_MAX } from './csSummary'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
type GetCall = { url: string; params: Record<string, unknown> }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

function captureGets(responder: (_call: GetCall) => unknown) {
  const calls: GetCall[] = []
  mutableClient.get = ((url: unknown, config: unknown) => {
    const call = {
      url: String(url),
      params: ((config as { params?: Record<string, unknown> })?.params ?? {}) as Record<
        string,
        unknown
      >,
    }
    calls.push(call)
    const result = responder(call)
    if (result instanceof Promise) return result
    return Promise.resolve(result)
  }) as AnyFn
  return calls
}
const ORG = '114022088375011328'
const BIG_TSID_A = '1942412345678901234'
const BIG_TSID_B = '1942412345678901299'

function pagePayload(seats: unknown[], nextAfterId: string | null) {
  return { data: { code: 0, msg: 'success', payload: { seats, next_after_id: nextAfterId } } }
}

function seatRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    organization_name: 'IMBoy',
    display_name: '客服甲',
    business_identity_id: BIG_TSID_A,
    function_key: 'customer_service',
    enabled: true,
    max_concurrent: 3,
    active_count: 2,
    workspace_id: ORG,
    ...overrides,
  }
}

describe('getOrgCsSummary', () => {
  it('单页耗尽：GET /customer-service/seats 携带 organization_id（string）与 limit=200，聚合正确', async () => {
    const calls = captureGets(() =>
      pagePayload([seatRow(), seatRow({ business_identity_id: BIG_TSID_B, enabled: false, active_count: 0 })], null)
    )
    const summary = await getOrgCsSummary(ORG)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/customer-service/seats')
    expect(calls[0].url.includes('/api/v1')).toBe(false)
    expect(calls[0].params.organization_id).toBe(ORG)
    expect(calls[0].params.limit).toBe(SEAT_PAGE_LIMIT)
    expect('after_id' in calls[0].params).toBe(false)

    expect(summary.seatTotal).toBe(2)
    expect(summary.seatUsed).toBe(1)
    expect(summary.activeSessions).toBe(2)
    expect(summary.truncated).toBe(false)
  })

  it('键集分页：next_after_id 推进 after_id 游标（TSID string 直传），耗尽即停', async () => {
    const calls = captureGets((call) => {
      if (!('after_id' in call.params)) {
        return pagePayload([seatRow({ business_identity_id: BIG_TSID_A })], BIG_TSID_B)
      }
      return pagePayload([seatRow({ business_identity_id: BIG_TSID_B, active_count: 1 })], null)
    })
    const summary = await getOrgCsSummary(ORG)

    expect(calls).toHaveLength(2)
    expect(calls[1].params.after_id).toBe(BIG_TSID_B)
    expect(summary.seatTotal).toBe(2)
    expect(summary.seatUsed).toBe(2)
    expect(summary.activeSessions).toBe(3)
    expect(summary.truncated).toBe(false)
  })

  it('空页（组织无坐席事实）→ seatTotal=0（空态判据），仅一次请求', async () => {
    const calls = captureGets(() => pagePayload([], null))
    const summary = await getOrgCsSummary(ORG)
    expect(calls).toHaveLength(1)
    expect(summary.seatTotal).toBe(0)
    expect(summary.seats).toHaveLength(0)
  })

  it('触达安全页数上限：恰好 SEAT_PAGE_MAX 次请求后停止并 truncated=true（不静默丢行）', async () => {
    let serial = 0
    const calls = captureGets(() => {
      serial += 1
      // 每页都声称还有下一页（永不尽头）→ 读取器必须自己封顶
      return pagePayload([seatRow({ business_identity_id: String(BigInt(BIG_TSID_A) + BigInt(serial)) })], '9999999999999999999')
    })
    const summary = await getOrgCsSummary(ORG)

    expect(calls).toHaveLength(SEAT_PAGE_MAX)
    expect(summary.truncated).toBe(true)
    expect(summary.seatTotal).toBe(SEAT_PAGE_MAX)
  })

  it('空 organization_id fail-closed：抛错且不发请求', async () => {
    const calls = captureGets(() => pagePayload([], null))
    await expect(getOrgCsSummary('   ')).rejects.toThrow('organization_id')
    expect(calls).toHaveLength(0)
  })

  it('响应缺 payload（契约回归）→ 抛错上抛，不伪造成空摘要', async () => {
    captureGets(() => ({ data: { code: 0, msg: 'success' } }))
    await expect(getOrgCsSummary(ORG)).rejects.toThrow('Missing payload')
  })
})
