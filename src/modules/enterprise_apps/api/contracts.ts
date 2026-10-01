/**
 * Admin 企业应用治理面 — 冻结合同（路径 / 权限 / scope 目录 / 生命周期）。
 *
 * 硬边界（FULL-04 brief + manifest INV-2/INV-3）：
 * Admin 是 **Human/Admin 会话**（adm cookie），**不得**调用 `/api/internal/v1/*`。
 * 本文件的 BASE 挂在 `client.ts` 的 `BASE_URL = '/api/adm'` 之下，最终形如
 * `/api/adm/enterprise/...`，与 internal 前缀在字符串层面就不相交。
 *
 * 后端聚合面状态：`PENDING_A0_WIRING`（见 checkpoints/FULL-04.md §0.5）。
 * 未接线时前端诚实失败（404 → `aggregationUnavailable`），不伪造任何数据。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'

/** 挂在 client BASE_URL('/api/adm') 之下的治理面前缀。 */
export const ENTERPRISE_APPS_BASE = '/enterprise'

/** 读取权限码：与后端 `role_acl/1` + `required_permission` 元数据逐字一致。 */
export const READ_PERMISSION = 'enterprise_business:read'
/** 写入权限码：仅 role_id=1（super_admin）持有；role 2 只读。 */
export const WRITE_PERMISSION = 'enterprise_business:write'

/**
 * ⚠️ 后端聚合面接线状态开关（**A0 接线完成后改为 true**）。
 *
 * `false`：`/api/adm/enterprise/*`（checkpoint §0.5 A-01..A-14）尚未注册，404 归类为
 * `aggregationUnavailable`，页面显示「聚合面未接线」的诚实失败。
 * `true`（**FULL-08 接线完成后的实际状态**）：后端已在
 * `imboy_router:enterprise_application_governance_routes/0` 注册 A-01..A-14，
 * 404 归类为 `notFound`（资源不存在 / 跨组织）。
 *
 * 该开关只影响**错误文案分类**，不影响任何请求路径与权限判定。
 *
 * 接线证据（A0，FULL-08）：迁移 00000143 + `adm_enterprise_application_handler`
 * + `enterprise_admin_governance_logic` + 真库往返测试
 * `test/repo/enterprise_app_lifecycle_migration_pg_tests.erl`（9/9）、
 * `test/repo/enterprise_admin_governance_pg_tests.erl`（6/6）。
 */
export const GOVERNANCE_BACKEND_WIRED = true

/**
 * 固定 scope 全集（16 值，读写分别授权）。
 * 真源：`src/api/enterprise_internal_scope.erl:?SCOPES` +
 * `priv/migrations/00000160_workspace_internal_write.up.sql` 的 DB CHECK。
 * 无 wildcard（INV-4）。
 */
export const SCOPE_CATALOG = [
  'application:read',
  'identities:read',
  'identities:write',
  'groups:read',
  'groups:write',
  'workspaces:read',
  'projects:read',
  'channels:read',
  'files:write',
  'messages:send',
  'messages:send_as_human',
  'friend_requests:create',
  'webhooks:manage',
  'sso:exchange',
  'customer_service:read',
  'customer_service:write',
  'workspaces:write',
] as const

export type EnterpriseScope = (typeof SCOPE_CATALOG)[number]

/**
 * INV-4：这三个 scope **必须显式授予**，不被 `messages:send` 隐含。
 * 单测钉死 `impliedScopes('messages:send') === ['messages:send']`。
 */
export const NEVER_IMPLIED_SCOPES: readonly EnterpriseScope[] = [
  'messages:send_as_human',
  'friend_requests:create',
  'webhooks:manage',
]

/** scope 中文说明（Admin 展示用；不改变 scope 语义）。 */
export const SCOPE_LABELS: Record<EnterpriseScope, string> = {
  'application:read': '读取自身应用上下文',
  'identities:read': '读取身份映射',
  'identities:write': '写入身份映射',
  'groups:read': '读取企业群与成员',
  'groups:write': '企业群写',
  'workspaces:read': '读取已授权工作空间',
  'projects:read': '读取已授权企业项目',
  'channels:read': '读取已授权企业频道',
  'files:write': '企业附件写',
  'messages:send': '以应用身份发消息',
  'messages:send_as_human': '代同组织已映射 Human 发消息',
  'friend_requests:create': '代已映射 Human 发起好友申请（不可自动接受）',
  'webhooks:manage': 'Webhook 管理',
  'sso:exchange': '一次性 SSO 交换',
  'customer_service:read': '读取企业客服坐席（企业全域授权）',
  'customer_service:write': '管理企业客服坐席（企业全域授权）',
  'workspaces:write': '创建、修改和归档企业工作空间',
}

/** Application 生命周期（plan-full §3.1）。 */
export const APPLICATION_STATUSES = ['draft', 'active', 'disabled', 'archived'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: '草稿',
  active: '启用',
  disabled: '停用',
  archived: '归档',
}

/** 允许的生命周期迁移（单向；archived 为终态，只能回到 active 之外只读）。 */
export const STATUS_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  draft: ['active', 'archived'],
  active: ['disabled', 'archived'],
  disabled: ['active', 'archived'],
  archived: [],
}

/** credential 状态（含到期呈现）。 */
export const CREDENTIAL_STATUSES = ['active', 'revoked', 'expired'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  active: '有效',
  revoked: '已撤销',
  expired: '已过期',
}

/** Grant workspace 范围语义（migration 139：一表一 Grant）。 */
export const GRANT_WORKSPACE_SCOPE_KINDS = ['none', 'explicit'] as const
export type GrantWorkspaceScopeKind = (typeof GRANT_WORKSPACE_SCOPE_KINDS)[number]

export const GRANT_WORKSPACE_SCOPE_LABELS: Record<GrantWorkspaceScopeKind, string> = {
  none: 'Organization Grant（组织全域）',
  explicit: 'Workspace Grant（显式工作区）',
}

/** Grant 状态（后端 status 枚举镜像）。 */
export const GRANT_STATUSES = ['active', 'revoked'] as const
export type GrantStatus = (typeof GRANT_STATUSES)[number]

/**
 * 投递列表允许出现的**元数据**字段白名单。
 * 任何 `payload` / `request_body` / `response_body` / `secret` 键都触发熔断。
 */
export const DELIVERY_SAFE_KEYS = [
  'id',
  'event_id',
  'event_type',
  'status',
  'attempt_count',
  'max_attempts',
  'endpoint_generation',
  'ledger_version',
  'replay_of',
  'correlation_id',
  'next_retry_at',
  'last_error_class',
  'created_at',
  'updated_at',
  'terminal_at',
] as const

/** credential 元数据白名单（**无 secret / 无 digest**）。 */
export const CREDENTIAL_SAFE_KEYS = [
  'id',
  'credential_prefix',
  'status',
  'created_at',
  'expires_at',
  'last_used_at',
  'revoked_at',
  'version',
] as const

/** 审计条目白名单（before/after 只允许这些业务字段进 diff）。 */
export const AUDIT_DIFF_FIELDS = [
  'status',
  'scopes',
  'workspace_scope_kind',
  'workspace_ids',
  'valid_from',
  'valid_to',
  'credential_status',
  'credential_prefix',
] as const

/** 审计动作码 → 中文（后端 action 字面量集合，Admin 只展示）。 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  application_created: '创建应用',
  application_status_changed: '生命周期变更',
  application_scopes_changed: 'scope 变更',
  credential_issued: '签发凭证',
  credential_rotated: '轮换凭证',
  credential_revoked: '撤销凭证',
  grant_issued: '新增授权',
  grant_scopes_changed: '授权 scope 变更',
  grant_workspaces_changed: '授权工作区变更',
  grant_revoked: '撤销授权',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

/** 危险的“敏感键”熔断正则（与 enterprise_business / customer_service 同口径，本模块自持一份）。 */
export const SENSITIVE_KEY_PATTERN =
  /(secret|cipher|hmac|digest|password|passwd|authorization|cookie|api_key|private_key|signing_key)/i

/** 响应体里**绝不允许**出现的键（出现即视为后端契约违约，前端熔断并报错）。 */
export const SECRET_FORBIDDEN_KEYS = [
  'secret',
  'secret_digest',
  'secret_hash',
  'credential_secret',
  'credential_hash',
  'token_digest',
  'token_hash',
  'sha256_digest',
  'signing_key',
  'private_key',
] as const

/** 投递/事件响应里**绝不允许**出现的正文键。 */
export const PAYLOAD_FORBIDDEN_KEYS = [
  'payload',
  'request_body',
  'response_body',
  'body',
  'body_cipher',
  'content',
  'raw_body',
] as const

/** 仅签发/轮换响应允许携带的唯一字段名。 */
export const SECRET_ONCE_FIELD = 'secret'

type QueryValue = string | number | undefined

function query(params: Record<string, QueryValue>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

function requirePathId(value: EntityId, label: string): string {
  const id = coerceEntityId(value, '')
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return encodeURIComponent(id)
}

function appPath(organizationId: EntityId, applicationId?: EntityId): string {
  const org = requirePathId(organizationId, 'organization_id')
  const base = `${ENTERPRISE_APPS_BASE}/organizations/${org}/applications`
  if (applicationId === undefined) return base
  return `${base}/${requirePathId(applicationId, 'application_id')}`
}

function credentialPath(organizationId: EntityId, applicationId: EntityId, credentialId?: EntityId): string {
  const base = `${appPath(organizationId, applicationId)}/credentials`
  if (credentialId === undefined) return base
  return `${base}/${requirePathId(credentialId, 'credential_id')}`
}

function grantPath(organizationId: EntityId, applicationId: EntityId, grantId?: EntityId): string {
  const base = `${appPath(organizationId, applicationId)}/grants`
  if (grantId === undefined) return base
  return `${base}/${requirePathId(grantId, 'grant_id')}`
}

/**
 * 冻结合同表：A-01..A-14（checkpoint §0.5）。
 * 单测逐条断言字符串，防止路径漂移。
 */
export const ENDPOINTS = {
  /** A-01 列表 */
  applications: (orgId: EntityId, params: { page?: number; size?: number; status?: string; q?: string } = {}) =>
    `${appPath(orgId)}${query({ page: params.page, size: params.size, status: params.status, q: params.q })}`,
  /** A-02 详情 */
  applicationDetail: (orgId: EntityId, appId: EntityId) => appPath(orgId, appId),
  /** A-03 生命周期迁移 */
  applicationStatus: (orgId: EntityId, appId: EntityId) => `${appPath(orgId, appId)}/status`,
  /** A-04 scope 授予/降级 */
  applicationScopes: (orgId: EntityId, appId: EntityId) => `${appPath(orgId, appId)}/scopes`,
  /** A-05 credential 元数据列表 */
  credentials: (orgId: EntityId, appId: EntityId) => credentialPath(orgId, appId),
  /** A-06 签发（唯一携带 secret 的响应） */
  issueCredential: (orgId: EntityId, appId: EntityId) => credentialPath(orgId, appId),
  /** A-07 轮换（唯一携带 secret 的响应） */
  rotateCredential: (orgId: EntityId, appId: EntityId, credentialId: EntityId) =>
    `${credentialPath(orgId, appId, credentialId)}/rotate`,
  /** A-08 撤销 */
  revokeCredential: (orgId: EntityId, appId: EntityId, credentialId: EntityId) =>
    credentialPath(orgId, appId, credentialId),
  /** A-09 Grant 列表 */
  grants: (orgId: EntityId, appId: EntityId) => grantPath(orgId, appId),
  /** A-10 新增 Grant */
  issueGrant: (orgId: EntityId, appId: EntityId) => grantPath(orgId, appId),
  /** A-11 Grant CAS 增删 */
  grant: (orgId: EntityId, appId: EntityId, grantId: EntityId) => grantPath(orgId, appId, grantId),
  /** A-12 投递统计（无 payload） */
  deliveryStats: (orgId: EntityId, appId: EntityId) => `${appPath(orgId, appId)}/delivery-stats`,
  /** A-13 投递列表（无 payload / 无 secret） */
  deliveries: (orgId: EntityId, appId: EntityId, params: { page?: number; size?: number; status?: string } = {}) =>
    `${appPath(orgId, appId)}/deliveries${query({ page: params.page, size: params.size, status: params.status })}`,
  /** A-14 审计（before/after diff） */
  auditLogs: (orgId: EntityId, appId: EntityId, params: { page?: number; size?: number } = {}) =>
    `${appPath(orgId, appId)}/audit-logs${query({ page: params.page, size: params.size })}`,
} as const

/** 分页边界（列表页统一默认 size=10，与仓内规范一致）。 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

export function clampPageSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  const size = Math.trunc(value)
  if (size < 1) return DEFAULT_PAGE_SIZE
  return size > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : size
}

export function clampPage(value: number): number {
  if (!Number.isFinite(value)) return 1
  const page = Math.trunc(value)
  return page < 1 ? 1 : page
}
