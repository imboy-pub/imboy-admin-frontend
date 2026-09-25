/**
 * 组织客服摘要纯函数单元测试（CS-ADM-01 / CS-GOV-02A）。
 *
 * 覆盖验收点：
 * - TSID lossless：19 位大数 business_identity_id 全程 string（不 Number()）；
 * - 聚合口径：used = enabled 现算（CS-BE-06 同口径）；active sessions =
 *   Σ active_count（仅 enabled 坐席）；max_concurrent 合计；明细截断；
 * - seatLimit 恒 null（平台 /api/adm 域不投影额度，诚实降级不编造）；
 * - 错误归类：409 / seat_limit_exceeded / advisory lock 类并发冲突有稳定
 *   类别与行动指引；403 等其他错误不误报冲突。
 */
import { describe, expect, it } from 'bun:test'
import {
  aggregateOrgCsSummary,
  classifyCsSummaryError,
  CS_SUMMARY_DETAIL_LIMIT,
  isCsConcurrencyConflict,
  toCsSummarySeatFact,
} from './csSummaryPure'

const ORG = '114022088375011328'
const BIG_TSID_A = '1942412345678901234'
const BIG_TSID_B = '1942412345678901299'
const BIG_TSID_C = '1942412345678901307'

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

describe('toCsSummarySeatFact', () => {
  it('19 位 TSID 全程 string（lossless，不 Number()）', () => {
    const fact = toCsSummarySeatFact(seatRow({ business_identity_id: BIG_TSID_A }))
    expect(fact).not.toBeNull()
    expect(fact?.businessIdentityId).toBe(BIG_TSID_A)
    expect(typeof fact?.businessIdentityId).toBe('string')
  })

  it('enabled 容错布尔字面量；max_concurrent/active_count 容错数字串', () => {
    const fact = toCsSummarySeatFact(
      seatRow({ enabled: 'true', max_concurrent: '5', active_count: '1' })
    )
    expect(fact?.enabled).toBe(true)
    expect(fact?.maxConcurrent).toBe(5)
    expect(fact?.activeCount).toBe(1)
  })

  it('缺 business_identity_id 的行 fail-closed 返回 null（宁缺毋假）', () => {
    expect(toCsSummarySeatFact(seatRow({ business_identity_id: '' }))).toBeNull()
    expect(toCsSummarySeatFact(seatRow({ business_identity_id: undefined }))).toBeNull()
    expect(toCsSummarySeatFact(null)).toBeNull()
    expect(toCsSummarySeatFact('not-an-object')).toBeNull()
  })
})

describe('aggregateOrgCsSummary', () => {
  it('used 只计 enabled；active sessions = Σ active_count（仅 enabled）；并发上限合计', () => {
    const summary = aggregateOrgCsSummary(
      ORG,
      [
        seatRow({ business_identity_id: BIG_TSID_A, enabled: true, max_concurrent: 3, active_count: 2 }),
        seatRow({
          business_identity_id: BIG_TSID_B,
          display_name: null,
          enabled: true,
          max_concurrent: 5,
          active_count: 1,
        }),
        seatRow({ business_identity_id: BIG_TSID_C, enabled: false, max_concurrent: 9, active_count: 7 }),
      ],
      false
    )
    expect(summary.organizationId).toBe(ORG)
    expect(summary.seatTotal).toBe(3)
    expect(summary.seatUsed).toBe(2)
    // 停用坐席不进 used / active / 并发上限（active 会话只可能挂在 enabled 坐席上）
    expect(summary.activeSessions).toBe(3)
    expect(summary.maxConcurrentTotal).toBe(8)
    expect(summary.seats).toHaveLength(3)
    expect(summary.seats.map((seat) => seat.businessIdentityId)).toEqual([
      BIG_TSID_A,
      BIG_TSID_B,
      BIG_TSID_C,
    ])
  })

  it('seatLimit 恒为 null：平台 /api/adm 域不投影额度事实，不推导不编造', () => {
    const summary = aggregateOrgCsSummary(ORG, [seatRow()], false)
    expect(summary.seatLimit).toBeNull()
  })

  it('空行集 → seatTotal=0（空态判据）；truncated 如实透传', () => {
    const empty = aggregateOrgCsSummary(ORG, [], false)
    expect(empty.seatTotal).toBe(0)
    expect(empty.seatUsed).toBe(0)
    expect(empty.activeSessions).toBe(0)
    expect(empty.truncated).toBe(false)

    const truncated = aggregateOrgCsSummary(ORG, [seatRow()], true)
    expect(truncated.truncated).toBe(true)
  })

  it('明细行超出上限截断到 CS_SUMMARY_DETAIL_LIMIT（摘要不是列表页）', () => {
    const rows = Array.from({ length: CS_SUMMARY_DETAIL_LIMIT + 5 }, (_, index) =>
      seatRow({ business_identity_id: String(1000000000000000000 + index) })
    )
    const summary = aggregateOrgCsSummary(ORG, rows, false)
    expect(summary.seatTotal).toBe(CS_SUMMARY_DETAIL_LIMIT + 5)
    expect(summary.seats).toHaveLength(CS_SUMMARY_DETAIL_LIMIT)
  })
})

describe('isCsConcurrencyConflict / classifyCsSummaryError', () => {
  it('HTTP 409 → 并发冲突（advisory lock 治理写并发类）', () => {
    const err = { code: 409, msg: '组织已归档，不能更新' }
    expect(isCsConcurrencyConflict(err)).toBe(true)
    const failure = classifyCsSummaryError(err)
    expect(failure.concurrencyConflict).toBe(true)
    expect(failure.suggestRefresh).toBe(true)
    expect(failure.message).toContain('并发冲突（409/advisory lock 类）')
    expect(failure.message).toContain('刷新服务端事实后重试')
  })

  it('稳定码 seat_limit_exceeded（非 409 状态）也归并发/额度冲突', () => {
    const err = { code: 400, msg: 'seat_limit_exceeded: 并发开通超出组织额度' }
    expect(isCsConcurrencyConflict(err)).toBe(true)
    expect(classifyCsSummaryError(err).concurrencyConflict).toBe(true)
  })

  it('advisory lock / serialization failure / deadlock 类锁错误归并发冲突', () => {
    expect(isCsConcurrencyConflict({ code: 503, msg: 'could not obtain advisory lock' })).toBe(true)
    expect(isCsConcurrencyConflict({ code: 500, msg: 'serialization failure: 40001' })).toBe(true)
    expect(isCsConcurrencyConflict({ code: 500, msg: 'deadlock detected (40P01)' })).toBe(true)
  })

  it('403 权限 / 网络错误不误报为并发冲突', () => {
    const forbidden = classifyCsSummaryError({ code: 403, msg: '无权限' })
    expect(forbidden.concurrencyConflict).toBe(false)
    expect(forbidden.kind).toBe('forbidden')
    expect(forbidden.message).toContain('403')

    const network = classifyCsSummaryError({ code: -1, msg: 'Network Error' })
    expect(network.concurrencyConflict).toBe(false)
    expect(network.kind).toBe('network')
  })
})
