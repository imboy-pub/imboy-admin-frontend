/**
 * SEAT-02 组件层测试替身（仅测试引用；非生产代码）。
 *
 * 设计约束（与 SEAT-01 合同测试同款口径）：
 * - 不 mock 合同形状——假后端按 cs_actions / eb_enterprise_actions 冻结动作表的
 *   真实 wire 形状回包（{code,msg,payload} 信封 / TSID 大整数字面量 / 键集分页 /
 *   CAS 409 / workspace_id handler 级必填 422 / 发送走企业真源 {message:{...}} 载荷）
 *   ——DF-9 修订：此前固化的是错误合同（发送 POST 405 路径、写动作缺 workspace_id），
 *   正是缺陷根因，本替身现在逐处镜像真实后端；
 * - SSE 用可编程 ReadableStream 持流，测试逐帧推 §3.6 合同信封；
 * - 全部形状校验走生产投影（fail-closed），替身只负责「像后端一样回包」。
 */
import { SeatApiClient } from '../seatApiClient'
import { SeatEventStream } from '../seatSseClient'
import { SeatWorkbenchApi } from './workbenchApi'
import { seatTokenVault } from '../seatAuthStore'
import type { SeatStreamHandlers, SeatWorkbenchGateway } from './workbenchHooks'

export const ORG = '2000000000000000002'
export const WS = '3000000000000000003'
export const USER = '1000000000000000001'
export const IDENTITY = '6000000000000000006'
export const OTHER_IDENTITY = '6000000000000000007'
export const SESSION = '72057594037927937'
export const CONV = '5000000000000000005'
export const CONTACT = '4000000000000000004'

export type SeatFakeBackendState = {
  sessionStatus: 'queued' | 'active' | 'closed'
  version: number
  /** 模拟其他坐席抢先：claim 一律 409（版本不匹配）。 */
  claimAlwaysConflict: boolean
  /** 连续失败计数：>0 时下一个请求 500 并递减。 */
  failingResponsesLeft: number
  /** contexts 永久 403（无坐席上下文）。 */
  contexts403: boolean
  claimAttempts: number
}

export function initialFakeState(): SeatFakeBackendState {
  return {
    sessionStatus: 'queued',
    version: 7,
    claimAlwaysConflict: false,
    failingResponsesLeft: 0,
    contexts403: false,
    claimAttempts: 0,
  }
}

function ok(payloadText: string): Response {
  return new Response(`{"code":0,"msg":"success","payload":${payloadText}}`, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function conflict(): Response {
  return new Response('{"code":409,"msg":"session version conflict","payload":{}}', { status: 409 })
}

/** DF-9 真实合同：workspace_id 为 handler 级必填，缺失 → 422 missing_workspace_id。 */
function missingWorkspace(): Response {
  return new Response('{"code":422,"msg":"missing_workspace_id","payload":{}}', { status: 422 })
}

function serverError(): Response {
  return new Response('{"code":500,"msg":"internal","payload":{}}', { status: 500 })
}

function forbidden(): Response {
  return new Response('{"code":403,"msg":"not a seat member","payload":{}}', { status: 403 })
}

/** 会话行（线缆 TSID = JSON integer 字面量，经 parseSeatJson 精度保护）。 */
export function sessionRowText(status: string, version: number): string {
  return (
    `{"id":${SESSION},"organization_id":"${ORG}","workspace_id":"${WS}","contact_id":"${CONTACT}",` +
    `"conversation_id":"${CONV}","business_identity_id":${status === 'queued' ? 'null' : IDENTITY},` +
    `"status":"${status}","version":${version},` +
    `"queued_at":"2026-09-20T05:14:47Z","claimed_at":${status === 'queued' ? 'null' : '"2026-09-20T05:20:00Z"'},` +
    `"closed_at":null,"source":"widget","contact":{"masked_name":"王***"},` +
    `"last_message":{"id":null,"preview":"你好","at":"2026-09-20T05:14:40Z"}}`
  )
}

function pageText(view: 'queued' | 'active' | 'closed', rowVersion: number | null): string {
  const count = rowVersion !== null ? 1 : 0
  const rows = rowVersion !== null ? `[${sessionRowText(view, rowVersion)}]` : '[]'
  const counts =
    view === 'queued'
      ? `{"queued":${count},"active":0,"closed":0}`
      : view === 'active'
        ? `{"queued":0,"active":${count},"closed":0}`
        : '{"queued":0,"active":0,"closed":0}'
  return `{"sessions":${rows},"total":${count},"total_by_status":${counts},"next_after_id":null}`
}

export const CONTEXTS_TEXT =
  `{"user_id":"${USER}","contexts":[{"organization_id":"${ORG}","organization_name":"示例商城",` +
  `"workspaces":[{"id":"${WS}","name":"默认工作区"}],"business_identity_id":"${IDENTITY}",` +
  `"seat_enabled":true,"capabilities":["conversation.read","conversation.write","message.write","asset.read"]}]}`

/** 坐席可读消息（含附件三阶段 + ACK read_at）。 */
export const MESSAGES_TEXT =
  '[' +
  `{"id":9000000000000000009,"sender_type":"contact","sender_contact_id":"${CONTACT}","body":"你好",` +
  `"client_msg_id":"visitor-cm-1","created_at":"2026-09-20T05:30:00Z","read_at":"2026-09-20T05:31:00Z"},` +
  `{"id":9000000000000000010,"sender_type":"seat","body":"您好，请问有什么可以帮您？",` +
  `"client_msg_id":"seat-cm-1","created_at":"2026-09-20T05:30:10Z","read_at":null,` +
  `"assets":[{"asset_id":"8000000000000000008","status":"active","mime":"image/png","size":2048,"file_name":"截图.png"},` +
  `{"asset_id":"8000000000000000009","status":"pending_confirm","mime":"image/jpeg","size":10},` +
  `{"asset_id":"8000000000000000010","status":"deleted"}]}` +
  ']'

export const TRANSFER_TARGETS_TEXT =
  `{"targets":[{"business_identity_id":"${OTHER_IDENTITY}","display_name":"坐席乙","available":true}],"next_after_id":null}`

/** 假后端：按冻结动作表回包；记录调用供断言（权威刷新次数等）。 */
export class SeatFakeBackend {
  readonly state: SeatFakeBackendState
  readonly calls: Array<{ method: string; path: string; body: string }> = []
  messageFetchCount = 0
  queueFetchCount = 0
  contextsFetchCount = 0
  sentClientMsgIds: string[] = []

  constructor(state: SeatFakeBackendState = initialFakeState()) {
    this.state = state
  }

  private takeFailure(): Response | null {
    if (this.state.failingResponsesLeft > 0) {
      this.state.failingResponsesLeft -= 1
      return serverError()
    }
    return null
  }

  handle = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.split('?')[0] ?? url
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : ''
    this.calls.push({ method, path, body })
    const failure = this.takeFailure()
    if (failure !== null) return failure

    if (path === '/api/v1/passport/qr_login/create') {
      return ok('{"qr_token":"qr-demo-token","session_token":"st-demo-token","expires_in":60,"status":"waiting"}')
    }
    if (path === '/api/v1/passport/qr_login/cancel') return ok('{}')

    if (path === '/api/v1/cs/me/seat-contexts') {
      this.contextsFetchCount += 1
      return this.state.contexts403 ? forbidden() : ok(CONTEXTS_TEXT)
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/queue`) {
      this.queueFetchCount += 1
      const s = this.state.sessionStatus
      return ok(pageText(s, s === 'queued' ? this.state.version : null))
    }
    if (path === `/api/v1/cs/organizations/${ORG}/seats/sessions`) {
      const status = new URL(url, 'http://localhost').searchParams.get('status') ?? 'active'
      const view: 'active' | 'closed' = status === 'closed' ? 'closed' : 'active'
      const rowVersion = this.state.sessionStatus === view ? this.state.version : null
      return ok(pageText(view, rowVersion))
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}`) {
      // DF-9 真实合同：session detail 的 workspace_id 走 query 且必填
      // （cs_actions session_detail 无 workspace=>optional 宽松项 → 缺失 422）。
      const ws = new URL(url, 'http://localhost').searchParams.get('workspace_id')
      if (ws !== WS) return missingWorkspace()
      return ok(sessionRowText(this.state.sessionStatus, this.state.version))
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/claim`) {
      this.state.claimAttempts += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as { expected_version?: number; workspace_id?: string }
      // DF-9 真实合同：写动作 body 必带 workspace_id（cs_http 缺失 422，不取默认值）。
      if (body.workspace_id !== WS) return missingWorkspace()
      if (this.state.claimAlwaysConflict || body.expected_version !== this.state.version) return conflict()
      this.state.version += 1
      this.state.sessionStatus = 'active'
      return ok('{}')
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { workspace_id?: string }
      if (body.workspace_id !== WS) return missingWorkspace()
      return ok('{}')
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/close`) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { workspace_id?: string }
      if (body.workspace_id !== WS) return missingWorkspace()
      this.state.version += 1
      this.state.sessionStatus = 'closed'
      return ok('{}')
    }
    if (path === `/api/v1/enterprise/conversations/${CONV}/messages`) {
      if (method === 'POST') {
        // DF-9 真实合同：cs 段 /enterprise/conversations/:conv/messages 只登记
        // GET（cs_actions conversation_messages 无 POST case）→ POST 405。
        // 旧前端把发送 POST 到此路径即 DF-9 缺陷本体（固化错误合同的实证）。
        return new Response('{"code":405,"msg":"method not allowed","payload":{}}', { status: 405 })
      }
      this.messageFetchCount += 1
      return ok(MESSAGES_TEXT)
    }
    if (path === `/api/v1/enterprise/organizations/${ORG}/conversations/${CONV}/messages` && method === 'POST') {
      // DF-9 真实合同（eb_tenant_handler conversation_messages POST append_message；
      // e2e agent-api.ts reply 实调形状，9802 真链实测）：
      // body 必带 {body, client_msg_id, workspace_id, sender_type, identity_id}，
      // 缺一即 422（identity_id 缺失真链 500 identity_required）；
      // 响应载荷 = {message:{...}}。
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const clientMsgId = typeof parsed.client_msg_id === 'string' ? parsed.client_msg_id : ''
      if (
        parsed.workspace_id !== WS ||
        clientMsgId.length === 0 ||
        typeof parsed.body !== 'string' ||
        parsed.body.length === 0 ||
        parsed.sender_type !== 'business_identity' ||
        typeof parsed.identity_id !== 'string' ||
        parsed.identity_id.length === 0
      ) {
        return new Response('{"code":422,"msg":"missing required message fields","payload":{}}', { status: 422 })
      }
      this.sentClientMsgIds.push(clientMsgId)
      // 幂等：同 client_msg_id 返回同一 message（载荷 {message:{...}}）。
      return ok(
        `{"message":{"id":9000000000000000011,"sender_type":"business_identity","body":"收到","client_msg_id":"${clientMsgId}"}}`,
      )
    }
    if (path === `/api/v1/cs/organizations/${ORG}/transfer-targets`) return ok(TRANSFER_TARGETS_TEXT)
    return new Response('{"code":404,"msg":"not found","payload":{}}', { status: 404 })
  }
}

/** 可编程 SSE 流：测试逐帧推 §3.6 合同帧；fail 模式返回 500 触发重连。 */
export class FakeSseStream {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null
  connectCount = 0
  failNext = 0

  private makeStream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller
      },
    })
  }

  fetchImpl = async (): Promise<Response> => {
    this.connectCount += 1
    if (this.failNext > 0) {
      this.failNext -= 1
      return new Response('sse unavailable', { status: 500 })
    }
    return new Response(this.makeStream(), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'X-CS-Event-Retention-Seconds': '86400' },
    })
  }

  push(frame: string): void {
    this.controller?.enqueue(new TextEncoder().encode(frame))
  }

  close(): void {
    try {
      this.controller?.close()
    } catch {
      /* already closed */
    }
  }
}

/** §3.6 合同信封帧（与 seatSseClient.test 同款 wire 格式）。 */
export function envelopeFrame(
  eventId: string,
  type: string,
  resourceType: string,
  resourceId: string | null,
  reason = 'created',
): string {
  return `id: ${eventId}\nevent: ${type}\ndata: ${JSON.stringify({
    event_id: eventId,
    type,
    organization_id: ORG,
    workspace_id: WS,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_version: 1,
    occurred_at: '2026-09-20T05:40:00Z',
    reason,
  })}\n\n`
}

/** 组装可注入工作台的 gateway（api + 可编程 SSE 流工厂；token 走内存 vault）。 */
export function makeGateway(
  backend: SeatFakeBackend,
  sse: FakeSseStream,
): SeatWorkbenchGateway & { sse: FakeSseStream; backend: SeatFakeBackend } {
  const getToken = (): string | null => seatTokenVault.getToken()
  const client = new SeatApiClient({ fetchImpl: backend.handle, getToken })
  const api = new SeatWorkbenchApi({ client })
  const gateway = {
    api,
    fetchImpl: sse.fetchImpl,
    createStream: (handlers: SeatStreamHandlers) =>
      new SeatEventStream({
        getToken,
        fetchImpl: sse.fetchImpl,
        backoffBaseMs: 10,
        ...handlers,
      }),
    sse,
    backend,
  }
  return gateway
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
