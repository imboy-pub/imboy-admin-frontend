/**
 * Unit tests for misc service files:
 *   complianceKey.ts  — listComplianceKeys, createComplianceKey, revokeComplianceKey
 *   mutedUsers.ts     — mutedUsersQueryKey, listMutedUsers, unmuteUser, unmuteUsers
 *   pushToken.ts      — getPushTokenList (if present)
 */
import { describe, expect, it, afterEach } from 'bun:test'
import client from './client'
import {
  complianceKeyQueryKey,
  listComplianceKeys,
  createComplianceKey,
  revokeComplianceKey,
} from './complianceKey'
import {
  mutedUsersQueryKey,
  listMutedUsers,
  unmuteUser,
  unmuteUsers,
} from './mutedUsers'

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
// complianceKey
// ---------------------------------------------------------------------------

describe('complianceKeyQueryKey', () => {
  it('returns stable query key tuple', () => {
    expect(complianceKeyQueryKey()).toEqual(['compliance-key', 'list'])
  })
})

describe('listComplianceKeys', () => {
  it('resolves with list on success', async () => {
    const keys = [{ key_id: '1', status: 1, created_at: '2024-01-01' }]
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: { list: keys } } })
    const result = await listComplianceKeys()
    expect(result.list).toHaveLength(1)
    expect(result.list[0].key_id).toBe('1')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(listComplianceKeys()).rejects.toThrow()
  })
})

describe('createComplianceKey', () => {
  it('resolves with key_id on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: { key_id: '999' } } })
    const result = await createComplianceKey({ public_key: 'pub', private_key_encrypted: 'enc' })
    expect(result.key_id).toBe('999')
  })

  it('throws on API error', async () => {
    mutableClient.post = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(
      createComplianceKey({ public_key: 'pub', private_key_encrypted: 'enc' })
    ).rejects.toThrow()
  })
})

describe('revokeComplianceKey', () => {
  it('resolves without error on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    await expect(revokeComplianceKey('1')).resolves.toBeUndefined()
  })

  it('throws on API error', async () => {
    mutableClient.post = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(revokeComplianceKey('1')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// mutedUsers
// ---------------------------------------------------------------------------

describe('mutedUsersQueryKey', () => {
  it('returns stable query key tuple', () => {
    expect(mutedUsersQueryKey()).toEqual(['muted-users', 'list'])
  })
})

describe('listMutedUsers', () => {
  it('resolves with list on success', async () => {
    const users = [{ uid: '42', mute_until: 9999, remaining_seconds: 100 }]
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: { list: users } } })
    const result = await listMutedUsers()
    expect(result.list).toHaveLength(1)
    expect(result.list[0].uid).toBe('42')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(listMutedUsers()).rejects.toThrow()
  })
})

describe('unmuteUser', () => {
  it('resolves without error on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    await expect(unmuteUser('42')).resolves.toBeUndefined()
  })

  it('passes uid in request body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }
    await unmuteUser('77')
    expect((capturedBody as { uid: string }).uid).toBe('77')
  })

  it('throws on API error', async () => {
    mutableClient.post = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(unmuteUser('42')).rejects.toThrow()
  })
})

describe('unmuteUsers', () => {
  it('resolves without error on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    await expect(unmuteUsers(['1', '2'])).resolves.toBeUndefined()
  })

  it('passes uids array in request body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }
    await unmuteUsers(['10', '20', '30'])
    expect((capturedBody as { uids: string[] }).uids).toEqual(['10', '20', '30'])
  })
})
