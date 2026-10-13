import { expect, it } from 'bun:test'
import { toCsSessionStats } from './pureFunctions'

const facts = {
  organization_id: '7266418340025468901', date: '2026-10-12', tz_offset: 480,
  window_start: 1791734400, window_end: 1791820800,
  new_sessions: 4, closed_sessions: 2,
  first_response: { count: 0, avg_seconds: null }, rating: { count: 0, avg: null },
  current: { queued: 1, active: 2 },
}

it('no-sample means remain null rather than being coerced to zero', () => {
  const result = toCsSessionStats(facts)
  expect(result?.firstResponse.avgSeconds).toBeNull()
  expect(result?.rating.avg).toBeNull()
})

it('explicit zero wait and a valid rating are preserved exactly', () => {
  const result = toCsSessionStats({ ...facts,
    first_response: { count: 1, avg_seconds: 0 }, rating: { count: 2, avg: 4.5 },
  })
  expect(result?.firstResponse).toEqual({ count: 1, avgSeconds: 0 })
  expect(result?.rating).toEqual({ count: 2, avg: 4.5 })
})

for (const key of ['window_start', 'window_end', 'new_sessions', 'closed_sessions', 'current', 'first_response', 'rating']) {
  it('missing ' + key + ' is rejected instead of displaying invented zeros', () => {
    const incomplete: Record<string, unknown> = { ...facts }
    delete incomplete[key]
    expect(toCsSessionStats(incomplete)).toBeNull()
  })
}

for (const count of [null, false, '', -1, 0.5, Infinity, 'not-a-count']) {
  it('invalid count ' + String(count) + ' rejects the whole statistics response', () => {
    expect(toCsSessionStats({ ...facts, new_sessions: count })).toBeNull()
  })
}

it('invalid metric values and inconsistent sample counts are rejected', () => {
  for (const average of [undefined, '', false, -1, Infinity]) {
    expect(toCsSessionStats({ ...facts, first_response: { count: 1, avg_seconds: average } })).toBeNull()
  }
  expect(toCsSessionStats({ ...facts, first_response: { count: 1, avg_seconds: null } })).toBeNull()
  expect(toCsSessionStats({ ...facts, rating: { count: 1, avg: 6 } })).toBeNull()
  expect(toCsSessionStats({ ...facts, rating: { count: 0, avg: 4 } })).toBeNull()
})

it('invalid calendar dates, windows and offsets cannot reach date formatting', () => {
  for (const change of [{ date: '2026-02-31' }, { window_end: 1 },
    { window_end: Number.MAX_SAFE_INTEGER }, { tz_offset: 841 }, { tz_offset: 0.5 }]) {
    expect(toCsSessionStats({ ...facts, ...change })).toBeNull()
  }
})

it('a correctly echoed day and offset cannot hide a different or shortened window', () => {
  for (const change of [{ window_start: facts.window_start + 86400, window_end: facts.window_end + 86400 },
    { window_end: facts.window_start + 1 }, { window_start: facts.window_start + 1 }]) {
    expect(toCsSessionStats({ ...facts, ...change })).toBeNull()
  }
})

it('valid UTC windows may start before the Unix epoch without making counts negative', () => {
  const result = toCsSessionStats({ ...facts, date: '1970-01-01', tz_offset: 480,
    window_start: -28800, window_end: 57600,
  })
  expect(result?.windowStart).toBe(-28800)
  expect(result?.windowEnd).toBe(57600)
  expect(toCsSessionStats({ ...facts, new_sessions: -1 })).toBeNull()
})

it('window timestamps still reject coercion, fractional values and unsafe integers', () => {
  for (const windowStart of [null, false, '', -0.5, '-0.5', Number.MIN_SAFE_INTEGER - 1]) {
    expect(toCsSessionStats({ ...facts, window_start: windowStart })).toBeNull()
  }
})
