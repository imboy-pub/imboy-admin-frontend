/**
 * CSW-01R：Widget 后端合同（冻结形状）——类型 + fail-closed 出入站投影。
 *
 * 合同真源（**后端源码为准**，A6/CSX-01 实测校准）：
 * - `cs_actions.erl` table(widget)：每条路由参数表（org_source=param →
 *   `organization_id` 是每条请求的必填申报参数，POST 走正文 / GET 走查询串）；
 * - `cs_widget_handler.erl`：服务端派生键（at/origin/secret/contact_id/workspace_id
 *   等）客户端提供即 400；凭证只走 `x-cs-visit-token` 头（查询串出现即 400）；
 * - `cs_widget_app:bootstrap_view/1`、`cs_widget_session_app`（create_session /
 *   visitor_session_view / rate）与 `eb_pg_store_sql:message_fields/0`：响应投影。
 *
 * 出站编码（cs_http:encode_entity）：`id`/`*_id` 整数一律转 string；version/rating/
 * expires_at 保持 number；时间戳为 RFC3339 字符串。
 *
 * 桩=E2E 替身声明：真实后端联调由 CSX-01 复验（D1 修复对齐后重跑）。
 */

export const WIDGET_API_BASE = '/api/v1/cs/widget'

/** 请求级申报租户（PUBLIC 路由提示，服务端仍以令牌/allowlist 证明）。 */
export type RequestScope = {
  organizationId: string
  installationId: string
}

export type WidgetBrand = {
  displayName: string
  primaryColor: string | null
  welcomeText: string | null
}

/** bootstrap 响应（bootstrap_view/1 白名单；secret=visit token 只此一次）。 */
export type BootstrapResult = {
  installationId: string
  publicWidgetId: string
  displayName: string
  consentVersion: string
  branding: WidgetBrand
  contactId: string
  visitToken: string
  reused: boolean
}

export type WidgetSessionStatus = 'queued' | 'active' | 'closed'

export type WidgetSession = {
  id: string
  status: WidgetSessionStatus | string
  /** 评分 CAS 用（list_sessions 视图携带；create_session 无此键） */
  version: number | null
}

/** 历史行（message_fields/0；读面是 body_cipher——D5 读面解密为后端缺口）。 */
export type WidgetMessage = {
  id: string
  senderType: 'contact' | 'business_identity' | string
  senderContactId: string | null
  clientMsgId: string | null
  body: string | null
  createdAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

/** 品牌投影只取后端白名单键（primary_color/logo_url/welcome_text/display_name）。 */
export function toBrand(raw: unknown): WidgetBrand {
  const empty = { displayName: '在线客服', primaryColor: null, welcomeText: null }
  if (!isRecord(raw)) return empty
  const color = typeof raw.primary_color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.primary_color) ? raw.primary_color : null
  const name = str(raw.display_name).trim()
  const welcome = str(raw.welcome_text).trim()
  return {
    displayName: name.length > 0 ? name : '在线客服',
    primaryColor: color,
    welcomeText: welcome.length > 0 ? welcome : null,
  }
}

/** bootstrap 响应投影：缺 installation_id/secret/contact_id 一律 fail-closed。 */
export function toBootstrapResult(raw: unknown): BootstrapResult | null {
  if (!isRecord(raw)) return null
  const installationId = str(raw.installation_id)
  const visitToken = str(raw.secret)
  const contactId = str(raw.contact_id)
  if (installationId.length === 0 || visitToken.length === 0 || contactId.length === 0) return null
  return {
    installationId,
    publicWidgetId: str(raw.public_widget_id),
    displayName: str(raw.display_name),
    consentVersion: str(raw.consent_version),
    branding: toBrand(raw.branding),
    contactId,
    visitToken,
    reused: raw.reused === true,
  }
}

/** create_session 响应投影（session_id 承载会话标识）。 */
export function toCreatedSession(raw: unknown): WidgetSession | null {
  if (!isRecord(raw)) return null
  const id = str(raw.session_id)
  if (id.length === 0) return null
  return { id, status: str(raw.status) || 'queued', version: null }
}

/** list_sessions 行投影（visitor_session_view 白名单，version 供评分 CAS）。 */
export function toSession(raw: unknown): WidgetSession | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (id.length === 0) return null
  return { id, status: str(raw.status), version: optInt(raw.version) }
}

export function toSessionList(raw: unknown): WidgetSession[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.sessions) ? raw.sessions : []
  return list.map(toSession).filter((s): s is WidgetSession => s !== null)
}

/** 历史行投影（sender_type 决定角色；body_cipher 缺读面明文 = D5）。 */
export function toWidgetMessage(raw: unknown): WidgetMessage | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (id.length === 0) return null
  const senderType = str(raw.sender_type)
  if (senderType.length === 0) return null
  return {
    id,
    senderType,
    senderContactId: optStr(raw.sender_contact_id),
    clientMsgId: optStr(raw.client_msg_id),
    body: optStr(raw.body),
    createdAt: optStr(raw.created_at),
  }
}

/** 历史载荷 = 裸数组（eb list_messages_after → {ok, [map()]}；兼容 {messages} 旧形）。 */
export function toMessageList(raw: unknown): WidgetMessage[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.messages) ? raw.messages : []
  return list.map(toWidgetMessage).filter((m): m is WidgetMessage => m !== null)
}

/** 评分合同：rating 仅 1..5 的安全整数；expected_version 为正整数（CAS）。 */
export function isValidRatingScore(rating: number): boolean {
  return Number.isSafeInteger(rating) && rating >= 1 && rating <= 5
}

export function isValidExpectedVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0
}

/** 请求体构造：bootstrap（POST 正文逐键 = cs_actions widget_bootstrap 参数表）。 */
export function buildBootstrapBody(scope: {
  organizationId: string
  publicWidgetId: string
  subjectId: string
}): { organization_id: string; public_widget_id: string; subject_id: string } {
  return {
    organization_id: scope.organizationId,
    public_widget_id: scope.publicWidgetId,
    subject_id: scope.subjectId,
  }
}

/** 请求体构造：建会话（widget_create_session：installation_id 必填）。 */
export function buildCreateSessionBody(scope: RequestScope): {
  organization_id: string
  installation_id: string
} {
  return { organization_id: scope.organizationId, installation_id: scope.installationId }
}

/** 查询串构造：GET 面（organization_id/installation_id 必填 + after_id/limit 可选）。 */
export function buildScopeQuery(
  scope: RequestScope,
  extra: { afterId?: string | null; limit?: number | null } = {}
): string {
  const params = new URLSearchParams()
  params.set('organization_id', scope.organizationId)
  params.set('installation_id', scope.installationId)
  if (typeof extra.afterId === 'string' && extra.afterId.length > 0) params.set('after_id', extra.afterId)
  if (typeof extra.limit === 'number' && Number.isSafeInteger(extra.limit) && extra.limit > 0) {
    params.set('limit', String(extra.limit))
  }
  const qs = params.toString()
  return qs.length > 0 ? `?${qs}` : ''
}

export function buildMessagesPath(sessionId: string, scope: RequestScope, afterId?: string | null): string {
  const base = `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`
  return `${base}${buildScopeQuery(scope, { afterId })}`
}

export function buildSsePath(sessionId: string, scope: RequestScope): string {
  return `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/events${buildScopeQuery(scope)}`
}

/** 请求体构造：访客消息（widget_visitor_message 逐键）。 */
export function buildSendMessageBody(scope: RequestScope, clientMsgId: string, body: string): {
  organization_id: string
  installation_id: string
  client_msg_id: string
  body: string
} {
  return {
    organization_id: scope.organizationId,
    installation_id: scope.installationId,
    client_msg_id: clientMsgId,
    body,
  }
}

/** 请求体构造：评分（widget_rate 逐键：rating 1..5 + expected_version CAS）。 */
export function buildRatingBody(scope: RequestScope, rating: number, expectedVersion: number): {
  organization_id: string
  installation_id: string
  rating: number
  expected_version: number
} {
  return {
    organization_id: scope.organizationId,
    installation_id: scope.installationId,
    rating,
    expected_version: expectedVersion,
  }
}
