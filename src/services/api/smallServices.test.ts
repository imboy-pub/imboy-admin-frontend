/**
 * Unit tests for smaller service modules:
 *   mutedUsers, pushToken, complianceKey, logoutApplications
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'

import {
  listMutedUsers,
  unmuteUser,
  unmuteUsers,
  mutedUsersQueryKey,
} from './mutedUsers'
import {
  listPushTokens,
  pushTokenQueryKey,
} from './pushToken'
import {
  listComplianceKeys,
  createComplianceKey,
  revokeComplianceKey,
  complianceKeyQueryKey,
} from './complianceKey'
import {
  getLogoutApplicationListPayload,
  rejectLogoutApplication,
} from './logoutApplications'

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
// mutedUsers
// ---------------------------------------------------------------------------
describe('mutedUsersQueryKey', () => {
  it('returns stable cache key', () => {
    expect(mutedUsersQueryKey()).toEqual(['muted-users', 'list'])
  })
})

describe('listMutedUsers', () => {
  it('returns muted user list from payload', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/admin/muted_users/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [
              { uid: '101', mute_until: 1800000000, remaining_seconds: 3600 },
              { uid: '202', mute_until: 1800003600, remaining_seconds: 7200 },
            ],
          },
        },
      }
    }

    const result = await listMutedUsers()
    expect(result.list).toHaveLength(2)
    expect(result.list[0].uid).toBe('101')
    expect(result.list[1].remaining_seconds).toBe(7200)
  })
})

describe('unmuteUser', () => {
  it('posts to /admin/muted_users/unmute with uid', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/admin/muted_users/unmute')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await unmuteUser('101')
    expect(capturedBody.uid).toBe('101')
  })
})

describe('unmuteUsers (batch)', () => {
  it('posts to /admin/muted_users/unmute_batch with uids array', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/admin/muted_users/unmute_batch')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await unmuteUsers(['101', '202', '303'])
    expect(capturedBody.uids).toEqual(['101', '202', '303'])
  })
})

// ---------------------------------------------------------------------------
// pushToken
// ---------------------------------------------------------------------------
describe('pushTokenQueryKey', () => {
  it('includes page and size in cache key', () => {
    expect(pushTokenQueryKey(2, 50)).toEqual(['push-token', 'list', 2, 50])
  })
})

describe('listPushTokens', () => {
  it('returns paginated token list from payload', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/admin/push_token/list')
      expect(config?.params?.page).toBe(1)
      expect(config?.params?.size).toBe(10)
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [
              {
                user_id: '9001',
                device_id: 'dev-001',
                device_type: 'phone',
                platform: 'android',
                token: 'fcm-token-abc',
                created_at: '2026-01-10 08:00:00',
                updated_at: '2026-01-10 08:00:00',
              },
            ],
            total: 1, page: 1, size: 10,
          },
        },
      }
    }

    const result = await listPushTokens(1, 10)
    expect(result.list).toHaveLength(1)
    expect(result.list[0].user_id).toBe('9001')
    expect(result.list[0].platform).toBe('android')
    expect(result.total).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// complianceKey
// ---------------------------------------------------------------------------
describe('complianceKeyQueryKey', () => {
  it('returns stable cache key', () => {
    expect(complianceKeyQueryKey()).toEqual(['compliance-key', 'list'])
  })
})

describe('listComplianceKeys', () => {
  it('returns key list from payload', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/admin/compliance_key/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [
              { key_id: 'key-001', status: 1, created_at: '2026-01-01 00:00:00' },
              { key_id: 'key-002', status: 0, created_at: '2026-02-01 00:00:00', revoked_at: '2026-03-01' },
            ],
          },
        },
      }
    }

    const result = await listComplianceKeys()
    expect(result.list).toHaveLength(2)
    expect(result.list[0].key_id).toBe('key-001')
    expect(result.list[0].status).toBe(1)
    expect(result.list[1].status).toBe(0)
  })
})

describe('createComplianceKey', () => {
  it('posts only public_key and returns key_id (零信任改造线 A)', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/admin/compliance_key/create')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { key_id: 'new-key-001' } } }
    }

    const result = await createComplianceKey({
      public_key: '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
    })

    expect(result.key_id).toBe('new-key-001')
    expect(capturedBody.public_key).toContain('BEGIN PUBLIC KEY')
    // 守护：禁止上送 private_key_encrypted（零信任改造线 A）
    expect(capturedBody).not.toHaveProperty('private_key_encrypted')
  })
})

describe('revokeComplianceKey', () => {
  it('posts key_id to /admin/compliance_key/revoke', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/admin/compliance_key/revoke')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await revokeComplianceKey('key-001')
    expect(capturedBody.key_id).toBe('key-001')
  })
})

// ---------------------------------------------------------------------------
// logoutApplications
// ---------------------------------------------------------------------------
describe('getLogoutApplicationListPayload', () => {
  it('returns paginated logout application list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/user/logout_apply/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              {
                uid: '5001',
                account: 'user5001',
                nickname: 'Test User',
                body: '账号注销申请',
                status: 0,
                created_at: '2026-04-01 09:00:00',
              },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getLogoutApplicationListPayload({ page: 1, size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].uid).toBe('5001')
    expect(result.total).toBe(1)
  })
})

describe('rejectLogoutApplication', () => {
  it('posts uid and reason to /user/logout_apply/reject', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/user/logout_apply/reject')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { uid: '5001', status: 'rejected' } } }
    }

    const result = await rejectLogoutApplication('5001', '资料不符合要求')
    expect(capturedBody.uid).toBe('5001')
    expect(capturedBody.reason).toBe('资料不符合要求')
    expect(result.payload?.uid).toBe('5001')
  })

  it('uses empty string when reason is omitted', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { uid: '5001', status: 'rejected' } } }
    }

    await rejectLogoutApplication('5001')
    expect(capturedBody.reason).toBe('')
  })
})
