/**
 * SEAT-02：SeatWorkbenchApi 单测（线格式合同 fixture，SEAT-01 同款测试替身）。
 *
 * 覆盖：
 * - 队列/两视图键集分页查询串（after_id/limit/workspace_id）与响应投影；
 * - claim/transfer/close：CAS 请求体（expected_version）+ 409 → conflict 分类；
 * - 消息历史裸数组载荷 + 发送 client_msg_id 幂等请求体；
 * - TSID 大整数精度保护（原始 JSON 文本经 parseSeatJson）；
 * - 域隔离不变量（/api/adm 仍被拒，A01 不因 enterprise 前缀增补而松动）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatApiClient } from '../seatApiClient'
import { isSeatApiError } from '../errors'
import { seatTokenVault } from '../seatAuthStore'

const ORG = '2000000000000000002'
const SESSION = '72057594037927937'
const CONV = '5000000000000000005'
const TARGET = '6000000000000000006'

type RecordedCall = { url: string; init: RequestInit | undefined }

function envelope(payloadText: string, status = 200): Response {
  return new Response(`{"code":0,"msg":"success","payload":${payloadText}}`, {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFetch(responder: (_url: string, _init: RequestInit | undefined) => Response): {
  calls: RecordedCall[]
  api: SeatWorkbenchApi
  api2: SeatWorkbenchApi
} {
  const calls: RecordedCall[] = []
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    return responder(url, init)
  }
  const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
  const api = new SeatWorkbenchApi({ client })
  // 第二个「坐席」实例：共享同一假后端，模拟并发竞争（A01）。
  const api2 = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() }) })
  return { calls, api, api2 }
}

const PAGE_TEXT = `{"sessions":[{"id":${SESSION},"organization_id":"${ORG}","workspace_id":"3000000000000000003","contact_id":"4000000000000000004","conversation_id":"${CONV}","business_identity_id":"6000000000000000006","status":"queued","version":7,"queued_at":"2026-09-20T05:14:47Z","claimed_at":null,"closed_at":null,"source":"widget","contact":{"masked_name":"李***"},"last_message":{"id":null,"preview":null,"at":null}}],"total":1,"total_by_status":{"queued":1,"active":0,"closed":0},"next_after_id":null}`

afterEach(() => {
  seatTokenVault.clear()
})

describe('列表合同（queue / active / closed）', () => {
  it('队列 GET：路径与查询串（after_id/limit/workspace_id）+ 页投影', async () => {
    const { calls, api } = makeFetch((url) => {
      expect(url.startsWith(`/api/v1/cs/organizations/${ORG}/sessions/queue?`)).toBe(true)
      return envelope(PAGE_TEXT)
    })
    const page = await api.fetchQueue(ORG, { afterId: '100', limit: 20, workspaceId: '3000000000000000003' })
    const url = calls[0]?.url ?? ''
    expect(url).toContain('after_id=100')
    expect(url).toContain('limit=20')
    expect(url).toContain('workspace_id=3000000000000000003')
    expect(page.sessions).toHaveLength(1)
    expect(page.sessions[0]?.version).toBe(7)
    expect(page.counts).toEqual({ queued: 1, active: 0, closed: 0 })
  })

  it('active/closed 两视图：status 必填进查询串', async () => {
    const { calls, api } = makeFetch(() => envelope('{"sessions":[],"total":0,"total_by_status":{"queued":0,"active":0,"closed":0},"next_after_id":null}'))
    await api.fetchSessions(ORG, 'active')
    await api.fetchSessions(ORG, 'closed', { afterId: '55' })
    expect(calls[0]?.url).toContain('/seats/sessions?status=active')
    expect(calls[1]?.url).toContain('status=closed&after_id=55')
  })

  it('TSID 大整数精度保护：响应文本里的超安全整数到达时已是 string', async () => {
    const { api } = makeFetch(() =>
      envelope(`{"sessions":[{"id":9223372036854775807,"organization_id":"${ORG}","status":"queued","version":1}],"total":1,"total_by_status":{"queued":1,"active":0,"closed":0},"next_after_id":null}`),
    )
    const page = await api.fetchQueue(ORG)
    expect(page.sessions[0]?.id).toBe('9223372036854775807')
  })
})

describe('CAS 写合同（claim / transfer / close）', () => {
  it('claim：POST {expected_version}；请求体逐键', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.claim(ORG, SESSION, 7)
    expect(calls[0]?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/claim`)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ expected_version: 7 })
  })

  it('A01：两坐席并发 claim 同版本，恰一成功、另一方 409 conflict', async () => {
    // 假后端：CAS 语义 = version 匹配才成功（首次成功后 version+1）。
    let version = 7
    let claims = 0
    const { api, api2 } = makeFetch((url, init) => {
      if (url.endsWith('/claim')) {
        claims += 1
        const body = JSON.parse(String(init?.body)) as { expected_version: number }
        if (body.expected_version === version) {
          version += 1
          return envelope('{}')
        }
        return new Response('{"code":409,"msg":"version conflict","payload":{}}', { status: 409 })
      }
      return envelope('{}')
    })
    const results = await Promise.allSettled([api.claim(ORG, SESSION, 7), api2.claim(ORG, SESSION, 7)])
    expect(claims).toBe(2)
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const error = (rejected[0] as PromiseRejectedResult).reason
    expect(isSeatApiError(error)).toBe(true)
    expect((error as { kind: string }).kind).toBe('conflict')
  })

  it('transfer：{to_identity_id, expected_version} 逐键', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.transfer(ORG, SESSION, { toIdentityId: TARGET, expectedVersion: 9 })
    expect(calls[0]?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ to_identity_id: TARGET, expected_version: 9 })
  })

  it('close：{expected_version, reason?}；缺 reason 不带键', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.close(ORG, SESSION, { expectedVersion: 11, reason: 'visitor_left' })
    await api.close(ORG, SESSION, { expectedVersion: 12 })
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ expected_version: 11, reason: 'visitor_left' })
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ expected_version: 12 })
  })
})

describe('消息合同（历史 + 幂等发送）', () => {
  it('历史：GET enterprise conversations 路径族 + 裸数组载荷', async () => {
    const message = `{"id":9000000000000000009,"sender_type":"contact","body":"你好","client_msg_id":"cm-1","read_at":null}`
    const { calls, api } = makeFetch(() => envelope(`[${message}]`))
    const list = await api.fetchMessages(ORG, CONV, { limit: 50 })
    expect(calls[0]?.url).toBe(`/api/v1/enterprise/conversations/${CONV}/messages?limit=50`)
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('9000000000000000009')
  })

  it('发送：POST {body, client_msg_id}（幂等键在请求体，不在 URL）', async () => {
    const { calls, api } = makeFetch(() => envelope('{"id":9000000000000000010,"sender_type":"seat","body":"您好"}'))
    const message = await api.sendMessage(ORG, CONV, { body: '您好', clientMsgId: 'seat-cm-1' })
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ body: '您好', client_msg_id: 'seat-cm-1' })
    expect(message.id).toBe('9000000000000000010')
    expect(calls[0]?.url).not.toContain('seat-cm-1')
  })

  it('transfer-targets：{targets, next_after_id} 投影', async () => {
    const { api } = makeFetch(() => envelope(`{"targets":[{"business_identity_id":"${TARGET}","display_name":"坐席乙","available":true}],"next_after_id":null}`))
    const page = await api.fetchTransferTargets(ORG)
    expect(page.targets[0]?.identityId).toBe(TARGET)
  })
})

describe('域隔离不回退（A01）', () => {
  it('enterprise 前缀增补后，/api/adm 与域外路径仍被拒且不发请求', async () => {
    const { calls } = makeFetch(() => envelope('{}'))
    const client = new SeatApiClient({
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        return envelope('{}')
      },
    })
    for (const path of ['/adm/x', '/api/adm/organizations', '/api/v1/user/show', '/api/v1/enterprise_admin/x']) {
      let thrown: unknown = null
      try {
        await client.request(path)
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as Error).message).toContain('outside seat domain')
    }
    expect(calls).toHaveLength(0)
  })
})
