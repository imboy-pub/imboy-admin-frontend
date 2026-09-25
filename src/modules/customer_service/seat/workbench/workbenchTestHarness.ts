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
/** CS-WEB-04：第二会话（切换/陈旧响应用例的另一位客户）。 */
export const SESSION2 = '72057594037927938'
export const CONV = '5000000000000000005'
export const CONTACT = '4000000000000000004'
/** CS-WEB-01 附件 fixture（与 MESSAGES_TEXT 的 assets[].id 对应）。 */
export const ASSET_PNG_ID = '8000000000000000008'
export const ASSET_PDF_ID = '8000000000000000011'

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
  /** CS-WEB-01：按 asset id 覆盖 content 响应状态（默认 200）。 */
  assetContentStatuses: Record<string, number>
  /** CS-WEB-02：各上传/发送步骤的连续失败计数（500 并递减；供失败保留/重试用例）。 */
  presignFailuresLeft: number
  uploadPutFailuresLeft: number
  confirmFailuresLeft: number
  sendFailuresLeft: number
  /** CS-WEB-02：presign 拒绝（422 + msg 透传断言；模拟 mime/size/hash 服务端裁决）。 */
  presignRejection: { code: number; msg: string } | null
  /** CS-WEB-02：presign 响应不含 upload.url（部署未开放对象 PUT → fail-closed 用例）。 */
  presignOmitUploadUrl: boolean
  /** CS-WEB-03：queued 行 waiting_seconds（服务端权威值；null = 缺键模拟）。 */
  queueWaitingSeconds: number | null
  /** CS-WEB-03：last_message.preview（null = 占位；undefined = 无 last_message 整键）。 */
  lastMessagePreview: string | null | undefined
  /** CS-WEB-04：客户上下文 403（转接后原 Seat 失去读权 / 撤权 seat_disabled）。 */
  context403: boolean
  /** CS-WEB-04：客户上下文连续 500 计数（递减）。 */
  contextFailuresLeft: number
  /** CS-WEB-04：客户上下文历史会话页行数（0 = 历史空态）。 */
  contextHistoryCount: number
  /** CS-WEB-04：客户上下文备注行数（0 = 备注空态）。 */
  contextNotesCount: number
  /** CS-WEB-04：按会话 id 的上下文响应延迟 ms（陈旧响应竞态用例）。 */
  contextDelayMsBySession: Record<string, number>
  /** CS-WEB-04：队列页附加第二会话行（切换会话用例）。 */
  extraSessionInQueue: boolean
}

export function initialFakeState(): SeatFakeBackendState {
  return {
    sessionStatus: 'queued',
    version: 7,
    claimAlwaysConflict: false,
    failingResponsesLeft: 0,
    contexts403: false,
    claimAttempts: 0,
    assetContentStatuses: {},
    presignFailuresLeft: 0,
    uploadPutFailuresLeft: 0,
    confirmFailuresLeft: 0,
    sendFailuresLeft: 0,
    presignRejection: null,
    presignOmitUploadUrl: false,
    queueWaitingSeconds: 125,
    lastMessagePreview: '你好，请问订单 8891 什么时候发货',
    context403: false,
    contextFailuresLeft: 0,
    contextHistoryCount: 1,
    contextNotesCount: 0,
    contextDelayMsBySession: {},
    extraSessionInQueue: false,
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

/**
 * 会话行（线缆 TSID = JSON integer 字面量，经 parseSeatJson 精度保护）。
 * CS-WEB-03：行形状镜像 CS-BE-02 冻结投影——时间字段是 epoch bigint 秒
 * （cs_pg_session extract(epoch)::bigint），last_message 键集恰为
 * {id, sender_type, created_at, preview}（preview 为 null 占位），queued 行
 * 带 waiting_seconds（服务端权威值；active/closed 恒缺键）。
 */
export function sessionRowText(
  status: string,
  version: number,
  state: SeatFakeBackendState,
  sessionId: string = SESSION,
  maskedName = '王***',
): string {
  const lastMessageText =
    state.lastMessagePreview === undefined
      ? 'null'
      : `{"id":7000000000000000007,"sender_type":"contact","created_at":1759000000,"preview":${JSON.stringify(state.lastMessagePreview)}}`
  const waitingText =
    status === 'queued' && state.queueWaitingSeconds !== null ? `,"waiting_seconds":${state.queueWaitingSeconds}` : ''
  return (
    `{"id":${sessionId},"organization_id":"${ORG}","workspace_id":"${WS}","contact_id":"${CONTACT}",` +
    `"conversation_id":${CONV},"business_identity_id":${status === 'queued' ? 'null' : `"${IDENTITY}"`},` +
    `"status":"${status}","version":${version},` +
    `"queued_at":1758999975,"claimed_at":${status === 'queued' ? 'null' : '1759000025'},` +
    `"closed_at":null,"source":"widget","contact":{"masked_name":"${maskedName}"},` +
    `"last_message":${lastMessageText}${waitingText}}`
  )
}

function pageText(view: 'queued' | 'active' | 'closed', rowVersion: number | null, state: SeatFakeBackendState): string {
  let rows = rowVersion !== null ? [sessionRowText(view, rowVersion, state)] : []
  // CS-WEB-04：附加第二会话行（仅 queued 视图；行数/计数同步为服务端事实口径）。
  if (view === 'queued' && state.extraSessionInQueue) {
    rows = [...rows, sessionRowText('queued', state.version, state, SESSION2, '李***')]
  }
  const countFinal = rows.length
  const counts =
    view === 'queued'
      ? `{"queued":${countFinal},"active":0,"closed":0}`
      : view === 'active'
        ? `{"queued":0,"active":${countFinal},"closed":0}`
        : '{"queued":0,"active":0,"closed":0}'
  return `{"sessions":[${rows.join(',')}],"total":${countFinal},"total_by_status":${counts},"next_after_id":null}`
}

export const CONTEXTS_TEXT =
  `{"user_id":"${USER}","contexts":[{"organization_id":"${ORG}","organization_name":"示例商城",` +
  `"workspaces":[{"id":"${WS}","name":"默认工作区"}],"business_identity_id":"${IDENTITY}",` +
  `"seat_enabled":true,"capabilities":["conversation.read","conversation.write","message.write","asset.read"]}]}`

/** 坐席可读消息（含附件三阶段 + ACK read_at）。
 * CS-WEB-01：assets[] 镜像后端冻结投影键 {id,mime,size_bytes,file_name,status}
 * （eb_pg_message_ext 白名单；旧 `size` 键是断链实证，不再出现）。 */
export const MESSAGES_TEXT =
  '[' +
  `{"id":9000000000000000009,"sender_type":"contact","sender_contact_id":"${CONTACT}","body":"你好",` +
  `"client_msg_id":"visitor-cm-1","created_at":"2026-09-20T05:30:00Z","read_at":"2026-09-20T05:31:00Z"},` +
  `{"id":9000000000000000010,"sender_type":"seat","body":"您好，请问有什么可以帮您？",` +
  `"client_msg_id":"seat-cm-1","created_at":"2026-09-20T05:30:10Z","read_at":null,` +
  `"assets":[{"id":${ASSET_PNG_ID},"status":"active","mime":"image/png","size_bytes":2048,"file_name":"截图.png"},` +
  `{"id":8000000000000000009,"status":"pending_confirm","mime":"image/jpeg","size_bytes":10},` +
  `{"id":8000000000000000010,"status":"deleted"},` +
  `{"id":${ASSET_PDF_ID},"status":"active","mime":"application/pdf","size_bytes":1048576,"file_name":"退款凭证.pdf"}]}` +
  ']'

/** content 端点字节（PNG 魔数头即可——客户端不解析内容）。 */
const ASSET_CONTENT_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export const TRANSFER_TARGETS_TEXT =
  `{"targets":[{"business_identity_id":"${OTHER_IDENTITY}","display_name":"坐席乙","available":true}],"next_after_id":null}`

/**
 * CS-WEB-04：客户上下文载荷（镜像 CS-BE-03 session_customer_context 投影：
 * 白名单 {session_id, workspace_id, source, contact{masked_name,first_seen,
 * last_seen}, history{sessions,next_after_id}, notes[{id,business_identity_id,
 * created_at}]}；TSID = JSON 整数字面量，时间 = epoch 秒 bigint）。
 * 不同会话给不同掩码名（陈旧数据可见性断言的事实源）。
 */
export function customerContextText(sessionId: string, state: SeatFakeBackendState): string {
  const maskedName = sessionId === SESSION2 ? '李***' : '王***'
  const historyRows: string[] = []
  for (let i = 0; i < state.contextHistoryCount; i += 1) {
    const id = `71000000000000000${String(10 + i)}`
    historyRows.push(
      `{"id":${id},"conversation_id":${CONV},"workspace_id":${WS},"status":"closed",` +
        `"version":3,"rating":${i === 0 ? 5 : 'null'},"queued_at":1758000000,` +
        `"claimed_at":1758000100,"closed_at":1758000200}`,
    )
  }
  const noteRows: string[] = []
  for (let i = 0; i < state.contextNotesCount; i += 1) {
    const id = `82000000000000000${String(10 + i)}`
    noteRows.push(`{"id":${id},"business_identity_id":"${IDENTITY}","created_at":1758500000}`)
  }
  return (
    `{"session_id":${sessionId},"workspace_id":${WS},"source":"widget",` +
    `"contact":{"masked_name":"${maskedName}","first_seen":1757000000,"last_seen":1759000000},` +
    `"history":{"sessions":[${historyRows.join(',')}],"next_after_id":null},` +
    `"notes":[${noteRows.join(',')}]}`
  )
}

/** 假后端：按冻结动作表回包；记录调用供断言（权威刷新次数等）。 */
export class SeatFakeBackend {
  readonly state: SeatFakeBackendState
  readonly calls: Array<{ method: string; path: string; body: string; auth: string | null }> = []
  messageFetchCount = 0
  queueFetchCount = 0
  /** CS-WEB-04：context 端点观测（刷新次数/晚到响应断言）。 */
  contextFetchCount = 0
  contextCalls: Array<{ sessionId: string; aborted: boolean }> = []
  contextsFetchCount = 0
  assetContentFetchCount = 0
  sentClientMsgIds: string[] = []
  /** CS-WEB-02：上传/发送观测（顺序与重试不重复上传断言的唯一事实源）。 */
  presignCount = 0
  uploadPutCount = 0
  confirmCount = 0
  confirmedUploadRefs: string[] = []
  sentBodies: Array<string | null> = []
  sentAssetIds: string[][] = []
  /** 每次 presign 请求体（断言冻结字段）。 */
  presignRequests: Array<Record<string, unknown>> = []

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
    const headers = (init?.headers ?? undefined) as Record<string, string> | undefined
    this.calls.push({ method, path, body, auth: headers?.Authorization ?? null })
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
      return ok(pageText(s, s === 'queued' ? this.state.version : null, this.state))
    }
    if (path === `/api/v1/cs/organizations/${ORG}/seats/sessions`) {
      const status = new URL(url, 'http://localhost').searchParams.get('status') ?? 'active'
      const view: 'active' | 'closed' = status === 'closed' ? 'closed' : 'active'
      const rowVersion = this.state.sessionStatus === view ? this.state.version : null
      return ok(pageText(view, rowVersion, this.state))
    }
    // CS-WEB-04：客户上下文端点（imboy_router session_customer_context）。
    // 5 段路径；403（转接后原 Seat / 撤权）/ 500 递减 / 可编程延迟（陈旧
    // 响应竞态用例：晚到的旧响应由 hook 序号守卫拒绝）。
    const contextMatch = path.match(new RegExp(`^/api/v1/cs/organizations/${ORG}/sessions/(\\d+)/context$`))
    if (contextMatch !== null) {
      this.contextFetchCount += 1
      const sessionId = contextMatch[1] ?? ''
      this.contextCalls.push({ sessionId, aborted: init?.signal?.aborted === true })
      if (this.state.context403) return forbidden()
      if (this.state.contextFailuresLeft > 0) {
        this.state.contextFailuresLeft -= 1
        return serverError()
      }
      const delay = this.state.contextDelayMsBySession[sessionId] ?? 0
      if (delay > 0) await sleep(delay)
      if (init?.signal?.aborted === true) {
        return new Response('{"code":499,"msg":"aborted","payload":{}}', { status: 499 })
      }
      return ok(customerContextText(sessionId, this.state))
    }
    const detailMatch = path.match(new RegExp(`^/api/v1/cs/organizations/${ORG}/sessions/(\\d+)$`))
    if (detailMatch !== null) {
      // DF-9 真实合同：session detail 的 workspace_id 走 query 且必填
      // （cs_actions session_detail 无 workspace=>optional 宽松项 → 缺失 422）。
      const ws = new URL(url, 'http://localhost').searchParams.get('workspace_id')
      if (ws !== WS) return missingWorkspace()
      const sessionId = detailMatch[1] ?? SESSION
      return ok(
        sessionRowText(
          this.state.sessionStatus,
          this.state.version,
          this.state,
          sessionId,
          sessionId === SESSION2 ? '李***' : '王***',
        ),
      )
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
      // body 必带 {client_msg_id, workspace_id, sender_type, identity_id}；
      // CS-WEB-02（附件消息合同）：body 可选化——空正文 + asset_ids（TSID string
      // 数组）合法；正文与 asset_ids 同时空 → 422（服务端兜底语义）；
      // 响应载荷 = {message:{...}}。
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const clientMsgId = typeof parsed.client_msg_id === 'string' ? parsed.client_msg_id : ''
      const messageBody = typeof parsed.body === 'string' && parsed.body.length > 0 ? parsed.body : null
      const assetIds = Array.isArray(parsed.asset_ids)
        ? (parsed.asset_ids as unknown[]).filter((v): v is string => typeof v === 'string')
        : []
      if (
        parsed.workspace_id !== WS ||
        clientMsgId.length === 0 ||
        parsed.sender_type !== 'business_identity' ||
        typeof parsed.identity_id !== 'string' ||
        parsed.identity_id.length === 0 ||
        (messageBody === null && assetIds.length === 0)
      ) {
        return new Response('{"code":422,"msg":"missing required message fields or empty payload","payload":{}}', { status: 422 })
      }
      if (this.state.sendFailuresLeft > 0) {
        this.state.sendFailuresLeft -= 1
        return serverError()
      }
      this.sentClientMsgIds.push(clientMsgId)
      this.sentBodies.push(messageBody)
      this.sentAssetIds.push(assetIds)
      // 幂等：同 client_msg_id 返回同一 message（载荷 {message:{...}}）。
      return ok(
        `{"message":{"id":9000000000000000011,"sender_type":"business_identity","body":"收到","client_msg_id":"${clientMsgId}"}}`,
      )
    }
    // CS-WEB-02：附件 presign（imboy_router.erl:1790，eb_tenant_handler presign →
    // request_presign）。冻结字段 {conversation_id, mime, size_bytes, object_hash,
    // file_name?, workspace_id}；mime/size/hash 合法性由服务端裁决（422 透传）。
    if (path === `/api/v1/enterprise/organizations/${ORG}/assets/presign` && method === 'POST') {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      this.presignRequests.push(parsed)
      if (
        parsed.conversation_id !== CONV ||
        typeof parsed.mime !== 'string' ||
        typeof parsed.size_bytes !== 'number' ||
        typeof parsed.object_hash !== 'string' ||
        parsed.workspace_id !== WS
      ) {
        return new Response('{"code":422,"msg":"invalid presign arguments","payload":{}}', { status: 422 })
      }
      if (this.state.presignRejection !== null) {
        const { code, msg } = this.state.presignRejection
        return new Response(`{"code":${code},"msg":"${msg}","payload":{}}`, { status: code })
      }
      if (this.state.presignFailuresLeft > 0) {
        this.state.presignFailuresLeft -= 1
        return serverError()
      }
      this.presignCount += 1
      const uploadRef = `ur-${this.presignCount}`
      const assetId = 8100000000000000000 + this.presignCount
      const uploadUrl = this.state.presignOmitUploadUrl
        ? null
        : `/api/v1/enterprise/organizations/${ORG}/assets/upload/${this.presignCount}`
      // 镜像 eb_asset_app:presign_view + widget BE-PATCH-01 的 upload.url 投影。
      const uploadText =
        uploadUrl === null
          ? '{"method":"PUT","token":"opaque","expires_at":1759000000,"adapter":"local_private_object_store","rule":"opaque_token_no_url_no_object_key"}'
          : `{"method":"PUT","url":"${uploadUrl}","token":"opaque","expires_at":1759000000,"adapter":"local_private_object_store","rule":"opaque_token_no_url_no_object_key"}`
      return ok(
        `{"asset_id":${assetId},"upload_ref":"${uploadRef}","object_hash":"${parsed.object_hash}","mime":"${parsed.mime}",` +
          `"size_bytes":${parsed.size_bytes},"file_name":null,"retain_until":null,"expires_at":1759000000,"upload":${uploadText}}`,
      )
    }
    // CS-WEB-02：裸 PUT 上传目标（presign 下发的 upload.url；同源相对路径形态）。
    // 只带 Content-Type / 无 Authorization——无 token 断言在本端点核对。
    if (method === 'PUT' && /^\/api\/v1\/enterprise\/organizations\/[^/]+\/assets\/upload\/\d+$/.test(path)) {
      if (this.state.uploadPutFailuresLeft > 0) {
        this.state.uploadPutFailuresLeft -= 1
        return serverError()
      }
      this.uploadPutCount += 1
      if (typeof headers?.Authorization === 'string') {
        throw new Error('bare upload PUT must not carry Authorization')
      }
      return new Response('', { status: 200 })
    }
    // CS-WEB-02：附件 confirm（imboy_router.erl:1796，confirm_asset）。
    if (path === `/api/v1/enterprise/organizations/${ORG}/assets/confirm` && method === 'POST') {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { upload_ref?: string; workspace_id?: string }
      if (typeof parsed.upload_ref !== 'string' || parsed.upload_ref.length === 0 || parsed.workspace_id !== WS) {
        return new Response('{"code":422,"msg":"invalid confirm arguments","payload":{}}', { status: 422 })
      }
      if (this.state.confirmFailuresLeft > 0) {
        this.state.confirmFailuresLeft -= 1
        return serverError()
      }
      // 重复 confirm 同 ref → 409（不伪成功）。
      if (this.confirmedUploadRefs.includes(parsed.upload_ref)) {
        return new Response('{"code":409,"msg":"asset already confirmed","payload":{}}', { status: 409 })
      }
      this.confirmCount += 1
      this.confirmedUploadRefs.push(parsed.upload_ref)
      return ok('{"asset_id":0,"status":"active"}')
    }
    if (path === `/api/v1/cs/organizations/${ORG}/transfer-targets`) return ok(TRANSFER_TARGETS_TEXT)
    // CS-WEB-01：真实 enterprise content 端点（imboy_router.erl:1803）：
    // GET /api/v1/enterprise/organizations/:org_id/assets/:id/content。
    // 成功 = 原始字节流（application/octet-stream，非信封）；错误 = HTTP 状态。
    const assetMatch = path.match(/^\/api\/v1\/enterprise\/organizations\/[^/]+\/assets\/([^/]+)\/content$/)
    if (assetMatch !== null) {
      this.assetContentFetchCount += 1
      const assetId = assetMatch[1] ?? ''
      const status = this.state.assetContentStatuses[assetId]
      if (status !== undefined) {
        return new Response(`{"code":${status},"msg":"asset content rejected","payload":{}}`, { status })
      }
      return new Response(ASSET_CONTENT_BYTES.slice(), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(ASSET_CONTENT_BYTES.length) },
      })
    }
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
