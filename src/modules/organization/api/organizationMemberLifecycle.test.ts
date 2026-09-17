/**
 * 成员生命周期命令 API 单测（ORG-ADMIN-WIRING）。
 *
 * 契约真源：后端 imboy_router.erl（EB-D07/EB-08 注册段）+ organization_member_handler.erl：
 *   * POST /api/v1/organizations/:organization_id/members/:user_id/suspend
 *   * POST /api/v1/organizations/:organization_id/members/:user_id/restore
 *   * POST /api/v1/organizations/:organization_id/members/:user_id/offboard
 * 三者均无业务请求体（路径绑定即参数）；响应信封 {code,msg,payload}，
 * payload 为 member_result：suspend/restore 含 role，offboard（removed 终态）无 role。
 * 离场单一入口：不再调用 legacy DELETE .../members/:uid（本套件同时验证旧方法已移除）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  offboardOrganizationMember,
  restoreOrganizationMember,
  suspendOrganizationMember,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { post: AnyFn }
type PostCapture = { url: string; body: unknown; config?: { baseURL?: string } }

const mutableClient = client as unknown as MutableClient
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.post = originalPost
})

function stubPost(captures: PostCapture[], payload: unknown): void {
  mutableClient.post = async (url: string, body: unknown, config?: { baseURL?: string }) => {
    captures.push({ url, body, config })
    return { data: { code: 0, msg: 'success', payload } }
  }
}

const ORG = '7700487111111111111'
const USER = '7700487222222222222'

describe('suspendOrganizationMember', () => {
  it('POST suspend 路径正确、baseURL 指向 /api/v1、空请求体，响应投影含 role', async () => {
    const captures: PostCapture[] = []
    stubPost(captures, { organization_id: ORG, user_id: USER, role: 'member', status: 'suspended' })

    const result = await suspendOrganizationMember(ORG, USER)

    expect(result.status).toBe('suspended')
    expect(result.role).toBe('member')
    expect(result.userId).toBe(USER)
    expect(captures).toHaveLength(1)
    expect(captures[0]?.url).toBe(`/organizations/${ORG}/members/${USER}/suspend`)
    expect(captures[0]?.config?.baseURL).toContain('/api/v1')
    expect(captures[0]?.body).toEqual({})
  })
})

describe('restoreOrganizationMember', () => {
  it('POST restore 路径正确，响应投影 status=active', async () => {
    const captures: PostCapture[] = []
    stubPost(captures, { organization_id: ORG, user_id: USER, role: 'admin', status: 'active' })

    const result = await restoreOrganizationMember(ORG, USER)

    expect(result.status).toBe('active')
    expect(result.role).toBe('admin')
    expect(captures[0]?.url).toBe(`/organizations/${ORG}/members/${USER}/restore`)
    expect(captures[0]?.body).toEqual({})
  })
})

describe('offboardOrganizationMember', () => {
  it('POST offboard 路径正确，removed 终态无 role → 投影为 null', async () => {
    const captures: PostCapture[] = []
    stubPost(captures, { organization_id: ORG, user_id: USER, status: 'removed' })

    const result = await offboardOrganizationMember(ORG, USER)

    expect(result.status).toBe('removed')
    expect(result.role).toBeNull()
    expect(captures[0]?.url).toBe(`/organizations/${ORG}/members/${USER}/offboard`)
    expect(captures[0]?.body).toEqual({})
  })

  it('响应缺 payload 时抛错（契约回归检出，不静默成功）', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'success' } })
    await expect(offboardOrganizationMember(ORG, USER)).rejects.toThrow('Missing payload')
  })
})

describe('参数校验与离场单一入口', () => {
  it('空 ID 直接抛错，不发请求', async () => {
    const captures: PostCapture[] = []
    stubPost(captures, {})
    await expect(suspendOrganizationMember('', USER)).rejects.toThrow('organization_id')
    await expect(restoreOrganizationMember(ORG, '  ')).rejects.toThrow('user_id')
    await expect(offboardOrganizationMember(ORG, '')).rejects.toThrow('user_id')
    expect(captures).toHaveLength(0)
  })

  it('TSID 以 string 形态进入 URL（不发生 64-bit 精度丢失）', async () => {
    const captures: PostCapture[] = []
    const bigTsid = '9007199254740993' // 2^53+1，超出 JS Number 安全整数
    stubPost(captures, { organization_id: bigTsid, user_id: bigTsid, status: 'removed' })
    await offboardOrganizationMember(bigTsid, bigTsid)
    expect(captures[0]?.url).toBe(`/organizations/${bigTsid}/members/${bigTsid}/offboard`)
  })

  it('public 模块已无 removeOrganizationMember 导出（离场单一入口：offboard 取代 legacy DELETE）', async () => {
    const mod = (await import('./public')) as Record<string, unknown>
    expect(mod['removeOrganizationMember']).toBeUndefined()
    expect(typeof mod['offboardOrganizationMember']).toBe('function')
    expect(typeof mod['suspendOrganizationMember']).toBe('function')
    expect(typeof mod['restoreOrganizationMember']).toBe('function')
  })
})
