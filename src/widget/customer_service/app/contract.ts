/**
 * CSW-01：Widget 后端合同（冻结合同形状）——类型 + fail-closed 出入站投影。
 *
 * 合同真源：POST-V4.1 §12.4 表 1（source-to-contract-matrix.md「Widget API」）。
 * 所有路径挂 `/api/v1/cs/widget`，凭证只走 `x-cs-visit-token` 请求头
 * （查询串出现 token = 后端 400；客户端侧同样禁止，见 widgetApi guard）。
 *
 * 桩=E2E 替身声明：本模块是后端联调前的合同参考实现；真实后端联调归 CSX-01。
 */

export const WIDGET_API_BASE = '/api/v1/cs/widget'

export type NoticeState = 'pending' | 'accepted' | 'rejected'

export type WidgetBrand = {
  displayName: string
  primaryColor: string | null
}

export type WidgetNotice = {
  version: string
  state: NoticeState
}

export type BootstrapResult = {
  visitToken: string
  brand: WidgetBrand
  notice: WidgetNotice
}

export type WidgetSessionStatus = 'queued' | 'active' | 'closed'

export type WidgetSession = {
  id: string
  status: WidgetSessionStatus | string
}

export type WidgetMessageRole = 'visitor' | 'agent' | 'system'

export type WidgetMessage = {
  id: string
  role: WidgetMessageRole
  body: string
  clientMsgId: string | null
  createdAt: string | null
}

export type MessageListPage = {
  messages: WidgetMessage[]
  nextAfterId: string | null
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

/** 品牌投影只取白名单键；primary_color 必须是受控色值形状（防注入）。 */
export function toBrand(raw: unknown): WidgetBrand {
  if (!isRecord(raw)) return { displayName: '在线客服', primaryColor: null }
  const color = typeof raw.primary_color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.primary_color) ? raw.primary_color : null
  const name = str(raw.display_name).trim()
  return { displayName: name.length > 0 ? name : '在线客服', primaryColor: color }
}

export function toNotice(raw: unknown): WidgetNotice | null {
  if (!isRecord(raw)) return null
  const state = raw.state
  if (state !== 'pending' && state !== 'accepted' && state !== 'rejected') return null
  const version = str(raw.version).trim()
  if (version.length === 0) return null
  return { version, state }
}

/** bootstrap 响应投影：缺 visit_token / notice 一律 fail-closed（返回 null）。 */
export function toBootstrapResult(raw: unknown): BootstrapResult | null {
  if (!isRecord(raw)) return null
  const visitToken = str(raw.visit_token)
  if (visitToken.length === 0) return null
  const notice = toNotice(raw.notice)
  if (notice === null) return null
  return { visitToken, brand: toBrand(raw.brand), notice }
}

export function toSession(raw: unknown): WidgetSession | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (id.length === 0) return null
  const status = str(raw.status)
  return { id, status: status.length > 0 ? status : 'active' }
}

export function toWidgetMessage(raw: unknown): WidgetMessage | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const body = str(raw.body)
  if (id.length === 0 || body.length === 0) return null
  const role = raw.role === 'agent' || raw.role === 'system' || raw.role === 'visitor' ? raw.role : null
  if (role === null) return null
  return {
    id,
    role,
    body,
    clientMsgId: optStr(raw.client_msg_id),
    createdAt: optStr(raw.created_at),
  }
}

export function toMessageListPage(raw: unknown): MessageListPage {
  const list = isRecord(raw) && Array.isArray(raw.messages) ? raw.messages : []
  const messages = list.map(toWidgetMessage).filter((m): m is WidgetMessage => m !== null)
  const next = isRecord(raw) ? optStr(raw.next_after_id) : null
  return { messages, nextAfterId: next }
}

/** 评分合同：仅 1..5 的安全整数。 */
export function isValidRatingScore(score: number): boolean {
  return Number.isSafeInteger(score) && score >= 1 && score <= 5
}

/** 请求体构造：bootstrap 只带 public widget_id。 */
export function buildBootstrapBody(widgetId: string): { widget_id: string } {
  return { widget_id: widgetId }
}

/** 请求体构造：创建会话只携带白名单页面上下文（origin/path）。 */
export function buildCreateSessionBody(context: { pageOrigin: string; pagePath: string }): {
  context: { page_origin: string; page_path: string }
} {
  return { context: { page_origin: context.pageOrigin, page_path: context.pagePath } }
}

export function buildSendMessageBody(clientMsgId: string, body: string): { client_msg_id: string; body: string } {
  return { client_msg_id: clientMsgId, body }
}

/** 消息请求路径（after_id 键集分页；token 永不进入查询串）。 */
export function buildMessagesPath(sessionId: string, afterId: string | null): string {
  const base = `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`
  return afterId === null ? base : `${base}?after_id=${encodeURIComponent(afterId)}`
}

export function buildSsePath(sessionId: string): string {
  return `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/events`
}
