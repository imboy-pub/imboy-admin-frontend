/**
 * CSW-01：Widget HTTP 客户端（轻量 fetch，独立于 Admin axios 实例）。
 *
 * 纪律（冻结合同）：
 * - 凭证只走 `x-cs-visit-token` 请求头；URL 查询串出现任何 token 形状直接抛错
 *   （后端对查询串 token 一律 400，客户端必须提前拦住）；
 * - `credentials: 'omit'`：Widget 与宿主跨源，绝不携带/依赖 Cookie；
 * - 信封 {code,msg,payload}，payload 缺失 fail-closed。
 * 桩=E2E 替身声明：真实后端联调归 CSX-01。
 */
import {
  buildBootstrapBody,
  buildCreateSessionBody,
  buildMessagesPath,
  buildSendMessageBody,
  toBootstrapResult,
  toMessageListPage,
  toSession,
  toWidgetMessage,
  WIDGET_API_BASE,
  type BootstrapResult,
  type MessageListPage,
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

  /** POST /bootstrap（public widget_id；Origin 头由浏览器自动携带）。 */
  async bootstrap(widgetId: string): Promise<BootstrapResult> {
    const payload = await this.requestJson(`${WIDGET_API_BASE}/bootstrap`, {
      method: 'POST',
      body: JSON.stringify(buildBootstrapBody(widgetId)),
    })
    const result = toBootstrapResult(payload)
    if (result === null) throw new WidgetApiError('bootstrap 响应形状非法', 502)
    this.visitToken = result.visitToken
    return result
  }

  /** POST /sessions（携带白名单页面上下文）。 */
  async createSession(context: { pageOrigin: string; pagePath: string }): Promise<WidgetSession> {
    const payload = await this.requestJson(`${WIDGET_API_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify(buildCreateSessionBody(context)),
    })
    const session = toSession(isPayloadObject(payload) ? payload.session : null)
    if (session === null) throw new WidgetApiError('创建会话响应形状非法', 502)
    return session
  }

  /** GET /sessions/:id/messages（after_id 键集分页）。 */
  async listMessages(sessionId: string, afterId: string | null): Promise<MessageListPage> {
    const payload = await this.requestJson(buildMessagesPath(sessionId, afterId), null)
    return toMessageListPage(payload)
  }

  /** POST /sessions/:id/messages（client_msg_id 幂等）。 */
  async sendMessage(sessionId: string, clientMsgId: string, body: string): Promise<WidgetMessage> {
    const payload = await this.requestJson(
      `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: 'POST', body: JSON.stringify(buildSendMessageBody(clientMsgId, body)) }
    )
    const message = toWidgetMessage(isPayloadObject(payload) ? payload.message : null)
    if (message === null) throw new WidgetApiError('发送消息响应形状非法', 502)
    return message
  }

  /** POST /sessions/:id/rating（仅 closed、1..5、幂等）。 */
  async submitRating(sessionId: string, score: number): Promise<void> {
    if (!Number.isSafeInteger(score) || score < 1 || score > 5) {
      throw new WidgetApiError('评分必须是 1..5 的整数', 422)
    }
    await this.requestJson(`${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score }),
    })
  }
}

function isPayloadObject(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}
