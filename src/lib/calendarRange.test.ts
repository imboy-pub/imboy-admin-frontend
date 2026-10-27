/**
 * R12-AD calendarRange 测试（PLAN §7.4 指定新增）。
 *
 * 覆盖 AC：
 * - R12-1 上海筛一天从当地 00:00 开始；
 * - R12-2 当日 23:59:59.999（当地）包含、次日 00:00（当地）排除；
 * - R12-3 相邻日期无重叠无遗漏（N 日 endExclusive === N+1 日 start）；
 * - R12-4 纽约 2026-03-08（23h）与 2026-11-01（25h）DST 日区间长度正确
 *   （本 helper 的时区是显式入参，无需 TZ 环境分支；auditDateRange 的本地
 *   语义集成由 auditDateRange.test.ts 的 TZ 分支覆盖）。
 */
import { describe, expect, it } from 'bun:test'
import { calendarDateOf, calendarDayRange, isValidCalendarDay } from './calendarRange'

const HOUR = 3600000

describe('R12-1/R12-2 整日半开区间（上海）', () => {
  it('2026-10-20 从上海当地 00:00 开始（= UTC 前一日 16:00）', () => {
    const range = calendarDayRange('2026-10-20', 'Asia/Shanghai')
    expect(range).not.toBeNull()
    expect(range!.startMs).toBe(Date.parse('2026-10-19T16:00:00.000Z'))
    expect(range!.endExclusiveMs).toBe(Date.parse('2026-10-20T16:00:00.000Z'))
  })

  it('当地 23:59:59.999 包含；次日当地 00:00 排除（R12-2）', () => {
    const range = calendarDayRange('2026-10-20', 'Asia/Shanghai')!
    const lastMs = Date.parse('2026-10-20T15:59:59.999Z') // 上海 23:59:59.999
    const nextMidnight = Date.parse('2026-10-20T16:00:00.000Z') // 上海 次日 00:00
    expect(lastMs >= range.startMs && lastMs < range.endExclusiveMs).toBe(true)
    expect(nextMidnight >= range.startMs && nextMidnight < range.endExclusiveMs).toBe(false)
  })
})

describe('R12-3 相邻日无重漏', () => {
  for (const [zone, day] of [
    ['Asia/Shanghai', '2026-10-20'],
    ['America/New_York', '2026-03-07'], // 跨春季拨快日
    ['America/New_York', '2026-10-31'], // 跨秋季回落日
    ['UTC', '2026-12-31'], // 跨年
  ] as const) {
    it(`${zone} ${day}：N 日 endExclusive === N+1 日 start（无重漏）`, () => {
      const current = calendarDayRange(day, zone)!
      // N 日上界瞬间即 N+1 日当地 00:00：由它反推日历日再构造区间。
      const nextDay = calendarDateOf(current.endExclusiveMs, zone)
      const following = calendarDayRange(nextDay, zone)!
      expect(current.endExclusiveMs).toBe(following.startMs)
    })
  }
})

describe('R12-4 DST 23/25 小时日（纽约）', () => {
  it('2026-03-08 春季拨快：区间 23 小时', () => {
    const range = calendarDayRange('2026-03-08', 'America/New_York')!
    expect(range.startMs).toBe(Date.parse('2026-03-08T05:00:00.000Z')) // 00:00 EST
    expect(range.endExclusiveMs).toBe(Date.parse('2026-03-09T04:00:00.000Z')) // 次日 00:00 EDT
    expect(range.endExclusiveMs - range.startMs).toBe(23 * HOUR)
  })

  it('2026-11-01 秋季回落：区间 25 小时', () => {
    const range = calendarDayRange('2026-11-01', 'America/New_York')!
    expect(range.startMs).toBe(Date.parse('2026-11-01T04:00:00.000Z')) // 00:00 EDT
    expect(range.endExclusiveMs).toBe(Date.parse('2026-11-02T05:00:00.000Z')) // 次日 00:00 EST
    expect(range.endExclusiveMs - range.startMs).toBe(25 * HOUR)
  })

  it('非 DST 边界日仍是 24 小时；Kathmandu +5:45 偏移正确', () => {
    const normal = calendarDayRange('2026-10-20', 'America/New_York')!
    expect(normal.endExclusiveMs - normal.startMs).toBe(24 * HOUR)
    const kathmandu = calendarDayRange('2026-10-20', 'Asia/Kathmandu')!
    expect(kathmandu.startMs).toBe(Date.parse('2026-10-19T18:15:00.000Z'))
  })
})

describe('畸形日期与日历校验', () => {
  it('会被引擎滚动/越界的日期返回 null（不猜测）', () => {
    for (const bad of ['2026-02-30', '2026-02-29', '1900-02-29', '2026-13-01',
      '2026-00-10', '2026-01-00', '2026-01-32', '', '2026-1-1', '2026-10-20T00:00',
      'not-a-date', '2026/10/20']) {
      expect(calendarDayRange(bad, 'Asia/Shanghai')).toBeNull()
      expect(isValidCalendarDay(bad)).toBe(false)
    }
  })

  it('真实闰日合法（含 2000 千年闰年规则）', () => {
    expect(isValidCalendarDay('2024-02-29')).toBe(true)
    expect(isValidCalendarDay('2000-02-29')).toBe(true)
    const leap = calendarDayRange('2024-02-29', 'UTC')!
    expect(leap.startMs).toBe(Date.parse('2024-02-29T00:00:00.000Z'))
    expect(leap.endExclusiveMs).toBe(Date.parse('2024-03-01T00:00:00.000Z'))
  })

  it('跨年日历进位：12-31 的次日上界是次年 01-01 当地午夜', () => {
    const range = calendarDayRange('2026-12-31', 'Asia/Shanghai')!
    expect(range.endExclusiveMs).toBe(Date.parse('2026-12-31T16:00:00.000Z')) // 2027-01-01 00:00 +08
  })
})

describe('calendarDateOf：瞬间 → 当地日历日（reference date 注入）', () => {
  it('同一瞬间在不同 zone 落入不同日历日；注入参考瞬间推导可复现', () => {
    const instant = Date.parse('2026-10-19T16:30:00.000Z')
    expect(calendarDateOf(instant, 'Asia/Shanghai')).toBe('2026-10-20')
    expect(calendarDateOf(instant, 'UTC')).toBe('2026-10-19')
    expect(calendarDateOf(new Date(instant), 'America/New_York')).toBe('2026-10-19')
  })

  it('注入 reference date 后「当天」区间与直接构造一致', () => {
    const reference = Date.parse('2026-11-01T12:00:00.000Z') // NY 当地 11-01 08:00 EDT（回落前）
    const today = calendarDateOf(reference, 'America/New_York')
    expect(today).toBe('2026-11-01')
    expect(calendarDayRange(today, 'America/New_York')).toEqual(calendarDayRange('2026-11-01', 'America/New_York'))
  })
})
