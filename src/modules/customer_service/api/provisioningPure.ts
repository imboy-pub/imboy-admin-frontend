/**
 * 客服开通向导（ADM-01）纯函数层。
 *
 * 契约真源：api-surface-freeze.json `admin_provisioning` 段（frozen）——
 * `/api/adm` 平台面、`customer_service:write` 等既有平台权限、事务化创建/修复
 * identity/assignment/seat、actor/target/before/after 不可抵赖审计。
 *
 * 安全要点（ADM-01-A01/A04/A05）：
 * - provisioning 响应投影走「白名单 + 敏感键熔断」双层（复用 CS-03 isSensitiveKey），
 *   审计条目只投影 action/actor/target/before/after 五键；
 * - 接入 snippet 结构上不可能包含 tenant 参数：函数签名只接受 public widget id
 *   与 Widget origin（loader `src` 的 origin），Organization 由后端以 installation
 *   权威解析，绝不出现 data-org-id / secret / token；
 * - Widget origin 复用 installation 面的严格 origin 校验（精确 protocol+host+port，
 *   无通配、无路径）。
 */
import { isSensitiveKey } from './pureFunctions'
import { isValidPublicWidgetId, originOrNull } from './widgetInstallationsPure'

/** 单条审计投影：actor/target/before/after 不可抵赖审计的最小展示面。 */
export type CsProvisioningAuditEntry = {
  action: string
  actor: string
  target: string
  before: string | null
  after: string | null
}

/** 开通结果中的 seat 投影（enabled seat 是自举成功的判定事实）。 */
export type CsProvisioningSeat = {
  business_identity_id: string
  workspace_id: string
  enabled: boolean
  status: string
}

/** POST provisioning 的成功响应投影（白名单；fail-closed）。 */
export type CsProvisioningResult = {
  organization_id: string
  workspace_id: string
  identity_id: string
  assignment_id: string | null
  seat: CsProvisioningSeat | null
  /** 是否为既有资源的修复（幂等重放/repair），后端缺失时按 false 呈现。 */
  repaired: boolean
  audits: CsProvisioningAuditEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** provisioning 层附加敏感键（与 installation 面 INSTALLATION_SENSITIVE_EXTRA 同口径）。 */
const PROVISIONING_SENSITIVE_EXTRA = /shop_key|identity_key|one_time_secret/i

function isSensitive(key: string): boolean {
  return isSensitiveKey(key) || PROVISIONING_SENSITIVE_EXTRA.test(key)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function strOrNull(value: unknown): string | null {
  const text = str(value)
  return text.length > 0 ? text : null
}

function idOrEmpty(value: unknown): string {
  // TSID 以 string 传输（TSID-string 纪律）；number 一律拒绝投影（fail-closed）。
  return typeof value === 'string' ? value.trim() : ''
}

/** 审计条目投影：白名单五键 + 敏感键熔断（命中即丢弃整条，防泄漏）。 */
export function toCsProvisioningAuditEntry(raw: unknown): CsProvisioningAuditEntry | null {
  if (!isRecord(raw)) return null
  for (const key of Object.keys(raw)) {
    if (isSensitive(key)) return null
  }
  const action = str(raw['action'])
  const actor = str(raw['actor'])
  const target = str(raw['target'])
  if (action.length === 0 || actor.length === 0 || target.length === 0) return null
  return {
    action,
    actor,
    target,
    before: strOrNull(raw['before']),
    after: strOrNull(raw['after']),
  }
}

export function toCsProvisioningAuditList(raw: unknown): CsProvisioningAuditEntry[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(toCsProvisioningAuditEntry).filter((item): item is CsProvisioningAuditEntry => item !== null)
}

function toSeatProjection(raw: unknown): CsProvisioningSeat | null {
  if (!isRecord(raw)) return null
  for (const key of Object.keys(raw)) {
    if (isSensitive(key)) return null
  }
  const identityId = idOrEmpty(raw['business_identity_id'])
  if (identityId.length === 0) return null
  const enabledRaw = raw['enabled']
  return {
    business_identity_id: identityId,
    workspace_id: idOrEmpty(raw['workspace_id']),
    enabled: enabledRaw === true || enabledRaw === 'true',
    status: str(raw['status']) || 'unknown',
  }
}

/**
 * provisioning 响应投影。容忍两种形状（后端 BE-S01b 未定稿，端到端联调
 * DEPENDENT_BACKEND_BS01B）：identity/assignment 嵌套对象或 *_id 平铺键；
 * identity 事实与 organization_id/workspace_id 缺一即返回 null（fail-closed）。
 */
export function toCsProvisioningResult(raw: unknown): CsProvisioningResult | null {
  if (!isRecord(raw)) return null
  for (const key of Object.keys(raw)) {
    if (isSensitive(key)) return null
  }
  const organizationId = idOrEmpty(raw['organization_id'])
  const workspaceId = idOrEmpty(raw['workspace_id'])
  if (organizationId.length === 0 || workspaceId.length === 0) return null
  const identityRaw = isRecord(raw['identity']) ? raw['identity'] : {}
  const identityId =
    idOrEmpty(identityRaw['id']).length > 0
      ? idOrEmpty(identityRaw['id'])
      : idOrEmpty(raw['identity_id'])
  if (identityId.length === 0) return null
  const assignmentRaw = isRecord(raw['assignment']) ? raw['assignment'] : {}
  const assignmentId =
    idOrEmpty(assignmentRaw['id']).length > 0
      ? idOrEmpty(assignmentRaw['id'])
      : idOrEmpty(raw['assignment_id'])
  return {
    organization_id: organizationId,
    workspace_id: workspaceId,
    identity_id: identityId,
    assignment_id: assignmentId.length > 0 ? assignmentId : null,
    seat: toSeatProjection(raw['seat']),
    repaired: raw['repaired'] === true,
    audits: toCsProvisioningAuditList(raw['audit'] ?? raw['audit_entries'] ?? raw['audits']),
  }
}

/**
 * ADM-01-A05 接入 snippet：只含 public widget id；Widget origin 只出现在
 * loader `src`（loader 从自身 script.src 推导 origin）；Organization 由后端
 * 以 installation 权威解析——签名不接受 organization 参数（结构上杜绝
 * 重复 tenant 参数），也绝不包含任何 secret。
 */
export function buildProvisionSnippet(
  publicWidgetId: string,
  options: { widgetOrigin: string }
): string {
  if (!isValidPublicWidgetId(publicWidgetId)) {
    throw new Error('public_widget_id 形状非法，拒绝生成接入代码')
  }
  const origin = originOrNull(options.widgetOrigin)
  if (origin === null) {
    throw new Error('Widget origin 非法（需 http(s) 精确 origin，无通配/路径），拒绝生成接入代码')
  }
  return `<script async src="${origin}/loader.js" data-widget-id="${publicWidgetId}"></script>`
}
