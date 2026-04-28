import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import { getMyRbacProfilePayload } from './rbac'

// Provide sessionStorage if not available (bun test environment)
if (typeof globalThis.sessionStorage === 'undefined') {
  const store: Record<string, string> = {}
  globalThis.sessionStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
  // Clear session-based unavailability flag between tests
  try { sessionStorage.removeItem('imboy_admin_rbac_endpoint_unavailable') } catch { /* ignore */ }
})

describe('getMyRbacProfilePayload', () => {
  it('returns normalized RbacProfile on success', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/rbac/me')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            role_id: 1,
            role_name: '超级管理员',
            permissions: ['users:read', 'users:write', 'groups:read'],
            menu_paths: ['/users', '/groups'],
          },
        },
      }
    }

    const result = await getMyRbacProfilePayload()
    expect(result.role_id).toBe(1)
    expect(result.role_name).toBe('超级管理员')
    expect(result.permissions).toEqual(['users:read', 'users:write', 'groups:read'])
    expect(result.menu_paths).toEqual(['/users', '/groups'])
  })

  it('normalizes role_ids from single role_id', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          role_id: 2,
          role_name: '运营',
          permissions: [],
          menu_paths: [],
        },
      },
    })

    const result = await getMyRbacProfilePayload()
    expect(result.role_id).toBe(2)
    expect(result.role_ids).toEqual([2])
  })

  it('normalizes role_ids from role_ids array', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          role_id: 1,
          role_ids: [1, 2, 3],
          role_name: '复合角色',
          permissions: ['admin:all'],
          menu_paths: [],
        },
      },
    })

    const result = await getMyRbacProfilePayload()
    expect(result.role_ids).toEqual([1, 2, 3])
    expect(result.role_id).toBe(1)
  })

  it('deduplicates concurrent calls — only one request inflight', async () => {
    let callCount = 0
    mutableClient.get = async () => {
      callCount++
      // Simulate async delay
      await new Promise((r) => setTimeout(r, 10))
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { role_id: 1, role_name: 'admin', permissions: [], menu_paths: [] },
        },
      }
    }

    // Fire three concurrent calls
    const [r1, r2, r3] = await Promise.all([
      getMyRbacProfilePayload(),
      getMyRbacProfilePayload(),
      getMyRbacProfilePayload(),
    ])

    // All three resolve to the same result
    expect(r1.role_id).toBe(1)
    expect(r2.role_id).toBe(1)
    expect(r3.role_id).toBe(1)
    // Only one real HTTP request was made
    expect(callCount).toBe(1)
  })

  it('filters empty strings from permissions and menu_paths', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          role_id: 1,
          role_name: 'tester',
          permissions: ['valid:read', '', '  ', 'valid:write'],
          menu_paths: ['/users', '', '/groups'],
        },
      },
    })

    const result = await getMyRbacProfilePayload()
    expect(result.permissions).toEqual(['valid:read', 'valid:write'])
    expect(result.menu_paths).toEqual(['/users', '/groups'])
  })

  it('throws on network error', async () => {
    mutableClient.get = async () => { throw new Error('network failure') }

    await expect(getMyRbacProfilePayload()).rejects.toThrow('network failure')
  })

  // NOTE: This test marks RBAC as unavailable for the rest of the file — keep last
  it('throws and marks endpoint unavailable on 404', async () => {
    mutableClient.get = async () => { throw { code: 404, msg: 'Not Found' } }

    await expect(getMyRbacProfilePayload()).rejects.toBeTruthy()

    // Subsequent calls should short-circuit immediately
    let hitNetwork = false
    mutableClient.get = async () => {
      hitNetwork = true
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await expect(getMyRbacProfilePayload()).rejects.toThrow('RBAC endpoint unavailable')
    expect(hitNetwork).toBe(false)
  })
})
