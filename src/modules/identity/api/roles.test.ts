/**
 * Unit tests for identity/api/roles:
 *   isRoleEndpointUnavailable — pure classifier
 *   getRoleListPayload — primary + fallback behavior
 *   createRole — endpoint fallback, body normalization
 *   updateRolePermissions — PUT → POST fallback
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  isRoleEndpointUnavailable,
  getRoleListPayload,
  createRole,
  updateRolePermissions,
} from './roles'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
})

// ---------------------------------------------------------------------------
// isRoleEndpointUnavailable
// ---------------------------------------------------------------------------
describe('isRoleEndpointUnavailable', () => {
  it('returns true for code 404', () => {
    expect(isRoleEndpointUnavailable({ code: 404, msg: 'not found' })).toBe(true)
  })

  it('returns true for code 405', () => {
    expect(isRoleEndpointUnavailable({ code: 405, msg: 'method not allowed' })).toBe(true)
  })

  it('returns true for code 501', () => {
    expect(isRoleEndpointUnavailable({ code: 501, msg: 'not implemented' })).toBe(true)
  })

  it('returns true for Error with "not found" message', () => {
    expect(isRoleEndpointUnavailable(new Error('endpoint not found'))).toBe(true)
  })

  it('returns true for Error with "method not allowed" message', () => {
    expect(isRoleEndpointUnavailable(new Error('method not allowed for this endpoint'))).toBe(true)
  })

  it('returns false for code 500', () => {
    expect(isRoleEndpointUnavailable({ code: 500, msg: 'internal server error' })).toBe(false)
  })

  it('returns false for network error', () => {
    expect(isRoleEndpointUnavailable(new Error('network timeout'))).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isRoleEndpointUnavailable(null)).toBe(false)
    expect(isRoleEndpointUnavailable(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getRoleListPayload
// ---------------------------------------------------------------------------
describe('getRoleListPayload', () => {
  it('returns normalized role list from primary endpoint', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          items: [
            { id: 1, name: '超级管理员', description: '全权限', permissions: ['admin:all'], status: 1, created_at: '2026-01-01' },
            { id: 2, name: '运营', description: '运营权限', permissions: ['users:read', 'groups:read'], status: 1, created_at: '2026-01-01' },
          ],
          page: 1, size: 50, total: 2, total_pages: 1,
        },
      },
    })

    const result = await getRoleListPayload()
    expect(result.source).toBe('list')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].id).toBe(1)
    expect(result.items[0].name).toBe('超级管理员')
    expect(result.items[0].permissions).toEqual(['admin:all'])
    expect(result.total).toBe(2)
  })

  it('normalizes alternative field names (role_id, role_name, permission_keys)', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          list: [
            {
              role_id: 3,
              role_name: '编辑',
              desc: '内容编辑',
              permission_keys: ['content:write'],
              state: 1,
              create_time: '2026-02-01',
            },
          ],
          page: 1, size: 50, total: 1, total_pages: 1,
        },
      },
    })

    const result = await getRoleListPayload()
    expect(result.items[0].id).toBe(3)
    expect(result.items[0].name).toBe('编辑')
    expect(result.items[0].description).toBe('内容编辑')
    expect(result.items[0].permissions).toEqual(['content:write'])
  })

  it('handles array payload format', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: [
          { id: 1, name: '管理员', description: '', permissions: [], status: 1, created_at: '' },
        ],
      },
    })

    const result = await getRoleListPayload()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('管理员')
  })

  it('filters out items with id=0 or empty name', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          items: [
            { id: 0, name: '无效', permissions: [], status: 1 },  // id=0 filtered
            { id: 2, name: '', permissions: [], status: 1 },       // empty name filtered
            { id: 3, name: '有效', permissions: [], status: 1 },   // valid
          ],
          page: 1, size: 50, total: 3, total_pages: 1,
        },
      },
    })

    const result = await getRoleListPayload()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe(3)
  })

  it('falls back to sidebar config when all list endpoints return 404', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/role/list' || url === '/roles/list') {
        throw { code: 404, msg: 'not found' }
      }
      // Sidebar config request
      if (url.includes('sidebar')) {
        throw new Error('not a config endpoint')
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    // Mock fetch for sidebar config
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input).replace(/\?t=\d+$/, '')
      if (url === '/api/adm/admin/config/sidebar') {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          payload: {
            items: [],
            rbac: {
              roles: [
                { id: 1, name: '超级管理员', description: '全权限', permissions: ['admin:all'] },
              ],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('Not Found', { status: 404 })
    }

    try {
      const result = await getRoleListPayload()
      expect(result.source).toBe('config')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].name).toBe('超级管理员')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

// ---------------------------------------------------------------------------
// createRole
// ---------------------------------------------------------------------------
describe('createRole', () => {
  it('posts name, permissions, status to primary endpoint', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createRole({ name: '运营', permissions: ['users:read'], status: 1 })
    expect(capturedUrl).toBe('/role/create')
    expect(capturedBody.name).toBe('运营')
    expect(capturedBody.permissions).toEqual(['users:read'])
    expect(capturedBody.status).toBe(1)
  })

  it('omits empty description from body', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createRole({ name: '编辑' })
    expect(capturedBody.description).toBeUndefined()
    expect(capturedBody.status).toBe(1) // default
  })

  it('includes non-empty description', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createRole({ name: '审核员', description: '内容审核专员' })
    expect(capturedBody.description).toBe('内容审核专员')
  })

  it('falls back to secondary endpoint when primary returns 404', async () => {
    const calledUrls: string[] = []
    mutableClient.post = async (url: string) => {
      calledUrls.push(url)
      if (url === '/role/create') throw { code: 404, msg: 'not found' }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createRole({ name: '测试角色' })
    expect(calledUrls).toContain('/role/create')
    expect(calledUrls).toContain('/roles/create')
  })
})

// ---------------------------------------------------------------------------
// updateRolePermissions
// ---------------------------------------------------------------------------
describe('updateRolePermissions', () => {
  it('sends PUT with role_id and permissions', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> = {}
    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await updateRolePermissions(1, ['users:read', 'users:write'])
    expect(capturedUrl).toBe('/role/permissions/save')
    expect(capturedBody.role_id).toBe(1)
    expect(capturedBody.permissions).toEqual(['users:read', 'users:write'])
  })

  it('falls back to POST when PUT returns 404', async () => {
    const calls: Array<{ method: string; url: string }> = []
    mutableClient.put = async (url: string) => {
      calls.push({ method: 'PUT', url })
      throw { code: 404, msg: 'not found' }
    }
    mutableClient.post = async (url: string) => {
      calls.push({ method: 'POST', url })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await updateRolePermissions(2, ['groups:read'])
    expect(calls.some((c) => c.method === 'PUT')).toBe(true)
    expect(calls.some((c) => c.method === 'POST')).toBe(true)
  })

  it('deduplicates and trims permissions array', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.put = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await updateRolePermissions(1, ['  users:read  ', 'users:write', '', 'users:read'])
    const perms = capturedBody.permissions as string[]
    // Empty strings filtered, whitespace trimmed
    expect(perms).not.toContain('')
    expect(perms).toContain('users:read')
    expect(perms).toContain('users:write')
  })
})
