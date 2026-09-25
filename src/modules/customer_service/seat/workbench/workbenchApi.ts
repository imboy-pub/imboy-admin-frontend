/**
 * SEAT-02：坐席工作台 API client（复用 SEAT-01 SeatApiClient，不新增传输栈）。
 *
 * - 全部请求经 SeatApiClient：域 allowlist / credentials omit / Bearer vault /
 *   TSID 精度保护解析 / {code,msg,payload} 信封 / SeatApiError 分类（A01/A03 不变）；
 * - claim/transfer/close 是 CAS 写：expected_version 由调用方从权威事实取
 *   （列表行.version / detail.version）；409 → SeatApiError('conflict')，
 *   调用方（hooks）必须刷新真实状态后提示，失败方自动收敛（A01）；
 * - 发送幂等：client_msg_id 由调用方生成并在重试间复用，同 id 返回同一 message。
 */
import {
  buildAssetConfirmPath,
  buildAssetPresignPath,
  buildConversationMessagesPath,
  buildConversationSendPath,
  buildSeatQueuePath,
  buildSeatHeartbeatPath,
  buildSeatMyPresencePath,
  buildSeatSessionActionPath,
  buildSeatSessionContextPath,
  buildSeatSessionDetailPath,
  buildSeatSessionsPath,
  buildTransferTargetsPath,
  seatAssetContentPath,
  toSeatMessage,
  toSeatMessageList,
  toSeatPresence,
  toSeatPresignResult,
  toSeatSessionDetail,
  toSeatSessionPage,
  toSeatCustomerContext,
  toTransferTargetList,
  type SeatMessage,
  type SeatCustomerContext,
  type SeatPresence,
  type SeatReadState,
  type SeatPresignResult,
  type SeatSessionDetail,
  type SeatSessionPage,
  type SeatTransferTargetPage,
  toSeatReadState,
} from './contract'

export type {
  SeatPresence,
  SeatPresenceStatus,
  SeatReadState,
  SeatSessionCounts,
  SeatSessionPage,
} from './contract'
import type { SeatApiClient } from '../seatApiClient'
import type { EntityId, SeatContextsResult } from '../types'
import { fetchSeatContexts } from '../seatContexts'
import { isRecord } from '../tsid'

export type SeatPageQuery = {
  afterId?: EntityId | null
  limit?: number
  workspaceId?: EntityId | null
}

function pageQuery(query: SeatPageQuery): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof query.afterId === 'string' && query.afterId.length > 0) out.after_id = query.afterId
  if (typeof query.limit === 'number' && Number.isSafeInteger(query.limit) && query.limit > 0) {
    out.limit = String(query.limit)
  }
  if (typeof query.workspaceId === 'string' && query.workspaceId.length > 0) out.workspace_id = query.workspaceId
  return out
}

export type SeatWorkbenchApiOptions = {
  client: SeatApiClient
}

/** 列表页大小（键集分页；与后端 limit 白名单兼容的保守值）。 */
export const SEAT_SESSION_PAGE_LIMIT = 20
export const SEAT_MESSAGE_PAGE_LIMIT = 50

export class SeatWorkbenchApi {
  /** 底层 SeatApiClient（contexts 读取等复用；域门/凭证卫生不变）。 */
  readonly client: SeatApiClient

  constructor(options: SeatWorkbenchApiOptions) {
    this.client = options.client
  }

  /** 坐席上下文清单（登录后第一跳；A04 fail-closed 选路由 hooks 做）。 */
  async fetchContexts(): Promise<SeatContextsResult> {
    return fetchSeatContexts(this.client)
  }

  /** 队列视图（status 冻结 queued；键集分页 + 服务端计数）。 */
  async fetchQueue(orgId: EntityId, query: SeatPageQuery = {}): Promise<SeatSessionPage> {
    const payload = await this.client.request(buildSeatQueuePath(orgId), { query: pageQuery(query) })
    return toSeatSessionPage(payload)
  }

  /** active/closed 两视图（status 必填；queued 冻结在队列端点，此处禁传）。 */
  async fetchSessions(
    orgId: EntityId,
    status: 'active' | 'closed',
    query: SeatPageQuery = {},
  ): Promise<SeatSessionPage> {
    const payload = await this.client.request(buildSeatSessionsPath(orgId), {
      query: { status, ...pageQuery(query) },
    })
    return toSeatSessionPage(payload)
  }

  /**
   * 会话详情（权威事实源；版本/CAS 基准从这里来）。
   * DF-9：session_detail 的 workspace_id 是 handler 级必填（cs_http：缺失
   * 422 missing_workspace_id，不取默认值）——query 必带 workspace_id。
   */
  async fetchDetail(orgId: EntityId, sessionId: EntityId, workspaceId: EntityId): Promise<SeatSessionDetail> {
    const payload = await this.client.request(buildSeatSessionDetailPath(orgId, sessionId), {
      query: { workspace_id: workspaceId },
    })
    return toSeatSessionDetail(payload)
  }

  /**
   * 消息历史（DF-9R：query 必带 workspace_id + organization_id——cs_actions
   * conversation_messages org_source=param、workspace 门必填，缺失真实后端
   * 422；分页键集 after_id/limit；载荷=裸数组，兼容 {messages} 旧形）。
   */
  async fetchMessages(
    orgId: EntityId,
    conversationId: EntityId,
    workspaceId: EntityId,
    query: SeatPageQuery = {},
  ): Promise<SeatMessage[]> {
    const payload = await this.client.request(buildConversationMessagesPath(conversationId), {
      query: { workspace_id: workspaceId, organization_id: orgId, ...pageQuery(query) },
    })
    return toSeatMessageList(payload)
  }

  /**
   * 发送坐席消息（client_msg_id 幂等：重试复用同 id，同 id 返回同一 message）。
   * DF-9 对齐真实合同（eb_tenant_handler conversation_messages POST）：
   * - 路径必带 /organizations/:org 段（cs 段 /enterprise/conversations/:id/messages
   *   只登记 GET，POST 真实后端 405）；
   * - body = {body, client_msg_id, workspace_id, sender_type, identity_id}
   *   （workspace_id handler 级必填 422；sender_type 表内必填 422；
   *   identity_id 缺失真链 500 identity_required——取自坐席上下文本人身份）；
   * - 响应载荷 = {message:{...}}，解包后投影。
   * CS-WEB-02（附件消息）：`body` 可为空串——空正文 + `asset_ids`（TSID string
   * 数组）是合法附件消息；wire 上空正文省略 body 键（后端 body 由 asset_ids
   * 可选化）。正文与附件不能同时空由调用方（UI/useSeatSend）校验 + 服务端兜底。
   */
  async sendMessage(
    orgId: EntityId,
    conversationId: EntityId,
    input: {
      body: string
      clientMsgId: string
      workspaceId: EntityId
      identityId: EntityId
      assetIds?: readonly EntityId[]
    },
  ): Promise<SeatMessage> {
    const wire: Record<string, unknown> = {
      client_msg_id: input.clientMsgId,
      workspace_id: input.workspaceId,
      sender_type: 'business_identity',
      identity_id: input.identityId,
    }
    if (input.body.length > 0) wire.body = input.body
    const assetIds = input.assetIds ?? []
    if (assetIds.length > 0) wire.asset_ids = [...assetIds]
    const payload = await this.client.request(buildConversationSendPath(orgId, conversationId), {
      method: 'POST',
      body: wire,
    })
    // 真实载荷 {message:{...}}（agent-api.ts reply：envelope<{message:{id}}>）。
    const row = isRecord(payload) ? payload.message : null
    const message = toSeatMessage(row)
    if (message === null) throw new TypeError('seat send message payload invalid')
    return message
  }

  /**
   * CS-WEB-02：附件 presign（eb_tenant_handler presign → request_presign）。
   * 请求体冻结字段 {conversation_id, mime, size_bytes, object_hash, file_name?,
   * workspace_id}（object_hash = 64 位小写 hex SHA-256，PUT 后服务端复核；
   * file_name 可选 1..256 字节；workspace_id handler 级必填）。
   * mime/size/hash 的合法性由服务端裁决（422 语义透传，前端提示不替代）。
   */
  async requestAssetPresign(
    orgId: EntityId,
    conversationId: EntityId,
    workspaceId: EntityId,
    input: { mime: string; sizeBytes: number; objectHash: string; fileName?: string | null },
  ): Promise<SeatPresignResult> {
    const wire: Record<string, unknown> = {
      conversation_id: conversationId,
      mime: input.mime,
      size_bytes: input.sizeBytes,
      object_hash: input.objectHash,
      workspace_id: workspaceId,
    }
    if (typeof input.fileName === 'string' && input.fileName.length > 0) wire.file_name = input.fileName
    const payload = await this.client.request(buildAssetPresignPath(orgId), { method: 'POST', body: wire })
    return toSeatPresignResult(payload)
  }

  /**
   * CS-WEB-02：附件字节裸 PUT（presign 响应 upload.url；只带 Content-Type、
   * 无 Authorization/credentials——SeatApiClient.putUploadObject 通道）。
   */
  async uploadAssetBytes(uploadUrl: string, file: Blob, signal?: AbortSignal): Promise<void> {
    await this.client.putUploadObject(uploadUrl, file, { signal })
  }

  /**
   * CS-WEB-02：附件 confirm（eb_tenant_handler confirm_asset）：
   * POST {upload_ref, workspace_id}；服务端复核 hash/size/mime 后落库 active。
   * 重复 confirm 同 ref → 409（不伪成功，由调用方按失败处理换新 ref）。
   */
  async confirmAssetUpload(orgId: EntityId, workspaceId: EntityId, uploadRef: string): Promise<void> {
    await this.client.request(buildAssetConfirmPath(orgId), {
      method: 'POST',
      body: { upload_ref: uploadRef, workspace_id: workspaceId },
    })
  }

  /**
   * CAS 接单：expected_version 不匹配 → 409 conflict（调用方刷新真实状态）。
   * DF-9：workspace_id 是 handler 级必填（缺失真实后端 422 missing_workspace_id）。
   */
  async claim(orgId: EntityId, sessionId: EntityId, workspaceId: EntityId, expectedVersion: number): Promise<void> {
    await this.client.request(buildSeatSessionActionPath(orgId, sessionId, 'claim'), {
      method: 'POST',
      body: { workspace_id: workspaceId, expected_version: expectedVersion },
    })
  }

  /** CAS 转接（to_identity_id 来自 transfer-targets 投影；workspace_id 必填）。 */
  async transfer(
    orgId: EntityId,
    sessionId: EntityId,
    workspaceId: EntityId,
    input: { toIdentityId: EntityId; expectedVersion: number },
  ): Promise<void> {
    await this.client.request(buildSeatSessionActionPath(orgId, sessionId, 'transfer'), {
      method: 'POST',
      body: {
        to_identity_id: input.toIdentityId,
        expected_version: input.expectedVersion,
        workspace_id: workspaceId,
      },
    })
  }

  /** CAS 关闭（reason 可选；closed 视图随后由权威刷新收敛；workspace_id 必填）。 */
  async close(
    orgId: EntityId,
    sessionId: EntityId,
    workspaceId: EntityId,
    input: { expectedVersion: number; reason?: string },
  ): Promise<void> {
    const body: Record<string, unknown> = { expected_version: input.expectedVersion, workspace_id: workspaceId }
    if (typeof input.reason === 'string' && input.reason.length > 0) body.reason = input.reason
    await this.client.request(buildSeatSessionActionPath(orgId, sessionId, 'close'), {
      method: 'POST',
      body,
    })
  }

  /** 转接目标最小投影（同 Org 其他可用坐席；排除本人由服务端裁决）。 */
  async fetchTransferTargets(orgId: EntityId, query: SeatPageQuery = {}): Promise<SeatTransferTargetPage> {
    const payload = await this.client.request(buildTransferTargetsPath(orgId), { query: pageQuery(query) })
    return toTransferTargetList(payload)
  }

  /**
   * CS-WEB-01：附件内容字节（后端真实合同，imboy_router.erl:1803：
   * GET /api/v1/enterprise/organizations/:org_id/assets/:id/content →
   * eb_tenant_handler#asset_content；Seat JWT 认证域 + asset.read）。
   * 成功 = 原始字节流 Blob（非 {code,msg,payload} 信封）；失败按 HTTP
   * 状态/信封 code 分类（401/403/404…）。调用方负责 ObjectURL 生命周期。
   */
  async fetchAssetContent(orgId: EntityId, assetId: EntityId, signal?: AbortSignal): Promise<Blob> {
    return this.client.requestBlob(seatAssetContentPath(orgId, assetId), { signal })
  }

  /**
   * CS-WEB-04：客户上下文只读投影（CS-BE-03 端点，conversation.read 门）。
   * 授权由服务端裁决（session ownership 复核：转接后原 Seat 403 not_session_owner、
   * 撤权 403 seat_disabled、跨 Org 404）——本层不猜、不缓存跨会话事实；
   * signal 透传给传输层，切换会话时旧请求可被取消（stale 防护第二层）。
   */
  async fetchCustomerContext(
    orgId: EntityId,
    sessionId: EntityId,
    options: { signal?: AbortSignal } = {},
  ): Promise<SeatCustomerContext> {
    const payload = await this.client.request(buildSeatSessionContextPath(orgId, sessionId), {
      signal: options.signal,
    })
    return toSeatCustomerContext(payload)
  }

  /**
   * CS-WEB-05：presence 心跳（POST；at 是服务端派生时钟，客户端不可报时）。
   * 调用时机由 hooks 门控（页面可见 + navigator.onLine）——断网/隐藏不发，
   * 不得替用户谎报 online；失败原样上抛（展示侧降级，不本地造状态）。
   */
  async heartbeat(orgId: EntityId): Promise<SeatPresence> {
    const payload = await this.client.request(buildSeatHeartbeatPath(orgId), {
      method: 'POST',
    })
    return toSeatPresence(payload)
  }

  /** CS-WEB-05：自身运行态视图（GET；降级展示的数据源，不发心跳）。 */
  async fetchMyPresence(orgId: EntityId): Promise<SeatPresence> {
    const payload = await this.client.request(buildSeatMyPresencePath(orgId))
    return toSeatPresence(payload)
  }

  /**
   * CS-WEB-05：手动状态 set/clear（PUT；manual_status 缺省 = clear 回自动）。
   * manual away 优先于自动派生（CS-DEC-02），clear 后回到心跳/负载派生。
   */
  async setManualStatus(
    orgId: EntityId,
    manualStatus: 'away' | null,
  ): Promise<SeatPresence> {
    const body =
      manualStatus === 'away'
        ? { manual_status: 'away' }
        : {}
    const payload = await this.client.request(buildSeatMyPresencePath(orgId), {
      method: 'PUT',
      body,
    })
    return toSeatPresence(payload)
  }

  /** CS-BE-04：会话读状态（游标 + 未读数；未读 badge 数据源）。 */
  async fetchReadState(orgId: EntityId, sessionId: EntityId): Promise<SeatReadState> {
    const payload = await this.client.request(
      buildSeatSessionActionPath(orgId, sessionId, 'read-cursor'),
    )
    return toSeatReadState(payload)
  }

  /**
   * CS-WEB-05：ACK（POST last_read_message_id；服务端单调 upsert——重复/
   * 乱序后到的旧值是零行 no-op，前端多标签页并发 ACK 不会倒退游标）。
   */
  async ackRead(orgId: EntityId, sessionId: EntityId, lastReadMessageId: EntityId): Promise<void> {
    await this.client.request(buildSeatSessionActionPath(orgId, sessionId, 'read-cursor'), {
      method: 'POST',
      body: { last_read_message_id: lastReadMessageId },
    })
  }
}
