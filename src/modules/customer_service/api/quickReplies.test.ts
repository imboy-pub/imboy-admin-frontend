/**
 * V3-27 快捷回复管理面单元测试（API client 合同 + 纯函数投影）。
 *
 * 合同真源：.task-state/imboy-garage-direct-v1/v3/specs/cs-quick-reply.md
 * 覆盖：
 * - 路径只落 /customer-service/quick-replies*（/api/adm 前缀由 client baseURL 承担）；
 * - 分页参数（page/size 默认 10）与 search 透传；空 search 不发送；
 * - TSID 线缆 integer → string（safeParseBigIntJson 口径，绝不 Number 回转）；
 * - 行投影 fail-closed（缺必需键丢行）与分页元数据归一；
 * - 表单校验长度门（64/2000）与 sort 整数门。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
  QUICK_REPLY_DEFAULT_PAGE_SIZE,
} from './quickReplies'
import {
  hasQuickReplyFormErrors,
  toQuickReply,
  toQuickReplyPage,
  validateQuickReplyInput,
} from './quickRepliesPure'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
  mutableClient.delete = originalDelete
})

function wireRow(overrides: Record<string, unknown> = {}) {
  // TSID 线缆形态 = JSON integer（大整数由 safeParseBigIntJson 收敛为 string，
  // 此处按收敛后形态喂投影——整数进 string 出的口径在投影层断言）。
  return {
    id: '999999999999999999',
    tenant_id: '1234567890123456789',
    workspace_id: '9876543210987654321',
    title: '问候语',
    content: '您好，很高兴为您服务。',
    sort: 0,
    created_by: '555555555555555555',
    created_at: 1789900000,
    updated_at: 1789900000,
    ...overrides,
  }
}

describe('快捷回复 API 路径与参数（合同 §2）', () => {
  it('GET 列表：路径、显式租户条件、分页默认 page=1/size=10', async () => {
    const calls: Array<{ url: string; params: Record<string, unknown> }> = []
    mutableClient.get = (url: unknown, config: unknown) => {
      calls.push({ url: String(url), params: ((config as { params?: Record<string, unknown> })?.params) ?? {} })
      return { data: { code: 0, msg: 'success', payload: { list: [wireRow()], page: 1, size: 10, total: 1, total_page: 1 } } }
    }
    const page = await listQuickReplies({ organizationId: '1234567890123456789', workspaceId: '9876543210987654321' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/customer-service/quick-replies')
    expect(calls[0]?.params.organization_id).toBe('1234567890123456789')
    expect(calls[0]?.params.workspace_id).toBe('9876543210987654321')
    expect(calls[0]?.params.page).toBe(1)
    expect(calls[0]?.params.size).toBe(QUICK_REPLY_DEFAULT_PAGE_SIZE)
    expect(calls[0]?.params.size).toBe(10)
    expect('search' in (calls[0]?.params ?? {})).toBe(false)
    // 投影：TSID string、列表元数据
    expect(page.total).toBe(1)
    expect(page.list[0]?.id).toBe('999999999999999999')
    expect(typeof page.list[0]?.id).toBe('string')
  })

  it('GET 列表：显式分页与 search 透传', async () => {
    const calls: Array<{ params: Record<string, unknown> }> = []
    mutableClient.get = ((_url: unknown, config: unknown) => {
      calls.push({ params: ((config as { params?: Record<string, unknown> })?.params) ?? {} })
      return { data: { code: 0, msg: 'success', payload: { list: [], page: 3, size: 20, total: 41, total_page: 3 } } }
    }) as typeof mutableClient.get
    await listQuickReplies({
      organizationId: '1234567890123456789',
      workspaceId: '9876543210987654321',
      page: 3,
      size: 20,
      search: ' 问候 ',
    })
    expect(calls[0]?.params.page).toBe(3)
    expect(calls[0]?.params.size).toBe(20)
    expect(calls[0]?.params.search).toBe('问候')
  })

  it('POST/PUT/DELETE：路径形态与 body 白名单（id 绝不进 body）', async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = []
    mutableClient.post = (url: unknown, body: unknown) => {
      calls.push({ method: 'POST', url: String(url), body })
      return { data: { code: 0, msg: 'success', payload: { quick_reply: wireRow() } } }
    }
    mutableClient.put = (url: unknown, body: unknown) => {
      calls.push({ method: 'PUT', url: String(url), body })
      return { data: { code: 0, msg: 'success', payload: { quick_reply: wireRow({ title: '改' }) } } }
    }
    mutableClient.delete = (url: unknown, config: unknown) => {
      calls.push({ method: 'DELETE', url: String(url), body: (config as { data?: unknown })?.data })
      return { data: { code: 0, msg: 'success', payload: { ok: true } } }
    }
    const scope = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }
    await createQuickReply({ ...scope, title: '问候语', content: '您好', sort: 0 })
    await updateQuickReply('999999999999999999', { ...scope, title: '改', content: '您好2', sort: 2 })
    await deleteQuickReply({ ...scope, quickReplyId: '999999999999999999' })

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /customer-service/quick-replies',
      'PUT /customer-service/quick-replies/999999999999999999',
      'DELETE /customer-service/quick-replies/999999999999999999',
    ])
    for (const call of calls) {
      expect(String(call.url).includes('/api/v1')).toBe(false)
      expect(String(call.url).includes('/api/admin/v1')).toBe(false)
    }
    const bodies = calls.map((call) => call.body as Record<string, unknown>)
    for (const body of bodies) {
      expect('id' in body).toBe(false)
      expect('quick_reply_id' in body).toBe(false)
      expect(body.organization_id).toBe('1234567890123456789')
      expect(body.workspace_id).toBe('9876543210987654321')
    }
    expect(Object.keys(bodies[0] as object).sort()).toEqual(['content', 'organization_id', 'sort', 'title', 'workspace_id'])
    // 创建/更新响应形状非法 → fail-closed 抛错
    mutableClient.post = ((_url: unknown, _body: unknown) => ({
      data: { code: 0, msg: 'success', payload: {} },
    })) as typeof mutableClient.post
    expect(createQuickReply({ ...scope, title: 'x', content: 'y', sort: 0 })).rejects.toThrow('创建快捷回复响应形状非法')
  })

  it('缺租户条件 → 请求前抛错（不发请求）', async () => {
    let called = false
    mutableClient.get = ((_url: unknown) => {
      called = true
      return { data: { code: 0, msg: 'success', payload: { list: [] } } }
    }) as typeof mutableClient.get
    await expect(
      listQuickReplies({ organizationId: '', workspaceId: '9876543210987654321' })
    ).rejects.toThrow('缺少必填 ID：organization_id')
    expect(called).toBe(false)
  })
})

describe('快捷回复投影与校验纯函数（合同 §1/§7）', () => {
  it('toQuickReply：缺必需键整行丢弃；created_at 数字规范化为 string', () => {
    const row = toQuickReply(wireRow())
    expect(row).not.toBeNull()
    expect(row?.created_at).toBe('1789900000')
    expect(typeof row?.created_at).toBe('string')
    expect(toQuickReply({ ...wireRow(), id: '' })).toBeNull()
    expect(toQuickReply({ ...wireRow(), workspace_id: undefined })).toBeNull()
    expect(toQuickReply({ ...wireRow(), title: '' })).toBeNull()
    expect(toQuickReply({ ...wireRow(), content: null })).toBeNull()
    expect(toQuickReply(null)).toBeNull()
  })

  it('toQuickReplyPage：非法行丢弃、分页元数据缺省归一', () => {
    const page = toQuickReplyPage({
      list: [wireRow(), { id: '1', title: '缺内容' }, 'not-a-row'],
      total: 25,
    })
    expect(page.list).toHaveLength(1)
    expect(page.total).toBe(25)
    expect(page.total_page).toBe(3)
    expect(toQuickReplyPage(null).list).toEqual([])
    expect(toQuickReplyPage({ list: [] }).size).toBe(10)
  })

  it('validateQuickReplyInput：长度门 64/2000 + sort 整数门', () => {
    expect(hasQuickReplyFormErrors(validateQuickReplyInput({ title: '问候', content: '您好', sort: 0 }))).toBe(false)
    expect(hasQuickReplyFormErrors(validateQuickReplyInput({ title: '  ', content: '您好', sort: 0 }))).toBe(true)
    expect(
      validateQuickReplyInput({ title: 'a'.repeat(65), content: '您好', sort: 0 }).title
    ).toContain('64')
    expect(
      validateQuickReplyInput({ title: 'a', content: 'b'.repeat(2001), sort: 0 }).content
    ).toContain('2000')
    expect(validateQuickReplyInput({ title: 'a', content: 'b', sort: Number.NaN }).sort).not.toBeNull()
    expect(
      hasQuickReplyFormErrors(validateQuickReplyInput({ title: 'a'.repeat(64), content: 'b'.repeat(2000), sort: -5 }))
    ).toBe(false)
  })
})
