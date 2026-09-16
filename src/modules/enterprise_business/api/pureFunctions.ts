/**
 * 企业业务平台只读面纯函数（CS-03）。
 *
 * 契约真源：EB 平台面动作表（后端 `eb_enterprise_actions.erl` platform 段）+
 * `eb_pg_store_sql.erl` 的字段投影。展示字段走**白名单 + 敏感键熔断**双层投影
 * （CS-03-A05）：`profile_cipher` / `body_cipher` / `subject_hmac` / `aad_hash` /
 * `content_hash` / `object_key` 等绝不进入展示视图。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'

/** 与 customer_service 模块同一熔断口径（单一事实：本文件为 EB 侧镜像）。 */
const SENSITIVE_KEY_PATTERN =
  /(secret|cipher|hmac|hash|token|digest|password|passwd|authorization|cookie|object_key|storage|presign|api_key)/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

/** 白名单投影：只保留 allowKeys 中且未命中敏感键熔断的字段。 */
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

export const EB_IDENTITY_SAFE_KEYS = [
  'id',
  'function_key',
  'display_name',
  'status',
  'version',
] as const

export const EB_CONTACT_SAFE_KEYS = [
  'id',
  'imboy_user_id',
  'display_name',
  'status',
  'version',
] as const

export const EB_MESSAGE_SAFE_KEYS = [
  'id',
  'conversation_id',
  'sender_type',
  'sender_contact_id',
  'sender_business_identity_id',
  'visibility',
  'policy_id',
  'policy_version',
  'retention_days',
  'retain_until',
  'version',
  'created_at',
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

export type EbIdentity = {
  id: EntityId
  function_key: string
  display_name: string
  status: string
  version: number
}

export type EbContact = {
  id: EntityId
  imboy_user_id: EntityId | null
  display_name: string
  status: string
  version: number
}

export type EbMessage = {
  id: EntityId
  conversation_id: EntityId
  sender_type: string
  sender_contact_id: EntityId | null
  sender_business_identity_id: EntityId | null
  visibility: string
  policy_id: EntityId | null
  retention_days: number | null
  retain_until: string | null
  version: number
  created_at: string | null
}

function toStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function toEbIdentity(raw: unknown): EbIdentity | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    function_key: toStr(row.function_key),
    display_name: toStr(row.display_name),
    status: toStr(row.status),
    version: toOptionalInt(row.version) ?? 0,
  }
}

export function toEbIdentityList(raw: unknown): EbIdentity[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toEbIdentity).filter((item): item is EbIdentity => item !== null)
}

export function toEbContact(raw: unknown): EbContact | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    imboy_user_id: toIdOrNull(row.imboy_user_id),
    display_name: toStr(row.display_name),
    status: toStr(row.status),
    version: toOptionalInt(row.version) ?? 0,
  }
}

export function toEbContactList(raw: unknown): EbContact[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toEbContact).filter((item): item is EbContact => item !== null)
}

export function toEbMessage(raw: unknown): EbMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    conversation_id: toIdOrNull(row.conversation_id) ?? '',
    sender_type: toStr(row.sender_type),
    sender_contact_id: toIdOrNull(row.sender_contact_id),
    sender_business_identity_id: toIdOrNull(row.sender_business_identity_id),
    visibility: toStr(row.visibility),
    policy_id: toIdOrNull(row.policy_id),
    retention_days: toOptionalInt(row.retention_days),
    retain_until: typeof row.retain_until === 'string' ? row.retain_until : null,
    version: toOptionalInt(row.version) ?? 0,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
  }
}

export function toEbMessageList(raw: unknown): EbMessage[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toEbMessage).filter((item): item is EbMessage => item !== null)
}

export type EbScopeParams = {
  organizationId: EntityId
  workspaceId: EntityId
}

/** workspace_id 是平台面每条路径的必填参数（缺失后端 422）。 */
export function assertEbScope(scope: EbScopeParams): void {
  if (coerceEntityId(scope.organizationId, '') === '') {
    throw new Error('请先填写组织 ID（organization_id）')
  }
  if (coerceEntityId(scope.workspaceId, '') === '') {
    throw new Error('请先填写工作区 ID（workspace_id）')
  }
}

/**
 * 键集分页游标推进（后端为 `id > after_id` 键集语义，非 OFFSET）。
 * 给定当前页 items 与 limit，返回下一页游标；不足一页说明没有更多。
 */
export function nextCursor<T extends { id: EntityId }>(items: T[], limit: number): EntityId | null {
  if (items.length === 0) return null
  if (Number.isFinite(limit) && items.length < Math.floor(limit)) return null
  return items[items.length - 1].id
}

// ===========================================================================
// W2：平台 offboarding cases（冻结合同 W2-ADMIN 段，contracts-w2.md）
//
// GET  /api/adm/enterprise-business/organizations/:org_id/offboarding/cases[/:id]
//      查询 status / after_id / limit（detail 另有 items_status）
// POST /api/adm/enterprise-business/organizations/:org_id/offboarding/:id/execute
//      （既有幂等重试端点：仅重放失败项，body 需 expected_version + actor_user_id）
// case 投影白名单：id, organization_id, workspace_id, leaver_user_id,
//   successor_user_id, status, reason, item_total/item_success/item_failed,
//   created_at, updated_at（另保留 version：execute 幂等重试的 expected_version 来源）
// detail 另含 items[]（id, kind, status, failure_reason, attempt, idempotency_key）
// 永不渲染：key_digest/token_digest/secret/cipher/object_key（A05 熔断兜底）。
// ===========================================================================

export type EbOffboardingStatusFilter =
  | 'all'
  | 'draft'
  | 'frozen'
  | 'transferring'
  | 'verifying'
  | 'completed'
  | 'failed'

export const EB_OFFBOARDING_STATUS_FILTERS: readonly EbOffboardingStatusFilter[] = [
  'all',
  'draft',
  'frozen',
  'transferring',
  'verifying',
  'completed',
  'failed',
] as const

/** URL/status 参数 → 契约 6 态白名单；非法值归 all（不把脏值发给后端）。 */
export function parseOffboardingStatusFilter(raw: string | null | undefined): EbOffboardingStatusFilter {
  switch (raw) {
    case 'draft':
    case 'frozen':
    case 'transferring':
    case 'verifying':
    case 'completed':
    case 'failed':
    case 'all':
      return raw
    default:
      return 'all'
  }
}

export type EbOffboardingItemsStatusFilter = 'all' | 'pending' | 'success' | 'failed'

/** item 状态过滤白名单（detail 查询 items_status）；非法值归 all。 */
export function parseOffboardingItemsStatusFilter(
  raw: string | null | undefined
): EbOffboardingItemsStatusFilter {
  switch (raw) {
    case 'pending':
    case 'success':
    case 'failed':
    case 'all':
      return raw
    default:
      return 'all'
  }
}

export type OffboardingListQueryInput = {
  status: EbOffboardingStatusFilter
  afterId: EntityId | null
  limit?: number
}

/** cases 列表查询串：status=all 不下发；游标空不下发；limit 钳制 1..200。 */
export function buildOffboardingListQuery(
  input: OffboardingListQueryInput
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

/** case 详情查询串：items_status=all 不下发。 */
export function buildOffboardingDetailQuery(
  itemsStatus: EbOffboardingItemsStatusFilter
): Record<string, string> {
  return itemsStatus === 'all' ? {} : { items_status: itemsStatus }
}

/**
 * 交接 case 视图（冻结合同投影白名单 + version）。
 * `version` 非 contract 白名单字段，但是 execute 幂等重试 required 入参
 * `expected_version` 的唯一来源（后端 CASE_DETAIL_KEYS 恒出站）；仅用于重试表单预填。
 */
export type EbOffboardingCase = {
  id: EntityId
  organization_id: EntityId
  workspace_id: EntityId
  leaver_user_id: EntityId
  successor_user_id: EntityId
  status: string
  reason: string | null
  item_total: number
  item_success: number
  item_failed: number
  version: number
  created_at: string | null
  updated_at: string | null
}

/** 交接项视图（冻结合同 item 白名单）。 */
export type EbOffboardingItem = {
  id: EntityId
  kind: string
  status: string
  failure_reason: string | null
  attempt: number
  idempotency_key: string
}

export function toEbOffboardingCase(raw: unknown): EbOffboardingCase | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    organization_id: coerceEntityId(row.organization_id, ''),
    workspace_id: coerceEntityId(row.workspace_id, ''),
    leaver_user_id: toIdOrNull(row.leaver_user_id) ?? '',
    successor_user_id: toIdOrNull(row.successor_user_id) ?? '',
    status: toStr(row.status),
    reason: typeof row.reason === 'string' && row.reason.length > 0 ? row.reason : null,
    item_total: toOptionalInt(row.item_total) ?? 0,
    item_success: toOptionalInt(row.item_success) ?? 0,
    item_failed: toOptionalInt(row.item_failed) ?? 0,
    version: toOptionalInt(row.version) ?? 0,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

export function toEbOffboardingCaseList(raw: unknown): EbOffboardingCase[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toEbOffboardingCase).filter((item): item is EbOffboardingCase => item !== null)
}

export function toEbOffboardingItem(raw: unknown): EbOffboardingItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = toIdOrNull(row.id)
  if (id === null) return null
  return {
    id,
    kind: toStr(row.kind),
    status: toStr(row.status),
    failure_reason:
      typeof row.failure_reason === 'string' && row.failure_reason.length > 0
        ? row.failure_reason
        : null,
    attempt: toOptionalInt(row.attempt) ?? 0,
    idempotency_key: toStr(row.idempotency_key),
  }
}

export function toEbOffboardingItemList(raw: unknown): EbOffboardingItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toEbOffboardingItem).filter((item): item is EbOffboardingItem => item !== null)
}

export type EbOffboardingCaseListPage = {
  cases: EbOffboardingCase[]
  next_after_id: EntityId | null
}

/** cases 列表整包解析：next_after_id 优先响应值，缺失时页满回退页尾 id。 */
export function toEbOffboardingCaseListPage(
  raw: unknown,
  fallbackLimit: number
): EbOffboardingCaseListPage {
  if (!raw || typeof raw !== 'object') return { cases: [], next_after_id: null }
  const payload = raw as Record<string, unknown>
  const cases = toEbOffboardingCaseList(payload.cases)
  const explicit = toIdOrNull(payload.next_after_id)
  if (explicit !== null) return { cases, next_after_id: explicit }
  const limit = Number.isFinite(fallbackLimit) && fallbackLimit > 0 ? Math.floor(fallbackLimit) : 0
  if (limit > 0 && cases.length >= limit && cases.length > 0) {
    return { cases, next_after_id: cases[cases.length - 1].id }
  }
  return { cases, next_after_id: null }
}

export type EbOffboardingCaseDetail = EbOffboardingCase & {
  items: EbOffboardingItem[]
}

/** case 详情解析：case 主体 fail-closed，items 容错（缺失归空列表）。 */
export function toEbOffboardingCaseDetail(raw: unknown): EbOffboardingCaseDetail | null {
  const base = toEbOffboardingCase(raw)
  if (base === null) return null
  const items = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).items : undefined
  return { ...base, items: toEbOffboardingItemList(items) }
}

/** 失败项计数（服务端聚合 item_failed；缺失归 0）。 */
export function offboardingFailedCount(caseRow: Pick<EbOffboardingCase, 'item_failed'>): number {
  return caseRow.item_failed > 0 ? caseRow.item_failed : 0
}

/** 是否存在失败项（驱动「失败项 N」徽标与失败高亮）。 */
export function hasOffboardingFailures(caseRow: Pick<EbOffboardingCase, 'item_failed'>): boolean {
  return offboardingFailedCount(caseRow) > 0
}

/**
 * 重试门（write 门 + 幂等重试前置）：
 * - 必须持 enterprise_business:write（无权限时按钮禁用 + tooltip）；
 * - expected_version 必须有效（正整数）；
 * - 仅未完成的 case 允许 execute（终态 completed 不可重试；failed 可重试）。
 */
export function canRetryOffboardingCase(
  caseRow: Pick<EbOffboardingCase, 'status' | 'version'>,
  canWrite: boolean
): boolean {
  if (!canWrite) return false
  if (!Number.isSafeInteger(caseRow.version) || caseRow.version <= 0) return false
  return caseRow.status !== 'completed'
}

/** execute 幂等重试语义说明（文档化提示，页面直出）。 */
export const OFFBOARDING_RETRY_HINT =
  '重试走既有 POST execute 端点，语义为幂等重放：仅重试 status=failed 的交接项（attempt 递增），' +
  '已成功项不会重复执行；重复点击安全，无需担心重复交接。'

/** case 状态 → 展示标签（契约 6 态）。 */
export const EB_OFFBOARDING_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  frozen: '已冻结',
  transferring: '交接中',
  verifying: '校验中',
  completed: '已完成',
  failed: '有失败项',
}

export function offboardingStatusLabel(status: string): string {
  const label = EB_OFFBOARDING_STATUS_LABELS[status]
  return typeof label === 'string' ? label : status
}

export function offboardingItemStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '待执行'
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    default:
      return status.length > 0 ? status : '未知'
  }
}

// ---------------------------------------------------------------------------
// 列表错误态映射（401/403/404/422 + 409 冲突）
// ---------------------------------------------------------------------------

export type EbListFailure =
  | 'unauthenticated' // 401 —— 会话失效
  | 'permission_missing' // 403 —— 缺 enterprise_business:read/write
  | 'not_found' // 404 —— case 不在作用域内/不存在
  | 'validation' // 400/422 —— 参数不合法
  | 'conflict_stale' // 409 —— expected_version 过期/状态机冲突，刷新后可重试
  | 'unknown'

/** 后端错误 envelope 形状（拦截器 reject 出 {code, msg}）。 */
export type EbApiErrorLike = {
  code?: unknown
  msg?: unknown
}

export function toApiErrorLike(err: unknown): EbApiErrorLike | null {
  if (err && typeof err === 'object' && ('code' in err || 'msg' in err)) {
    return err as EbApiErrorLike
  }
  return null
}

function errorCode(err: EbApiErrorLike): number {
  const code = err.code
  if (typeof code === 'number' && Number.isFinite(code)) return code
  if (typeof code === 'string') {
    const parsed = Number(code)
    if (Number.isFinite(parsed)) return parsed
  }
  return -1
}

export function classifyListFailure(err: unknown): EbListFailure {
  const apiErr = toApiErrorLike(err)
  if (!apiErr) return 'unknown'
  const code = errorCode(apiErr)
  const msg = typeof apiErr.msg === 'string' ? apiErr.msg : ''
  if (code === 401) return 'unauthenticated'
  if (code === 409 || msg === 'conflict' || msg.includes('stale_version') || msg.includes('cas_mismatch')) {
    return 'conflict_stale'
  }
  if (code === 403) return 'permission_missing'
  if (code === 404) return 'not_found'
  if (code === 400 || code === 422) return 'validation'
  return 'unknown'
}

/** 列表/execute 失败分类 → 用户可读文案。 */
export function listFailureMessage(failure: EbListFailure): string {
  switch (failure) {
    case 'unauthenticated':
      return '登录状态已失效，请重新登录'
    case 'permission_missing':
      return '缺少 enterprise_business:read / enterprise_business:write 权限'
    case 'not_found':
      return '交接 case 不在该组织/工作区作用域内（或不存在）'
    case 'validation':
      return '请求参数不合法（status/after_id/limit/expected_version），请修正后重试'
    case 'conflict_stale':
      return 'case 状态已变化（版本过期），请刷新详情后重试'
    default:
      return '操作失败，请稍后重试'
  }
}
