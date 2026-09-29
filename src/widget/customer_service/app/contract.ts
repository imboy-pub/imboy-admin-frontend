/**
 * CSW-01R / CSD-FE-01：Widget 后端合同（冻结形状）——类型 + fail-closed 出入站投影。
 *
 * 合同真源（**hosted-widget-contract-v1** S3/S5 为准）：
 * - 全局唯一 `public_widget_id` → 唯一 active installation → 服务端权威派生
 *   `(organization_id, workspace_id)`；浏览器任何请求面**不得申报**
 *   organization/workspace（服务端派生键客户端提供即 400 `server_derived_key_rejected`）；
 * - installation_id 的合法来源 = bootstrap 成功响应体；widget JS 仅内存持有、
 *   后续动作以该响应值为参；绝不写 storage/URL/log；
 * - 凭证只走 `x-cs-visit-token` 头（查询串出现即 400）；`credentials: 'omit'`；
 * - `cs_widget_app:bootstrap_view/1`、`cs_widget_session_app` 与
 *   `eb_pg_store_sql:message_fields/0`：响应投影。
 *
 * 出站编码（cs_http:encode_entity）：`id`/`*_id` 整数一律转 string；version/rating/
 * expires_at 保持 number；时间戳为 RFC3339 字符串。
 *
 * 桩=E2E 替身声明：真实后端联调由 CSX-01/CSD-E2E-01 复验。
 */

export const WIDGET_API_BASE = '/api/v1/cs/widget'

/** 请求面唯一作用域 = installation（bootstrap 响应派生；浏览器不申报 org）。 */
export type RequestScope = {
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
  /**
   * CP-CON-04：访客面坐席在线汇总（`agents_online` 安全整数计数投影）：
   * false = 无 online 坐席（计数 0）、true = 有（>0）、null = 服务端未派生
   * （缺键/非法，未知不猜）。枚举语义对齐 seat 面冻结合同 SeatPresenceStatus
   * （online/away/busy/offline）——计数即 status === 'online' 的坐席数。
   */
  agentsOnline: boolean | null
}

/** agents_online 三态投影：0 → false、正整数 → true、缺键/负数/非整数 → null。 */
function toAgentsOnlineFlag(raw: unknown): boolean | null {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) return null
  return raw > 0
}

/**
 * 历史附件投影（CS-WGT-01 / CSX-01 冻结契约）：`assets:[{id,mime,size_bytes,
 * file_name,status}]` 五键白名单；纯文本 `assets=[]`（键存在且为空）。
 * 投影**不含** object_key/upload_url/token——解析面同样按白名单取键，
 * 多余键一概丢弃（fail-closed）。
 */
export type WidgetAsset = {
  id: string
  mime: string
  sizeBytes: number | null
  fileName: string | null
  status: string
}

/** 历史行（message_fields/0 + CS-BE-01 assets 投影；读面是 body_cipher——
 * D5 读面解密为后端缺口）。 */
export type WidgetMessage = {
  id: string
  senderType: 'contact' | 'business_identity' | string
  senderContactId: string | null
  clientMsgId: string | null
  body: string | null
  createdAt: string | null
  assets: WidgetAsset[]
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

/** create_session 响应投影（session_id 承载会话标识；agents_online 可选派生）。 */
export function toCreatedSession(raw: unknown): WidgetSession | null {
  if (!isRecord(raw)) return null
  const id = str(raw.session_id)
  if (id.length === 0) return null
  return { id, status: str(raw.status) || 'queued', version: null, agentsOnline: toAgentsOnlineFlag(raw.agents_online) }
}

/** list_sessions 行投影（visitor_session_view 白名单，version 供评分 CAS；
 * agents_online 可选派生——服务端未派生时 null = 未知）。 */
export function toSession(raw: unknown): WidgetSession | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (id.length === 0) return null
  return { id, status: str(raw.status), version: optInt(raw.version), agentsOnline: toAgentsOnlineFlag(raw.agents_online) }
}

export function toSessionList(raw: unknown): WidgetSession[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.sessions) ? raw.sessions : []
  return list.map(toSession).filter((s): s is WidgetSession => s !== null)
}

/** 单条 assets 元素投影：缺 id 一律丢弃（fail-closed，不猜测占位）。 */
function toWidgetAsset(raw: unknown): WidgetAsset | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (id.length === 0) return null
  return {
    id,
    mime: str(raw.mime),
    sizeBytes: optInt(raw.size_bytes),
    fileName: optStr(raw.file_name),
    status: str(raw.status),
  }
}

/** assets 数组投影：非数组（含缺键的纯文本旧形）→ []，逐项过滤非法元素。 */
function toWidgetAssets(raw: unknown): WidgetAsset[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toWidgetAsset).filter((a): a is WidgetAsset => a !== null)
}

/** 历史行投影（sender_type 决定角色；body_cipher 缺读面明文 = D5；
 * CS-WGT-01：assets 五键白名单解析，纯文本 assets=[]）。 */
export function toWidgetMessage(raw: unknown): WidgetMessage | null {
  // P1-E2E-01 实证缺陷修复：单发响应载荷是 {message:{...}} 嵌套（后端 POST
  // /sessions/:id/messages 的真实合同），历史行是裸消息——两形兼容。
  const row = isRecord(raw) && isRecord(raw.message) ? raw.message : raw
  if (!isRecord(row)) return null
  const id = str(row.id)
  if (id.length === 0) return null
  const senderType = str(row.sender_type)
  if (senderType.length === 0) return null
  return {
    id,
    senderType,
    senderContactId: optStr(row.sender_contact_id),
    clientMsgId: optStr(row.client_msg_id),
    body: optStr(row.body),
    createdAt: optStr(row.created_at),
    assets: toWidgetAssets(row.assets),
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

/** 请求体构造：bootstrap（合同 v1 S3：只报 public_widget_id + subject_id，
 * organization 由服务端按 public_widget_id 反查派生，绝不申报）。 */
export function buildBootstrapBody(scope: {
  publicWidgetId: string
  subjectId: string
  /** subject_key 为服务端派生注入（cs_widget_handler token_credential），客户端禁止申报。 */
  subjectKey?: string
}): { public_widget_id: string; subject_id: string } {
  return {
    public_widget_id: scope.publicWidgetId,
    subject_id: scope.subjectId,
  }
}

/** 请求体构造：建会话（installation_id = bootstrap 响应派生值）。 */
export function buildCreateSessionBody(scope: RequestScope): { installation_id: string } {
  return { installation_id: scope.installationId }
}

/** 查询串构造：GET 面（installation_id 必填 + after_id/limit 可选）。 */
export function buildScopeQuery(
  scope: RequestScope,
  extra: { afterId?: string | null; limit?: number | null } = {}
): string {
  const params = new URLSearchParams()
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

/** 请求体构造：访客消息（client_msg_id 幂等键；installation_id = 响应派生值）。 */
export function buildSendMessageBody(scope: RequestScope, clientMsgId: string, body: string): {
  installation_id: string
  client_msg_id: string
  body: string
} {
  return {
    installation_id: scope.installationId,
    client_msg_id: clientMsgId,
    body,
  }
}

/** 请求体构造：评分（rating 1..5 + expected_version CAS）。 */
export function buildRatingBody(scope: RequestScope, rating: number, expectedVersion: number): {
  installation_id: string
  rating: number
  expected_version: number
} {
  return {
    installation_id: scope.installationId,
    rating,
    expected_version: expectedVersion,
  }
}

// ---------------------------------------------------------------------------
// FE-W01：附件面（§3.7 冻结合同；路由形状 = imboy_router widget 面 +
// cs_actions table(widget)：presign {mime,size_bytes,object_hash} /
// confirm {upload_ref}）
// ---------------------------------------------------------------------------

/** SHA-256 形状：64 位小写 hex（object_hash 必填，PUT 后服务端复核）。 */
export function isValidSha256Hex(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash)
}

/** 请求体构造：presign（{mime,size_bytes,object_hash}；多出的键会被后端 400）。 */
export function buildPresignBody(
  scope: RequestScope,
  file: { mime: string; sizeBytes: number; objectHash: string }
): { installation_id: string; mime: string; size_bytes: number; object_hash: string } {
  return {
    installation_id: scope.installationId,
    mime: file.mime,
    size_bytes: file.sizeBytes,
    object_hash: file.objectHash,
  }
}

/** 请求体构造：confirm（upload_ref = presign 签发）。 */
export function buildConfirmBody(scope: RequestScope, uploadRef: string): {
  installation_id: string
  upload_ref: string
} {
  return {
    installation_id: scope.installationId,
    upload_ref: uploadRef,
  }
}

/** presign 响应投影（presign_view 白名单）：asset_id + upload_ref 必填，
 * upload.url 缺省（合同形状 rule=opaque_token_no_url_no_object_key）→ null。
 * 对象 key / 存储侧 URL 绝不投影出去。 */
export type PresignResult = {
  assetId: string
  uploadRef: string
  uploadUrl: string | null
}

export function toPresignResult(raw: unknown): PresignResult | null {
  if (!isRecord(raw)) return null
  const assetId = str(raw.asset_id)
  const uploadRef = str(raw.upload_ref)
  if (assetId.length === 0 || uploadRef.length === 0) return null
  let uploadUrl: string | null = null
  if (isRecord(raw.upload) && typeof raw.upload.url === 'string') {
    uploadUrl = isBareHttpsUploadUrl(raw.upload.url) ? raw.upload.url : null
  }
  return { assetId, uploadRef, uploadUrl }
}

/**
 * 裸 PUT 目标校验：必须绝对 https、无内嵌凭证（userinfo）、无查询串 token 形状。
 * 不合法 → null（fail-closed：绝不向非 https 目标 PUT 文件字节）。
 */
export function isBareHttpsUploadUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.username !== '' || url.password !== '') return null
    if (/token/i.test(url.search)) return null
    return url.toString()
  } catch {
    return null
  }
}

/** 请求体构造：带附件的消息（§3.7 append input = asset_ids；空数组时不带该键，
 * 与纯文本路径完全同形）。 */
export function buildAssetMessageBody(
  scope: RequestScope,
  clientMsgId: string,
  body: string,
  assetIds: string[]
): { installation_id: string; client_msg_id: string; body: string; asset_ids?: string[] } {
  const base = buildSendMessageBody(scope, clientMsgId, body)
  if (assetIds.length === 0) return base
  return { ...base, asset_ids: assetIds.filter((id) => id.length > 0) }
}

/** 附件内容（下载/预览）：只经授权 content 代理（visit token 走 header），
 * 路径本身零凭证；绝不构造/返回存储侧 presigned GET URL。 */
export function buildAssetContentPath(sessionId: string, assetId: string, scope: RequestScope): string {
  const base = `${WIDGET_API_BASE}/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}/content`
  return `${base}${buildScopeQuery(scope)}`
}
