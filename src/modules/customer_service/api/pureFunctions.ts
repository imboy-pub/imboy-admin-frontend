/**
 * 客服平台运营面纯函数（CS-03）。
 *
 * 契约真源：CS-02 冻结动作表（后端 `cs_actions.erl` 平台面 6 条路径）。
 * - TSID 全程 string（`coerceEntityId` 口径），后端 TSID 也以 JSON string 出站；
 * - 展示字段走**白名单 + 敏感键熔断**双层投影（CS-03-A05：
 *   secret/cipher/object key/hash 永不出现在展示视图，即便白名单误配）；
 * - 错误分类把后端 envelope（HTTP 状态 + `msg` 稳定标签）收敛成可重试性。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'

/**
 * 敏感键熔断模式（CS-03-A05）：body_cipher / profile_cipher / subject_hmac /
 * aad_hash / content_hash / object_key / object_hash / secret / token / digest /
 * authorization / cookie 一律不得进入展示视图。
 * 命中即丢弃——即使调用方把该键误加入白名单。
 */
const SENSITIVE_KEY_PATTERN =
  /(secret|cipher|hmac|hash|token|digest|password|passwd|authorization|cookie|object_key|storage|presign|api_key)/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

/**
 * 白名单投影：只保留 allowKeys 中**且**未命中敏感键熔断的字段。
 * 返回新对象（不可变性），键顺序跟随 allowKeys。
 */
export function pickSafeFields(
  raw: Record<string, unknown> | null | undefined,
  allowKeys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!raw) return out
  for (const key of allowKeys) {
    if (isSensitiveKey(key)) continue
    if (key in raw) out[key] = raw[key]
  }
  return out
}

/** 坐席展示白名单（后端 cs_pg_seat SEAT_KEYS + active_count 的安全子集）。 */
export const CS_SEAT_SAFE_KEYS = [
  'organization_id',
  'business_identity_id',
  'function_key',
  'enabled',
  'max_concurrent',
  'active_count',
  'version',
] as const

/** 会话展示白名单（后端 cs_pg_session SESSION_KEYS 的安全子集）。 */
export const CS_SESSION_SAFE_KEYS = [
  'id',
  'organization_id',
  'workspace_id',
  'contact_id',
  'conversation_id',
  'business_identity_id',
  'status',
  'rating',
  'queued_at',
  'claimed_at',
  'closed_at',
  'close_reason',
  'version',
] as const

function toOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

function toIdOrNull(value: unknown): EntityId | null {
  const id = coerceEntityId(value, '')
  return id.length > 0 ? id : null
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1
}

/** 原始坐席行 → TSID-safe 坐席视图；形状不合法返回 null（fail-closed）。 */
export function toCsSeat(raw: unknown): CsSeat | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const identityId = toIdOrNull(row.business_identity_id)
  if (identityId === null) return null
  return {
    organization_id: coerceEntityId(row.organization_id, ''),
    business_identity_id: identityId,
    function_key: typeof row.function_key === 'string' ? row.function_key : '',
    enabled: toBool(row.enabled),
    max_concurrent: toOptionalInt(row.max_concurrent) ?? 0,
    active_count: toOptionalInt(row.active_count) ?? 0,
    version: toOptionalInt(row.version) ?? 0,
  }
}

export function toCsSeatList(raw: unknown): CsSeat[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toCsSeat).filter((seat): seat is CsSeat => seat !== null)
}

/** 原始会话行 → TSID-safe 会话视图；缺 id 时返回 null（fail-closed）。 */
export function toCsSession(raw: unknown): CsSession | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    organization_id: coerceEntityId(row.organization_id, ''),
    workspace_id: coerceEntityId(row.workspace_id, ''),
    contact_id: toIdOrNull(row.contact_id) ?? '',
    conversation_id: toIdOrNull(row.conversation_id) ?? '',
    business_identity_id: toIdOrNull(row.business_identity_id),
    status: typeof row.status === 'string' ? row.status : '',
    rating: toOptionalInt(row.rating),
    queued_at: toOptionalInt(row.queued_at),
    claimed_at: toOptionalInt(row.claimed_at),
    closed_at: toOptionalInt(row.closed_at),
    close_reason: typeof row.close_reason === 'string' && row.close_reason.length > 0 ? row.close_reason : null,
    version: toOptionalInt(row.version) ?? 0,
  }
}

export type CsSeat = {
  organization_id: EntityId
  business_identity_id: EntityId
  function_key: string
  enabled: boolean
  max_concurrent: number
  active_count: number
  version: number
}

export type CsSession = {
  id: EntityId
  organization_id: EntityId
  workspace_id: EntityId
  contact_id: EntityId
  conversation_id: EntityId
  business_identity_id: EntityId | null
  status: string
  rating: number | null
  queued_at: number | null
  claimed_at: number | null
  closed_at: number | null
  close_reason: string | null
  version: number
}

/** 会话状态 → 展示标签。 */
export const CS_SESSION_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  active: '服务中',
  closed: '已关闭',
}

export function csSessionStatusLabel(status: string): string {
  return CS_SESSION_STATUS_LABELS[status] ?? (status.length > 0 ? status : '未知')
}

/** 客户端到后端的参数形态（organization_id/workspace_id 恒为 string TSID）。 */
export type CsScopeParams = {
  organizationId: EntityId
  workspaceId: EntityId
}

/** workspace_id 是平台面每条路径的必填参数（缺失后端 422）。 */
export function assertScope(scope: CsScopeParams): void {
  if (coerceEntityId(scope.organizationId, '') === '') {
    throw new Error('请先填写组织 ID（organization_id）')
  }
  if (coerceEntityId(scope.workspaceId, '') === '') {
    throw new Error('请先填写工作区 ID（workspace_id）')
  }
}

/**
 * 平台面错误分类（CS-03-A04：交接失败项要能区分可重试与不可重试）。
 *
 * 后端错误 envelope：HTTP 状态与 body.code 同值，`msg` 是稳定点分标签
 * （cs_http:tag/1）；`offboarding_required` 是冻结契约标签（HTTP 409）。
 */
export type CsActionFailure =
  | 'stale_version' // 409 conflict / stale_version / cas_mismatch —— 可重试（先刷新再重试）
  | 'offboarding_required' // 409 冻结标签 —— 不可重试，需先走企业离岗流程
  | 'seat_disabled' // 403 —— 不可重试
  | 'permission_missing' // 403 —— 不可重试
  | 'not_found' // 404 —— 不可重试
  | 'validation' // 400/422 —— 不可重试
  | 'unknown'

export type ApiErrorLike = {
  code?: unknown
  msg?: unknown
}

export function toApiErrorLike(err: unknown): ApiErrorLike | null {
  if (err && typeof err === 'object' && ('code' in err || 'msg' in err)) {
    return err as ApiErrorLike
  }
  return null
}

function errorCode(err: ApiErrorLike): number {
  const code = err.code
  if (typeof code === 'number' && Number.isFinite(code)) return code
  if (typeof code === 'string') {
    const parsed = Number(code)
    if (Number.isFinite(parsed)) return parsed
  }
  return -1
}

function errorMsg(err: ApiErrorLike): string {
  return typeof err.msg === 'string' ? err.msg : ''
}

export function classifyActionFailure(err: unknown): CsActionFailure {
  const apiErr = toApiErrorLike(err)
  if (!apiErr) return 'unknown'
  const code = errorCode(apiErr)
  const msg = errorMsg(apiErr)
  if (msg === 'offboarding_required' || msg.endsWith('.offboarding_required')) {
    return 'offboarding_required'
  }
  if (
    code === 409 ||
    msg === 'conflict' ||
    msg.includes('stale_version') ||
    msg.includes('cas_mismatch') ||
    msg.includes('invalid_transition')
  ) {
    return 'stale_version'
  }
  if (code === 403) {
    if (msg.includes('seat_disabled')) return 'seat_disabled'
    if (msg.includes('permission_missing')) return 'permission_missing'
    return 'permission_missing'
  }
  if (code === 404) return 'not_found'
  if (code === 400 || code === 422) return 'validation'
  return 'unknown'
}

/** 失败分类 → 用户可读文案。 */
export function actionFailureMessage(failure: CsActionFailure): string {
  switch (failure) {
    case 'stale_version':
      return '状态已变化（版本过期），请刷新后重试'
    case 'offboarding_required':
      return '经办身份变更需先完成企业离岗（offboarding）流程，不能直接交接'
    case 'seat_disabled':
      return '目标坐席已被停用（suspended），无法执行该操作'
    case 'permission_missing':
      return '缺少 customer_service:write 权限，无法执行写操作'
    case 'not_found':
      return '资源不在该组织/工作区作用域内（或不存在）'
    case 'validation':
      return '请求参数不合法，请检查后重试'
    default:
      return '操作失败，请稍后重试'
  }
}

/** 该失败分类是否允许「重试」按钮（CS-03-A04：失败项可重试）。 */
export function isRetryableFailure(failure: CsActionFailure): boolean {
  return failure === 'stale_version' || failure === 'unknown'
}

/** 客户端分页（坐席列表服务端一次返回全量，前端切片）。 */
export function paginateClientSide<T>(items: T[], page: number, size: number): T[] {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 10
  const start = (safePage - 1) * safeSize
  return items.slice(start, start + safeSize)
}

// ===========================================================================
// W2：平台 CS session 列表（冻结合同 C1，contracts-w2.md）
//
// GET /api/adm/customer-service/organizations/:org_id/sessions
//   查询：workspace_id（必填）/ status（queued|active|closed）/ after_id / limit（1..200 缺省 50）
//   响应：{ sessions: [...], next_after_id: string|null }
// 列表投影白名单（逐字对齐 C1）：
//   id, organization_id, workspace_id, contact_id, business_identity_id, status,
//   rating, queued_at, claimed_at, closed_at, version
// 禁止：visit_token_id、close_reason、任何 digest/secret/cipher（列表级熔断）。
// ===========================================================================

export type CsSessionStatusFilter = 'all' | 'queued' | 'active' | 'closed'

export const CS_SESSION_STATUS_FILTERS: readonly CsSessionStatusFilter[] = [
  'all',
  'queued',
  'active',
  'closed',
] as const

/** URL/status 参数 → 白名单过滤值；非法值一律归 all（不把脏值发给后端，后端 422 兜底）。 */
export function parseCsSessionStatusFilter(raw: string | null | undefined): CsSessionStatusFilter {
  if (raw === 'queued' || raw === 'active' || raw === 'closed' || raw === 'all') return raw
  return 'all'
}

export type CsSessionListQueryInput = {
  status: CsSessionStatusFilter
  afterId: EntityId | null
  limit?: number
}

/**
 * C1 查询串构造：status=all 不下发；after_id 为空不下发；limit 缺省不下发
 * （交后端缺省 50），显式给出时钳制到 1..200（客户端防呆，服务端越界仍 422）。
 */
export function buildCsSessionListQuery(
  input: CsSessionListQueryInput
): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  if (input.status !== 'all') query.status = input.status
  const afterId = typeof input.afterId === 'string' ? input.afterId.trim() : ''
  if (afterId.length > 0) query.after_id = afterId
  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    const clamped = Math.min(Math.max(Math.floor(input.limit), 1), 200)
    query.limit = clamped
  }
  return query
}

/** C1 会话列表摘要视图（白名单字段，TSID 全 string）。 */
export type CsSessionSummary = {
  id: EntityId
  organization_id: EntityId
  workspace_id: EntityId
  contact_id: EntityId | null
  business_identity_id: EntityId | null
  status: string
  rating: number | null
  queued_at: number | null
  claimed_at: number | null
  closed_at: number | null
  version: number
}

/** 原始行 → C1 白名单摘要；缺 id 返回 null（fail-closed，不渲染半行）。 */
export function toCsSessionSummary(raw: unknown): CsSessionSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    organization_id: coerceEntityId(row.organization_id, ''),
    workspace_id: coerceEntityId(row.workspace_id, ''),
    contact_id: toIdOrNull(row.contact_id),
    business_identity_id: toIdOrNull(row.business_identity_id),
    status: typeof row.status === 'string' ? row.status : '',
    rating: toOptionalInt(row.rating),
    queued_at: toOptionalInt(row.queued_at),
    claimed_at: toOptionalInt(row.claimed_at),
    closed_at: toOptionalInt(row.closed_at),
    version: toOptionalInt(row.version) ?? 0,
  }
}

export function toCsSessionSummaryList(raw: unknown): CsSessionSummary[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toCsSessionSummary).filter((item): item is CsSessionSummary => item !== null)
}

export type CsSessionListPage = {
  sessions: CsSessionSummary[]
  next_after_id: EntityId | null
}

/**
 * C1 响应整包解析。next_after_id 优先取响应值；响应未携带（容错旧后端）且
 * 页满 limit 时回退页尾 id；不足一页视为没有更多。
 */
export function toCsSessionListPage(raw: unknown, fallbackLimit: number): CsSessionListPage {
  if (!raw || typeof raw !== 'object') return { sessions: [], next_after_id: null }
  const payload = raw as Record<string, unknown>
  const sessions = toCsSessionSummaryList(payload.sessions)
  const explicit = toIdOrNull(payload.next_after_id)
  if (explicit !== null) return { sessions, next_after_id: explicit }
  const limit = Number.isFinite(fallbackLimit) && fallbackLimit > 0 ? Math.floor(fallbackLimit) : 0
  if (limit > 0 && sessions.length >= limit && sessions.length > 0) {
    return { sessions, next_after_id: sessions[sessions.length - 1].id }
  }
  return { sessions, next_after_id: null }
}

/** 会话状态 → 展示标签（列表页用；语义与 csSessionStatusLabel 一致，非法值原样返回）。 */
export function csSessionListStatusLabel(status: string): string {
  const label = CS_SESSION_STATUS_LABELS[status]
  return typeof label === 'string' ? label : status
}

// ---------------------------------------------------------------------------
// 列表错误态映射（401/403/404/422）
// ---------------------------------------------------------------------------

export type CsListFailure =
  | 'unauthenticated' // 401 —— 会话失效，需重新登录
  | 'permission_missing' // 403 —— 缺 customer_service:read
  | 'not_found' // 404 —— 资源不在作用域内/不存在
  | 'validation' // 400/422 —— 参数不合法（非法 status/after_id/limit）
  | 'unknown'

export function classifyListFailure(err: unknown): CsListFailure {
  const apiErr = toApiErrorLike(err)
  if (!apiErr) return 'unknown'
  const code = errorCode(apiErr)
  if (code === 401) return 'unauthenticated'
  if (code === 403) return 'permission_missing'
  if (code === 404) return 'not_found'
  if (code === 400 || code === 422) return 'validation'
  return 'unknown'
}

/** 列表失败分类 → 用户可读文案。 */
export function listFailureMessage(failure: CsListFailure): string {
  switch (failure) {
    case 'unauthenticated':
      return '登录状态已失效，请重新登录'
    case 'permission_missing':
      return '缺少 customer_service:read 权限，无法查看'
    case 'not_found':
      return '资源不在该组织/工作区作用域内（或不存在）'
    case 'validation':
      return '查询参数不合法（status/after_id/limit），请修正后重试'
    default:
      return '加载失败，请稍后重试'
  }
}
