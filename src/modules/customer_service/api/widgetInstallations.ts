/**
 * 客服 Widget installation 管理面 API（CSW-01）。
 *
 * ⚠️ 前端先行：后端管理路由尚未建立（计划挂在 `/api/adm/customer-service/
 * widget-installations`，customer_service:read / write 门），联调归 CSX-01。
 * 本文件只做前端侧形状冻结与调用封装，不得伪造已完成联调。
 *
 * 计划契约：
 *   GET  /customer-service/widget-installations?organization_id&workspace_id  (read)
 *   POST /customer-service/widget-installations                               (write)
 *        body {organization_id, workspace_id, display_name, allowed_origins,
 *              branding{display_name?, primary_color?}, consent_version}
 *        → payload {installation, one_time_secret:{shop_key}}（shop_key 仅此一次）
 *   POST /customer-service/widget-installations/:id/revoke                    (write)
 *        body {workspace_id}
 *
 * 纪律：TSID 全程 string；shop_key 只允许出现在创建响应的一次性投影里，
 * 列表/详情投影（widgetInstallationsPure.toWidgetInstallation）熔断一切敏感键。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  toOneTimeSecret,
  toWidgetInstallation,
  toWidgetInstallationList,
  type WidgetInstallation,
} from './widgetInstallationsPure'

const INSTALLATIONS_BASE = '/customer-service/widget-installations'

export type CreateWidgetInstallationInput = {
  organizationId: EntityId
  workspaceId: EntityId
  displayName: string
  allowedOrigins: string[]
  branding: { displayName?: string | null; primaryColor?: string | null }
  consentVersion: string
}

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) throw new Error(`缺少必填 ID：${label}`)
  return id
}

/** GET installation 列表（必须显式租户条件，与平台面纪律一致）。 */
export async function listWidgetInstallations(scope: {
  organizationId: EntityId
  workspaceId: EntityId
}): Promise<WidgetInstallation[]> {
  const response = await client.get<ApiResponse<unknown>>(INSTALLATIONS_BASE, {
    params: {
      organization_id: requireNonEmptyId(scope.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
    },
  })
  return toWidgetInstallationList(requireApiPayload(response.data, 'GET widget installations'))
}

/** POST 创建 installation；返回 installation + 一次性 shop_key（仅本次响应可见）。 */
export async function createWidgetInstallation(
  input: CreateWidgetInstallationInput
): Promise<{ installation: WidgetInstallation; oneTimeSecret: { shopKey: string } | null }> {
  const response = await client.post<ApiResponse<unknown>>(INSTALLATIONS_BASE, {
    organization_id: requireNonEmptyId(input.organizationId, 'organization_id'),
    workspace_id: requireNonEmptyId(input.workspaceId, 'workspace_id'),
    display_name: input.displayName.trim(),
    allowed_origins: input.allowedOrigins,
    branding: {
      ...(input.branding.displayName ? { display_name: input.branding.displayName } : {}),
      ...(input.branding.primaryColor ? { primary_color: input.branding.primaryColor } : {}),
    },
    consent_version: input.consentVersion.trim(),
  })
  const payload = requireApiPayload(response.data, 'POST widget installations')
  const installation = toWidgetInstallation(
    (payload as { installation?: unknown } | null)?.installation ?? null
  )
  if (installation === null) throw new Error('创建 installation 响应形状非法')
  return { installation, oneTimeSecret: toOneTimeSecret(payload) }
}

/** POST 撤销 installation（status → revoked；撤销后 widget bootstrap 拒绝）。 */
export async function revokeWidgetInstallation(scope: {
  organizationId: EntityId
  workspaceId: EntityId
  installationId: EntityId
}): Promise<WidgetInstallation | null> {
  const response = await client.post<ApiResponse<unknown>>(
    `${INSTALLATIONS_BASE}/${encodeURIComponent(requireNonEmptyId(scope.installationId, 'installation_id'))}/revoke`,
    {
      organization_id: requireNonEmptyId(scope.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
    }
  )
  const payload = requireApiPayload(response.data, 'POST widget installation revoke')
  return toWidgetInstallation((payload as { installation?: unknown } | null)?.installation ?? null)
}
