/**
 * R12-AD：按目标 IANA 时区构造自然日「整日半开区间」[当地 00:00, 次日 00:00)。
 *
 * 职责边界（PLAN R12：日期范围 helper 与报表窗口各有职责，共用日历语义，
 * 不共用固定 24 小时假设）：
 * - 本模块只做「日历日 × 时区 → 瞬间区间」的纯换算（DST 23/25 小时日自然正确）；
 * - auditDateRange（本地时区语义、畸形→unbounded）与内容复审的客户端范围
 *   构造都消费本实现，不再各自维护一套午夜算术；
 * - 宿主 Intl 的 IANA zone 支持已在 W0 实测（Bun/JSC：NY 23h/25h、
 *   Shanghai +8、Kathmandu +5:45 正确）；无第三方时区库依赖。
 */

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

type CalendarDayRange = {
  /** 该日当地 00:00 对应的 UTC 毫秒（含）。 */
  startMs: number
  /** 次日当地 00:00 对应的 UTC 毫秒（不含）。 */
  endExclusiveMs: number
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days[month - 1]!
}

/** 日历日合法性（拒绝 JS 引擎会滚动到下月的 2026-02-30 之类）。 */
export function isValidCalendarDay(date: string): boolean {
  if (!CALENDAR_DAY.test(date)) return false
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

type ZoneWallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zoneWallClock(utcMs: number, timeZone: string): ZoneWallClock {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

/** UTC 时刻在目标时区的 offset（ms，东半球为正）：把墙上时钟当 UTC 求差。 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const wall = zoneWallClock(utcMs, timeZone)
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return wallAsUtc - utcMs
}

/**
 * 目标时区某日历日当地 00:00 的 UTC 毫秒。两次迭代吸收 DST 边界的
 * offset 抖动；`Date.UTC` 的越界参数自动进位处理月末/年末加法。
 */
function zoneMidnightMs(year: number, month: number, day: number, timeZone: string): number {
  let guess = Date.UTC(year, month - 1, day)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = zoneOffsetMs(guess, timeZone)
    const candidate = guess - offset
    if (zoneOffsetMs(candidate, timeZone) === offset) return candidate
    guess = candidate
  }
  return guess
}

/**
 * 整日半开区间：`[当日当地 00:00, 次日当地 00:00)`。
 * 畸形日期（含会被引擎滚动的 02-30）返回 null——调用方按自己的语义
 * 决定 unbounded / 拒绝上送，不在 helper 里猜测。
 * 23/25 小时 DST 日的区间长度由两次真实午夜相减自然得出（无 86400 假设）。
 */
export function calendarDayRange(date: string, timeZone: string): CalendarDayRange | null {
  if (!isValidCalendarDay(date)) return null
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const startMs = zoneMidnightMs(year, month, day, timeZone)
  // 日历加法求次日（Date.UTC 越界参数自动进位），仍按目标时区求其午夜。
  const endExclusiveMs = zoneMidnightMs(year, month, day + 1, timeZone)
  return { startMs, endExclusiveMs }
}

/**
 * 瞬间 → 目标时区当地日历日（YYYY-MM-DD）。供「今天 / 昨天」推导与
 * reference date 注入（测试固定参考瞬间后日历推导可复现）。
 */
export function calendarDateOf(instant: number | Date, timeZone: string): string {
  const wall = zoneWallClock(instant instanceof Date ? instant.getTime() : instant, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(wall.year).padStart(4, '0')}-${pad(wall.month)}-${pad(wall.day)}`
}
