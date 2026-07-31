/**
 * Unit tests for identity/api/roles:
 *   getRoleListPayload — 正常路径；端点探测/回退已移除
 *   createRole — body normalization
 *   updateRolePermissions — PUT（后端 PUT/POST 同一 handler，无需协商）
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
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

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('propagates the error instead of deriving roles from sidebar config', async () => {
    const calledUrls: string[] = []
    mutableClient.get = async (url: string) => {
      calledUrls.push(url)
      throw { code: 404, msg: 'not found' }
    }

    await expect(getRoleListPayload()).rejects.toMatchObject({ code: 404 })
    expect(calledUrls).toEqual(['/role/list'])
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

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('does not retry another endpoint when create fails', async () => {
    const calledUrls: string[] = []
    mutableClient.post = async (url: string) => {
      calledUrls.push(url)
      throw { code: 404, msg: 'not found' }
    }

    await expect(createRole({ name: '测试角色' })).rejects.toMatchObject({ code: 404 })
    expect(calledUrls).toEqual(['/role/create'])
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

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('does not fall back to POST when PUT fails', async () => {
    const putUrls: string[] = []
    const postUrls: string[] = []
    mutableClient.put = async (url: string) => {
      putUrls.push(url)
      throw { code: 404, msg: 'not found' }
    }
    mutableClient.post = async (url: string) => {
      postUrls.push(url)
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await expect(updateRolePermissions(1, ['a'])).rejects.toMatchObject({ code: 404 })
    expect(putUrls).toEqual(['/role/permissions/save'])
    expect(postUrls).toEqual([])
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
