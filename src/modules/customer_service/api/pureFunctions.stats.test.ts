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


it('human and AI first replies preserve independent server facts and unknown eligibility', () => {
  const result = toCsSessionStats({ ...facts,
    first_human_response: { count: 2, avg_seconds: 12.5 },
    first_ai_response: { count: 3, avg_seconds: 0 }, response_unknown_count: 4,
  })
  expect(result?.firstHumanResponse).toEqual({ count: 2, avgSeconds: 12.5 })
  expect(result?.firstAiResponse).toEqual({ count: 3, avgSeconds: 0 })
  expect(result?.responseUnknownCount).toBe(4)
  expect(result?.firstResponse).toEqual({ count: 0, avgSeconds: null })
})

it('old responses remain usable with explicitly unknown new metrics', () => {
  const result = toCsSessionStats(facts)
  expect(result).not.toBeNull()
  expect(result?.firstHumanResponse).toBeNull()
  expect(result?.firstAiResponse).toBeNull()
  expect(result?.responseUnknownCount).toBeNull()
})

it('known zero replies preserve null averages and a known zero unknown count', () => {
  const result = toCsSessionStats({ ...facts,
    first_human_response: { count: 0, avg_seconds: null },
    first_ai_response: { count: 0, avg_seconds: null }, response_unknown_count: 0,
  })
  expect(result?.firstHumanResponse).toEqual({ count: 0, avgSeconds: null })
  expect(result?.firstAiResponse).toEqual({ count: 0, avgSeconds: null })
  expect(result?.responseUnknownCount).toBe(0)
})

it('invalid new fields remain unknown without discarding valid existing statistics', () => {
  for (const invalid of [undefined, null, [], false, {}, { count: 0, avg_seconds: 0 },
    { count: 1, avg_seconds: null }, { count: -1, avg_seconds: 1 }, { count: 1, avg_seconds: Infinity }]) {
    const result = toCsSessionStats({ ...facts, first_human_response: invalid, first_ai_response: invalid })
    expect(result).not.toBeNull()
    expect(result?.firstHumanResponse).toBeNull()
    expect(result?.firstAiResponse).toBeNull()
  }
  for (const invalid of [undefined, null, false, '', -1, 0.5, Infinity]) {
    expect(toCsSessionStats({ ...facts, response_unknown_count: invalid })?.responseUnknownCount).toBeNull()
  }
})

// ---------------------------------------------------------------------------
// D03（IMBoy_Timezone_Decisions-V1，2026-10-27 冻结）：zone 自然日模式校验
// ---------------------------------------------------------------------------

// NY 2026-03-08 = 05:00Z..次日04:00Z（23h）；1772965200 = 2026-03-08T05:00:00Z
const naturalFacts = (start: number, lengthSeconds: number) => ({
  organization_id: '7266418340025468901', date: '2026-03-08', tz_offset: null,
  zone: 'America/New_York', window_mode: 'natural_day',
  window_start: start, window_end: start + lengthSeconds,
  new_sessions: 0, closed_sessions: 0,
  first_response: { count: 0, avg_seconds: null }, rating: { count: 0, avg: null },
  current: { queued: 0, active: 0 },
})

it('natural_day accepts 23/24/25 hour DST windows and echoes zone facts', () => {
  const spring23 = toCsSessionStats(naturalFacts(1772965200, 23 * 3600))
  expect(spring23?.windowMode).toBe('natural_day')
  expect(spring23?.zone).toBe('America/New_York')
  expect(spring23?.tzOffset).toBeNull()
  expect(spring23?.windowStart).toBe(1772965200)
  expect(spring23?.windowEnd).toBe(1772965200 + 23 * 3600)
  // 24h（无 DST 日）与 25h（秋季回拨日）同样接受
  expect(toCsSessionStats(naturalFacts(0, 24 * 3600))?.windowMode).toBe('natural_day')
  expect(toCsSessionStats(naturalFacts(0, 25 * 3600))?.windowMode).toBe('natural_day')
})

it('natural_day rejects wrong window lengths, missing zone, or smuggled tz_offset', () => {
  // 22.5h / 26h 非法；zone 缺失/非串非法；natural_day 携带 tz_offset 非法
  expect(toCsSessionStats(naturalFacts(0, 22 * 3600 + 1800))).toBeNull()
  expect(toCsSessionStats(naturalFacts(0, 26 * 3600))).toBeNull()
  const noZone = naturalFacts(0, 24 * 3600) as Record<string, unknown>
  delete noZone.zone
  expect(toCsSessionStats(noZone)).toBeNull()
  expect(toCsSessionStats({ ...naturalFacts(0, 24 * 3600), zone: 123 })).toBeNull()
  expect(toCsSessionStats({ ...naturalFacts(0, 24 * 3600), tz_offset: 0 })).toBeNull()
  expect(toCsSessionStats({ ...naturalFacts(0, 24 * 3600), window_mode: 'fixed_offset' })).toBeNull()
})

it('fixed_offset keeps legacy checks and defaults when window_mode key is absent', () => {
  // 旧响应（无 window_mode/zone 键）：按旧合同校验，模式回填 fixed_offset
  const legacy = toCsSessionStats(facts)
  expect(legacy?.windowMode).toBe('fixed_offset')
  expect(legacy?.zone).toBeNull()
  expect(legacy?.tzOffset).toBe(480)
  // 新 fixed_offset 响应：zone 必须为 null（缺失容忍，服务端恒回 null）
  const modernFixed = toCsSessionStats({ ...facts, window_mode: 'fixed_offset', zone: null })
  expect(modernFixed?.windowMode).toBe('fixed_offset')
  expect(modernFixed?.tzOffset).toBe(480)
  // fixed 模式下窗口仍必须是 expectedStart + 86400（原校验不变）
  expect(toCsSessionStats({ ...facts, window_mode: 'fixed_offset', window_end: facts.window_start + 23 * 3600 })).toBeNull()
  // 未知模式字符串整包拒绝
  expect(toCsSessionStats({ ...facts, window_mode: 'sidereal' })).toBeNull()
})
