/**
 * 待激活 Owner API client（GZAPP-06；深路径导入，不动 public.ts / api index——
 * 接线进页面路由属 GZAPP-08）。
 *
 * 契约真源：后端 `adm_owner_activation_handler.erl` + `adm_organization_handler.erl`
 * owner_mode 分流（migration 00000138 / D11-D13）。
 *
 * 端点（adm 面，cookie 会话 + organizations:read|write）：
 *   POST /api/adm/organizations                                （owner_mode=pending_phone）
 *   GET  /api/adm/organizations/:id/owner-activation            状态卡
 *   POST /api/adm/organizations/:id/owner-activation/resend     重发（token 轮换）
 *   POST /api/adm/organizations/:id/owner-activation/reactivate 30 天 TTL 重激活
 *   POST /api/adm/organizations/:id/owner-transfer-by-phone     按手机号换 Owner
 *
 * PII：mobile 只出现在请求体；响应只含 mobile_masked（前3后4）。
 * token：activation_token 明文只在响应出现一次，调用方一次性展示，禁止缓存。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  buildCreateOrganizationPendingBody,
  normalizeMobileInput,
  toCreatePendingOwnerResult,
  toPendingOwnerStatusView,
  toRotateInviteResult,
  toTransferOwnerByPhoneResult,
  type CreatePendingOwnerResult,
  type PendingOwnerCreateInput,
  type PendingOwnerStatusView,
  type RotateInviteResult,
  type TransferOwnerByPhoneResult,
} from './pendingOwnerPure'

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return id
}

function ownerActivationPath(organizationId: EntityId, suffix = ''): string {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  return `/organizations/${encodeURIComponent(org)}/owner-activation${suffix}`
}

/**
 * POST /api/adm/organizations（owner_mode=pending_phone）——手机号建待激活 Owner。
 * 响应 {organization, default_workspace, created, owner_activation, sms_sent}：
 * sms_sent=false 表示企业已建成但激活短信发送失败（D12 不回滚），调用方
 * 呈现 sms_failed 警示态 + 重发入口（owner_activation.activation_token 一次性）。
 */
export async function createOrganizationWithPendingOwner(
  input: PendingOwnerCreateInput
): Promise<CreatePendingOwnerResult> {
  const body = buildCreateOrganizationPendingBody(input)
  const response = await client.post<ApiResponse<unknown>>('/organizations', body)
  return toCreatePendingOwnerResult(
    requireApiPayload(response.data, 'POST organization create (pending_phone)')
  )
}

/** GET /api/adm/organizations/:id/owner-activation —— 待激活 Owner 状态卡。 */
export async function getPendingOwnerStatus(organizationId: EntityId): Promise<PendingOwnerStatusView> {
  const response = await client.get<ApiResponse<unknown>>(ownerActivationPath(organizationId))
  return toPendingOwnerStatusView(
    requireApiPayload(response.data, 'GET owner activation status')
  )
}

/**
 * POST /api/adm/organizations/:id/owner-activation/resend —— 重发激活短信。
 * 幂等可重入；token 轮换（旧行 digest 原地替换，旧链接即时失效）；
 * resend_count++。响应 {invite, sms_sent}。
 */
export async function resendOwnerActivationSms(organizationId: EntityId): Promise<RotateInviteResult> {
  const response = await client.post<ApiResponse<unknown>>(
    ownerActivationPath(organizationId, '/resend'),
    {}
  )
  return toRotateInviteResult(requireApiPayload(response.data, 'POST owner activation resend'))
}

/**
 * POST /api/adm/organizations/:id/owner-activation/reactivate —— 30 天 TTL
 * 重新激活（到期不删除；刷新 TTL 回 pending + token 轮换）。响应 {invite, sms_sent}。
 */
export async function reactivateOwner(organizationId: EntityId): Promise<RotateInviteResult> {
  const response = await client.post<ApiResponse<unknown>>(
    ownerActivationPath(organizationId, '/reactivate'),
    {}
  )
  return toRotateInviteResult(requireApiPayload(response.data, 'POST owner activation reactivate'))
}

/**
 * POST /api/adm/organizations/:id/owner-transfer-by-phone —— 按手机号换 Owner。
 * 目标已注册活跃 → direct_transfer（无邀请短信）；新手机号 → pending_transfer
 * （预创建 Owner + 新邀请 + 旧邀请 superseded）。D13 恰一 active Owner 不变量
 * 由服务端事务保证；短信失败不回滚转移（D12 同口径）。
 */
export async function replaceOwnerByPhone(
  organizationId: EntityId,
  ownerMobile: string
): Promise<TransferOwnerByPhoneResult> {
  const mobile = normalizeMobileInput(ownerMobile)
  if (!mobile.ok) {
    throw new Error(mobile.error)
  }
  const response = await client.post<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(requireNonEmptyId(organizationId, 'organization_id'))}/owner-transfer-by-phone`,
    { owner_mobile: mobile.mobile }
  )
  return toTransferOwnerByPhoneResult(
    requireApiPayload(response.data, 'POST owner transfer by phone')
  )
}
