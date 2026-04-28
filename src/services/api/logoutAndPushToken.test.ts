/**
 * Unit tests for:
 *   logoutApplications.ts — getLogoutApplicationListPayload, rejectLogoutApplication
 *   pushToken.ts           — pushTokenQueryKey, listPushTokens
 */
import { describe, expect, it, afterEach } from 'bun:test'
import client from './client'
import {
  getLogoutApplicationListPayload,
  rejectLogoutApplication,
} from './logoutApplications'
import {
  pushTokenQueryKey,
  listPushTokens,
} from './pushToken'

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
// getLogoutApplicationListPayload
// ---------------------------------------------------------------------------

describe('getLogoutApplicationListPayload', () => {
  it('resolves with paginated payload on success', async () => {
    const items = [{ uid: '1', reason: 'test', status: 0, created_at: '2024-01-01' }]
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: { items, page: 1, size: 10, total: 1, total_pages: 1 },
      },
    })
    const result = await getLogoutApplicationListPayload({ page: 1, size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(getLogoutApplicationListPayload({ page: 1, size: 10 })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rejectLogoutApplication
// ---------------------------------------------------------------------------

describe('rejectLogoutApplication', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({
      data: { code: 0, msg: 'ok', payload: { uid: '1', status: 'rejected' } },
    })
    const result = await rejectLogoutApplication('1', 'inappropriate')
    expect(result.msg).toBe('ok')
  })

  it('passes uid and reason in request body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await rejectLogoutApplication('42', 'spam')
    expect((capturedBody as { uid: string; reason: string }).uid).toBe('42')
    expect((capturedBody as { uid: string; reason: string }).reason).toBe('spam')
  })

  it('uses empty string when reason is omitted', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await rejectLogoutApplication('99')
    expect((capturedBody as { reason: string }).reason).toBe('')
  })
})

// ---------------------------------------------------------------------------
// pushTokenQueryKey
// ---------------------------------------------------------------------------

describe('pushTokenQueryKey', () => {
  it('returns tuple with page and size', () => {
    expect(pushTokenQueryKey(1, 10)).toEqual(['push-token', 'list', 1, 10])
    expect(pushTokenQueryKey(2, 20)).toEqual(['push-token', 'list', 2, 20])
  })
})

// ---------------------------------------------------------------------------
// listPushTokens
// ---------------------------------------------------------------------------

describe('listPushTokens', () => {
  it('resolves with list on success', async () => {
    const tokens = [
      {
        user_id: '100',
        device_id: 'dev-1',
        device_type: 'ios',
        platform: 'apple',
        token: 'tok-abc',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      },
    ]
    mutableClient.get = async (_url: unknown, config: unknown) => {
      expect((config as { params: { page: number } }).params.page).toBe(1)
      return { data: { code: 0, msg: 'ok', payload: { list: tokens, total: 1, page: 1, size: 10 } } }
    }
    const result = await listPushTokens(1, 10)
    expect(result.list).toHaveLength(1)
    expect(result.list[0].device_type).toBe('ios')
    expect(result.total).toBe(1)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(listPushTokens(1, 10)).rejects.toThrow()
  })
})
