import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { getMicroCommunityEnabled, getDiscussionCandidates, setDiscussionBinding, setChannelMessageEssence } from './public'

const originalGet = client.get
const originalPut = client.put
afterEach(() => { client.get = originalGet; client.put = originalPut })

describe('micro community API', () => {
  it('uses nullable EntityId binding without converting large IDs', async () => {
    const calls: unknown[] = []
    client.put = (async (url: string, body: unknown) => {
      calls.push([url, body]); return { data: { payload: body } }
    }) as typeof client.put
    await setDiscussionBinding('9223372036854775800', '9223372036854775700')
    await setDiscussionBinding('9223372036854775800', null)
    expect(calls).toEqual([
      ['/channel/9223372036854775800/discussion', { discussion_group_id: '9223372036854775700' }],
      ['/channel/9223372036854775800/discussion', { discussion_group_id: null }],
    ])
  })
  it('keeps essence and pin independent', async () => {
    client.put = (async (url: string, body: unknown) => {
      expect(url).toBe('/channel/10/message/20/essence')
      expect(body).toEqual({ is_essence: true }); return { data: { code: 0 } }
    }) as typeof client.put
    await setChannelMessageEssence('10', '20', true)
  })
  it('normalizes candidate list and passes pagination', async () => {
    client.get = (async (url: string, config: { params: unknown }) => {
      expect(url).toBe('/channel/10/discussion/candidates')
      expect(config.params).toEqual({ page: 2, size: 10 })
      return { data: { payload: { list: [{ id: '20', title: '讨论' }], page: 2, size: 10, total: 11 } } }
    }) as typeof client.get
    expect((await getDiscussionCandidates('10', 2, 10)).items[0].id).toBe('20')
  })
  it('requires explicit live profile and channel flag', async () => {
    for (const [profile, flag, enabled] of [
      ['community', true, true], ['phase1_delivery', true, false],
      ['unknown', true, false], [undefined, true, false], ['community', undefined, false],
    ] as const) {
      client.get = (async () => ({ data: { payload: { profile, features: { channel: flag } } } })) as typeof client.get
      expect(await getMicroCommunityEnabled()).toBe(enabled)
    }
  })
})
