/**
 * Unit tests for identity module APIs:
 *   users — getUserListPayload, getUserDetailPayload, banUser, unbanUser, searchUsersPayload
 *   messages — getMessageListPayload, getMessageDetailPayload
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getUserListPayload,
  getUserDetailPayload,
  banUser,
  unbanUser,
  searchUsersPayload,
} from './users'
import {
  getMessageListPayload,
  getMessageDetailPayload,
} from '@/modules/messages/api/public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

// ---------------------------------------------------------------------------
// identity/api/users
// ---------------------------------------------------------------------------
describe('getUserListPayload', () => {
  it('returns paginated user list from /user/list', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/user/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: '7001', account: 'alice', nickname: 'Alice', status: 1 },
              { id: '7002', account: 'bob', nickname: 'Bob', status: 1 },
            ],
            page: 1, size: 20, total: 2, total_pages: 1,
          },
        },
      }
    }

    const result = await getUserListPayload({ page: 1, size: 20 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].account).toBe('alice')
    expect(result.total).toBe(2)
  })

  it('forwards keyword filter param', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { items: [], page: 1, size: 10, total: 0, total_pages: 1 },
        },
      }
    }

    await getUserListPayload({ page: 1, size: 10, keyword: 'alice' })
    expect(capturedParams.keyword).toBe('alice')
  })
})

describe('getUserDetailPayload', () => {
  it('passes uid as query param to /user/detail', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/user/detail')
      expect(config?.params?.user_id).toBe('7001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            id: '7001',
            account: 'alice',
            nickname: 'Alice',
            avatar: '',
            status: 1,
            created_at: '2026-01-01',
          },
        },
      }
    }

    const result = await getUserDetailPayload('7001')
    expect(result.id).toBe('7001')
    expect(result.nickname).toBe('Alice')
  })
})

describe('banUser', () => {
  it('posts user_id to /user/ban', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/user/ban')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await banUser('7001')
    // Backend parse_uid_param prefers 'user_id', falls back to 'uid' (T22/BE-17)
    expect(capturedBody.user_id).toBe('7001')
  })
})

describe('unbanUser', () => {
  it('posts user_id to /user/unban', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/user/unban')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await unbanUser('7001')
    expect(capturedBody.user_id).toBe('7001')
  })
})

describe('searchUsersPayload', () => {
  it('forwards keyword, page, size to /user/search', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/user/search')
      expect(config?.params?.keyword).toBe('alice')
      expect(config?.params?.page).toBe(2)
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: '7001', account: 'alice' }],
            page: 2, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await searchUsersPayload('alice', 2, 10)
    expect(result.items[0].account).toBe('alice')
  })
})

// ---------------------------------------------------------------------------
// messages/api/public
// ---------------------------------------------------------------------------
describe('getMessageListPayload', () => {
  it('returns paginated message list from /message/list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/message/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 'msg-001', from_uid: '7001', to_uid: '7002', msg_type: 1, body: 'hello', created_at: '2026-04-01' },
            ],
            page: 1, size: 20, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getMessageListPayload({ page: 1, size: 20 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('msg-001')
  })
})

describe('getMessageDetailPayload', () => {
  it('returns message detail from /message/detail', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/message/detail')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            id: 'msg-001',
            from_uid: '7001',
            body: 'hello world',
            msg_type: 1,
            created_at: '2026-04-01',
          },
        },
      }
    }

    const result = await getMessageDetailPayload({ msg_id: 'msg-001' })
    expect(result.id).toBe('msg-001')
    expect(result.body).toBe('hello world')
  })
})
