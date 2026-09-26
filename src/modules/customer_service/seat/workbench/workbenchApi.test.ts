/**
 * SEAT-02：SeatWorkbenchApi 单测（线格式合同 fixture，SEAT-01 同款测试替身）。
 *
 * 覆盖：
 * - 队列/两视图键集分页查询串（after_id/limit/workspace_id）与响应投影；
 * - claim/transfer/close：CAS 请求体（expected_version + workspace_id 必填，
 *   DF-9 真实合同）+ 409 → conflict 分类；
 * - 会话详情 query 必带 workspace_id（DF-9：缺失真实后端 422）；
 * - 消息历史裸数组载荷 + 发送企业真源写路径（{message:{...}} 载荷、
 *   workspace_id/sender_type/identity_id 逐键，DF-9）；
 * - TSID 大整数精度保护（原始 JSON 文本经 parseSeatJson）；
 * - 域隔离不变量（/api/adm 仍被拒，A01 不因 enterprise 前缀增补而松动）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatApiClient } from '../seatApiClient'
import { isSeatApiError } from '../errors'
import { blobSha256Hex, isValidSha256Hex, runSeatAttachmentUpload, SeatUploadTargetMissingError } from './attachmentUpload'
import { seatTokenVault } from '../seatAuthStore'

const ORG = '2000000000000000002'
const WS = '3000000000000000003'
const SESSION = '72057594037927937'
const CONV = '5000000000000000005'
const TARGET = '6000000000000000006'
const IDENTITY = '6000000000000000006'

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

const PAGE_TEXT = `{"sessions":[{"id":${SESSION},"organization_id":"${ORG}","workspace_id":"3000000000000000003","contact_id":"4000000000000000004","conversation_id":"${CONV}","business_identity_id":"6000000000000000006","status":"queued","version":7,"queued_at":1758999975,"claimed_at":null,"closed_at":null,"source":"widget","contact":{"masked_name":"李***"},"last_message":{"id":7000000000000000007,"sender_type":"contact","created_at":1759000000,"preview":"你好，请问订单 8891 什么时候发货"},"waiting_seconds":125}],"total":1,"total_by_status":{"queued":1,"active":0,"closed":0},"next_after_id":null}`

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
    // CS-WEB-03：队列页消费 CS-BE-02 投影——服务端 preview 摘要与等待时长。
    expect(page.sessions[0]?.lastMessage.preview).toBe('你好，请问订单 8891 什么时候发货')
    expect(page.sessions[0]?.lastMessage.createdAt).toBe(1759000000)
    expect(page.sessions[0]?.waitingSeconds).toBe(125)
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
  it('claim：POST {workspace_id, expected_version}；请求体逐键（DF-9）', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.claim(ORG, SESSION, WS, 7)
    expect(calls[0]?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/claim`)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ workspace_id: WS, expected_version: 7 })
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
    const results = await Promise.allSettled([api.claim(ORG, SESSION, WS, 7), api2.claim(ORG, SESSION, WS, 7)])
    expect(claims).toBe(2)
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const error = (rejected[0] as PromiseRejectedResult).reason
    expect(isSeatApiError(error)).toBe(true)
    expect((error as { kind: string }).kind).toBe('conflict')
  })

  it('transfer：{to_identity_id, expected_version, workspace_id} 逐键（DF-9）', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.transfer(ORG, SESSION, WS, { toIdentityId: TARGET, expectedVersion: 9 })
    expect(calls[0]?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      to_identity_id: TARGET,
      expected_version: 9,
      workspace_id: WS,
    })
  })

  it('close：{expected_version, workspace_id, reason?}；缺 reason 不带键（DF-9）', async () => {
    const { calls, api } = makeFetch(() => envelope('{}'))
    await api.close(ORG, SESSION, WS, { expectedVersion: 11, reason: 'visitor_left' })
    await api.close(ORG, SESSION, WS, { expectedVersion: 12 })
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      expected_version: 11,
      workspace_id: WS,
      reason: 'visitor_left',
    })
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ expected_version: 12, workspace_id: WS })
  })

  it('detail：GET query 必带 workspace_id（DF-9：缺失真实后端 422）', async () => {
    const { calls, api } = makeFetch(() =>
      envelope(
        `{"id":${SESSION},"organization_id":"${ORG}","workspace_id":"${WS}","status":"queued","version":7,` +
          `"contact":{"masked_name":"李***","display_name":"李***"},"source":"widget"}`,
      ),
    )
    const detail = await api.fetchDetail(ORG, SESSION, WS)
    expect(calls[0]?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}?workspace_id=${WS}`)
    expect(detail.id).toBe(SESSION)
    expect(detail.version).toBe(7)
  })
})

describe('消息合同（历史 + 幂等发送）', () => {
  it('历史：GET enterprise conversations 路径族 + 必带 workspace_id/organization_id（DF-9R）+ 裸数组载荷', async () => {
    const message = `{"id":9000000000000000009,"sender_type":"contact","body":"你好","client_msg_id":"cm-1","read_at":null}`
    const { calls, api } = makeFetch(() => envelope(`[${message}]`))
    const list = await api.fetchMessages(ORG, CONV, WS, { limit: 50 })
    expect(calls[0]?.url).toBe(
      `/api/v1/enterprise/conversations/${CONV}/messages?workspace_id=${WS}&organization_id=${ORG}&limit=50`,
    )
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('9000000000000000009')
  })

  it('发送：POST 企业真源写路径（/organizations/:org 段 + 全键 body + {message} 载荷，DF-9）', async () => {
    const { calls, api } = makeFetch(() =>
      envelope(
        `{"message":{"id":9000000000000000010,"sender_type":"business_identity","body":"您好","client_msg_id":"seat-cm-1"}}`,
      ),
    )
    const message = await api.sendMessage(ORG, CONV, {
      body: '您好',
      clientMsgId: 'seat-cm-1',
      workspaceId: WS,
      identityId: IDENTITY,
    })
    expect(calls[0]?.init?.method).toBe('POST')
    // DF-9：真实路径必带 /organizations/:org 段（cs 段旧路径 POST 真实后端 405）。
    expect(calls[0]?.url).toBe(`/api/v1/enterprise/organizations/${ORG}/conversations/${CONV}/messages`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      body: '您好',
      client_msg_id: 'seat-cm-1',
      workspace_id: WS,
      sender_type: 'business_identity',
      identity_id: IDENTITY,
    })
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

describe('CS-WEB-02 附件合同（presign / 裸 PUT / confirm / asset_ids 发送）', () => {
  const OBJECT_HASH = 'ab'.repeat(32)
  const UPLOAD_PATH = `/api/v1/enterprise/organizations/${ORG}/assets/upload/1`
  const PRESIGN_PAYLOAD = `{"asset_id":8100000000000000001,"upload_ref":"ur-1","object_hash":"${OBJECT_HASH}","mime":"image/png","size_bytes":8,"expires_at":1759000000,"upload":{"method":"PUT","url":"${UPLOAD_PATH}","token":"opaque","expires_at":1759000000,"adapter":"local_private_object_store","rule":"opaque_token_no_url_no_object_key"}}`
  const FILE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  /** 上传三动作 + 发送的按路径分派 responder（断言顺序用 calls）。 */
  function uploadStackResponder(): { calls: RecordedCall[]; fetchImpl: (_url: string, _init?: RequestInit) => Promise<Response> } {
    const calls: RecordedCall[] = []
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      const path = url.split('?')[0] ?? url
      if (path === `/api/v1/enterprise/organizations/${ORG}/assets/presign`) return envelope(PRESIGN_PAYLOAD)
      if (path === UPLOAD_PATH) return new Response('', { status: 200 })
      if (path === `/api/v1/enterprise/organizations/${ORG}/assets/confirm`) return envelope('{"asset_id":0,"status":"active"}')
      if (path === `/api/v1/enterprise/organizations/${ORG}/conversations/${CONV}/messages` && init?.method === 'POST') {
        return envelope(`{"message":{"id":9000000000000000012,"sender_type":"business_identity","body":"","client_msg_id":"seat-cm-2"}}`)
      }
      return new Response('{"code":404,"msg":"not found","payload":{}}', { status: 404 })
    }
    return { calls, fetchImpl }
  }

  it('presign：POST assets/presign + 冻结字段逐键（file_name 空串不落线）+ 响应投影', async () => {
    const { calls, fetchImpl } = uploadStackResponder()
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    const presign = await api.requestAssetPresign(ORG, CONV, WS, {
      mime: 'image/png',
      sizeBytes: 8,
      objectHash: OBJECT_HASH,
      fileName: '',
    })
    expect(calls[0]?.url).toBe(`/api/v1/enterprise/organizations/${ORG}/assets/presign`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      conversation_id: CONV,
      mime: 'image/png',
      size_bytes: 8,
      object_hash: OBJECT_HASH,
      workspace_id: WS,
    })
    expect(presign.assetId).toBe('8100000000000000001')
    expect(presign.uploadRef).toBe('ur-1')
    expect(presign.uploadUrl).toBe(UPLOAD_PATH)

    // file_name 非空 → 落线（CS-BE-01 可选展示名）。
    const { calls: calls2, fetchImpl: fetchImpl2 } = uploadStackResponder()
    const api2 = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl: fetchImpl2, getToken: () => 'tok' }) })
    await api2.requestAssetPresign(ORG, CONV, WS, { mime: 'image/png', sizeBytes: 8, objectHash: OBJECT_HASH, fileName: '截图.png' })
    expect((JSON.parse(String(calls2[0]?.init?.body)) as { file_name?: string }).file_name).toBe('截图.png')
  })

  it('confirm：POST assets/confirm + {upload_ref, workspace_id} 请求体', async () => {
    const { calls, fetchImpl } = uploadStackResponder()
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    await api.confirmAssetUpload(ORG, WS, 'ur-1')
    expect(calls[0]?.url).toBe(`/api/v1/enterprise/organizations/${ORG}/assets/confirm`)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ upload_ref: 'ur-1', workspace_id: WS })
  })

  it('发送 asset_ids：空正文省略 body 键 + asset_ids 数组；纯文本不出现 asset_ids', async () => {
    const { calls, fetchImpl } = uploadStackResponder()
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    await api.sendMessage(ORG, CONV, {
      body: '',
      clientMsgId: 'seat-cm-2',
      workspaceId: WS,
      identityId: IDENTITY,
      assetIds: ['8100000000000000001'],
    })
    const wire = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
    expect(wire.body).toBeUndefined()
    expect(wire.asset_ids).toEqual(['8100000000000000001'])
    expect(wire.client_msg_id).toBe('seat-cm-2')

    const { calls: calls2, fetchImpl: fetchImpl2 } = uploadStackResponder()
    const api2 = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl: fetchImpl2, getToken: () => 'tok' }) })
    await api2.sendMessage(ORG, CONV, { body: '您好', clientMsgId: 'seat-cm-3', workspaceId: WS, identityId: IDENTITY })
    const wire2 = JSON.parse(String(calls2[0]?.init?.body)) as Record<string, unknown>
    expect(wire2.body).toBe('您好')
    expect(wire2.asset_ids).toBeUndefined()
  })

  it('上传编排顺序钉死（TEST-00）：presign → 裸 PUT → confirm（不可乱序/跳步；hash 先于 presign）', async () => {
    const { calls, fetchImpl } = uploadStackResponder()
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    const result = await runSeatAttachmentUpload({
      api,
      orgId: ORG,
      conversationId: CONV,
      workspaceId: WS,
      file: new Blob([FILE_BYTES.slice()], { type: 'image/png' }),
      fileName: '截图.png',
    })
    // 顺序唯一事实源：calls 路径序列。
    expect(calls.map((call) => call.url.split('?')[0])).toEqual([
      `/api/v1/enterprise/organizations/${ORG}/assets/presign`,
      UPLOAD_PATH,
      `/api/v1/enterprise/organizations/${ORG}/assets/confirm`,
    ])
    // PUT 形状：octet-stream、无 Authorization。
    const putInit = calls[1]?.init as RequestInit
    expect(putInit.method).toBe('PUT')
    expect((putInit.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream')
    expect((putInit.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(result.assetId).toBe('8100000000000000001')
    expect(result.objectHash).toBe(await blobSha256Hex(new Blob([FILE_BYTES.slice()])))
  })

  it('upload.url 缺失（部署未开放对象 PUT）→ fail-closed：PUT/confirm 均不发生', async () => {
    const presignNoUrl = PRESIGN_PAYLOAD.replace(`"url":"${UPLOAD_PATH}",`, '')
    const calls: RecordedCall[] = []
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      return envelope(presignNoUrl)
    }
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    let thrown: unknown = null
    try {
      await runSeatAttachmentUpload({
        api,
        orgId: ORG,
        conversationId: CONV,
        workspaceId: WS,
        file: new Blob([FILE_BYTES.slice()], { type: 'image/png' }),
        fileName: '截图.png',
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SeatUploadTargetMissingError)
    expect(calls).toHaveLength(1) // 仅 presign；无 PUT/confirm/发送。
  })

  it('confirm 409（重复 confirm）→ conflict 分类（不伪成功）', async () => {
    const calls: RecordedCall[] = []
    let presignDone = false
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      const path = url.split('?')[0] ?? url
      if (path.endsWith('/assets/presign')) {
        presignDone = true
        return envelope(PRESIGN_PAYLOAD)
      }
      if (path === UPLOAD_PATH) return new Response('', { status: 200 })
      if (path.endsWith('/assets/confirm')) {
        return new Response('{"code":409,"msg":"asset already confirmed","payload":{}}', { status: 409 })
      }
      return new Response('{"code":404,"msg":"not found","payload":{}}', { status: 404 })
    }
    const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl, getToken: () => 'tok' }) })
    let thrown: unknown = null
    try {
      await runSeatAttachmentUpload({
        api,
        orgId: ORG,
        conversationId: CONV,
        workspaceId: WS,
        file: new Blob([FILE_BYTES.slice()], { type: 'image/png' }),
        fileName: '截图.png',
      })
    } catch (error) {
      thrown = error
    }
    expect(presignDone).toBe(true)
    expect(isSeatApiError(thrown)).toBe(true)
    expect((thrown as { kind: string }).kind).toBe('conflict')
  })

  it('SHA-256 形状：blobSha256Hex 64 位小写 hex + isValidSha256Hex 白名单', async () => {
    const hash = await blobSha256Hex(new Blob(['imboy']))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(isValidSha256Hex(hash)).toBe(true)
    expect(isValidSha256Hex('AB'.repeat(32))).toBe(false)
    expect(isValidSha256Hex('zz')).toBe(false)
  })
})

describe('CS-WEB-04 客户上下文合同（CS-BE-03 端点）', () => {
  it('fetchCustomerContext：GET context 路径 + 信封解包 + 投影；signal 透传', async () => {
    const { calls, api } = makeFetch(() =>
      envelope(
        `{"session_id":${SESSION},"workspace_id":3000000000000000003,"source":"seat",` +
          `"contact":{"masked_name":"李***","first_seen":1757000000,"last_seen":1759000000},` +
          `"history":{"sessions":[{"id":7100000000000000010,"conversation_id":${CONV},"workspace_id":3000000000000000003,"status":"closed","version":3,"rating":5,"queued_at":1758000000,"claimed_at":1758000100,"closed_at":1758000200}],"next_after_id":null},` +
          `"notes":[{"id":8200000000000000010,"business_identity_id":6000000000000000006,"created_at":1758500000}]}`,
      ),
    )
    seatTokenVault.setToken('eyJh.eyJi.c2lg')
    const controller = new AbortController()
    const ctx = await api.fetchCustomerContext(ORG, WS, SESSION, { signal: controller.signal })
    expect(ctx.sessionId).toBe(SESSION)
    expect(ctx.source).toBe('seat')
    expect(ctx.contact.maskedName).toBe('李***')
    expect(ctx.history.sessions.length).toBe(1)
    expect(ctx.notes.length).toBe(1)
    const call = calls[0]
    expect(call?.url).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/context?workspace_id=${WS}`)
    expect(call?.init?.signal).toBe(controller.signal)
  })

  it('fetchCustomerContext：403 → forbidden 分类（转接后原 Seat 失去读权语义）', async () => {
    const { api } = makeFetch(() => new Response('{"code":403,"msg":"not_session_owner","payload":{}}', { status: 403 }))
    seatTokenVault.setToken('eyJh.eyJi.c2lg')
    let caught: unknown = null
    try {
      await api.fetchCustomerContext(ORG, WS, SESSION)
    } catch (error) {
      caught = error
    }
    expect(isSeatApiError(caught)).toBe(true)
    expect(caught && typeof caught === 'object' && 'kind' in caught ? (caught as { kind: string }).kind : '').toBe('forbidden')
  })

  it('fetchCustomerContext：载荷形状非法 → TypeError（投影层 fail-closed，不猜形状）', async () => {
    const { api } = makeFetch(() => envelope('{"session_id":"not-a-tsid"}'))
    seatTokenVault.setToken('eyJh.eyJi.c2lg')
    let caught: unknown = null
    try {
      await api.fetchCustomerContext(ORG, WS, SESSION)
    } catch (error) {
      caught = error
    }
    expect(caught instanceof TypeError).toBe(true)
    expect(String(caught)).toMatch(/session_id/)
  })

  it('fetchCustomerContext：信封载荷缺失 → invalid_response（传输层分类不变）', async () => {
    const { api } = makeFetch(() => envelope('null'))
    seatTokenVault.setToken('eyJh.eyJi.c2lg')
    let caught: unknown = null
    try {
      await api.fetchCustomerContext(ORG, WS, SESSION)
    } catch (error) {
      caught = error
    }
    expect(isSeatApiError(caught)).toBe(true)
    expect(caught && typeof caught === 'object' && 'kind' in caught ? (caught as { kind: string }).kind : '').toBe('invalid_response')
  })
})
