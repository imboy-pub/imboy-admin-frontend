import { calendarDayRange } from './calendarRange'

/**
 * Audit page dates always arrive as YYYY-MM-DD or not at all (UI type=date,
 * but URL deep links are user-editable): malformed strings filter nothing
 * instead of throwing RangeError on Invalid Date arithmetic.
 *
 * R12-AD：本地时区整日半开区间的午夜算术收敛到 calendarRange（同一套
 * 日历语义；DST 23/25 小时日由两次真实午夜相减得出）。本模块语义不变：
 * 畸形日期 → unbounded，边界独立。
 */
function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Local calendar bounds for the audit page's already-loaded events. */
export function auditDateRange(dateStart: string, dateEnd: string) {
  const zone = localTimeZone()
  const start = calendarDayRange(dateStart, zone)
  const end = calendarDayRange(dateEnd, zone)
  return {
    startMs: start === null ? -Infinity : start.startMs,
    endExclusiveMs: end === null ? Infinity : end.endExclusiveMs,
  }
}

/** Existing admin endpoints use inclusive timestamptz bounds at microsecond precision. */
export function auditDateQuery(dateStart: string, dateEnd: string) {
  const { startMs, endExclusiveMs } = auditDateRange(dateStart, dateEnd)
  const start = Number.isFinite(startMs) ? new Date(startMs).toISOString() : undefined
  // Whole-day end is always .999Z here, so the µs tail swap yields .999999Z.
  const end = Number.isFinite(endExclusiveMs)
    ? new Date(endExclusiveMs - 1).toISOString().replace(/Z$/, '999Z')
    : undefined
  return {
    ...(start ? { from_ts: start } : {}),
    ...(end ? { to_ts: end } : {}),
  }
}
