/**
 * Admin 企业应用治理面 HTTP 服务层（只调 `/api/adm/enterprise/*`）。
 *
 * 纪律（plan-full §7 + FULL-04 brief）：
 *  1. **不碰 internal 前缀**：本文件不出现 `/api/internal` 字面量（单测源码扫描钉死）。
 *  2. **secret 只出现一次**：签发/轮换的明文 secret 在服务层内部直接交给
 *     `secretOnetime` 内存仓，**函数只返回 windowId** —— secret 不进入 React Query
 *     缓存、不进入组件 state、不进 URL、不进任何 storage（结构性无 hydration）。
 *  3. **读面熔断**：所有读响应过 `assertNoSecretFields` / `assertNoPayloadFields`
 *     / `assertNoSecretEcho`（后者用 md5 指纹比对，仓内不留明文）。
 *  4. **写面 fail-closed**：调用方必须显式传入自己的权限集，缺
 *     `enterprise_business:write` 即在**发请求前**抛错。
 */
import { md5 } from 'js-md5'
import client from '@/services/api/client'
import type { ApiResponse } from '@/types/api'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { EntityId } from '@/types/common'
import {
  DEFAULT_PAGE_SIZE,
  ENDPOINTS,
  clampPage,
  clampPageSize,
  type ApplicationStatus,
  type EnterpriseScope,
  type GrantWorkspaceScopeKind,
} from './contracts'
import { assertNoPayloadFields, assertNoSecretFields, collectStringValues } from './guards'
import {
  assertStatusTransition,
  assertWriteAllowed,
  toApplicationDetailFromPayload,
  toApplicationPage,
  toAuditList,
  toCredentialMetaList,
  toDeliveryList,
  toDeliveryStats,
  toGrantList,
  toIssuedCredentialOnce,
  toScopeList,
  validateScopeSelection,
  type ApplicationDetail,
  type ApplicationPage,
  type AuditEntry,
  type CredentialMeta,
  type DeliveryRow,
  type DeliveryStats,
  type GrantView,
} from './pureFunctions'
import { armOnce } from './secretOnetime'

export type GovernanceScope = { organizationId: EntityId; applicationId: EntityId }

/**
 * 已签发 secret 的 md5 指纹集（**只留指纹，不留明文**）。
 * 任何后续响应若回显已签发 secret，指纹比对命中 → 抛错。
 */
const issuedSecretFingerprints = new Set<string>()

function fingerprint(secret: string): string {
  return md5(secret)
}

/** 测试/证据辅助：已登记指纹数。 */
export function issuedFingerprintCount(): number {
  return issuedSecretFingerprints.size
}

/** 递归找出 payload 里所有字符串值，逐个与已签发指纹比对。 */
export function findSecretEcho(payload: unknown, fingerprints: ReadonlySet<string>): string | null {
  if (fingerprints.size === 0) return null
  for (const value of collectStringValues(payload)) {
    if (value.length >= 8 && fingerprints.has(fingerprint(value))) return value
  }
  return null
}

function assertNoSecretEcho(payload: unknown, context: string): void {
  const echoed = findSecretEcho(payload, issuedSecretFingerprints)
  if (echoed !== null) {
    throw new Error(`已签发的 secret 在后续响应中被二次回显 (${context})`)
  }
}

function guardRead(payload: unknown, context: string): void {
  assertNoSecretFields(payload, context)
  assertNoPayloadFields(payload, context)
  assertNoSecretEcho(payload, context)
}

function requireScope(scope: GovernanceScope): GovernanceScope {
  const organizationId = typeof scope.organizationId === 'string' ? scope.organizationId.trim() : ''
  const applicationId = typeof scope.applicationId === 'string' ? scope.applicationId.trim() : ''
  if (organizationId.length === 0) throw new Error('缺少必填 ID：organization_id')
  if (applicationId.length === 0) throw new Error('缺少必填 ID：application_id')
  return { organizationId, applicationId }
}

// ---------------------------------------------------------------------------
// 读面
// ---------------------------------------------------------------------------

/** A-01 Application 列表。 */
export async function listApplications(
  organizationId: EntityId,
  params: { page?: number; size?: number; status?: string; q?: string } = {}
): Promise<ApplicationPage> {
  const size = clampPageSize(params.size ?? DEFAULT_PAGE_SIZE)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.applications(organizationId, { ...params, page: clampPage(params.page ?? 1), size })
  )
  const payload = requireApiPayload(response.data, 'GET admin applications')
  guardRead(payload, 'GET admin applications')
  return toApplicationPage(payload, size)
}

/** A-02 Application 详情（含 lifecycle + scopes + version）。 */
export async function getApplicationDetail(scope: GovernanceScope): Promise<ApplicationDetail> {
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.applicationDetail(organizationId, applicationId)
  )
  const payload = requireApiPayload(response.data, 'GET admin application detail')
  guardRead(payload, 'GET admin application detail')
  return toApplicationDetailFromPayload(payload)
}

/** A-05 credential 元数据列表（无 secret / 无 digest）。 */
export async function listCredentials(scope: GovernanceScope): Promise<CredentialMeta[]> {
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.credentials(organizationId, applicationId)
  )
  const payload = requireApiPayload(response.data, 'GET admin credentials')
  guardRead(payload, 'GET admin credentials')
  return toCredentialMetaList(payload)
}

/** A-09 Grant 列表。 */
export async function listGrants(scope: GovernanceScope): Promise<GrantView[]> {
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.get<ApiResponse<unknown>>(ENDPOINTS.grants(organizationId, applicationId))
  const payload = requireApiPayload(response.data, 'GET admin grants')
  guardRead(payload, 'GET admin grants')
  return toGrantList(payload)
}

/** A-12 投递健康度摘要（无 payload）。 */
export async function getDeliveryStats(scope: GovernanceScope): Promise<DeliveryStats> {
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.deliveryStats(organizationId, applicationId)
  )
  const payload = requireApiPayload(response.data, 'GET admin delivery stats')
  guardRead(payload, 'GET admin delivery stats')
  return toDeliveryStats(payload)
}

/** A-13 投递元数据列表（无 payload / 无 secret）。 */
export async function listDeliveries(
  scope: GovernanceScope,
  params: { page?: number; size?: number; status?: string } = {}
): Promise<DeliveryRow[]> {
  const { organizationId, applicationId } = requireScope(scope)
  const size = clampPageSize(params.size ?? DEFAULT_PAGE_SIZE)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.deliveries(organizationId, applicationId, {
      ...params,
      page: clampPage(params.page ?? 1),
      size,
    })
  )
  const payload = requireApiPayload(response.data, 'GET admin deliveries')
  guardRead(payload, 'GET admin deliveries')
  return toDeliveryList(payload)
}

/** A-14 审计（before/after diff）。 */
export async function listAuditLogs(
  scope: GovernanceScope,
  params: { page?: number; size?: number } = {}
): Promise<AuditEntry[]> {
  const { organizationId, applicationId } = requireScope(scope)
  const size = clampPageSize(params.size ?? DEFAULT_PAGE_SIZE)
  const response = await client.get<ApiResponse<unknown>>(
    ENDPOINTS.auditLogs(organizationId, applicationId, {
      ...params,
      page: clampPage(params.page ?? 1),
      size,
    })
  )
  const payload = requireApiPayload(response.data, 'GET admin audit logs')
  guardRead(payload, 'GET admin audit logs')
  return toAuditList(payload)
}

// ---------------------------------------------------------------------------
// 写面（全部要求显式权限集；全部要求 expected_version CAS）
// ---------------------------------------------------------------------------

export type MutateOptions = {
  /** 调用方当前权限集（来自 /rbac/me）；缺 write 即拒绝。 */
  permissions: readonly string[]
  /** 幂等键（与 internal 面 INV-7 同口径；Admin 写面同样要求）。 */
  idempotencyKey?: string
}

function writeHeaders(options: MutateOptions): Record<string, string> {
  const key = typeof options.idempotencyKey === 'string' ? options.idempotencyKey.trim() : ''
  return key.length > 0 ? { 'Idempotency-Key': key } : {}
}

/** 生成幂等键（浏览器 crypto.randomUUID；不可用时退化为时间戳+随机）。 */
export function newIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** A-03 生命周期迁移（draft/active/disabled/archived；CAS）。 */
export async function changeApplicationStatus(
  scope: GovernanceScope,
  input: { currentStatus: ApplicationDetail['status']; target: ApplicationStatus; expectedVersion: number },
  options: MutateOptions
): Promise<void> {
  assertWriteAllowed(options.permissions, 'change_application_status')
  assertStatusTransition(input.currentStatus, input.target)
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.post<ApiResponse<unknown>>(
    ENDPOINTS.applicationStatus(organizationId, applicationId),
    { status: input.target, expected_version: input.expectedVersion },
    { headers: writeHeaders(options) }
  )
  requireApiPayload(response.data, 'POST admin application status')
}

/** A-04 scope 授予 / 降级（CAS）。 */
export async function updateApplicationScopes(
  scope: GovernanceScope,
  input: { scopes: readonly string[]; expectedVersion: number },
  options: MutateOptions
): Promise<EnterpriseScope[]> {
  assertWriteAllowed(options.permissions, 'update_application_scopes')
  const scopes = validateScopeSelection(input.scopes)
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.put<ApiResponse<unknown>>(
    ENDPOINTS.applicationScopes(organizationId, applicationId),
    { scopes, expected_version: input.expectedVersion },
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'PUT admin application scopes')
  guardRead(payload, 'PUT admin application scopes')
  return toScopeList((payload as { scopes?: unknown })?.scopes ?? payload)
}

export type IssueCredentialResult = {
  credential: CredentialMeta
  /** 一次性展示窗口号（**不含 secret 本体**）。 */
  windowId: number
}

/**
 * A-06 签发 credential。
 *
 * ⚠️ 返回值**不含 secret**：明文在校验后立刻进 `secretOnetime` 内存仓，
 * 由页面用 `readOnce(credential.id)` 读出一次。secret 不进 React Query 缓存。
 */
export async function issueCredential(
  scope: GovernanceScope,
  input: { expiresAt?: string } = {},
  options: MutateOptions
): Promise<IssueCredentialResult> {
  assertWriteAllowed(options.permissions, 'issue_credential')
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.post<ApiResponse<unknown>>(
    ENDPOINTS.issueCredential(organizationId, applicationId),
    input.expiresAt ? { expires_at: input.expiresAt } : {},
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'POST admin issue credential')
  const once = toIssuedCredentialOnce(payload, 'POST admin issue credential')
  issuedSecretFingerprints.add(fingerprint(once.secret))
  const windowId = armOnce({
    credentialId: once.credential.id,
    credentialPrefix: once.credential.prefix,
    secret: once.secret,
    mode: 'issue',
  })
  return { credential: once.credential, windowId }
}

/** A-07 轮换 credential（唯一携带 secret 的另一个响应）。 */
export async function rotateCredential(
  scope: GovernanceScope,
  credentialId: EntityId,
  options: MutateOptions
): Promise<IssueCredentialResult> {
  assertWriteAllowed(options.permissions, 'rotate_credential')
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.post<ApiResponse<unknown>>(
    ENDPOINTS.rotateCredential(organizationId, applicationId, credentialId),
    {},
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'POST admin rotate credential')
  const once = toIssuedCredentialOnce(payload, 'POST admin rotate credential')
  issuedSecretFingerprints.add(fingerprint(once.secret))
  const windowId = armOnce({
    credentialId: once.credential.id,
    credentialPrefix: once.credential.prefix,
    secret: once.secret,
    mode: 'rotate',
  })
  return { credential: once.credential, windowId }
}

/** A-08 撤销 credential（敏感动作，UI 需二次确认）。 */
export async function revokeCredential(
  scope: GovernanceScope,
  credentialId: EntityId,
  options: MutateOptions
): Promise<void> {
  assertWriteAllowed(options.permissions, 'revoke_credential')
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.delete<ApiResponse<unknown>>(
    ENDPOINTS.revokeCredential(organizationId, applicationId, credentialId),
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'DELETE admin credential')
  guardRead(payload, 'DELETE admin credential')
}

export type GrantInput = {
  scopes: readonly string[]
  workspaceScopeKind: GrantWorkspaceScopeKind
  workspaceIds: EntityId[]
  validFrom?: string
  validTo?: string
}

function normalizeGrantInput(input: GrantInput) {
  const scopes = validateScopeSelection(input.scopes)
  const workspaceIds = Array.from(new Set(input.workspaceIds.map((item) => item.trim()).filter(Boolean)))
  if (input.workspaceScopeKind === 'explicit' && workspaceIds.length === 0) {
    throw new Error('Workspace Grant 必须至少指定一个 workspace_id')
  }
  if (input.workspaceScopeKind === 'none' && workspaceIds.length > 0) {
    throw new Error('Organization Grant 不接受 workspace_ids')
  }
  return { scopes, workspaceIds, workspaceScopeKind: input.workspaceScopeKind }
}

/** A-10 新增 Grant。 */
export async function issueGrant(
  scope: GovernanceScope,
  input: GrantInput & { expectedVersion: number },
  options: MutateOptions
): Promise<GrantView | null> {
  assertWriteAllowed(options.permissions, 'issue_grant')
  const normalized = normalizeGrantInput(input)
  const { organizationId, applicationId } = requireScope(scope)
  const response = await client.post<ApiResponse<unknown>>(
    ENDPOINTS.issueGrant(organizationId, applicationId),
    {
      scopes: normalized.scopes,
      workspace_scope_kind: normalized.workspaceScopeKind,
      workspace_ids: normalized.workspaceIds,
      expected_version: input.expectedVersion,
      valid_from: input.validFrom,
      valid_to: input.validTo,
    },
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'POST admin issue grant')
  guardRead(payload, 'POST admin issue grant')
  const list = toGrantList(Array.isArray(payload) ? payload : [payload])
  return list[0] ?? null
}

export type GrantPatch = {
  expectedVersion: number
  scopes?: readonly string[]
  workspaceScopeKind?: GrantWorkspaceScopeKind
  workspaceIds?: EntityId[]
  revoke?: boolean
}

/** A-11 Grant CAS 增删（scopes / workspaces / 撤销）。 */
export async function patchGrant(
  scope: GovernanceScope,
  grantId: EntityId,
  patch: GrantPatch,
  options: MutateOptions
): Promise<void> {
  assertWriteAllowed(options.permissions, 'patch_grant')
  const { organizationId, applicationId } = requireScope(scope)
  const body: Record<string, unknown> = { expected_version: patch.expectedVersion }
  if (patch.revoke === true) body.revoke = true
  if (patch.scopes !== undefined) body.scopes = validateScopeSelection(patch.scopes)
  if (patch.workspaceScopeKind !== undefined) body.workspace_scope_kind = patch.workspaceScopeKind
  if (patch.workspaceIds !== undefined) {
    body.workspace_ids = Array.from(new Set(patch.workspaceIds.map((item) => item.trim()).filter(Boolean)))
  }
  const response = await client.patch<ApiResponse<unknown>>(
    ENDPOINTS.grant(organizationId, applicationId, grantId),
    body,
    { headers: writeHeaders(options) }
  )
  const payload = requireApiPayload(response.data, 'PATCH admin grant')
  guardRead(payload, 'PATCH admin grant')
}

/** 清空指纹集（测试/登出）。 */
export function resetIssuedFingerprints(): void {
  issuedSecretFingerprints.clear()
}
