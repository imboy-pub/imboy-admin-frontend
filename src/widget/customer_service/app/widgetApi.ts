/**
 * CSW-01R：Widget HTTP 客户端（轻量 fetch，独立于 Admin axios 实例）。
 *
 * 逐键对齐后端真实校验（cs_actions.erl table(widget) + cs_widget_handler）：
 * - 每条请求正文/查询必带申报键 `organization_id`（org_source=param）；
 * - 凭证只走 `x-cs-visit-token` 头；URL 查询串出现任何 token 形状直接抛错
 *   （后端对查询串凭证键一律 400，客户端提前拦住）；
 * - 服务端派生键（at/contact_id/workspace_id/origin/secret…）绝不出现客户端请求；
 * - `credentials: 'omit'`：Widget 与宿主跨源，绝不携带/依赖 Cookie；
 * - 信封 {code,msg,payload}，payload 缺失 fail-closed。
 */
import {
  buildBootstrapBody,
  buildCreateSessionBody,
  buildMessagesPath,
  buildRatingBody,
  buildScopeQuery,
  buildSendMessageBody,
  isValidExpectedVersion,
  isValidRatingScore,
  toBootstrapResult,
  toCreatedSession,
  toMessageList,
  toSessionList,
  toWidgetMessage,
  WIDGET_API_BASE,
  type BootstrapResult,
  type RequestScope,
  type WidgetMessage,
  type WidgetSession,
} from './contract'

export type FetchLike = (_input: string, _init?: RequestInit) => Promise<Response>

export class WidgetApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'WidgetApiError'
    this.status = status
  }
}

/** 查询串凭证禁令：任何 token 形状进入 URL 直接拒绝（与后端 400 语义对齐）。 */
export function assertNoTokenInUrl(url: string): void {
  if (/token/i.test(url)) {
    throw new WidgetApiError('visit token 不允许出现在 URL 查询串（合同 400）', 400)
  }
}

function buildHeaders(visitToken: string | null, json: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'
  if (visitToken !== null) headers['x-cs-visit-token'] = visitToken
  return headers
}

export class WidgetApiClient {
  private readonly fetchImpl: FetchLike
  private visitToken: string | null = null

  constructor(fetchImpl: FetchLike = (...args) => fetch(...args)) {
    this.fetchImpl = fetchImpl
  }

  currentToken(): string | null {
    return this.visitToken
  }

  private async requestJson(path: string, init: RequestInit | null): Promise<unknown> {
    assertNoTokenInUrl(path)
    const method = init?.method ?? 'GET'
    const response = await this.fetchImpl(path, {
      ...init,
      method,
      headers: buildHeaders(this.visitToken, method !== 'GET'),
      credentials: 'omit',
    })
    if (!response.ok) {
      throw new WidgetApiError(`Widget API ${method} ${path} 失败（HTTP ${response.status}）`, response.status)
    }
    const envelope = (await response.json()) as { code?: number; payload?: unknown }
    if (typeof envelope.code !== 'number' || envelope.code !== 0 || envelope.payload === undefined) {
      throw new WidgetApiError(`Widget API ${method} ${path} 返回非法信封`, response.status)
    }
    return envelope.payload
  }

  /**
   * POST /bootstrap（widget_bootstrap 逐键：organization_id + public_widget_id +
   * subject_id；Origin 头由浏览器自动携带）。响应 `secret` 即 visit token。
   */
  async bootstrap(body: {
    organizationId: string
    publicWidgetId: string
    subjectId: string
  }): Promise<BootstrapResult> {
    const payload = await this.requestJson(`${WIDGET_API_BASE}/bootstrap`, {
      method: 'POST',
      body: JSON.stringify(buildBootstrapBody(body)),
    })
    const result = toBootstrapResult(payload)
    if (result === null) throw new WidgetApiError('bootstrap 响应形状非法', 502)
    this.visitToken = result.visitToken
    return result
  }

  /** POST /sessions（widget_create_session：installation_id 必填）。 */
  async createSession(scope: RequestScope): Promise<WidgetSession> {
    const payload = await this.requestJson(`${WIDGET_API_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify(buildCreateSessionBody(scope)),
    })
    const session = toCreatedSession(payload)
    if (session === null) throw new WidgetApiError('创建会话响应形状非法', 502)
    return session
  }

  /** GET /sessions（widget_list_sessions：查询串 installation_id + organization_id）。 */
  async listSessions(scope: RequestScope): Promise<WidgetSession[]> {
    const payload = await this.requestJson(
      `${WIDGET_API_BASE}/sessions${buildScopeQuery(scope)}`,
      null
    )
    return toSessionList(payload)
  }

  /** GET /sessions/:id/messages（widget_history_after：after_id 键集；载荷=裸数组）。 */
  async listMessages(sessionId: string, scope: RequestScope, afterId?: string | null): Promise<WidgetMessage[]> {
    const payload = await this.requestJson(buildMessagesPath(sessionId, scope, afterId ?? null), null)
    return toMessageList(payload)
  }

  /** POST /sessions/:id/messages（widget_visitor_message：client_msg_id 幂等）。 */
  async sendMessage(
    sessionId: string,
    scope: RequestScope,
    clientMsgId: string,
    body: string
  ): Promise<WidgetMessage> {
    const payload = await this.requestJson(
      `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: 'POST', body: JSON.stringify(buildSendMessageBody(scope, clientMsgId, body)) }
    )
    const message = toWidgetMessage(payload)
    if (message === null) throw new WidgetApiError('发送消息响应形状非法', 502)
    return message
  }

  /** POST /sessions/:id/rating（widget_rate：rating 1..5 + expected_version CAS）。 */
  async submitRating(sessionId: string, scope: RequestScope, rating: number, expectedVersion: number): Promise<void> {
    if (!isValidRatingScore(rating)) {
      throw new WidgetApiError('评分必须是 1..5 的整数', 422)
    }
    if (!isValidExpectedVersion(expectedVersion)) {
      throw new WidgetApiError('缺少有效的 expected_version（评分 CAS）', 422)
    }
    await this.requestJson(`${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/rating`, {
      method: 'POST',
      body: JSON.stringify(buildRatingBody(scope, rating, expectedVersion)),
    })
  }
}
