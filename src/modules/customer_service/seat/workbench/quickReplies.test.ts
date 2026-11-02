/**
 * V3-27 快捷回复 Seat 域合同纯函数测试。
 *
 * 合同：v3/specs/cs-quick-reply.md §3/§7/§8——路径落 /cs/organizations/:org/
 * quick-replies（SeatApiClient 域门放行前缀）；白名单投影 id/title/content/
 * sort；sort ASC/title ASC 幂等重排；标题包含匹配过滤；插入语义（空草稿
 * 填入 / 非空换行追加）。
 */
import { describe, expect, it } from 'bun:test'
import {
  buildSeatQuickRepliesPath,
  filterSeatQuickReplies,
  insertQuickReplyContent,
  toSeatQuickReplyList,
} from './quickReplies'
import { SeatApiClient } from '../seatApiClient'
import { SeatWorkbenchApi } from './workbenchApi'

const ORG = '1234567890123456789'
const WS = '9876543210987654321'

function wireRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '999999999999999999',
    tenant_id: Number(ORG),
    workspace_id: Number(WS),
    title: '问候语',
    content: '您好，很高兴为您服务。',
    sort: 0,
    created_by: '555555555555555555',
    ...overrides,
  }
}

describe('buildSeatQuickRepliesPath（合同 §3.1）', () => {
  it('落 /cs/organizations/:org/quick-replies（域门放行前缀）', () => {
    expect(buildSeatQuickRepliesPath(ORG)).toBe(`/cs/organizations/${ORG}/quick-replies`)
  })
  it('org id URL 编码（防路径注入）', () => {
    expect(buildSeatQuickRepliesPath('a/b c')).toBe('/cs/organizations/a%2Fb%20c/quick-replies')
  })
})

describe('toSeatQuickReplyList（合同 §7 白名单投影）', () => {
  it('合法行投影只保留 id/title/content/sort，TSID 收敛 string', () => {
    const list = toSeatQuickReplyList({ list: [wireRow()] })
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ id: '999999999999999999', title: '问候语', content: '您好，很高兴为您服务。', sort: 0 })
    expect(Object.keys(list[0] as object).sort()).toEqual(['content', 'id', 'sort', 'title'])
  })
  it('缺必需键的行跳过；payload 形状非法 → 空列表 fail-closed', () => {
    expect(toSeatQuickReplyList({ list: [wireRow({ title: '' }), wireRow({ content: null }), {}, 'x'] })).toEqual([])
    expect(toSeatQuickReplyList(null)).toEqual([])
    expect(toSeatQuickReplyList({ list: 'nope' })).toEqual([])
    expect(toSeatQuickReplyList([wireRow()])).toEqual([])
  })
  it('sort ASC、title ASC 幂等重排（抗合同漂移）', () => {
    const list = toSeatQuickReplyList({
      list: [
        wireRow({ id: '1', title: 'b', sort: 1 }),
        wireRow({ id: '2', title: 'a', sort: 1 }),
        wireRow({ id: '3', title: 'z', sort: 0 }),
        wireRow({ id: '4', title: 'c', sort: 1 }),
      ],
    })
    expect(list.map((row) => row.id)).toEqual(['3', '2', '1', '4'])
  })
})

describe('filterSeatQuickReplies（标题包含匹配，case-insensitive）', () => {
  const rows = [
    { id: '1', title: '问候语', content: '您好', sort: 0 },
    { id: '2', title: 'Shipping FAQ', content: 'Where is my order', sort: 1 },
  ]
  it('空搜索原样返回（同引用）', () => {
    expect(filterSeatQuickReplies(rows, '   ')).toBe(rows)
  })
  it('中文/英文大小写包含匹配', () => {
    expect(filterSeatQuickReplies(rows, '问候').map((row) => row.id)).toEqual(['1'])
    expect(filterSeatQuickReplies(rows, 'shipping').map((row) => row.id)).toEqual(['2'])
    expect(filterSeatQuickReplies(rows, 'FAQ').map((row) => row.id)).toEqual(['2'])
    expect(filterSeatQuickReplies(rows, '不存在')).toEqual([])
  })
})

describe('insertQuickReplyContent（合同 §8 插入语义）', () => {
  it('空/纯空白草稿 → 直接填入', () => {
    expect(insertQuickReplyContent('', '您好')).toBe('您好')
    expect(insertQuickReplyContent('  \n ', '您好')).toBe('您好')
  })
  it('非空草稿 → 去尾部空白后换行追加', () => {
    expect(insertQuickReplyContent('请问', '您好')).toBe('请问\n您好')
    expect(insertQuickReplyContent('请问 \n', '您好')).toBe('请问\n您好')
  })
  it('空内容不改变草稿（防空白行注入）', () => {
    expect(insertQuickReplyContent('请问', '  ')).toBe('请问')
  })
})

describe('SeatWorkbenchApi.fetchQuickReplies（经 SeatApiClient 域门）', () => {
  it('完整 URL = /api/v1/seat/cs/organizations/:org/quick-replies?workspace_id=（Bearer 头）', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      seen.push({ url: input, init })
      return new Response(
        JSON.stringify({ code: 0, msg: 'success', payload: { list: [wireRow()] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    const api = new SeatWorkbenchApi({
      client: new SeatApiClient({ getToken: () => 'seat-jwt', fetchImpl }),
    })
    const list = await api.fetchQuickReplies(ORG, WS)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe(`/api/v1/seat/cs/organizations/${ORG}/quick-replies?workspace_id=${WS}`)
    expect((seen[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer seat-jwt')
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('999999999999999999')
  })

  it('403（越权 workspace）→ SeatApiError forbidden，不吞错', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ code: 403, msg: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch
    const api = new SeatWorkbenchApi({
      client: new SeatApiClient({ fetchImpl }),
    })
    expect(api.fetchQuickReplies(ORG, WS)).rejects.toMatchObject({ kind: 'forbidden' })
  })
})
