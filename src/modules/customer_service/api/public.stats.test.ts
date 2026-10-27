import { afterEach, expect, it, mock, spyOn } from 'bun:test'
import client from '@/services/api/client'
import { getCsSessionStats } from './public'

const facts = {
  organization_id: '11', date: '2026-10-12', tz_offset: 480,
  window_start: 1791734400, window_end: 1791820800,
  new_sessions: 4, closed_sessions: 2,
  first_response: { count: 0, avg_seconds: null }, rating: { count: 0, avg: null },
  current: { queued: 1, active: 2 },
}
afterEach(() => mock.restore())

it('an omitted timezone uses the contracted UTC default, not the response timezone', async () => {
  spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: facts } })
  await expect(getCsSessionStats({ organizationId: '11', date: '2026-10-12' })).rejects.toThrow('无法展示')
})

it('statistics preserve explicit no-sample values from the wire', async () => {
  spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: facts } })
  const value = await getCsSessionStats({ organizationId: '11', date: '2026-10-12', tzOffset: 480 })
  expect(value.rating.avg).toBeNull()
  expect(value.firstResponse.avgSeconds).toBeNull()
})

for (const change of [{ organization_id: '12' }, { date: '2026-10-11' }, { tz_offset: 0 }, { new_sessions: null }]) {
  it('inconsistent response ' + JSON.stringify(change) + ' fails without displaying wrong-scope facts', async () => {
    spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: { ...facts, ...change } } })
    await expect(getCsSessionStats({ organizationId: '11', date: '2026-10-12', tzOffset: 480 })).rejects.toThrow('无法展示')
  })
}


it('new reply facts preserve existing organization, date and timezone guards', async () => {
  const additions = { first_human_response: { count: 1, avg_seconds: 12 },
    first_ai_response: { count: 0, avg_seconds: null }, response_unknown_count: 2 }
  spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: { ...facts, ...additions } } })
  const value = await getCsSessionStats({ organizationId: '11', date: facts.date, tzOffset: 480 })
  expect(value.firstHumanResponse).toEqual({ count: 1, avgSeconds: 12 })
  expect(value.firstAiResponse).toEqual({ count: 0, avgSeconds: null })
  expect(value.responseUnknownCount).toBe(2)
  for (const change of [{ organization_id: '12' }, { date: '2026-10-11' }, { tz_offset: -480 }]) {
    spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: { ...facts, ...additions, ...change } } })
    await expect(getCsSessionStats({ organizationId: '11', date: facts.date, tzOffset: 480 })).rejects.toThrow('无法展示')
  }
})

// —— D03 zone 模式守卫（自然日窗口）：互斥先行拒绝 + 回显按模式核对 ——
const naturalDayFacts = {
  ...facts, date: '2026-03-08', tz_offset: null,
  window_mode: 'natural_day', zone: 'America/New_York',
  // NY 2026-03-08 春季拨快：当地两午夜 = 05:00Z → 次日 04:00Z（恰 23h，
  // 与 BE 真库套件 cs_stats_zone_pg_tests 的 ny_spring 期望同一对 epoch）
  window_start: 1772946000, window_end: 1772946000 + 23 * 3600,
}

it('zone with tzOffset is rejected client-side before any request (D03)', async () => {
  const get = spyOn(client, 'get')
  await expect(getCsSessionStats({
    organizationId: '11', date: '2026-03-08', zone: 'America/New_York', tzOffset: 480,
  })).rejects.toThrow('互斥')
  expect(get).not.toHaveBeenCalled()
})

it('zone request with legacy fixed-only response fails closed (D03)', async () => {
  // facts 是合法的旧 fixed 形态（无 window_mode 键）：窄化回退 fixed_offset
  // 后与 zone 请求的模式不符 → 拒绝展示
  spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: facts } })
  await expect(getCsSessionStats({ organizationId: '11', date: '2026-03-08', zone: 'America/New_York' }))
    .rejects.toThrow('无法展示')
})

for (const change of [
  { zone: 'Asia/Shanghai' }, // 回显 zone 与请求不一致
  { window_mode: 'fixed_offset' }, // 模式回退
]) {
  it('zone request with inconsistent echo ' + JSON.stringify(change) + ' fails closed (D03)', async () => {
    spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: { ...naturalDayFacts, ...change } } })
    await expect(getCsSessionStats({ organizationId: '11', date: '2026-03-08', zone: 'America/New_York' }))
      .rejects.toThrow('无法展示')
  })
}

it('natural_day echo round-trip passes and preserves the 23h zone window (D03)', async () => {
  spyOn(client, 'get').mockResolvedValue({ data: { code: 0, payload: naturalDayFacts } })
  const value = await getCsSessionStats({ organizationId: '11', date: '2026-03-08', zone: 'America/New_York' })
  expect(value.windowMode).toBe('natural_day')
  expect(value.zone).toBe('America/New_York')
  expect(value.tzOffset).toBeNull()
  expect(value.windowEnd - value.windowStart).toBe(23 * 3600)
})
