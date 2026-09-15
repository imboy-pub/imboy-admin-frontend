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
