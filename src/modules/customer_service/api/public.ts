/**
 * 客服平台运营面 API（CS-03）——只调 `/api/adm/customer-service/*`。
 *
 * 契约真源：CS-02 冻结动作表平台面（`cs_actions.erl` table(platform)）：
 *   GET  /api/adm/customer-service/organizations/:org_id/seats                 (customer_service:read)
 *   POST /api/adm/customer-service/organizations/:org_id/seats/:id/suspend     (customer_service:write)
 *   POST /api/adm/customer-service/organizations/:org_id/seats/:id/resume      (customer_service:write)
 *   GET  /api/adm/customer-service/organizations/:org_id/sessions/:id          (customer_service:read)
 *   POST /api/adm/customer-service/organizations/:org_id/sessions/:id/transfer (customer_service:write)
 *   POST /api/adm/customer-service/organizations/:org_id/sessions/:id/close    (customer_service:write)
 *
 * 纪律：
 * - `workspace_id` 是每条平台路径的必填参数（GET 查询串 / POST 正文），缺失 422；
 * - TSID 全程 string；`expected_version` 是 int（非 TSID），走 number；
 * - 严禁接入 `/api/v1`（CS-03-A01）。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  assertScope,
  buildCsSessionListQuery,
  toCsSeat,
  toCsSeatList,
  toCsSession,
  toCsSessionListPage,
  toPlatformSeatListPage,
  type CsScopeParams,
  type CsSeat,
  type CsSession,
  type CsSessionListPage,
  type CsSessionStatusFilter,
  type PlatformSeatListPage,
} from './pureFunctions'

const CS_ORGS_BASE = '/customer-service/organizations'

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return id
}

/** GET 坐席列表（平台面无分页参数，服务端返回工作区内全量可调度坐席）。 */
export async function getCsSeats(scope: CsScopeParams): Promise<CsSeat[]> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const response = await client.get<ApiResponse<unknown[]>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/seats`,
    { params: { workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id') } }
  )
  return toCsSeatList(requireApiPayload(response.data, 'GET cs seats'))
}

export type PlatformSeatListParams = {
  /** 可选：收窄到该企业；缺失 = 跨企业全局（后端 org_source=param_optional）。 */
  organizationId?: EntityId | null
  afterId?: EntityId | null
  limit?: number
}

/**
 * GET 平台运营面坐席分页（跨企业）：/api/adm/customer-service/seats。
 * 键集分页（after_id + limit）；含已停用坐席（运营面可恢复）；
 * workspace_id 不需要——坐席是 Org 级事实。
 */
export async function getPlatformSeats(params: PlatformSeatListParams): Promise<PlatformSeatListPage> {
  const query: Record<string, string | number> = {}
  const organizationId =
    typeof params.organizationId === 'string' ? params.organizationId.trim() : ''
  if (organizationId.length > 0) {
    query.organization_id = organizationId
  }
  const afterId = typeof params.afterId === 'string' ? params.afterId.trim() : ''
  if (afterId.length > 0) {
    query.after_id = afterId
  }
  if (typeof params.limit === 'number' && Number.isSafeInteger(params.limit) && params.limit > 0) {
    // 客户端防呆钳制到 1..200（服务端越界仍 422）。
    query.limit = Math.min(params.limit, 200)
  }
  const response = await client.get<ApiResponse<unknown>>('/customer-service/seats', {
    params: query,
  })
  return toPlatformSeatListPage(
    requireApiPayload(response.data, 'GET platform seats'),
    params.limit ?? 50
  )
}

/** POST 停用坐席（body: {reason?}；workspace_id 必填走正文）。 */
export async function suspendCsSeat(
  scope: CsScopeParams & { identityId: EntityId; reason?: string }
): Promise<CsSeat | null> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const identityId = requireNonEmptyId(scope.identityId, 'business_identity_id')
  const response = await client.post<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/seats/${encodeURIComponent(identityId)}/suspend`,
    {
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
      ...(typeof scope.reason === 'string' && scope.reason.trim().length > 0
        ? { reason: scope.reason.trim() }
        : {}),
    }
  )
  return toCsSeat(requireApiPayload(response.data, 'POST cs seat suspend'))
}

/** POST 恢复坐席（无 body 参数；workspace_id 必填走正文）。 */
export async function resumeCsSeat(
  scope: CsScopeParams & { identityId: EntityId }
): Promise<CsSeat | null> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const identityId = requireNonEmptyId(scope.identityId, 'business_identity_id')
  const response = await client.post<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/seats/${encodeURIComponent(identityId)}/resume`,
    { workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id') }
  )
  return toCsSeat(requireApiPayload(response.data, 'POST cs seat resume'))
}

export type CsSessionListParams = {
  status: CsSessionStatusFilter
  afterId?: EntityId | null
  limit?: number
}

/**
 * GET 平台会话列表（W2 冻结合同 C1）：after_id 键集游标 + limit 分页，
 * status 可选过滤（queued|active|closed）。响应 { sessions, next_after_id }。
 */
export async function getPlatformCsSessions(
  scope: CsScopeParams,
  params: CsSessionListParams
): Promise<CsSessionListPage> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  if (params.limit !== undefined && (!Number.isSafeInteger(params.limit) || params.limit <= 0)) {
    throw new Error('limit 必须是正整数')
  }
  const response = await client.get<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/sessions`,
    {
      params: {
        // workspace_id 是平台面每条路径的必填参数（缺失后端 422）
        workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
        ...buildCsSessionListQuery({
          status: params.status,
          afterId: params.afterId ?? null,
          limit: params.limit,
        }),
      },
    }
  )
  const payload = requireApiPayload(response.data, 'GET cs sessions')
  return toCsSessionListPage(payload, params.limit ?? 50)
}

/** GET 会话详情（平台面只有按 id 取详情，无平台级会话列表——契约如此）。 */
export async function getCsSession(
  scope: CsScopeParams & { sessionId: EntityId }
): Promise<CsSession | null> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const sessionId = requireNonEmptyId(scope.sessionId, 'session_id')
  const response = await client.get<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/sessions/${encodeURIComponent(sessionId)}`,
    { params: { workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id') } }
  )
  return toCsSession(requireApiPayload(response.data, 'GET cs session'))
}

/** POST 转接会话（body: {to_identity_id, expected_version}；TSID=string，版本=int）。 */
export async function transferCsSession(
  scope: CsScopeParams & { sessionId: EntityId; toIdentityId: EntityId; expectedVersion: number }
): Promise<CsSession | null> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const sessionId = requireNonEmptyId(scope.sessionId, 'session_id')
  const toIdentityId = requireNonEmptyId(scope.toIdentityId, 'to_identity_id')
  if (!Number.isSafeInteger(scope.expectedVersion) || scope.expectedVersion <= 0) {
    throw new Error('expected_version 必须是正整数')
  }
  const response = await client.post<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/sessions/${encodeURIComponent(sessionId)}/transfer`,
    {
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
      to_identity_id: toIdentityId,
      expected_version: scope.expectedVersion,
    }
  )
  return toCsSession(requireApiPayload(response.data, 'POST cs session transfer'))
}

/** POST 关闭会话（body: {expected_version}；契约平台面 close 无 reason 参数）。 */
export async function closeCsSession(
  scope: CsScopeParams & { sessionId: EntityId; expectedVersion: number }
): Promise<CsSession | null> {
  assertScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const sessionId = requireNonEmptyId(scope.sessionId, 'session_id')
  if (!Number.isSafeInteger(scope.expectedVersion) || scope.expectedVersion <= 0) {
    throw new Error('expected_version 必须是正整数')
  }
  const response = await client.post<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/sessions/${encodeURIComponent(sessionId)}/close`,
    {
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
      expected_version: scope.expectedVersion,
    }
  )
  return toCsSession(requireApiPayload(response.data, 'POST cs session close'))
}
