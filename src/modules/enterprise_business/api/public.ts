/**
 * 企业业务平台只读 API（CS-03）——只调 `/api/adm/enterprise-business/*`。
 *
 * 契约真源：EB 平台面动作表（`eb_enterprise_actions.erl` platform 段）：
 *   GET /api/adm/enterprise-business/organizations/:org_id/identities                (enterprise_business:read)
 *   GET /api/adm/enterprise-business/organizations/:org_id/contacts                  (enterprise_business:read)
 *   GET /api/adm/enterprise-business/organizations/:org_id/contacts/:id              (enterprise_business:read)
 *   GET /api/adm/enterprise-business/organizations/:org_id/conversations/:id/messages (enterprise_business:read)
 *   GET /api/adm/enterprise-business/organizations/:org_id/assets/:id/content         (enterprise_business:read；需 actor_user_id)
 *
 * 纪律：
 * - `workspace_id` 必填（GET 查询串），缺失后端 422；
 * - TSID 全程 string；`limit`/`after_id` 为键集分页参数；
 * - 附件内容走**授权代理流式端点**（内存 blob），不签发、不展示任何存储 URL/object key；
 * - 严禁接入 `/api/v1`（CS-03-A01）。
 */
import { requireApiPayload } from '@/services/api/responseAdapter'
import client from '@/services/api/client'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  assertEbScope,
  buildOffboardingDetailQuery,
  buildOffboardingListQuery,
  toEbContact,
  toEbContactList,
  toEbIdentityList,
  toEbMessageList,
  toEbOffboardingCaseDetail,
  toEbOffboardingCaseListPage,
  parseOffboardingItemsStatusFilter,
  type EbContact,
  type EbMessage,
  type EbIdentity,
  type EbOffboardingCaseDetail,
  type EbOffboardingCaseListPage,
  type EbOffboardingItemsStatusFilter,
  type EbOffboardingStatusFilter,
  type EbScopeParams,
} from './pureFunctions'

const EB_ORGS_BASE = '/enterprise-business/organizations'

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return id
}

type ListQuery = {
  workspace_id: EntityId
  after_id?: EntityId
  limit?: number
}

function buildListQuery(
  scope: EbScopeParams,
  afterId?: EntityId,
  limit?: number
): ListQuery {
  const query: ListQuery = { workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id') }
  if (afterId && afterId.trim().length > 0) query.after_id = afterId.trim()
  if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0) query.limit = limit
  return query
}

/** GET 业务身份列表（键集分页：after_id 严格 id > 游标）。 */
export async function getEbIdentities(
  scope: EbScopeParams,
  afterId?: EntityId,
  limit?: number
): Promise<EbIdentity[]> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const response = await client.get<ApiResponse<unknown[]>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/identities`,
    { params: buildListQuery(scope, afterId, limit) }
  )
  return toEbIdentityList(requireApiPayload(response.data, 'GET eb identities'))
}

/** GET 企业客户列表（键集分页）。 */
export async function getEbContacts(
  scope: EbScopeParams,
  afterId?: EntityId,
  limit?: number
): Promise<EbContact[]> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const response = await client.get<ApiResponse<unknown[]>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/contacts`,
    { params: buildListQuery(scope, afterId, limit) }
  )
  return toEbContactList(requireApiPayload(response.data, 'GET eb contacts'))
}

/** GET 企业客户详情（同行投影；展示层过滤 profile_cipher 等敏感字段）。 */
export async function getEbContactDetail(
  scope: EbScopeParams,
  contactId: EntityId
): Promise<EbContact | null> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const id = requireNonEmptyId(contactId, 'contact_id')
  const response = await client.get<ApiResponse<unknown>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/contacts/${encodeURIComponent(id)}`,
    { params: { workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id') } }
  )
  return toEbContact(requireApiPayload(response.data, 'GET eb contact detail'))
}

/** GET 会话企业消息（游标 after_id；密文字段由展示层过滤）。 */
export async function getEbConversationMessages(
  scope: EbScopeParams,
  conversationId: EntityId,
  afterId?: EntityId,
  limit?: number
): Promise<EbMessage[]> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const id = requireNonEmptyId(conversationId, 'conversation_id')
  const response = await client.get<ApiResponse<unknown[]>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/conversations/${encodeURIComponent(id)}/messages`,
    { params: buildListQuery(scope, afterId, limit) }
  )
  return toEbMessageList(requireApiPayload(response.data, 'GET eb conversation messages'))
}

export type EbAssetContent = {
  blob: Blob
  contentType: string
  sizeBytes: number
  sha256Header: string | null
}

/**
 * GET 附件内容（授权代理流式端点）：返回内存 blob 与响应头元数据。
 *
 * - `actor_user_id` 是后端 ACL 的必填判据（本 Org 的 Owner/Admin 责任人）；
 * - 只取响应头（content-type / x-asset-sha256 / content-length），**不**解析、
 *   **不**展示 object key / 存储地址（CS-03-A05）；
 * - 错误响应按 envelope 解析 msg。
 */
export async function fetchEbAssetContent(
  scope: EbScopeParams,
  assetId: EntityId,
  actorUserId: EntityId
): Promise<EbAssetContent> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const id = requireNonEmptyId(assetId, 'asset_id')
  const actor = requireNonEmptyId(actorUserId, 'actor_user_id')
  const params = new URLSearchParams({
    workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
    actor_user_id: actor,
  })
  const url = `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/assets/${encodeURIComponent(id)}/content?${params.toString()}`
  try {
    const response = await client.get<Blob | string>(url, { responseType: 'blob' })
    if (response.data instanceof Blob) {
      return {
        blob: response.data,
        contentType: String(response.headers?.['content-type'] ?? 'application/octet-stream'),
        sizeBytes: response.data.size,
        sha256Header:
          typeof response.headers?.['x-asset-sha256'] === 'string'
            ? (response.headers['x-asset-sha256'] as string)
            : null,
      }
    }
    throw new Error('附件内容响应形状不合法')
  } catch (err) {
    // 流式端点失败时错误体可能是 JSON envelope Blob：解析出稳定 msg 再抛出
    const blobData = (err as { response?: { data?: unknown } } | null)?.response?.data
    if (blobData instanceof Blob) {
      const msg = await readBlobErrorMessage(blobData)
      if (msg) {
        // lib 目标为 ES2020（无 Error cause 选项），以属性赋值附挂原始错误
        const wrapped = new Error(msg) as Error & { cause: unknown }
        wrapped.cause = err
        throw wrapped
      }
    }
    throw err
  }
}

/** 从 axios blob 响应中读 envelope 错误信息（列表/详情之外的流式错误兜底）。 */
export async function readBlobErrorMessage(blob: Blob): Promise<string | null> {
  try {
    const text = await blob.text()
    const parsed = JSON.parse(text) as { msg?: unknown }
    return typeof parsed.msg === 'string' ? parsed.msg : null
  } catch {
    return null
  }
}

// ===========================================================================
// W2：平台 offboarding cases（冻结合同 W2-ADMIN 段）
//   GET  /enterprise-business/organizations/:org_id/offboarding/cases[/:id]  (read)
//   POST /enterprise-business/organizations/:org_id/offboarding/:id/execute  (write)
// ===========================================================================

export type EbOffboardingListParams = {
  status: EbOffboardingStatusFilter
  afterId?: EntityId | null
  limit?: number
}

/** GET 离岗交接 case 列表（键集分页 + status 过滤；enterprise_business:read）。 */
export async function getEbOffboardingCases(
  scope: EbScopeParams,
  params: EbOffboardingListParams
): Promise<EbOffboardingCaseListPage> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  if (params.limit !== undefined && (!Number.isSafeInteger(params.limit) || params.limit <= 0)) {
    throw new Error('limit 必须是正整数')
  }
  const response = await client.get<ApiResponse<unknown>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/offboarding/cases`,
    {
      params: {
        // workspace_id 是平台面每条路径的必填参数（缺失后端 422）
        workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
        ...buildOffboardingListQuery({
          status: params.status,
          afterId: params.afterId ?? null,
          limit: params.limit,
        }),
      },
    }
  )
  const payload = requireApiPayload(response.data, 'GET eb offboarding cases')
  return toEbOffboardingCaseListPage(payload, params.limit ?? 50)
}

export type EbOffboardingDetailParams = {
  itemsStatus?: EbOffboardingItemsStatusFilter
}

/** GET 离岗交接 case 详情（含 items 子表；items_status=failed 即失败项查询）。 */
export async function getEbOffboardingCaseDetail(
  scope: EbScopeParams,
  caseId: EntityId,
  itemsStatusOrParams: EbOffboardingItemsStatusFilter | EbOffboardingDetailParams = 'all'
): Promise<EbOffboardingCaseDetail | null> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const id = requireNonEmptyId(caseId, 'case_id')
  const itemsStatus =
    typeof itemsStatusOrParams === 'string' ? itemsStatusOrParams : (itemsStatusOrParams.itemsStatus ?? 'all')
  const response = await client.get<ApiResponse<unknown>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/offboarding/cases/${encodeURIComponent(id)}`,
    {
      params: {
        workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
        ...buildOffboardingDetailQuery(parseOffboardingItemsStatusFilter(itemsStatus)),
      },
    }
  )
  return toEbOffboardingCaseDetail(requireApiPayload(response.data, 'GET eb offboarding case detail'))
}

export type EbOffboardingExecuteParams = {
  expectedVersion: number
  actorUserId: EntityId
}

/**
 * POST 执行/重试交接 case（既有幂等 execute 端点；enterprise_business:write）。
 *
 * 幂等重试语义：仅重放 status=failed 的项（attempt 递增），已成功项不重复执行；
 * body 必须携带 expected_version（乐观锁）与 actor_user_id（审计责任人）。
 */
export async function executeEbOffboardingCase(
  scope: EbScopeParams,
  caseId: EntityId,
  params: EbOffboardingExecuteParams
): Promise<EbOffboardingCaseDetail | null> {
  assertEbScope(scope)
  const organizationId = requireNonEmptyId(scope.organizationId, 'organization_id')
  const id = requireNonEmptyId(caseId, 'case_id')
  const actorUserId = requireNonEmptyId(params.actorUserId, 'actor_user_id')
  if (!Number.isSafeInteger(params.expectedVersion) || params.expectedVersion <= 0) {
    throw new Error('expected_version 必须是正整数')
  }
  const response = await client.post<ApiResponse<unknown>>(
    `${EB_ORGS_BASE}/${encodeURIComponent(organizationId)}/offboarding/${encodeURIComponent(id)}/execute`,
    {
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
      expected_version: params.expectedVersion,
      actor_user_id: actorUserId,
    }
  )
  return toEbOffboardingCaseDetail(requireApiPayload(response.data, 'POST eb offboarding execute'))
}
