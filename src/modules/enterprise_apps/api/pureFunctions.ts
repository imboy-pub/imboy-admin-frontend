/**
 * Admin 企业应用治理面纯函数层（可单测，无 IO）。
 *
 * 三类职责：
 *   1. **白名单投影** —— 每个视图的键集合被逐键钉死（无 secret hydration、
 *      投递面无 payload）；未登记取值一律 fail-safe 到 `unknown`/丢弃，不猜测。
 *   2. **语义判定** —— 生命周期迁移、scope 目录（INV-4 无隐含）、Grant CAS、
 *      审计 before/after diff。
 *   3. **失败分类 / RBAC 纯闸门** —— 把后端/传输/前端守卫错误映射成稳定 UI 状态；
 *      写权限的最终 fail-closed 判定。
 *
 * 熔断守卫在 `guards.ts`（单一职责拆分，便于独立取证）。
 */
import { coerceEntityId } from '@/lib/entityId'
import { assertNoSecretFields } from './guards'
import type { EntityId } from '@/types/common'
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  AUDIT_DIFF_FIELDS,
  CREDENTIAL_SAFE_KEYS,
  CREDENTIAL_STATUSES,
  DELIVERY_SAFE_KEYS,
  NEVER_IMPLIED_SCOPES,
  READ_PERMISSION,
  SCOPE_CATALOG,
  SENSITIVE_KEY_PATTERN,
  STATUS_TRANSITIONS,
  WRITE_PERMISSION,
  type ApplicationStatus,
  type CredentialStatus,
  type EnterpriseScope,
  type GrantStatus,
  type GrantWorkspaceScopeKind,
} from './contracts'

/** 未知取值的安全侧标记：不猜测、不误标。 */
export type Unknownable<T extends string> = T | 'unknown'

// ---------------------------------------------------------------------------
// 2. 白名单投影
// ---------------------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toStr(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function toId(value: unknown): EntityId | null {
  const id = coerceEntityId(value, '')
  return id.length > 0 ? id : null
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

function toInt(value: unknown, fallback = 0): number {
  return toIntOrNull(value) ?? fallback
}

/** 比率解析（0..1 浮点，夹紧到 [0,1]）；非数字/越界 → null（调用方按口径回退）。 */
function toRatioOrNull(value: unknown): number | null {
  let parsed: number | null = null
  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = value
  } else if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) parsed = numeric
  }
  if (parsed === null) return null
  if (parsed < 0 || parsed > 1) return null
  return parsed
}

function toStrArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => toStr(item)).filter((item) => item.length > 0)
}

/** 白名单投影：只保留 allowKeys（且不含敏感键）。 */
function pickAllowed(raw: Record<string, unknown>, allowKeys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of allowKeys) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    if (key in raw) out[key] = raw[key]
  }
  return out
}

export function toApplicationStatus(value: unknown): Unknownable<ApplicationStatus> {
  const raw = toStr(value)
  return (APPLICATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ApplicationStatus)
    : 'unknown'
}

export function applicationStatusLabel(status: Unknownable<ApplicationStatus>): string {
  if (status === 'unknown') return '未知状态（fail-safe）'
  return APPLICATION_STATUS_LABELS[status]
}

export function toCredentialStatus(value: unknown): Unknownable<CredentialStatus> {
  const raw = toStr(value)
  return (CREDENTIAL_STATUSES as readonly string[]).includes(raw) ? (raw as CredentialStatus) : 'unknown'
}

/** 只接受固定枚举内的 scope；未登记/通配一律丢弃（不猜测、不透传）。 */
export function toScopeList(value: unknown): EnterpriseScope[] {
  const catalog = new Set<string>(SCOPE_CATALOG)
  const raw = toStrArray(value)
  return raw.filter((item): item is EnterpriseScope => catalog.has(item))
}

export type ApplicationSummary = {
  id: EntityId
  organizationId: EntityId
  name: string
  status: Unknownable<ApplicationStatus>
  scopes: EnterpriseScope[]
  version: number
  createdAt: string
  updatedAt: string
}

const APPLICATION_SAFE_KEYS = [
  'id',
  'organization_id',
  'name',
  'status',
  'scopes',
  'version',
  'created_at',
  'updated_at',
] as const

export function toApplicationSummary(raw: unknown): ApplicationSummary | null {
  if (!isPlainRecord(raw)) return null
  const id = toId(raw.id)
  if (id === null) return null
  const safe = pickAllowed(raw, APPLICATION_SAFE_KEYS)
  return {
    id,
    organizationId: toId(safe.organization_id) ?? '',
    name: toStr(safe.name),
    status: toApplicationStatus(safe.status),
    scopes: toScopeList(safe.scopes),
    version: toInt(safe.version, 1),
    createdAt: toStr(safe.created_at),
    updatedAt: toStr(safe.updated_at),
  }
}

export type ApplicationPage = {
  items: ApplicationSummary[]
  total: number
  page: number
  size: number
}

export function toApplicationPage(raw: unknown, fallbackSize: number): ApplicationPage {
  const record = isPlainRecord(raw) ? raw : {}
  const rawItems = Array.isArray(record.items) ? record.items : []
  const items = rawItems
    .map((item) => toApplicationSummary(item))
    .filter((item): item is ApplicationSummary => item !== null)
  return {
    items,
    total: toInt(record.total, items.length),
    page: toInt(record.page, 1),
    size: toInt(record.size, fallbackSize),
  }
}

/** 详情视图 = 摘要 + 可选扩展字段（键集合仍被白名单钉死）。 */
export type ApplicationDetail = ApplicationSummary & {
  description: string
  ownerApplicationKey: string
}

const APPLICATION_DETAIL_SAFE_KEYS = [
  'id',
  'organization_id',
  'name',
  'status',
  'scopes',
  'version',
  'created_at',
  'updated_at',
  'description',
  'owner_application_key',
] as const

export function toApplicationDetail(raw: unknown): ApplicationDetail | null {
  const summary = toApplicationSummary(raw)
  if (summary === null || !isPlainRecord(raw)) return null
  const safe = pickAllowed(raw, APPLICATION_DETAIL_SAFE_KEYS)
  return {
    ...summary,
    description: toStr(safe.description),
    ownerApplicationKey: toStr(safe.owner_application_key),
  }
}

/**
 * 详情端点的两种后端形状都接受：
 *  ① 顶层即 application（`{id,name,status,...}`）；
 *  ② `{application: {...}}` 包裹。
 * 两者都过白名单；缺 id 抛错（fail-loud，不渲染空壳）。
 */
export function toApplicationDetailFromPayload(payload: unknown): ApplicationDetail {
  const direct = toApplicationDetail(payload)
  if (direct !== null) return direct
  if (isPlainRecord(payload)) {
    const wrapped = toApplicationDetail(payload.application)
    if (wrapped !== null) return wrapped
  }
  throw new Error('Application 详情响应形状非法（缺少 id / application 包裹）')
}

/** credential 元数据视图：**没有** secret / digest 字段（类型层面即不可表达）。 */
export type CredentialMeta = {
  id: EntityId
  prefix: string
  status: Unknownable<CredentialStatus>
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  revokedAt: string
  version: number
}

export function toCredentialMeta(raw: unknown): CredentialMeta | null {
  if (!isPlainRecord(raw)) return null
  const id = toId(raw.id)
  if (id === null) return null
  const safe = pickAllowed(raw, CREDENTIAL_SAFE_KEYS)
  return {
    id,
    prefix: toStr(safe.credential_prefix),
    status: toCredentialStatus(safe.status),
    createdAt: toStr(safe.created_at),
    expiresAt: toStr(safe.expires_at),
    lastUsedAt: toStr(safe.last_used_at),
    revokedAt: toStr(safe.revoked_at),
    version: toInt(safe.version, 1),
  }
}

export function toCredentialMetaList(raw: unknown): CredentialMeta[] {
  const rawItems = Array.isArray(raw) ? raw : []
  return rawItems
    .map((item) => toCredentialMeta(item))
    .filter((item): item is CredentialMeta => item !== null)
}

/** credential 到期呈现（客户端派生，不改后端 status）：plan-full §3.2「过期状态」。 */
export function credentialExpiryState(
  meta: Pick<CredentialMeta, 'status' | 'expiresAt'>,
  now: number = Date.now()
): 'revoked' | 'expired' | 'active' | 'noExpiry' | 'unknown' {
  if (meta.status === 'unknown') return 'unknown'
  if (meta.status === 'revoked') return 'revoked'
  const expiresAt = Date.parse(meta.expiresAt)
  if (Number.isNaN(expiresAt)) return meta.expiresAt.length > 0 ? 'unknown' : 'noExpiry'
  return expiresAt <= now ? 'expired' : 'active'
}

export function credentialExpiryLabel(state: ReturnType<typeof credentialExpiryState>): string {
  switch (state) {
    case 'revoked':
      return '已撤销'
    case 'expired':
      return '已过期'
    case 'active':
      return '有效（未过期）'
    case 'noExpiry':
      return '有效（无到期）'
    default:
      return '未知（fail-safe）'
  }
}

/** last-used 呈现：空值不伪造成“刚刚”。 */
export function lastUsedLabel(value: string): string {
  const text = toStr(value)
  return text.length > 0 ? text : '从未使用'
}

/** 签发/轮换响应的**唯一**允许形状：元数据 + 一个 `secret`。 */
export type IssuedCredentialOnce = {
  credential: CredentialMeta
  secret: string
}

export function toIssuedCredentialOnce(raw: unknown, context: string): IssuedCredentialOnce {
  assertNoSecretFields(raw, context, true)
  if (!isPlainRecord(raw)) {
    throw new Error(`签发响应形状非法 (${context})`)
  }
  const credentialRaw = isPlainRecord(raw.credential) ? raw.credential : raw
  const credential = toCredentialMeta(credentialRaw)
  if (credential === null) {
    throw new Error(`签发响应缺少 credential id (${context})`)
  }
  const secret = toStr(raw.secret ?? credentialRaw.secret)
  if (secret.length === 0) {
    throw new Error(`签发响应缺少一次性 secret (${context})`)
  }
  return { credential, secret }
}

export type GrantView = {
  id: EntityId
  workspaceScopeKind: Unknownable<GrantWorkspaceScopeKind>
  workspaceIds: EntityId[]
  scopes: EnterpriseScope[]
  status: Unknownable<GrantStatus>
  version: number
  validFrom: string
  validTo: string
}

const GRANT_SAFE_KEYS = [
  'id',
  'workspace_scope_kind',
  'workspace_ids',
  'scopes',
  'status',
  'version',
  'valid_from',
  'valid_to',
] as const

export function toGrantView(raw: unknown): GrantView | null {
  if (!isPlainRecord(raw)) return null
  const id = toId(raw.id)
  if (id === null) return null
  const safe = pickAllowed(raw, GRANT_SAFE_KEYS)
  const kind = toStr(safe.workspace_scope_kind)
  const status = toStr(safe.status)
  return {
    id,
    workspaceScopeKind: kind === 'none' || kind === 'explicit' ? kind : 'unknown',
    workspaceIds: toStrArray(safe.workspace_ids)
      .map((item) => toId(item))
      .filter((item): item is EntityId => item !== null),
    scopes: toScopeList(safe.scopes),
    status: status === 'active' || status === 'revoked' ? status : 'unknown',
    version: toInt(safe.version, 1),
    validFrom: toStr(safe.valid_from),
    validTo: toStr(safe.valid_to),
  }
}

export function toGrantList(raw: unknown): GrantView[] {
  const rawItems = Array.isArray(raw) ? raw : []
  return rawItems.map((item) => toGrantView(item)).filter((item): item is GrantView => item !== null)
}

/** 投递元数据视图：**没有** payload / request_body 字段。 */
export type DeliveryRow = {
  id: EntityId
  eventId: EntityId
  eventType: string
  status: string
  attemptCount: number
  endpointGeneration: number
  ledgerVersion: number
  replayOf: EntityId | null
  correlationId: string
  nextRetryAt: string
  lastErrorClass: string
  createdAt: string
  terminalAt: string
}

export function toDeliveryRow(raw: unknown): DeliveryRow | null {
  if (!isPlainRecord(raw)) return null
  const id = toId(raw.id)
  if (id === null) return null
  const safe = pickAllowed(raw, DELIVERY_SAFE_KEYS)
  return {
    id,
    eventId: toId(safe.event_id) ?? '',
    eventType: toStr(safe.event_type),
    status: toStr(safe.status),
    attemptCount: toInt(safe.attempt_count),
    endpointGeneration: toInt(safe.endpoint_generation),
    ledgerVersion: toInt(safe.ledger_version, 1),
    replayOf: toId(safe.replay_of),
    correlationId: toStr(safe.correlation_id),
    nextRetryAt: toStr(safe.next_retry_at),
    lastErrorClass: toStr(safe.last_error_class),
    createdAt: toStr(safe.created_at),
    terminalAt: toStr(safe.terminal_at),
  }
}

export function toDeliveryList(raw: unknown): DeliveryRow[] {
  const rawItems = Array.isArray(raw) ? raw : []
  return rawItems.map((item) => toDeliveryRow(item)).filter((item): item is DeliveryRow => item !== null)
}

/** 健康度摘要（聚合数字；无 payload）。 */
export type DeliveryStats = {
  total: number
  success: number
  retry: number
  dead: number
  pending: number
  successRate: number
  deadLetterRate: number
}

const DELIVERY_STATS_SAFE_KEYS = [
  'total',
  'success',
  'retry',
  'dead',
  'pending',
  'success_rate',
  'dead_letter_rate',
] as const

/**
 * 成功率口径与 FULL-03 后端一致：success / (success + dead)。
 * 后端给了 success_rate 就用后端值（比率 0..1，**浮点**，不能用整数解析），
 * 否则本地按同一口径计算（口径单点）。
 */
export function toDeliveryStats(raw: unknown): DeliveryStats {
  const record = isPlainRecord(raw) ? raw : {}
  const safe = pickAllowed(record, DELIVERY_STATS_SAFE_KEYS)
  const success = toInt(safe.success)
  const dead = toInt(safe.dead)
  const retry = toInt(safe.retry)
  const pending = toInt(safe.pending)
  const total = toInt(safe.total, success + dead + retry + pending)
  const denied = success + dead
  const backendRate = toRatioOrNull(safe.success_rate)
  return {
    total,
    success,
    retry,
    dead,
    pending,
    successRate: backendRate ?? (denied > 0 ? success / denied : 1),
    deadLetterRate: denied > 0 ? dead / denied : 0,
  }
}

export function formatRate(value: number): string {
  const pct = value * 100
  const rounded = Math.round(pct * 10) / 10
  return `${rounded}%`
}

/** 审计条目（before/after 只保留 AUDIT_DIFF_FIELDS）。 */
export type AuditEntry = {
  id: string
  action: string
  actorAccount: string
  targetKind: string
  targetId: EntityId | null
  createdAt: string
  changed: Array<{ field: string; before: string; after: string }>
}

const AUDIT_SAFE_KEYS = [
  'id',
  'action',
  'actor_account',
  'target_kind',
  'target_id',
  'created_at',
  'before',
  'after',
] as const

export function toAuditEntry(raw: unknown): AuditEntry | null {
  if (!isPlainRecord(raw)) return null
  const safe = pickAllowed(raw, AUDIT_SAFE_KEYS)
  const before = isPlainRecord(safe.before) ? safe.before : {}
  const after = isPlainRecord(safe.after) ? safe.after : {}
  const createdAt = toStr(safe.created_at)
  const action = toStr(safe.action)
  const id = toStr(safe.id) || `${action}:${createdAt}`
  if (action.length === 0 && createdAt.length === 0) return null
  return {
    id,
    action,
    actorAccount: toStr(safe.actor_account),
    targetKind: toStr(safe.target_kind),
    targetId: toId(safe.target_id),
    createdAt,
    changed: buildAuditDiff(before, after),
  }
}

export function toAuditList(raw: unknown): AuditEntry[] {
  const rawItems = Array.isArray(raw) ? raw : []
  return rawItems.map((item) => toAuditEntry(item)).filter((item): item is AuditEntry => item !== null)
}

// ---------------------------------------------------------------------------
// 3. 语义判定
// ---------------------------------------------------------------------------

/** 允许的下一个状态（archived 为终态）。未知当前态 → 空集（fail-closed）。 */
export function nextAllowedStatuses(current: Unknownable<ApplicationStatus>): readonly ApplicationStatus[] {
  if (current === 'unknown') return []
  return STATUS_TRANSITIONS[current]
}

export function assertStatusTransition(
  current: Unknownable<ApplicationStatus>,
  target: ApplicationStatus
): void {
  if (current === 'unknown') {
    throw new Error('当前生命周期状态不可识别，拒绝迁移（fail-closed）')
  }
  if (current === target) {
    throw new Error(`生命周期已是 ${current}，无需迁移`)
  }
  if (!STATUS_TRANSITIONS[current].includes(target)) {
    throw new Error(`非法生命周期迁移：${current} → ${target}`)
  }
}

/**
 * INV-4：scope **无隐含包含**。
 * `impliedScopes(s)` 恒为 `[s]`——三个高危 scope 不被 `messages:send` 隐含。
 */
export function impliedScopes(scope: EnterpriseScope): readonly EnterpriseScope[] {
  return [scope]
}

/** 校验一组待授予 scope：只接受目录内成员；空集拒绝；无 wildcard。 */
export function validateScopeSelection(scopes: readonly string[]): EnterpriseScope[] {
  const catalog = new Set<string>(SCOPE_CATALOG)
  const unique = Array.from(new Set(scopes.map((item) => (typeof item === 'string' ? item.trim() : ''))))
  const unknown = unique.filter((item) => item.length > 0 && !catalog.has(item))
  if (unknown.length > 0) {
    throw new Error(`未登记的 scope：${unknown.join(', ')}`)
  }
  const accepted = unique.filter((item): item is EnterpriseScope => catalog.has(item))
  if (accepted.length === 0) {
    throw new Error('至少需要一个 scope')
  }
  return SCOPE_CATALOG.filter((scope) => accepted.includes(scope))
}

/** 三个高危 scope 是否被显式勾选（UI 用它在提交前加一道强提示）。 */
export function requiresExplicitConfirmation(scopes: readonly EnterpriseScope[]): boolean {
  return NEVER_IMPLIED_SCOPES.some((scope) => scopes.includes(scope))
}

export function diffScopes(before: readonly EnterpriseScope[], after: readonly EnterpriseScope[]) {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: after.filter((scope) => !beforeSet.has(scope)),
    removed: before.filter((scope) => !afterSet.has(scope)),
  }
}

/** scope 降级判定：after ⊆ before 且确有移除。 */
export function isScopeDowngrade(before: readonly EnterpriseScope[], after: readonly EnterpriseScope[]): boolean {
  const diff = diffScopes(before, after)
  return diff.removed.length > 0 && diff.added.length === 0
}

/** 审计 before/after diff（只对白名单字段；数组按集合比较，顺序无关）。 */
export function buildAuditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Array<{ field: string; before: string; after: string }> {
  const out: Array<{ field: string; before: string; after: string }> = []
  for (const field of AUDIT_DIFF_FIELDS) {
    if (!(field in before) && !(field in after)) continue
    const beforeText = renderFieldValue(before[field])
    const afterText = renderFieldValue(after[field])
    if (beforeText === afterText) continue
    out.push({ field, before: beforeText, after: afterText })
  }
  return out
}

function renderFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (Array.isArray(value)) {
    const items = value.map((item) => toStr(item)).filter((item) => item.length > 0)
    return items.length > 0 ? items.slice().sort().join(', ') : '—'
  }
  const text = toStr(value)
  return text.length > 0 ? text : '—'
}

// ---------------------------------------------------------------------------
// 4. 失败分类
// ---------------------------------------------------------------------------

export type GovernanceFailureKind =
  | 'contractViolation' // 响应契约违约（含禁止的 secret / payload 字段）—— 前端熔断
  | 'aggregationUnavailable' // 404 —— Admin 聚合面未接线（PENDING_A0_WIRING）
  | 'unauthenticated' // 401
  | 'forbidden' // 403 —— RBAC 拒绝
  | 'notFound' // 404 且已接线（资源不存在 / 跨组织）
  | 'versionConflict' // 409 + CAS 语义
  | 'conflict' // 409 其它
  | 'validation' // 400/422
  | 'rateLimited' // 429
  | 'serverError' // 5xx
  | 'network'
  | 'unknown'

export type ApiErrorLike = { code?: unknown; msg?: unknown; message?: unknown }

export function toApiErrorLike(err: unknown): ApiErrorLike | null {
  if (err && typeof err === 'object' && ('code' in err || 'msg' in err || 'message' in err)) {
    return err as ApiErrorLike
  }
  return null
}

export function errorCodeOf(err: ApiErrorLike): number {
  const code = err.code
  if (typeof code === 'number' && Number.isFinite(code)) return code
  if (typeof code === 'string') {
    const parsed = Number(code)
    if (Number.isFinite(parsed)) return parsed
  }
  return -1
}

const CAS_MARKERS = ['stale_version', 'cas_mismatch', 'version_conflict', 'expected_version', 'conflict_stale']
const NETWORK_MARKERS = ['network', 'timeout', 'failed to fetch', 'load failed', 'econnrefused', 'etimedout']

/**
 * 传输层错误识别（无 HTTP 状态码）：
 *  - 浏览器 `fetch` 抛 `TypeError`；
 *  - axios 无 response 的 `AxiosError`（`ERR_NETWORK` / 超时 / DNS 失败）。
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err === null || typeof err !== 'object') return false
  const record = err as { name?: unknown; code?: unknown; response?: unknown }
  if (typeof record.code === 'string' && record.code.startsWith('ERR_')) return true
  if (record.name === 'AxiosError') {
    return record.response === undefined || record.response === null
  }
  return false
}

const CONTRACT_VIOLATION_MARKERS = ['禁止的', '熔断', '二次回显', '触发熔断']
const PERMISSION_GUARD_MARKERS = ['缺少 enterprise_business', '权限，拒绝执行']

export function classifyGovernanceFailure(err: unknown, options: { wired?: boolean } = {}): GovernanceFailureKind {
  const wired = options.wired !== false
  const rawMessage = err instanceof Error ? err.message : ''
  // 前端守卫抛出的错误自带语义，优先识别（别被吞成 unknown）
  if (CONTRACT_VIOLATION_MARKERS.some((marker) => rawMessage.includes(marker))) {
    return 'contractViolation'
  }
  if (PERMISSION_GUARD_MARKERS.some((marker) => rawMessage.includes(marker))) {
    return 'forbidden'
  }
  const apiErr = toApiErrorLike(err)
  if (!apiErr) {
    return isNetworkError(err) ? 'network' : 'unknown'
  }
  const code = errorCodeOf(apiErr)
  const msg = `${toStr(apiErr.msg)} ${toStr(apiErr.message)}`.toLowerCase()
  if (code === 401) return 'unauthenticated'
  if (code === 403) return 'forbidden'
  if (code === 404) return wired ? 'notFound' : 'aggregationUnavailable'
  if (code === 409) {
    return CAS_MARKERS.some((marker) => msg.includes(marker)) ? 'versionConflict' : 'conflict'
  }
  if (code === 400 || code === 422) return 'validation'
  if (code === 429) return 'rateLimited'
  if (code >= 500) return 'serverError'
  // 无 HTTP 状态码：先判传输层，再退回 unknown
  if (isNetworkError(err) || NETWORK_MARKERS.some((marker) => msg.includes(marker))) return 'network'
  return 'unknown'
}

export function governanceFailureMessage(kind: GovernanceFailureKind): string {
  switch (kind) {
    case 'contractViolation':
      return '响应契约违约：响应体含被禁止的 secret / payload 字段，前端已熔断（不渲染、不缓存）'
    case 'aggregationUnavailable':
      return 'Admin 企业治理聚合面未接线（/api/adm/enterprise/* 返回 404 / PENDING_A0_WIRING）——本页不展示伪造数据'
    case 'unauthenticated':
      return '登录状态已失效，请重新登录'
    case 'forbidden':
      return '缺少 enterprise_business:read / enterprise_business:write 权限（RBAC 拒绝）'
    case 'notFound':
      return '资源不存在或不在当前组织作用域内'
    case 'versionConflict':
      return '版本已过期（expected_version CAS 冲突）：请刷新后按最新 version 重试'
    case 'conflict':
      return '操作与当前状态冲突，请刷新后重试'
    case 'validation':
      return '请求参数不合法，请修正后重试'
    case 'rateLimited':
      return '请求过于频繁（429），请稍后重试'
    case 'serverError':
      return '服务端错误（5xx），请稍后重试'
    case 'network':
      return '网络异常，请检查连接后重试'
    default:
      return '操作失败，请稍后重试'
  }
}

// ---------------------------------------------------------------------------
// 5. RBAC 纯判定（与 useAdminPermission 同口径的单一事实）
// ---------------------------------------------------------------------------

export function hasPermission(permissions: readonly string[], required: string): boolean {
  return permissions.includes(required)
}

export function canReadGovernance(permissions: readonly string[]): boolean {
  return hasPermission(permissions, READ_PERMISSION)
}

export function canWriteGovernance(permissions: readonly string[]): boolean {
  return hasPermission(permissions, WRITE_PERMISSION)
}

/**
 * 写动作的最终闸门（fail-closed）：
 * 无 `enterprise_business:write` → 拒绝，即使 UI 按钮被绕过。
 */
export function assertWriteAllowed(permissions: readonly string[], action: string): void {
  if (!canWriteGovernance(permissions)) {
    throw new Error(`缺少 ${WRITE_PERMISSION} 权限，拒绝执行：${action}`)
  }
}

/** 生命周期/授权变更是否触及「敏感动作」（需二次确认）——全部写动作都是。 */
export function sensitivityOf(action: string): 'high' | 'medium' {
  const highRisk = ['revoke_credential', 'rotate_credential', 'issue_credential', 'revoke_grant', 'archive_application']
  return highRisk.includes(action) ? 'high' : 'medium'
}
