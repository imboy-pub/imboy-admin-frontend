/** Audit page dates always arrive as YYYY-MM-DD or not at all (UI type=date,
 *  but URL deep links are user-editable): malformed strings filter nothing
 *  instead of throwing RangeError on Invalid Date arithmetic. */
const WHOLE_DAY = /^\d{4}-\d{2}-\d{2}$/

const unbounded = (ms: number, fallback: number) => (Number.isFinite(ms) ? ms : fallback)

/** Parse YYYY-MM-DD as local midnight; reject JS rollover (Feb 30 → Mar 2)
 *  so a typo filters nothing instead of the wrong day. */
function wholeDayMs(date: string): number {
  if (!WHOLE_DAY.test(date)) return NaN
  const parsed = new Date(`${date}T00:00:00`)
  const ms = parsed.getTime()
  if (!Number.isFinite(ms)) return NaN
  const same = parsed.getFullYear() === Number(date.slice(0, 4))
    && parsed.getMonth() === Number(date.slice(5, 7)) - 1
    && parsed.getDate() === Number(date.slice(8, 10))
  return same ? ms : NaN
}

/** Local calendar bounds for the audit page's already-loaded events. */
export function auditDateRange(dateStart: string, dateEnd: string) {
  const startMs = unbounded(wholeDayMs(dateStart), -Infinity)
  let endExclusiveMs = Infinity
  if (Number.isFinite(wholeDayMs(dateEnd))) {
    const nextDay = new Date(`${dateEnd}T00:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    endExclusiveMs = unbounded(nextDay.getTime(), Infinity)
  }
  return { startMs, endExclusiveMs }
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
