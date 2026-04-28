/**
 * Unit tests for social_graph module APIs:
 *   collects.ts — getUserCollectListPayload, removeUserCollect
 *   tags.ts     — getUserTagListPayload, deleteUserTag
 */
import { describe, expect, it, afterEach } from 'bun:test'
import client from '@/services/api/client'
import {
  getUserCollectListPayload,
  removeUserCollect,
} from './collects'
import {
  getUserTagListPayload,
  deleteUserTag,
} from './tags'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get
const origPost = mutableClient.post

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.post = origPost
})

// ---------------------------------------------------------------------------
// collects
// ---------------------------------------------------------------------------

describe('getUserCollectListPayload', () => {
  it('resolves with paginated payload on success', async () => {
    const items = [{ kind: 1, kind_id: 'abc', source: 'group', created_at: '2024-01-01', updated_at: '2024-01-01' }]
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items, page: 1, size: 10, total: 1, total_pages: 1 } },
    })
    const result = await getUserCollectListPayload({ uid: '42', scene: 'collect' } as Parameters<typeof getUserCollectListPayload>[0])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].kind_id).toBe('abc')
  })

  it('passes uid and page params to API', async () => {
    let capturedParams: unknown
    mutableClient.get = async (_url: unknown, config: unknown) => {
      capturedParams = (config as { params: unknown }).params
      return { data: { code: 0, msg: 'ok', payload: { items: [], page: 2, size: 5, total: 0, total_pages: 0 } } }
    }
    await getUserCollectListPayload({ uid: '99', page: 2, size: 5 } as Parameters<typeof getUserCollectListPayload>[0])
    expect((capturedParams as { uid: string; page: number }).uid).toBe('99')
    expect((capturedParams as { page: number }).page).toBe(2)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(getUserCollectListPayload({ uid: '1' } as Parameters<typeof getUserCollectListPayload>[0])).rejects.toThrow()
  })
})

describe('removeUserCollect', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const result = await removeUserCollect({ uid: '42', kind_id: 'kind-1' })
    expect(result.msg).toBe('ok')
  })

  it('passes correct body to API', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await removeUserCollect({ uid: '10', kind_id: 'k99' })
    expect((capturedBody as { uid: string; kind_id: string }).uid).toBe('10')
    expect((capturedBody as { uid: string; kind_id: string }).kind_id).toBe('k99')
  })
})

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

describe('getUserTagListPayload', () => {
  it('resolves with paginated payload on success', async () => {
    const items = [{ id: 1, creator_user_id: 99, scene: 1, name: 'friends', created_at: '2024-01-01', updated_at: '2024-01-01' }]
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items, page: 1, size: 10, total: 1, total_pages: 1 } },
    })
    const result = await getUserTagListPayload({ uid: '42', scene: 'collect' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('friends')
  })

  it('sends correct params to API', async () => {
    let capturedParams: unknown
    mutableClient.get = async (_url: unknown, config: unknown) => {
      capturedParams = (config as { params: unknown }).params
      return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
    }
    await getUserTagListPayload({ uid: '55', scene: 'friend', keyword: 'test' })
    expect((capturedParams as { uid: string; scene: string; keyword: string }).uid).toBe('55')
    expect((capturedParams as { scene: string }).scene).toBe('friend')
    expect((capturedParams as { keyword: string }).keyword).toBe('test')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(getUserTagListPayload({ uid: '1', scene: 'collect' })).rejects.toThrow()
  })
})

describe('deleteUserTag', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const result = await deleteUserTag({ uid: '42', scene: 'collect', tag: 'my-tag' })
    expect(result.msg).toBe('ok')
  })

  it('passes correct body to API', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteUserTag({ uid: '5', scene: 'friend', tag: 'work' })
    expect((capturedBody as { tag: string }).tag).toBe('work')
    expect((capturedBody as { scene: string }).scene).toBe('friend')
  })
})
