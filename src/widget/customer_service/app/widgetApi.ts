/**
 * CSW-01R / CSD-FE-01：Widget HTTP 客户端（轻量 fetch，独立于 Admin axios 实例）。
 *
 * 逐键对齐合同 v1 S3/S5：
 * - 全部相对同源路径 `/api/v1/cs/widget/*`（iframe 与 API 同源，无跨域请求）；
 * - organization/workspace 由服务端按 public_widget_id 反查派生——客户端请求面
 *   绝不申报 org/workspace（服务端派生键提供即 400）；
 * - installation_id 只来自 bootstrap 成功响应体（内存持有，不入 storage/URL/log）；
 * - 凭证只走 `x-cs-visit-token` 头；URL 查询串出现任何 token 形状直接抛错
 *   （后端对查询串凭证键一律 400，客户端提前拦住）；
 * - `credentials: 'omit'`：绝不携带/依赖 Cookie；
 * - 信封 {code,msg,payload}，payload 缺失 fail-closed。
 */
import {
  buildAssetContentPath,
  buildAssetMessageBody,
  buildBootstrapBody,
  buildConfirmBody,
  buildCreateSessionBody,
  buildMessagesPath,
  buildPresignBody,
  buildRatingBody,
  buildScopeQuery,
  isValidExpectedVersion,
  isValidRatingScore,
  toBootstrapResult,
  toCreatedSession,
  toMessageList,
  toPresignResult,
  toSessionList,
  toWidgetMessage,
  WIDGET_API_BASE,
  type BootstrapResult,
  type PresignResult,
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
   * POST /bootstrap（合同 v1 S3：只报 public_widget_id + subject_id；Origin 头
   * 由浏览器自动携带，服务端按 allowlist 校验）。响应 `installation_id` 为后续
   * 动作唯一作用域（内存持有）；响应 `secret` 即 visit token。
   */
  async bootstrap(body: {
    publicWidgetId: string
    subjectId: string
    subjectKey: string
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

  /** POST /sessions（installation_id = bootstrap 响应派生值）。 */
  async createSession(scope: RequestScope): Promise<WidgetSession> {
    const payload = await this.requestJson(`${WIDGET_API_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify(buildCreateSessionBody(scope)),
    })
    const session = toCreatedSession(payload)
    if (session === null) throw new WidgetApiError('创建会话响应形状非法', 502)
    return session
  }

  /** GET /sessions（查询串 installation_id；installation 作用域会话列表）。 */
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

  /** POST /sessions/:id/messages（widget_visitor_message：client_msg_id 幂等；
   * assetIds 非空时按 §3.7 附 asset_ids（confirmed asset 与消息同事务绑定）。 */
  async sendMessage(
    sessionId: string,
    scope: RequestScope,
    clientMsgId: string,
    body: string,
    assetIds: string[] = []
  ): Promise<WidgetMessage> {
    const payload = await this.requestJson(
      `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: 'POST', body: JSON.stringify(buildAssetMessageBody(scope, clientMsgId, body, assetIds)) }
    )
    const message = toWidgetMessage(payload)
    if (message === null) throw new WidgetApiError('发送消息响应形状非法', 502)
    return message
  }

  // -------------------------------------------------------------------------
  // FE-W01：附件面（presign → 裸 PUT → confirm → 消息 asset_ids；下载走代理）
  // -------------------------------------------------------------------------

  /** POST /sessions/:id/assets/presign（widget_asset_upload 逐键：mime +
   * size_bytes + object_hash）。响应 = 不透明 upload_ref（+ 可选裸 PUT url）。 */
  async presignAttachment(
    sessionId: string,
    scope: RequestScope,
    file: { mime: string; sizeBytes: number; objectHash: string }
  ): Promise<PresignResult> {
    const payload = await this.requestJson(
      `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/assets/presign`,
      { method: 'POST', body: JSON.stringify(buildPresignBody(scope, file)) }
    )
    const result = toPresignResult(payload)
    if (result === null) throw new WidgetApiError('presign 响应形状非法（缺 asset_id/upload_ref）', 502)
    return result
  }

  /** POST /sessions/:id/assets/confirm（widget_asset_confirm 逐键：upload_ref）。
   * 重复 confirm 409 不伪成功——异常原样抛出（WidgetApiError.status = 409）。 */
  async confirmAttachment(sessionId: string, scope: RequestScope, uploadRef: string): Promise<void> {
    await this.requestJson(
      `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/assets/confirm`,
      { method: 'POST', body: JSON.stringify(buildConfirmBody(scope, uploadRef)) }
    )
  }

  /** GET /sessions/:id/assets/:asset_id/content（授权内容代理）：
   * visit token 只走 header；返回原始 Response（二进制流由调用方消费），
   * 绝不返回/暴露存储侧 URL 或 presigned GET。 */
  async fetchAssetContent(sessionId: string, assetId: string, scope: RequestScope): Promise<Response> {
    const path = buildAssetContentPath(sessionId, assetId, scope)
    assertNoTokenInUrl(path)
    const response = await this.fetchImpl(path, {
      method: 'GET',
      headers: buildHeaders(this.visitToken, false),
      credentials: 'omit',
    })
    if (!response.ok) {
      throw new WidgetApiError(`附件内容代理失败（HTTP ${response.status}）`, response.status)
    }
    if (response.headers.get('content-type')?.includes('application/json')) {
      throw new WidgetApiError('附件内容代理返回错误信封', 502)
    }
    return response
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
