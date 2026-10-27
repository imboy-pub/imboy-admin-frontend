/**
 * R08-AD.0：跨端接口瞬间的唯一底层 parser（单位显式化）。
 *
 * 合同：
 * - 数字与「兼容整数字符串」（`/^-?\d+$/`）按显式 unit（seconds/milliseconds）
 *   按值换算——绝不按位数猜测单位（微秒等形状只有端点合同证明时才允许新入口）；
 * - RFC3339 字符串必须带 `Z` 或 `±HH:MM` offset，两种 unit 下都接受并按
 *   瞬间解析归一到毫秒（小数秒截断到毫秒，与 Date 精度一致）；
 * - 非法 / 缺失 / null / undefined / NaN / 非有限 / 非整数 / 超出安全整数 /
 *   超 Date 可表示范围 → null；0 与负 epoch 按值处理；**不回填 now**。
 * - DateOnly（YYYY-MM-DD）、duration、TSID 不属于本 helper。
 * - 纯函数：不依赖 React / Admin store / client（widget、seat 独立构建可用）。
 */

type ApiInstantUnit = 'seconds' | 'milliseconds'

/** 兼容整数字符串（历史响应把 epoch 数字字符串化的形状）。 */
const NUMERIC_STRING = /^-?\d+$/

/** 严格 RFC3339 时刻：日期 T 时间 [小数秒] (Z | ±HH:MM)；小写 t/z 兼容。 */
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/

/** 数字形状（number 或兼容整数字符串）：归一入口与「原样 vs 归一」路由共用。 */
export function isNumericInstantShape(raw: unknown): boolean {
  return typeof raw === 'number'
    || (typeof raw === 'string' && NUMERIC_STRING.test(raw))
}

/**
 * 严格 RFC3339 字符串 → 毫秒。先正则钉形状，再做日历校验（拒绝 JS 引擎对
 * 2026-02-30 之类滚动到 3 月的宽松归一），最后 Date.parse 取瞬间。
 * 小数秒由引擎截断到毫秒（宿主一致，无手写舍入分歧）。
 */
function rfc3339ToMs(value: string): number | null {
  const match = RFC3339_INSTANT.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  // 秒位 >59（:60 闰秒形状）有意拒绝——这是收紧而非疏漏：PG timestamptz
  // 不产出闰秒，接收 :60 只会引入各引擎 Date.parse 的分歧处理。
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || Number(offsetHourText ?? 0) > 23 || Number(offsetMinuteText ?? 0) > 59) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * 接口瞬间 → 毫秒（Unix epoch）。非法返回 null，绝不回填当前时间。
 * 数字按显式 unit 换算；RFC3339（带 offset）按瞬间归一；其余拒绝。
 */
export function parseApiInstantMs(raw: unknown, unit: ApiInstantUnit): number | null {
  let value: number
  if (typeof raw === 'number') {
    value = raw
  } else if (typeof raw === 'string' && NUMERIC_STRING.test(raw)) {
    value = Number(raw)
  } else if (typeof raw === 'string') {
    return rfc3339ToMs(raw)
  } else {
    return null
  }
  // Number.isSafeInteger 一并拒绝 NaN / ±Infinity / 小数 / 超精度整数。
  if (!Number.isSafeInteger(value)) return null
  const ms = unit === 'seconds' ? value * 1000 : value
  // Date 可表示范围（±8.64e15ms）之外的时间无法被任何下游消费，直接拒绝。
  return Number.isFinite(new Date(ms).getTime()) ? ms : null
}

/** 薄包装：解析成功输出规范 UTC ISO（毫秒精度）；非法返回 null。 */
export function toApiInstantIso(raw: unknown, unit: ApiInstantUnit): string | null {
  const ms = parseApiInstantMs(raw, unit)
  return ms === null ? null : new Date(ms).toISOString()
}
