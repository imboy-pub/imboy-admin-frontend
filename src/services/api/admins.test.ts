import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  getAdminListPayload,
  createAdmin,
  assignAdminRole,
  type CreateAdminInput,
} from './admins'

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

const rawAdminFixture = {
  id: '10001',
  account: 'admin',
  nickname: '超级管理员',
  avatar: '',
  role_id: 1,
  status: 1,
  login_count: 5,
  last_login_ip: '127.0.0.1',
  last_login_at: '2026-04-01 10:00:00',
  created_at: '2026-01-01 00:00:00',
}

// ---------------------------------------------------------------------------
// getAdminListPayload
// ---------------------------------------------------------------------------
describe('getAdminListPayload', () => {
  it('returns paginated admin list from primary endpoint /admin/list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/admin/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [rawAdminFixture],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getAdminListPayload()
    expect(result.source).toBe('list')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].account).toBe('admin')
    expect(result.items[0].role_id).toBe(1)
    expect(result.page).toBe(1)
    expect(result.total).toBe(1)
  })

  it('falls back to secondary endpoint /admins/list when primary returns 404', async () => {
    let callCount = 0
    mutableClient.get = async (url: string) => {
      callCount++
      if (url === '/admin/list') throw { code: 404, msg: 'not found' }
      if (url === '/admins/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: { items: [rawAdminFixture], page: 1, size: 10, total: 1, total_pages: 1 },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    const result = await getAdminListPayload()
    expect(result.source).toBe('list')
    expect(callCount).toBe(2)
    expect(result.items[0].account).toBe('admin')
  })

  it('falls back to current admin singleton when all list endpoints unavailable', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/list' || url === '/admins/list') {
        throw { code: 404, msg: 'not found' }
      }
      if (url === '/current') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: rawAdminFixture,
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    const result = await getAdminListPayload()
    expect(result.source).toBe('current')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].account).toBe('admin')
    expect(result.total).toBe(1)
  })

  it('normalizes admin fields from alternative key names', async () => {
    const altFieldsFixture = {
      admin_id: '20002',     // alternative to id
      username: 'ops_user', // alternative to account
      name: 'Ops User',     // alternative to nickname
      role: 2,              // alternative to role_id
      state: 1,             // alternative to status
      sign_in_count: 3,     // alternative to login_count
      last_ip: '10.0.0.1',  // alternative to last_login_ip
      last_sign_in_at: '2026-03-01 08:00:00',
      create_time: '2026-01-15 00:00:00',
      avatar: 'https://cdn.example.com/avatar.png',
    }

    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { items: [altFieldsFixture], page: 1, size: 10, total: 1, total_pages: 1 },
      },
    })

    const result = await getAdminListPayload()
    const admin = result.items[0]
    expect(admin.id).toBe('20002')
    expect(admin.account).toBe('ops_user')
    expect(admin.nickname).toBe('Ops User')
    expect(admin.role_id).toBe(2)
    expect(admin.login_count).toBe(3)
    expect(admin.last_login_ip).toBe('10.0.0.1')
  })

  it('handles array payload format (no wrapper object)', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: [rawAdminFixture],
      },
    })

    const result = await getAdminListPayload()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].account).toBe('admin')
    expect(result.total).toBe(1)
  })

  it('forwards query params to the list endpoint', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { items: [], page: 2, size: 5, total: 0, total_pages: 0 },
        },
      }
    }

    await getAdminListPayload({ page: 2, size: 5, role_id: 1, keyword: 'alice' })
    expect(capturedParams.page).toBe(2)
    expect(capturedParams.size).toBe(5)
    expect(capturedParams.role_id).toBe(1)
    expect(capturedParams.keyword).toBe('alice')
  })
})

// ---------------------------------------------------------------------------
// createAdmin
// ---------------------------------------------------------------------------
describe('createAdmin', () => {
  it('sends required fields and omits empty optional fields', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const input: CreateAdminInput = {
      account: 'newadmin',
      pwd: 'P@ssw0rd',
      role_id: 2,
    }

    await createAdmin(input)
    expect(capturedBody.account).toBe('newadmin')
    expect(capturedBody.pwd).toBe('P@ssw0rd')
    expect(capturedBody.role_id).toBe(2)
    expect(capturedBody.status).toBe(1) // default status
    // Empty optional fields should NOT appear in body
    expect(capturedBody.nickname).toBeUndefined()
    expect(capturedBody.email).toBeUndefined()
    expect(capturedBody.mobile).toBeUndefined()
  })

  it('includes optional fields when provided and non-empty', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const input: CreateAdminInput = {
      account: 'editor',
      pwd: 'Secure1!',
      role_id: 3,
      nickname: '编辑员',
      email: 'editor@example.com',
      mobile: '13800138000',
    }

    await createAdmin(input)
    expect(capturedBody.nickname).toBe('编辑员')
    expect(capturedBody.email).toBe('editor@example.com')
    expect(capturedBody.mobile).toBe('13800138000')
  })

  it('trims whitespace from account and pwd', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createAdmin({ account: '  admin  ', pwd: '  secret  ', role_id: 1 })
    expect(capturedBody.account).toBe('admin')
    expect(capturedBody.pwd).toBe('secret')
  })

  it('falls back to secondary endpoint when primary returns 404', async () => {
    const calledUrls: string[] = []

    mutableClient.post = async (url: string) => {
      calledUrls.push(url)
      if (url === '/admin/create') throw { code: 404, msg: 'not found' }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await createAdmin({ account: 'test', pwd: 'pass', role_id: 1 })
    expect(calledUrls).toContain('/admin/create')
    expect(calledUrls).toContain('/admins/create')
  })
})

// ---------------------------------------------------------------------------
// assignAdminRole
// ---------------------------------------------------------------------------
describe('assignAdminRole', () => {
  it('sends PUT to primary endpoint with admin_id and role_id', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> = {}

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await assignAdminRole({ admin_id: '10001', role_id: 2 })
    expect(capturedUrl).toBe('/admin/assign_role')
    expect(capturedBody.admin_id).toBe('10001')
    expect(capturedBody.role_id).toBe(2)
  })

  it('falls back to POST on same endpoint when PUT returns 404', async () => {
    const calls: Array<{ method: string; url: string }> = []

    mutableClient.put = async (url: string) => {
      calls.push({ method: 'PUT', url })
      throw { code: 404, msg: 'method not allowed' }
    }
    mutableClient.post = async (url: string) => {
      calls.push({ method: 'POST', url })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await assignAdminRole({ admin_id: '10001', role_id: 3 })

    expect(calls.some((c) => c.method === 'PUT')).toBe(true)
    expect(calls.some((c) => c.method === 'POST')).toBe(true)
    // Both calls to the same endpoint
    const urls = [...new Set(calls.map((c) => c.url))]
    expect(urls).toHaveLength(1)
  })
})
