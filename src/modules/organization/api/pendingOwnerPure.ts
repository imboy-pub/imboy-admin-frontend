/**
 * 待激活 Owner 纯函数（GZAPP-06 / D11-D13 + §4.1）。
 *
 * 契约真源（后端 worktree run/gzapp-06-...，adm 面）：
 *   - `src/adm/adm_organization_handler.erl`（owner_mode 分流：registered |
 *     pending_phone；创建响应含 owner_activation 一次性 activation_token）
 *   - `src/adm/adm_owner_activation_handler.erl`（resend / reactivate /
 *     consume / owner-transfer-by-phone / 状态卡）
 *   - `src/logic/organization_owner_activation_logic.erl` + 迁移 00000138
 *
 * 关键口径：
 *   - 创建请求体严格四键 {name, owner_mode:'pending_phone',
 *     default_workspace_name, owner_mobile}（owner_mode=registered 时仍走
 *     既有三键契约，见 pureFunctions.buildCreateOrganizationBody）；
 *   - 手机号归一化与后端 imboy_mobile 同口径（去空白/连字符/括号 → 剥「+」
 *     → 「86+恰11位」剥区号 → 5..20 位纯数字）；脱敏 = 前3后4（展示一律用
 *     服务端 mobile_masked，本地 mask 仅用于错误消息兜底，绝无明文落日志）；
 *   - 30 天 TTL：到期是查询谓词不是状态值（expired = expires_at <= now），
 *     到期行不删除，reactivate 刷新 TTL 回 pending；
 *   - resend/reactivate 都轮换 token（后端只存 sha256 digest，明文只随本次
 *     响应出现一次），旧链接即时失效；
 *   - 状态标签面：pending | sms_failed | activated | superseded + 派生态
 *     expired / reactivated（reactivated 是 UI 动作态：重激活成功后回 pending，
 *     标签上提示 TTL 已重置）。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'
import { classifyOrgError, type OrgFailure } from './pureFunctions'

// ===========================================================================
// 类型（出站白名单投影；mobile 明文永不出现在任何视图类型）
// ===========================================================================

export type PendingOwnerMode = 'registered' | 'pending_phone'

export type PendingOwnerInviteStatus = 'pending' | 'sms_failed' | 'activated' | 'superseded'

/** UI 派生标签态：expired 由 TTL 谓词派生；reactivated 为动作成功提示态。 */
export type PendingOwnerLabelStatus = PendingOwnerInviteStatus | 'expired' | 'reactivated'

export type PendingOwnerInviteView = {
  inviteId: EntityId
  organizationId: EntityId
  ownerUserId: EntityId
  status: PendingOwnerInviteStatus
  mobileMasked: string
  expiresAt: number | null
  lastSentAt: number | null
  resendCount: number
  consumedAt: number | null
  createdAt: number | null
  ttlRemainingSeconds: number | null
  expired: boolean
}

export type PendingOwnerStatusView = {
  organizationId: EntityId
  organizationName: string
  organizationStatus: string
  ownerUserId: EntityId
  ownerActivated: boolean
  invite: PendingOwnerInviteView | null
}

export type CreatePendingOwnerActivationView = {
  inviteId: EntityId
  organizationId: EntityId
  ownerUserId: EntityId
  status: PendingOwnerInviteStatus
  mobileMasked: string
  expiresAt: number | null
  resendCount: number
  /** 一次性明文 token：只在 create / resend / reactivate / transfer 响应出现。 */
  activationToken: string | null
}

export type CreatePendingOwnerResult = {
  organizationId: EntityId
  organizationName: string
  workspaceId: EntityId
  created: boolean
  smsSent: boolean
  ownerActivation: CreatePendingOwnerActivationView | null
}

export type TransferOwnerByPhoneResult = {
  organizationId: EntityId
  ownerUserId: EntityId
  previousOwnerId: EntityId
  mode: 'direct_transfer' | 'pending_transfer'
  smsSent: boolean
  invite: CreatePendingOwnerActivationView | null
}

export type PendingOwnerCreateInput = {
  name: string
  ownerMobile: string
  defaultWorkspaceName: string
}

// ===========================================================================
// 手机号归一化 / 脱敏（与后端 imboy_mobile 同口径）
// ===========================================================================

export type MobileNormalization =
  | { ok: true; mobile: string }
  | { ok: false; error: string }

/** 归一化手机号输入（5..20 位纯数字；剥 + 与「86+恰11位」区号）。 */
export function normalizeMobileInput(raw: string): MobileNormalization {
  const stripped = raw
    .trim()
    .replace(/[\s\-()]/g, '')
    .replace(/^\+/, '')
  let mobile = stripped
  if (/^86\d{11}$/.test(stripped)) {
    mobile = stripped.slice(2)
  }
  if (!/^\d{5,20}$/.test(mobile)) {
    return { ok: false, error: '手机号格式非法（5-20 位数字，可含 +86 前缀）' }
  }
  return { ok: true, mobile }
}

/** 本地脱敏（前3后4；仅用于错误消息兜底——展示一律用服务端 mobile_masked）。 */
export function maskMobile(mobile: string): string {
  if (mobile.length < 8) return '****'
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`
}

// ===========================================================================
// 创建请求体（严格四键；owner_mode 恒 'pending_phone'）
// ===========================================================================

/**
 * 严格构造 pending_phone 创建请求体：仅四键。任意缺字段 / 空白 / 手机号
 * 非法均抛错——充当契约回归护栏（测试据此断言形状）。
 */
export function buildCreateOrganizationPendingBody(input: PendingOwnerCreateInput): {
  name: string
  owner_mode: 'pending_phone'
  default_workspace_name: string
  owner_mobile: string
} {
  const name = input.name.trim()
  const defaultWorkspaceName = input.defaultWorkspaceName.trim()
  if (name.length === 0) throw new Error('组织名称不能为空')
  if (defaultWorkspaceName.length === 0) throw new Error('默认工作区名称不能为空')
  const mobile = normalizeMobileInput(input.ownerMobile)
  if (!mobile.ok) throw new Error(mobile.error)
  return {
    name,
    owner_mode: 'pending_phone',
    default_workspace_name: defaultWorkspaceName,
    owner_mobile: mobile.mobile,
  }
}

// ===========================================================================
// TTL（30 天；到期为谓词派生态）
// ===========================================================================

/** TTL 剩余秒数（可为负——负值即已过期秒数）。 */
export function ttlRemainingSeconds(expiresAt: number | null | undefined, now: number): number | null {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
  return Math.floor(expiresAt - now)
}

export function isInviteExpired(expiresAt: number | null | undefined, now: number): boolean {
  const remaining = ttlRemainingSeconds(expiresAt, now)
  return remaining != null && remaining <= 0
}

/** TTL 展示：剩余天数/小时；已过期给「已过期 N 天」（负 TTL 不吞）。 */
export function formatTtl(remainingSeconds: number | null): string {
  if (remainingSeconds == null) return '未知'
  if (remainingSeconds <= 0) {
    const overdueDays = Math.floor(-remainingSeconds / 86400)
    return overdueDays > 0 ? `已过期 ${overdueDays} 天` : '已过期'
  }
  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  if (days > 0) return `剩 ${days} 天 ${hours} 时`
  return `剩 ${hours} 时`
}

// ===========================================================================
// 状态标签
// ===========================================================================

/** 状态标签（pending|sms_failed|reactivated|superseded + activated/expired）。 */
export function pendingOwnerStatusLabel(
  status: PendingOwnerLabelStatus,
  expired = false
): string {
  switch (status) {
    case 'pending':
      return expired ? '待激活（已过期，可重新激活）' : '待激活'
    case 'sms_failed':
      return '短信发送失败（可重发）'
    case 'activated':
      return '已激活'
    case 'superseded':
      return '已作废（Owner 已更换）'
    case 'reactivated':
      return '已重新激活（TTL 已重置 30 天）'
    default:
      return '未知'
  }
}

/** 从 invite 视图派生主标签（先判终态，再叠 expired 谓词）。 */
export function inviteLabel(invite: PendingOwnerInviteView | null): string {
  if (!invite) return '无待处理邀请'
  if (invite.status === 'pending' && invite.expired) {
    return pendingOwnerStatusLabel('pending', true)
  }
  return pendingOwnerStatusLabel(invite.status)
}

// ===========================================================================
// 错误提示（复用 classifyOrgError 稳定归类 + 待激活旅程特有行动指引）
// ===========================================================================

export function pendingOwnerErrorHint(failure: OrgFailure): string {
  switch (failure.kind) {
    case 'validation':
      return `请求被拒（400）：${failure.message}。请检查手机号（5-20 位数字）与组织名 / 默认工作区名称。`
    case 'forbidden':
      return `无权限（403）：当前管理员缺少 organizations:write。授权由服务端 fail-closed 判定。`
    case 'not_found':
      return `目标不存在（404）：${failure.message}。组织或待处理邀请可能已变化，请刷新。`
    case 'conflict':
      return `冲突（409）：${failure.message}。若是创建时提示手机号已注册，请改用「已注册用户」模式选择该用户。`
    case 'server':
      return `服务端事务失败（500）：${failure.message}。事务已整体回滚，可稍后重试。`
    default:
      return failure.message
  }
}

/** 便捷入口：err → hint 文案（对话框 / 面板通用）。 */
export function pendingOwnerErrorHintOf(err: unknown): string {
  return pendingOwnerErrorHint(classifyOrgError(err))
}

// ===========================================================================
// 响应归一化（防御性出站投影；TSID 全 string；mobile 明文永不进入视图）
// ===========================================================================

function toIntOrNUll(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function toInviteStatus(value: unknown): PendingOwnerInviteStatus {
  return value === 'sms_failed' || value === 'activated' || value === 'superseded'
    ? value
    : 'pending'
}

export function toPendingOwnerInviteView(payload: unknown): PendingOwnerInviteView | null {
  if (payload == null || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  return {
    inviteId: coerceEntityId(row['invite_id'] ?? row['id']),
    organizationId: coerceEntityId(row['organization_id']),
    ownerUserId: coerceEntityId(row['owner_user_id']),
    status: toInviteStatus(row['status']),
    mobileMasked: typeof row['mobile_masked'] === 'string' ? row['mobile_masked'] : '****',
    expiresAt: toIntOrNUll(row['expires_at']),
    lastSentAt: toIntOrNUll(row['last_sent_at']),
    resendCount: typeof row['resend_count'] === 'number' ? row['resend_count'] : 0,
    consumedAt: toIntOrNUll(row['consumed_at']),
    createdAt: toIntOrNUll(row['created_at']),
    ttlRemainingSeconds: toIntOrNUll(row['ttl_remaining_seconds']),
    expired: row['expired'] === true,
  }
}

export function toPendingOwnerStatusView(payload: unknown): PendingOwnerStatusView {
  const row = (payload ?? {}) as Record<string, unknown>
  return {
    organizationId: coerceEntityId(row['organization_id']),
    organizationName: typeof row['organization_name'] === 'string' ? row['organization_name'] : '',
    organizationStatus: typeof row['organization_status'] === 'string' ? row['organization_status'] : '',
    ownerUserId: coerceEntityId(row['owner_user_id']),
    ownerActivated: row['owner_activated'] === true,
    invite: toPendingOwnerInviteView(row['invite']),
  }
}

/** create（pending_phone）响应归一化：org/ws/owner_activation/sms_sent。 */
export function toCreatePendingOwnerResult(payload: unknown): CreatePendingOwnerResult {
  const row = (payload ?? {}) as Record<string, unknown>
  const org = (row['organization'] ?? {}) as Record<string, unknown>
  const ws = (row['default_workspace'] ?? {}) as Record<string, unknown>
  const activation = row['owner_activation']
  const activationRow = (activation ?? {}) as Record<string, unknown>
  return {
    organizationId: coerceEntityId(org['id']),
    organizationName: typeof org['name'] === 'string' ? org['name'] : '',
    workspaceId: coerceEntityId(ws['id']),
    created: row['created'] === true,
    smsSent: row['sms_sent'] === true,
    ownerActivation:
      activation == null
        ? null
        : {
            inviteId: coerceEntityId(activationRow['invite_id']),
            organizationId: coerceEntityId(activationRow['organization_id']),
            ownerUserId: coerceEntityId(activationRow['owner_user_id']),
            status: toInviteStatus(activationRow['status']),
            mobileMasked:
              typeof activationRow['mobile_masked'] === 'string' ? activationRow['mobile_masked'] : '****',
            expiresAt: toIntOrNUll(activationRow['expires_at']),
            resendCount: typeof activationRow['resend_count'] === 'number' ? activationRow['resend_count'] : 0,
            activationToken:
              typeof activationRow['activation_token'] === 'string' ? activationRow['activation_token'] : null,
          },
  }
}

/** resend / reactivate / transfer 响应里的 invite 归一化（含一次性 token）。 */
export function toRotatedInviteView(payload: unknown): CreatePendingOwnerActivationView | null {
  if (payload == null || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  return {
    inviteId: coerceEntityId(row['invite_id']),
    organizationId: coerceEntityId(row['organization_id']),
    ownerUserId: coerceEntityId(row['owner_user_id']),
    status: toInviteStatus(row['status']),
    mobileMasked: typeof row['mobile_masked'] === 'string' ? row['mobile_masked'] : '****',
    expiresAt: toIntOrNUll(row['expires_at']),
    resendCount: typeof row['resend_count'] === 'number' ? row['resend_count'] : 0,
    activationToken: typeof row['activation_token'] === 'string' ? row['activation_token'] : null,
  }
}

export function toTransferOwnerByPhoneResult(payload: unknown): TransferOwnerByPhoneResult {
  const row = (payload ?? {}) as Record<string, unknown>
  return {
    organizationId: coerceEntityId(row['organization_id']),
    ownerUserId: coerceEntityId(row['owner_user_id']),
    previousOwnerId: coerceEntityId(row['previous_owner_id']),
    mode: row['mode'] === 'direct_transfer' ? 'direct_transfer' : 'pending_transfer',
    smsSent: row['sms_sent'] === true,
    invite: toRotatedInviteView(row['invite']),
  }
}

/** resend / reactivate 响应（{invite, sms_sent} 信封）归一化。 */
export type RotateInviteResult = {
  smsSent: boolean
  invite: CreatePendingOwnerActivationView | null
}

export function toRotateInviteResult(payload: unknown): RotateInviteResult {
  const row = (payload ?? {}) as Record<string, unknown>
  return {
    smsSent: row['sms_sent'] === true,
    invite: toRotatedInviteView(row['invite']),
  }
}
