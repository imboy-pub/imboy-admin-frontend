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
    expect(result.items[0].role_id).toBe('1')
    expect(result.page).toBe(1)
    expect(result.total).toBe(1)
  })

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('does not retry another endpoint when list fails', async () => {
    const calledUrls: string[] = []
    mutableClient.get = async (url: string) => {
      calledUrls.push(url)
      throw { code: 404, msg: 'not found' }
    }

    await expect(getAdminListPayload()).rejects.toMatchObject({ code: 404 })
    expect(calledUrls).toEqual(['/admin/list'])
  })

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('does not degrade to a current-admin singleton list', async () => {
    // 静默展示一条残缺数据会让管理员误以为系统里只有自己
    mutableClient.get = async () => {
      throw { code: 404, msg: 'not found' }
    }

    await expect(getAdminListPayload()).rejects.toMatchObject({ code: 404 })
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
    expect(admin.role_id).toBe('2')
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

  // 反转：探测/回退机制已移除。误判会重放写请求，而判据在结构上不可能正确
  // （client.ts 把业务错误码与 HTTP 状态压平成同一个 {code,msg}）。
  // 现在锁定单一端点，错误如实抛出，且**不得**发出第二个请求。
  it('does not retry another endpoint when create fails', async () => {
    const calledUrls: string[] = []
    mutableClient.post = async (url: string) => {
      calledUrls.push(url)
      throw { code: 404, msg: 'not found' }
    }

    await expect(createAdmin({ account: 'a', pwd: 'p', role_id: 2 })).rejects.toMatchObject({ code: 404 })
    expect(calledUrls).toEqual(['/admin/create'])
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

    await expect(assignAdminRole('1', 2)).rejects.toMatchObject({ code: 404 })
    expect(putUrls).toEqual(['/admin/assign_role'])
    expect(postUrls).toEqual([])
  })
})
