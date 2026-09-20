/**
 * SEAT-02：坐席工作台合同层（wire 形状 ↔ 强类型投影 + 路径构造器）。
 *
 * 合同真源（后端 cs_actions 冻结动作表 / §3.6 SSE / §3.7 Attachment）：
 * - GET  /api/v1/cs/organizations/:org_id/sessions/queue            队列视图（queued 冻结）
 * - GET  /api/v1/cs/organizations/:org_id/seats/sessions?status=    active/closed 两视图
 *   响应 {sessions:[seat_session_view], total, total_by_status, next_after_id}
 *   ——分页计数是服务端事实，客户端禁止本地推断；
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/claim        {expected_version} CAS
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/transfer     {to_identity_id, expected_version}
 * - POST /api/v1/cs/organizations/:org_id/sessions/:id/close        {expected_version, reason?}
 * - GET  /api/v1/cs/organizations/:org_id/sessions/:id              detail（权威事实源）
 * - GET  /api/v1/enterprise/conversations/:conv_id/messages         历史（键集 after_id/limit）
 *   响应载荷 = 裸数组（eb list_messages_after → {ok, [map()]}；兼容 {messages} 旧形）
 * - POST /api/v1/enterprise/conversations/:conv_id/messages         {body, client_msg_id}
 *   ——client_msg_id 幂等：同 id 重试返回同一 message；
 *   （该路径族 auth_context=cs_seat + conversation.read/write，属 Seat 域合同面；
 *   SeatApiClient 域 allowlist 已按前缀精确放行，A01 的 /api/adm 拒绝不变。）
 * - GET  /api/v1/cs/organizations/:org_id/transfer-targets          {targets, next_after_id}
 * - 附件只经 content 代理路径展示；全链不出现 object key / upload URL / JWT。
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
  preview: string | null
  at: string | null
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
  queuedAt: string | null
  claimedAt: string | null
  closedAt: string | null
  source: string
  contactMaskedName: string | null
  lastMessage: SeatLastMessage
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

export type SeatTransferTargetPage = {
  targets: SeatTransferTarget[]
  nextAfterId: EntityId | null
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
    size: optInt(raw.size),
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
  if (!isRecord(raw)) return { id: null, preview: null, at: null }
  return {
    id: optTsid(raw.id),
    preview: optStr(raw.preview),
    at: optStr(raw.at),
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
    queuedAt: optStr(raw.queued_at),
    claimedAt: optStr(raw.claimed_at),
    closedAt: optStr(raw.closed_at),
    source: optStr(raw.source) ?? 'shop_key',
    contactMaskedName: optStr(contact.masked_name),
    lastMessage: toLastMessage(raw.last_message),
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
  action: 'claim' | 'transfer' | 'close',
): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}/${action}`
}

export function buildSeatSessionDetailPath(orgId: EntityId, sessionId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(sessionId)}`
}

/** 会话历史/发送路径族（合同：/api/v1/enterprise/conversations/:conv_id/messages；org 由 seat 事实派生）。 */
export function buildConversationMessagesPath(conversationId: EntityId): string {
  return `/enterprise/conversations/${encodeURIComponent(conversationId)}/messages`
}

export function buildTransferTargetsPath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/transfer-targets`
}

/**
 * A03：附件只经 content 代理路径展示（同源 Seat 域，鉴权由服务端链裁决）。
 * 唯一的附件 href 生成点（浏览器导航用，带 /api/v1 前缀）；绝不拼
 * object key / upload URL / 任何 token。
 */
export const SEAT_ASSET_CONTENT_PATH_TEMPLATE = '/api/v1/cs/organizations/:org_id/sessions/:session_id/assets/:asset_id/content'

export function seatAssetContentPath(orgId: EntityId, sessionId: EntityId, assetId: EntityId): string {
  return (
    `/api/v1/cs/organizations/${encodeURIComponent(orgId)}` +
    `/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}/content`
  )
}
