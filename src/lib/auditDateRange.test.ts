import { describe, expect, it } from 'bun:test'
import { auditDateRange, auditDateQuery } from './auditDateRange'

function included(timestamp: number, day: string) {
  const { startMs, endExclusiveMs } = auditDateRange(day, day)
  return timestamp >= startMs && timestamp < endExclusiveMs
}

describe('audit local calendar bounds', () => {
  it('starts at local midnight and excludes the preceding instant', () => {
    const midnight = new Date(2026, 9, 20).getTime()
    expect(auditDateRange('2026-10-20', '').startMs).toBe(midnight)
    expect(included(midnight, '2026-10-20')).toBe(true)
    expect(included(midnight - 1, '2026-10-20')).toBe(false)
  })

  it('includes the whole last second and excludes next midnight', () => {
    const nextMidnight = new Date(2026, 9, 21).getTime()
    expect(auditDateRange('', '2026-10-20').endExclusiveMs).toBe(nextMidnight)
    expect(included(nextMidnight - 1, '2026-10-20')).toBe(true)
    expect(included(nextMidnight, '2026-10-20')).toBe(false)
  })

  for (const [day, month, date, nyHours] of [
    ['2026-03-08', 2, 8, 23],
    ['2026-11-01', 10, 1, 25],
  ] as const) {
    it(`uses the next calendar midnight across DST on ${day}`, () => {
      const range = auditDateRange(day, day)
      expect(range.startMs).toBe(new Date(2026, month, date).getTime())
      expect(range.endExclusiveMs).toBe(new Date(2026, month, date + 1).getTime())
      expect(included(range.endExclusiveMs - 1, day)).toBe(true)
      expect(included(range.endExclusiveMs, day)).toBe(false)
      if (process.env.TZ === 'America/New_York') {
        expect(range.endExclusiveMs - range.startMs).toBe(nyHours * 3600000)
      }
    })
  }

  it('keeps an empty range unbounded and each single boundary independent', () => {
    expect(auditDateRange('', '')).toEqual({ startMs: -Infinity, endExclusiveMs: Infinity })
    expect(auditDateRange('2026-10-20', '').endExclusiveMs).toBe(Infinity)
    expect(auditDateRange('', '2026-10-20').startMs).toBe(-Infinity)
  })

  it('treats malformed URL-editable dates as unbounded instead of throwing', () => {
    expect(auditDateRange('garbage', '2026-10-20')).toEqual({ startMs: -Infinity, endExclusiveMs: new Date(2026, 9, 21).getTime() })
    expect(auditDateRange('2026-10-20', '2026-13-01')).toEqual({ startMs: new Date(2026, 9, 20).getTime(), endExclusiveMs: Infinity })
    expect(auditDateRange('2026-10-20T00:00', 'not-a-date')).toEqual({ startMs: -Infinity, endExclusiveMs: Infinity })
    expect(auditDateRange('2026-02-30', '2026-10-20')).toEqual({ startMs: -Infinity, endExclusiveMs: new Date(2026, 9, 21).getTime() })
    expect(auditDateQuery('garbage', '')).toEqual({})
    expect(auditDateQuery('', '2026-10-32')).toEqual({})
  })
})


it('serializes calendar bounds for the existing inclusive microsecond API', () => {
  expect(auditDateQuery('', '')).toEqual({})
  const range = auditDateRange('2026-10-20', '2026-10-20')
  expect(auditDateQuery('2026-10-20', '2026-10-20')).toEqual({
    from_ts: new Date(range.startMs).toISOString(),
    to_ts: new Date(range.endExclusiveMs - 1).toISOString().replace(/Z$/, '999Z'),
  })
})
