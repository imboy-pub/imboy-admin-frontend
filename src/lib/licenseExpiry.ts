/**
 * License 到期时间换算 —— 单位约定的唯一真相来源。
 *
 * B-20：后端 `expires_at` 是**毫秒**（`imboy_license` 里
 * `ExpiresAt = StartMs + trial_days() * 86400000`，比较用
 * `erlang:system_time(millisecond)`），但前端三处都按**秒**处理、额外乘了 1000：
 *   - LicenseExpiryBanner：时间戳大 1000 倍 → daysLeft 巨大 → `> 30` 直接返回
 *     null，**到期横幅永不显示**
 *   - LicensePage formatExpiry：到期日显示成公元五万年
 *   - LicensePage daysRemaining：剩余天数是个荒谬的大数
 *
 * 三处各写一遍换算，正是它们能一起错、又没人发现的原因。这里收成一处：
 * 单位知识只存在于本文件，调用方拿到的就是天数/Date，不再自己乘除。
 */

/** 一天的毫秒数 */
const MS_PER_DAY = 86_400_000

/**
 * 距到期还有多少天（向上取整）。
 *
 * @param expiresAtMs 后端 `expires_at`，**毫秒** epoch
 * @param nowMs 当前时刻，毫秒 epoch（显式传入便于测试，不在内部取 Date.now）
 * @returns 正数=剩余天数；<=0 表示已到期
 */
export function daysUntilExpiry(expiresAtMs: number, nowMs: number): number {
  return Math.ceil((expiresAtMs - nowMs) / MS_PER_DAY)
}

/**
 * 到期时间转 Date。
 *
 * @param expiresAtMs 后端 `expires_at`，**毫秒** epoch
 */
export function expiryToDate(expiresAtMs: number): Date {
  return new Date(expiresAtMs)
}
