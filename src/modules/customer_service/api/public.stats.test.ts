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
