import { describe, expect, it } from 'bun:test'
import { daysUntilExpiry, expiryToDate } from './licenseExpiry'

// B-20：单位约定的回归护栏。三处调用方曾各写一遍 ×1000 换算，
// 于是一起错了同一个方向而没人发现。换算收进一处后，这里钉死它。
describe('licenseExpiry', () => {
  const now = Date.UTC(2026, 7, 1, 0, 0, 0)

  it('treats expires_at as milliseconds, not seconds', () => {
    // 7 天后（毫秒）。若实现里残留 ×1000，这个值会被算成 ~7000 天。
    expect(daysUntilExpiry(now + 7 * 86_400_000, now)).toBe(7)
  })

  it('returns <= 0 once expired', () => {
    expect(daysUntilExpiry(now - 1, now)).toBeLessThanOrEqual(0)
    expect(daysUntilExpiry(now - 86_400_000, now)).toBe(-1)
  })

  it('rounds up so a partial day still counts as a day left', () => {
    // 还剩 1.5 天 → 报 2 天。向下取整会让"明天到期"显示成"今天到期"，
    // 运营方少一天反应时间。
    expect(daysUntilExpiry(now + 1.5 * 86_400_000, now)).toBe(2)
  })

  it('converts to a Date without unit scaling', () => {
    expect(expiryToDate(now).getTime()).toBe(now)
    // 若残留 ×1000，年份会跑到公元五万年
    expect(expiryToDate(now).getUTCFullYear()).toBe(2026)
  })
})
