/**
 * SEAT-02：坐席工作台合同层（wire 形状 ↔ 强类型投影 + 路径构造器）。
 *
 * 合同真源（后端 cs_actions 冻结动作表 / §3.6 SSE / §3.7 Attachment）：
 * - GET  /api/v1/cs/organizations/:org_id/sessions/queue            队列视图（queued 冻结）
 * - GET  /api/v1/cs/organizations/:org_id/seats/sessions?status=    active/closed 两视图
 *   响应 {sessions:[seat_session_view], total, total_by_status, next_after_id}
 *   ——分页计数是服务端事实，客户端禁止本地推断；
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/claim        {workspace_id, expected_version} CAS
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/transfer     {to_identity_id, expected_version, workspace_id}
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/close        {expected_version, workspace_id, reason?}
 *   （DF-9：workspace_id 是 cs_http handler 级必填——缺失 422 missing_workspace_id；
 *   值来自坐席上下文 scope，不取默认值）
 * - GET  /api/v1/cs/organizations/:org_id/sessions/:id?workspace_id=  detail（权威事实源；query 必带 workspace_id）
 * - GET  /api/v1/enterprise/conversations/:conv_id/messages         历史（键集 after_id/limit）
 *   响应载荷 = 裸数组（eb list_messages_after → {ok, [map()]}；兼容 {messages} 旧形）
 * - POST /api/v1/enterprise/organizations/:org_id/conversations/:conv_id/messages
 *   {body, client_msg_id, workspace_id, sender_type:'business_identity', identity_id}
 *   响应载荷 = {message:{...}}（DF-9：坐席发送走企业真源写路径，带 /organizations/:org 段；
 *   cs 段 /enterprise/conversations/:conv_id/messages 仅登记 GET——POST 真实后端 405；
 *   workspace_id 为 handler 级必填——缺失 422 missing_workspace_id）
 *   ——client_msg_id 幂等：同 id 重试返回同一 message；
 *   （该路径族 auth_context=cs_seat/enterprise_member + conversation.read/write，
 *   属 Seat 域合同面；SeatApiClient 域 allowlist 已按前缀精确放行，
 *   A01 的 /api/adm 拒绝不变。）
 * - GET  /api/v1/cs/organizations/:org_id/transfer-targets          {targets, next_after_id}
 * - 附件字节只经真实 enterprise content 端点 + Seat Bearer fetch 获取
 *   （CS-WEB-01；见 SEAT_ASSET_CONTENT_PATH_TEMPLATE）；全链不出现
 *   object key / upload URL / JWT。
 */
import { isRecord, nonEmptyString, toEntityId } from '../tsid'
import type { EntityId } from '../types'

export const SEAT_SESSION_STATUSES = ['queued', 'active', 'closed'] as const
export type SeatSessionStatus = (typeof SEAT_SESSION_STATUSES)[number]

/** §3.7 附件阶段（seat 只读视角；deleted 含过期清理占位）。 */
export const SEAT_ATTACHMENT_PHASES = ['pending_confirm', 'active', 'deleted'] as const
export type SeatAttachmentPhase = (typeof SEAT_ATTACHMENT_PHASES)[number]

export type SeatAttachment = {
  assetId: EntityId
  phase: SeatAttachmentPhase
  mime: string | null
  size: number | null
  fileName: string | null
}

export type SeatMessage = {
  id: EntityId
  senderType: string
  senderContactId: EntityId | null
  senderIdentityId: EntityId | null
  clientMsgId: string | null
  body: string | null
  createdAt: string | null
  /** ACK：权威刷新投影的已读时刻（存在即已读）；SSE payload 不是真源。 */
  readAt: string | null
  attachments: SeatAttachment[]
}

export type SeatLastMessage = {
  id: EntityId | null
  /** CS-WEB-03 键名对齐（CSX-01 修正）：wire 键是 sender_type / created_at /
   *  preview（cs_session_app:last_message_with 冻结键集）——旧 parser 读
   *  `at` 属键名错位，恒 null。created_at 是 epoch 秒（PG bigint wire）。 */
  senderType: string | null
  preview: string | null
  createdAt: number | null
}

export type SeatSessionSummary = {
  id: EntityId
  organizationId: EntityId
  workspaceId: EntityId | null
  contactId: EntityId | null
  conversationId: EntityId | null
  businessIdentityId: EntityId | null
  status: SeatSessionStatus
  /** CAS 版本（claim/transfer/close 的 expected_version）。 */
  version: number
  /** 时间字段是 epoch 秒（cs_pg_session extract(epoch)::bigint wire）。 */
  queuedAt: number | null
  claimedAt: number | null
  closedAt: number | null
  source: string
  contactMaskedName: string | null
  lastMessage: SeatLastMessage
  /**
   * CS-WEB-03：服务端权威等待时长（秒）——仅 queued 视图行出键
   * （max(0, at − queued_at)；active/closed 恒缺键 → null）。客户端直渲染，
   * 绝不做本地时钟计算（负值防御在渲染层 max(0)）。
   */
  waitingSeconds: number | null
}

/** 服务端计数（禁本地推断）：total_by_status 是三视图 Tab 的唯一数字来源。 */
export type SeatSessionCounts = {
  queued: number
  active: number
  closed: number
}

export type SeatSessionPage = {
  sessions: SeatSessionSummary[]
  total: number
  counts: SeatSessionCounts
  /** 满页时为尾行游标（键集 after_id）；不足一页为 null。 */
  nextAfterId: EntityId | null
}

export type SeatSessionDetail = SeatSessionSummary & {
  /** 访客最小资料：只有掩码名/来源，无 PII（合同：contact.masked_name）。 */
  visitorMaskedName: string | null
  visitorSource: string
}

export type SeatTransferTarget = {
  identityId: EntityId
  displayName: string
  available: boolean
}

/**
 * CS-WEB-02：附件 presign 结果（eb_asset_app:presign_view 投影；坐席走
 * eb_tenant_handler presign → request_presign，职能白名单 sales|customer_service）。
 * - `upload_ref`：confirm 的不透明凭证（token 双投 presign_view 顶层与 upload.token，
 *   客户端只消费顶层）；
 * - `uploadUrl` = `upload.url`（BE-PATCH-01 widget 同款键）：裸 PUT 目标。
 *   部署未开放对象 PUT（upload 块无 url）→ null，上传编排必须 fail-closed
 *   （绝不自造端点、绝不落对象 key）。
 */
export type SeatPresignResult = {
  assetId: EntityId
  uploadRef: string
  uploadUrl: string | null
  expiresAt: number | null
}

export type SeatTransferTargetPage = {
  targets: SeatTransferTarget[]
  nextAfterId: EntityId | null
}

/**
 * CS-WEB-04：客户上下文（后端 CS-BE-03 / CS-DEC-01 冻结白名单投影）。
 * GET /api/v1/cs/organizations/:org_id/sessions/:id/context（Seat Bearer +
 * conversation.read；读操作零写副作用）。
 * 白名单**仅限**：掩码名 / first_seen / last_seen / 来源 / 同 Org 历史会话页 /
 * 授权备注事实行（零正文零密文）——电话/邮箱/原始外部身份/密文/凭证/object key
 * 永不出现在本投影，前端解析器同口径丢弃未知键（双层白名单）。
 * 时间字段均为 epoch 秒（后端 extract(epoch)::bigint wire）。
 */
export type SeatCustomerContextContact = {
  maskedName: string | null
  firstSeen: number | null
  lastSeen: number | null
}

export type SeatCustomerHistorySession = {
  id: EntityId
  conversationId: EntityId | null
  workspaceId: EntityId | null
  status: SeatSessionStatus | null
  version: number | null
  rating: number | null
  queuedAt: number | null
  claimedAt: number | null
  closedAt: number | null
}

export type SeatCustomerNote = {
  id: EntityId
  businessIdentityId: EntityId | null
  createdAt: number | null
}

export type SeatCustomerContext = {
  sessionId: EntityId
  workspaceId: EntityId | null
  source: string
  contact: SeatCustomerContextContact
  history: {
    sessions: SeatCustomerHistorySession[]
    nextAfterId: EntityId | null
  }
  notes: SeatCustomerNote[]
}

/** 历史会话行投影（键集 {id,conversation_id,workspace_id,status,version,rating,queued_at,claimed_at,closed_at}）。 */
function toCustomerHistorySession(raw: unknown): SeatCustomerHistorySession | null {
  if (!isRecord(raw)) return null
  const id = toEntityId(raw.id)
  if (id === null) return null
  return {
    id,
    conversationId: optTsid(raw.conversation_id),
    workspaceId: optTsid(raw.workspace_id),
    status: toStatus(raw.status),
    version: optInt(raw.version),
    rating: optInt(raw.rating),
    queuedAt: optInt(raw.queued_at),
    claimedAt: optInt(raw.claimed_at),
    closedAt: optInt(raw.closed_at),
  }
}

/**
 * 客户上下文投影（fail-closed）：session_id 形状非法即 throw（上游按错误处理）；
 * contact/history/notes 形状非法收敛为空值而非猜测；未知键一律丢弃——
 * 后端白名单外的字段即使出现（不该发生）也绝不进前端渲染面。
 */
export function toSeatCustomerContext(raw: unknown): SeatCustomerContext {
  if (!isRecord(raw)) throw new TypeError('seat customer context shape invalid')
  const sessionId = toEntityId(raw.session_id)
  if (sessionId === null) throw new TypeError('seat customer context session_id invalid')
  const contactRaw = isRecord(raw.contact) ? raw.contact : {}
  const historyRaw = isRecord(raw.history) ? raw.history : {}
  const historySessions = Array.isArray(historyRaw.sessions)
    ? historyRaw.sessions.map(toCustomerHistorySession).filter((s): s is SeatCustomerHistorySession => s !== null)
    : []
  const notes = Array.isArray(raw.notes)
    ? raw.notes.map((noteRaw: unknown): SeatCustomerNote | null => {
        if (!isRecord(noteRaw)) return null
        const noteId = toEntityId(noteRaw.id)
        if (noteId === null) return null
        return {
          id: noteId,
          businessIdentityId: optTsid(noteRaw.business_identity_id),
          createdAt: optInt(noteRaw.created_at),
        }
      }).filter((n): n is SeatCustomerNote => n !== null)
    : []
  return {
    sessionId,
    workspaceId: optTsid(raw.workspace_id),
    source: optStr(raw.source) ?? 'shop_key',
    contact: {
      maskedName: optStr(contactRaw.masked_name),
      firstSeen: optInt(contactRaw.first_seen),
      lastSeen: optInt(contactRaw.last_seen),
    },
    history: { sessions: historySessions, nextAfterId: optTsid(historyRaw.next_after_id) },
    notes,
  }
}

const SESSION_STATUS_LITERALS: readonly string[] = SEAT_SESSION_STATUSES

function toStatus(value: unknown): SeatSessionStatus | null {
  if (typeof value !== 'string') return null
  return SESSION_STATUS_LITERALS.includes(value) ? (value as SeatSessionStatus) : null
}

function optTsid(value: unknown): EntityId | null {
  return typeof value === 'string' && toEntityId(value) !== null ? toEntityId(value) : null
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

/** §3.7 阶段映射：白名单外（含 absent/upload_ref 协议态）一律按未就绪处理。 */
export function toSeatAttachmentPhase(value: unknown): SeatAttachmentPhase {
  if (typeof value !== 'string') return 'pending_confirm'
  if (value === 'active') return 'active'
  if (value === 'deleted' || value === 'expired') return 'deleted'
  return 'pending_confirm'
}

function toAttachment(raw: unknown): SeatAttachment | null {
  if (!isRecord(raw)) return null
  const assetId = toEntityId(raw.asset_id ?? raw.id)
  if (assetId === null) return null
  return {
    assetId,
    phase: toSeatAttachmentPhase(raw.status),
    mime: optStr(raw.mime),
    // CS-WEB-01 键名对齐：后端冻结投影键是 size_bytes（CSX-01 断链——旧读
    // size 永远 null；不保留 size 回退，防错位键继续被消费）。
    size: optInt(raw.size_bytes),
    fileName: optStr(raw.file_name),
  }
}

function toAttachments(value: unknown): SeatAttachment[] {
  if (!Array.isArray(value)) return []
  return value.map(toAttachment).filter((a): a is SeatAttachment => a !== null)
}

/** 消息行投影（与 widget 侧同源 wire 形状；附加 assets/read_at 投影）。 */
export function toSeatMessage(raw: unknown): SeatMessage | null {
  if (!isRecord(raw)) return null
  const id = toEntityId(raw.id)
  if (id === null || !nonEmptyString(raw.sender_type)) return null
  return {
    id,
    senderType: raw.sender_type,
    senderContactId: optTsid(raw.sender_contact_id),
    senderIdentityId: optTsid(raw.sender_identity_id),
    clientMsgId: optStr(raw.client_msg_id),
    body: optStr(raw.body),
    createdAt: optStr(raw.created_at),
    readAt: optStr(raw.read_at),
    attachments: toAttachments(raw.assets ?? raw.attachments),
  }
}

/** 历史载荷 = 裸数组（eb list_messages_after → {ok, [map()]}；兼容 {messages} 旧形）。 */
export function toSeatMessageList(raw: unknown): SeatMessage[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.messages) ? raw.messages : []
  return list.map(toSeatMessage).filter((m): m is SeatMessage => m !== null)
}

function toLastMessage(raw: unknown): SeatLastMessage {
  if (!isRecord(raw)) return { id: null, senderType: null, preview: null, createdAt: null }
  return {
    id: optTsid(raw.id),
    senderType: optStr(raw.sender_type),
    preview: optStr(raw.preview),
    createdAt: optInt(raw.created_at),
  }
}

/** seat_session_view 行投影（字段白名单；未知键丢弃，形状非法 null）。 */
export function toSeatSessionSummary(raw: unknown): SeatSessionSummary | null {
  if (!isRecord(raw)) return null
  const id = toEntityId(raw.id)
  const status = toStatus(raw.status)
  const organizationId = toEntityId(raw.organization_id)
  const version = raw.version
  if (id === null || status === null || organizationId === null) return null
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) return null
  const contact = isRecord(raw.contact) ? raw.contact : {}
  return {
    id,
    organizationId,
    workspaceId: optTsid(raw.workspace_id),
    contactId: optTsid(raw.contact_id),
    conversationId: optTsid(raw.conversation_id),
    businessIdentityId: optTsid(raw.business_identity_id),
    status,
    version,
    queuedAt: optInt(raw.queued_at),
    claimedAt: optInt(raw.claimed_at),
    closedAt: optInt(raw.closed_at),
    source: optStr(raw.source) ?? 'shop_key',
    contactMaskedName: optStr(contact.masked_name),
    lastMessage: toLastMessage(raw.last_message),
    waitingSeconds: optInt(raw.waiting_seconds),
  }
}

function toCounts(raw: unknown): SeatSessionCounts {
  if (!isRecord(raw)) throw new TypeError('total_by_status missing')
  const queued = raw.queued
  const active = raw.active
  const closed = raw.closed
  if (
    typeof queued !== 'number' ||
    typeof active !== 'number' ||
    typeof closed !== 'number' ||
    !Number.isSafeInteger(queued) ||
    !Number.isSafeInteger(active) ||
    !Number.isSafeInteger(closed)
  ) {
    throw new TypeError('total_by_status shape invalid')
  }
  return { queued, active, closed }
}

/** 会话页投影：{sessions,total,total_by_status,next_after_id}（计数服务端事实）。 */
export function toSeatSessionPage(raw: unknown): SeatSessionPage {
  if (!isRecord(raw) || !Array.isArray(raw.sessions)) {
    throw new TypeError('seat session page shape invalid')
  }
  const total = raw.total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('seat session page total invalid')
  }
  const sessions = raw.sessions.map(toSeatSessionSummary).filter((s): s is SeatSessionSummary => s !== null)
  return {
    sessions,
    total,
    counts: toCounts(raw.total_by_status),
    nextAfterId: optTsid(raw.next_after_id),
  }
}

/** detail 投影 = summary 字段 + 访客最小资料（掩码名/来源，无 PII）。 */
export function toSeatSessionDetail(raw: unknown): SeatSessionDetail {
  const base = toSeatSessionSummary(raw)
  if (base === null || !isRecord(raw)) throw new TypeError('seat session detail shape invalid')
  const contact = isRecord(raw.contact) ? raw.contact : {}
  return {
    ...base,
    visitorMaskedName: base.contactMaskedName ?? optStr(contact.display_name),
    visitorSource: optStr(raw.source) ?? 'shop_key',
  }
}

/** transfer-targets 页投影（{targets, next_after_id}；排除本人由服务端裁决）。 */
export function toTransferTargetList(raw: unknown): SeatTransferTargetPage {
  if (!isRecord(raw) || !Array.isArray(raw.targets)) {
    throw new TypeError('transfer targets shape invalid')
  }
  const targets: SeatTransferTarget[] = []
  for (const row of raw.targets) {
    if (!isRecord(row)) continue
    const identityId = toEntityId(row.business_identity_id)
    if (identityId === null || !nonEmptyString(row.display_name)) continue
    targets.push({ identityId, displayName: row.display_name, available: row.available === true })
  }
  return { targets, nextAfterId: optTsid(raw.next_after_id) }
}

// ---------------------------------------------------------------------------
// 路径构造器（相对 SEAT_API_BASE；全部落 Seat 域，经 SeatApiClient 域门复核）。
// ---------------------------------------------------------------------------

export function buildSeatQueuePath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/queue`
}

export function buildSeatSessionsPath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/seats/sessions`
}

export function buildSeatSessionActionPath(
  orgId: EntityId,
  sessionId: EntityId,
  action: 'claim' | 'transfer' | 'close' | 'read-cursor',
): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/${action}`
}

export function buildSeatSessionDetailPath(orgId: EntityId, sessionId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}`
}

/**
 * CS-WEB-04：客户上下文路径（CS-BE-03 落地：imboy_router.erl session_customer_context，
 * cs_seat + conversation.read；5 段路径与 4 段 detail 不冲突）。
 */
export function buildSeatSessionContextPath(orgId: EntityId, sessionId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/context`
}

/** 会话历史/发送路径族（合同：/api/v1/enterprise/conversations/:conv_id/messages；org 由 seat 事实派生）。 */
export function buildConversationMessagesPath(conversationId: EntityId): string {
  return `/enterprise/conversations/${encodeURIComponent(conversationId)}/messages`
}

/**
 * DF-9：坐席发送消息走企业真源写路径（eb_tenant_handler conversation_messages
 * POST append_message；cs 段 /enterprise/conversations/:conv/messages 只登记
 * GET list_messages——POST 该路径真实后端 405）。路径必带 /organizations/:org 段。
 * 实调形状（e2e agent-api.ts reply，9802 真链实测）：
 * POST {body, client_msg_id, workspace_id, sender_type:'business_identity', identity_id}。
 */
export function buildConversationSendPath(orgId: EntityId, conversationId: EntityId): string {
  return `/enterprise/organizations/${encodeURIComponent(orgId)}/conversations/${encodeURIComponent(conversationId)}/messages`
}

export function buildTransferTargetsPath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/transfer-targets`
}

/**
 * CS-WEB-01：后端真实合同（imboy_router.erl:1803，eb_tenant_handler#asset_content）：
 * GET /api/v1/enterprise/organizations/:org_id/assets/:id/content
 * （Seat JWT 认证域 + asset.read；成功 = 原始字节流，非 {code,msg,payload} 信封）。
 * 旧虚构路由 /cs/organizations/:org/sessions/:sid/assets/:aid/content 后端不存在
 * （必 404），已删除——附件字节只经 SeatApiClient.requestBlob（Bearer header +
 * credentials omit），绝不构造裸导航 href。
 */
export const SEAT_ASSET_CONTENT_PATH_TEMPLATE = '/api/v1/enterprise/organizations/:org_id/assets/:id/content'

/** 相对 SEAT_API_BASE 的内容路径（落在 /api/v1/enterprise/organizations/ 前缀，Seat 域门放行）。 */
export function seatAssetContentPath(orgId: EntityId, assetId: EntityId): string {
  return `/enterprise/organizations/${encodeURIComponent(orgId)}/assets/${encodeURIComponent(assetId)}/content`
}

/**
 * CS-WEB-02：presign 结果投影（fail-closed）：asset_id/upload_ref 形状非法
 * 即 throw（上游按错误处理，不猜）；`upload.url` 缺失 → uploadUrl=null
 * （部署未开放对象 PUT——由上传编排终止，不在此抛）。
 */
export function toSeatPresignResult(raw: unknown): SeatPresignResult {
  if (!isRecord(raw)) throw new TypeError('seat presign payload shape invalid')
  const assetId = toEntityId(raw.asset_id)
  if (assetId === null) throw new TypeError('seat presign asset_id invalid')
  if (!nonEmptyString(raw.upload_ref)) throw new TypeError('seat presign upload_ref invalid')
  const upload = isRecord(raw.upload) ? raw.upload : {}
  return {
    assetId,
    uploadRef: raw.upload_ref,
    uploadUrl: optStr(upload.url),
    expiresAt: optInt(upload.expires_at),
  }
}

/**
 * CS-WEB-02：附件上传三动作路径（imboy_router.erl:1790/1796，eb_tenant_handler
 * presign / confirm_asset；Seat JWT 认证域 + asset.write，职能 sales|customer_service）。
 */
export function buildAssetPresignPath(orgId: EntityId): string {
  return `/enterprise/organizations/${encodeURIComponent(orgId)}/assets/presign`
}

export function buildAssetConfirmPath(orgId: EntityId): string {
  return `/enterprise/organizations/${encodeURIComponent(orgId)}/assets/confirm`
}

/**
 * CS-WEB-05（CS-DEC-02）：坐席 presence 运行态（服务端派生值，前端只读展示 +
 * 手动 away 覆盖）。状态集合冻结：online / away / busy / offline。
 */
export type SeatPresenceStatus = 'online' | 'away' | 'busy' | 'offline'

const PRESENCE_STATUSES: readonly SeatPresenceStatus[] = [
  'online',
  'away',
  'busy',
  'offline',
]

export type SeatPresence = {
  status: SeatPresenceStatus
  /** 最近一次心跳的服务端时钟（epoch 秒）；null = 从未上报。 */
  lastHeartbeatAt: number | null
  /** 手动覆盖（当前冻结枚举仅 away）；null = 无手动覆盖。 */
  manualStatus: 'away' | null
  enabled: boolean
  maxConcurrent: number
  activeCount: number
}

/** CS-WEB-05：presence 视图 fail-closed 投影（形状非法即 throw，不猜）。 */
export function toSeatPresence(raw: unknown): SeatPresence {
  if (!isRecord(raw)) throw new TypeError('seat presence shape invalid')
  const status = PRESENCE_STATUSES.find((candidate) => candidate === raw.status)
  if (status === undefined) {
    throw new TypeError('seat presence status invalid')
  }
  const enabled = raw.enabled
  const maxConcurrent = optInt(raw.max_concurrent)
  const activeCount = optInt(raw.active_count)
  if (
    typeof enabled !== 'boolean' ||
    maxConcurrent === null ||
    maxConcurrent < 0 ||
    activeCount === null ||
    activeCount < 0
  ) {
    throw new TypeError('seat presence capacity fields invalid')
  }
  const manual = raw.manual_status
  return {
    status,
    lastHeartbeatAt: optInt(raw.last_heartbeat_at),
    manualStatus: manual === 'away' ? 'away' : null,
    enabled,
    maxConcurrent,
    activeCount,
  }
}

/** CS-BE-04：会话读状态（游标 + 未读数；未读 badge 数据源）。 */
export type SeatReadState = {
  sessionId: EntityId
  lastReadMessageId: EntityId
  unreadCount: number
}

/** CS-WEB-05：read_state fail-closed 投影。 */
export function toSeatReadState(raw: unknown): SeatReadState {
  if (!isRecord(raw)) throw new TypeError('seat read state shape invalid')
  const sessionId = toEntityId(raw.session_id)
  const lastReadMessageId = toEntityId(raw.last_read_message_id)
  const unreadCount = raw.unread_count
  if (sessionId === null || lastReadMessageId === null || typeof unreadCount !== 'number') {
    throw new TypeError('seat read state fields invalid')
  }
  return { sessionId, lastReadMessageId, unreadCount }
}

/** CS-BE-05：presence 心跳（POST；返回派生运行态）。 */
export function buildSeatHeartbeatPath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/seats/me/heartbeat`
}

/** CS-BE-05：手动状态 set/clear（PUT）与自身运行态视图（GET）同路径。 */
export function buildSeatMyPresencePath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/seats/me/presence`
}
