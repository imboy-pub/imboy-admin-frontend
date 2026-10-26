/**
 * R08-AD.0 公共 helper 测试（PLAN §7.4 指定入口）。
 *
 * 核心 AC（R08-1）：同一瞬间无论以秒数、毫秒数、UTC RFC3339 还是带 offset 的
 * RFC3339 到达，parseApiInstantMs 都归一到同一毫秒值；toApiInstantIso 输出
 * 同一规范 ISO。非法 / 缺失 / 越界一律 null，绝不回填 now、绝不按位数猜单位。
 */
import { describe, expect, it } from 'bun:test'
import { parseApiInstantMs, toApiInstantIso } from './apiInstant'

const T1_SEC = 1789600000
const T1_MS = 1789600000000
const T1_ISO = '2026-09-16T23:06:40.000Z'

describe('parseApiInstantMs: 同一瞬间四种表示归一一致（R08-1）', () => {
  it('秒数 / 毫秒数 / UTC RFC3339 / +08:00 RFC3339 是同一毫秒瞬间', () => {
    expect(parseApiInstantMs(T1_SEC, 'seconds')).toBe(T1_MS)
    expect(parseApiInstantMs(T1_MS, 'milliseconds')).toBe(T1_MS)
    expect(parseApiInstantMs(T1_ISO, 'seconds')).toBe(T1_MS)
    expect(parseApiInstantMs(T1_ISO, 'milliseconds')).toBe(T1_MS)
    expect(parseApiInstantMs('2026-09-17T07:06:40+08:00', 'seconds')).toBe(T1_MS)
    expect(parseApiInstantMs('2026-09-17T07:06:40+08:00', 'milliseconds')).toBe(T1_MS)
    expect(parseApiInstantMs('2026-09-16T16:06:40-07:00', 'milliseconds')).toBe(T1_MS)
  })

  it('纯数字字符串按显式 unit（不按位数猜测）', () => {
    expect(parseApiInstantMs('1789600000', 'seconds')).toBe(T1_MS)
    expect(parseApiInstantMs('1789600000000', 'milliseconds')).toBe(T1_MS)
    // 同一数字字符串在另一 unit 下按该 unit 语义处理，绝不启发式纠正。
    expect(parseApiInstantMs('1789600000', 'milliseconds')).toBe(1789600000)
    expect(parseApiInstantMs('0', 'seconds')).toBe(0)
    expect(parseApiInstantMs('-1', 'seconds')).toBe(-1000)
  })

  it('小数秒归一到毫秒（截断，与 Date 精度一致）', () => {
    expect(parseApiInstantMs('2026-09-16T23:06:40.123456Z', 'seconds')).toBe(T1_MS + 123)
    expect(parseApiInstantMs('2024-02-29T23:59:59.999999+08:00', 'milliseconds'))
      .toBe(Date.parse('2024-02-29T15:59:59.999Z'))
  })
})

describe('parseApiInstantMs: 边界与拒绝', () => {
  it('0 与负 epoch 按值处理（不回填 now、不清零）', () => {
    expect(parseApiInstantMs(0, 'seconds')).toBe(0)
    expect(parseApiInstantMs(0, 'milliseconds')).toBe(0)
    expect(parseApiInstantMs(-1, 'seconds')).toBe(-1000)
    expect(parseApiInstantMs(-1, 'milliseconds')).toBe(-1)
    expect(toApiInstantIso(-1, 'seconds')).toBe('1969-12-31T23:59:59.000Z')
  })

  it('非安全整数 / 非有限值拒绝（含 1e21 与 Number.MAX_SAFE_INTEGER 秒）', () => {
    expect(parseApiInstantMs(1e21, 'milliseconds')).toBeNull()
    expect(parseApiInstantMs(1e21, 'seconds')).toBeNull()
    expect(parseApiInstantMs(Number.MAX_SAFE_INTEGER, 'seconds')).toBeNull()
    expect(parseApiInstantMs(Number.MAX_SAFE_INTEGER, 'milliseconds')).toBeNull()
    expect(parseApiInstantMs(NaN, 'seconds')).toBeNull()
    expect(parseApiInstantMs(Infinity, 'milliseconds')).toBeNull()
    expect(parseApiInstantMs(-Infinity, 'seconds')).toBeNull()
    expect(parseApiInstantMs(1.5, 'seconds')).toBeNull()
    expect(parseApiInstantMs('99999999999999999999', 'milliseconds')).toBeNull()
  })

  it('缺失 / null / undefined / 空串 / 非字符串非数字拒绝', () => {
    for (const value of [null, undefined, '', false, true, {}, []]) {
      expect(parseApiInstantMs(value, 'seconds')).toBeNull()
      expect(parseApiInstantMs(value, 'milliseconds')).toBeNull()
    }
  })

  it('RFC3339 缺 offset / 非法日期 / 畸形形状拒绝（不交给宽松 Date.parse）', () => {
    for (const value of [
      '2026-09-16T23:06:40', // 无 offset
      '2026-09-16 23:06:40Z', // 空格分隔
      '2026-09-16', // DateOnly 不属于瞬间 helper
      '2026-02-30T00:00:00Z', // 日历滚动拒绝
      '2026-13-01T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:00+0800', // offset 无冒号
      'not-a-date',
    ]) {
      expect(parseApiInstantMs(value, 'seconds')).toBeNull()
      expect(parseApiInstantMs(value, 'milliseconds')).toBeNull()
    }
  })
})

describe('toApiInstantIso: 规范 ISO 输出', () => {
  it('同一瞬间四种输入输出同一规范 ISO（R08-1）', () => {
    expect(toApiInstantIso(T1_SEC, 'seconds')).toBe(T1_ISO)
    expect(toApiInstantIso(T1_MS, 'milliseconds')).toBe(T1_ISO)
    expect(toApiInstantIso(T1_ISO, 'seconds')).toBe(T1_ISO)
    expect(toApiInstantIso('2026-09-17T07:06:40+08:00', 'milliseconds')).toBe(T1_ISO)
  })

  it('非法输入返回 null（不回填 now）', () => {
    expect(toApiInstantIso(null, 'seconds')).toBeNull()
    expect(toApiInstantIso('', 'milliseconds')).toBeNull()
    expect(toApiInstantIso('2026-09-16T23:06:40', 'seconds')).toBeNull()
    expect(toApiInstantIso(1e21, 'milliseconds')).toBeNull()
  })
})
