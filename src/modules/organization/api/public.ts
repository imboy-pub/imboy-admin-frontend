/**
 * Organization 治理 API（ORG-ADMIN-ADM-WIRING）——平台专用 `/api/adm/organizations/*`。
 *
 * 契约真源：`control/org15/adm-org-api-contract.md`（A0 冻结版 r1）+ 后端
 * `imboy_router.erl` adm 注册段 / `adm_organization_handler.erl` /
 * `organization_admin_logic.erl`（TASK_ID=ORG-ADM-ORG-API）。
 *
 * 面边界（与 ORG-14 App 面时代的差异）：
 * - 鉴权 = adm cookie 会话 + adm_acl（organizations:read / organizations:write 分权）；
 *   Platform Admin 不映射 org owner/admin，member_role 事实不再出现在 list/detail 行。
 * - 401 = 管理会话失效：走全局「401 → 登出」事件（此前 App 面时代的
 *   SKIP_AUTH_EXPIRED_EVENT_FLAG 已随 V1_REQUEST 一并作废删除）。
 * - TSID 全程 string（EntityId）；body 中 id 字段以 string 发送，
 *   后端 elib_cnv:safe_to_integer / parse_tsid_map 归一。
 * - mutation 全部为 POST command（含部门 rename——App 面 PATCH 在 adm 面收敛为
 *   POST .../rename）；写审计（adm_operation_log）在后端 handler 层完成。
 * - 术语映射（App 面 → adm 面）：offboard → members/:uid/remove；
 *   transfer_owner → owner-transfer（body 键 target_user_id）；
 *   invitations/:iid/revoke → invitations/:iid/cancel；
 *   创建邀请 body 键 user_id → target_user_id。
 *
 * 冻结合同未提供的 App 面旅程（改名 / deletion-preflight / default-workspace /
 * 成员角色调整 / 部门成员挂载域）在平台面不存在，相应 client 方法已移除——
 * 平台治理语义只覆盖合同端点。唯一的例外是 createOrganization：合同以
 * `POST /organizations` 集合路由提供（非 App 面 v1 旅程语义），故保留并
 * 按 adm 面口径实现（body 三键 + created 幂等标志，见 buildCreateOrganizationBody）。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  toDepartmentRow,
  toInvitationCreatedReveal,
  toInvitationView,
  toMemberLifecycleResult,
  toOrgLifecycleResult,
  toOrganizationMemberRow,
  toOrganizationSummary,
  toWorkspaceRow,
  normalizeOrgPage,
  buildCreateOrganizationBody,
  type CreateOrganizationInput,
  type CreateOrganizationResult,
  type DepartmentRow,
  type InvitationCreatedReveal,
  type InvitationStatus,
  type InvitationView,
  type MemberLifecycleResult,
  type OrgLifecycleResult,
  type OrganizationMemberRow,
  type OrganizationSummary,
  type OrgPage,
  type WorkspaceRow,
} from './pureFunctions'

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return id
}

function orgPath(organizationId: EntityId, suffix = ''): string {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  return `/organizations/${encodeURIComponent(org)}${suffix}`
}

// ===========================================================================
// 组织本体（平台分页搜索 / 详情 / lifecycle）
// ===========================================================================

/**
 * GET /api/adm/organizations —— 平台视角组织分页（status=all|active|archived；
 * keyword 命中组织名或 TSID，服务端搜索）。替代 App 面 /organizations/mine。
 */
export async function getOrganizations(
  page: number,
  size: number,
  status: 'all' | 'active' | 'archived' = 'all',
  keyword = ''
): Promise<OrgPage<OrganizationSummary>> {
  const trimmed = keyword.trim()
  const response = await client.get<ApiResponse<unknown>>('/organizations', {
    params: {
      page,
      size,
      status,
      ...(trimmed.length > 0 ? { keyword: trimmed } : {}),
    },
  })
  return normalizeOrgPage(
    requireApiPayload(response.data, 'GET organizations'),
    toOrganizationSummary,
    size
  )
}

/** GET /api/adm/organizations/:organization_id —— 详情（平台只读事实 + 关系计数）。 */
export async function getOrganizationDetail(organizationId: EntityId): Promise<OrganizationSummary> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId))
  return toOrganizationSummary(requireApiPayload(response.data, 'GET organization detail'))
}

/**
 * POST /api/adm/organizations —— 创建组织（C2 集合路由分流；复用既有 collection route）。
 * body 严格三键：{name, owner_user_id(string TSID), default_workspace_name}。
 * 响应 {organization, default_workspace, created}：created=false 表示幂等命中
 * （同 owner + 归一化同名已有 active 组织），此时返回既有 org/workspace。
 * 权限：adm cookie + adm_acl organizations:write（fail-closed）。
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
  const body = buildCreateOrganizationBody(input)
  const response = await client.post<ApiResponse<unknown>>('/organizations', body)
  const data = requireApiPayload(response.data, 'POST organization create') as Record<string, unknown>
  const organization = toOrganizationSummary(data['organization'])
  const defaultWorkspace = toWorkspaceRow(data['default_workspace'])
  return {
    organization,
    defaultWorkspace,
    created: data['created'] === true,
  }
}

/**
 * POST /api/adm/organizations/:organization_id/archive —— 归档（幂等 command，C16）。
 * adm 面响应为 lifecycle 结果信封 {organization_id,status,changed}（非组织全量投影）。
 */
export async function archiveOrganization(organizationId: EntityId): Promise<OrgLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/archive'), {})
  return toOrgLifecycleResult(requireApiPayload(response.data, 'POST organization archive'))
}

/** POST /api/adm/organizations/:organization_id/restore —— 恢复（幂等，archived 态唯一放行写）。 */
export async function restoreOrganization(organizationId: EntityId): Promise<OrgLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/restore'), {})
  return toOrgLifecycleResult(requireApiPayload(response.data, 'POST organization restore'))
}

// ===========================================================================
// 成员治理（平台 RBAC write；服务端镜像 App 面状态机，无租户 actor 概念）
// ===========================================================================

/** GET /api/adm/organizations/:organization_id/members —— 成员分页（仅 active 行）。 */
export async function getOrganizationMembers(
  organizationId: EntityId,
  page: number,
  size: number
): Promise<OrgPage<OrganizationMemberRow>> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/members'), {
    params: { page, size },
  })
  return normalizeOrgPage(
    requireApiPayload(response.data, 'GET organization members'),
    toOrganizationMemberRow,
    size
  )
}

// ---------------------------------------------------------------------------
// 成员生命周期命令（EB-D07/EB-D08 平台通道）：suspend / restore / remove
// 三者都是 POST command（路径绑定 organization_id + user_id，无业务请求体）；
// 响应 data 为 member_result：suspend/restore 含 role，remove（removed 终态）无 role。
// 服务端规则：owner 目标 suspend/remove 均 409（先转移 Owner）；restore 仅
// suspended→active；adm 面无「admin 目标需主 Owner」限制（平台无租户 actor）。
// ---------------------------------------------------------------------------

/** 组装成员生命周期命令路径并校验 TSID（EntityId 全程 string）。 */
function memberLifecyclePath(
  organizationId: EntityId,
  userId: EntityId,
  action: 'suspend' | 'restore' | 'remove'
): string {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const target = requireNonEmptyId(userId, 'user_id')
  return `/organizations/${encodeURIComponent(org)}/members/${encodeURIComponent(target)}/${action}`
}

/** POST /api/adm/organizations/:id/members/:user_id/suspend —— 停用（active→suspended）。 */
export async function suspendOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'suspend'),
    {}
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member suspend'))
}

/** POST /api/adm/organizations/:id/members/:user_id/restore —— 恢复（仅 suspended→active）。 */
export async function restoreOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'restore'),
    {}
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member restore'))
}

/**
 * POST /api/adm/organizations/:id/members/:user_id/remove —— 移除（active|suspended→removed 终态）。
 * App 面 offboard 命令在 adm 面的术语收敛；依赖资源引用冲突仍由服务端 409 拒绝并要求先交接。
 */
export async function removeOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'remove'),
    {}
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member remove'))
}

/**
 * POST /api/adm/organizations/:id/owner-transfer —— Owner 转移（危险动作）。
 * body 键 `target_user_id`（adm 面口径；App 面 transfer_owner 的 user_id 已弃用）。
 * 响应为转移结果 {organization_id,owner_id,previous_owner_id,previous_owner_role}，调用方按需忽略。
 */
export async function transferOrganizationOwner(organizationId: EntityId, userId: EntityId): Promise<void> {
  await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/owner-transfer'), {
    target_user_id: requireNonEmptyId(userId, 'user_id'),
  })
}

// ===========================================================================
// 邀请治理（token 明文只在 create 响应出现一次；平台面 invited_by 恒 null）
// ===========================================================================

/** GET /api/adm/organizations/:id/invitations —— 邀请列表（status 过滤 + limit 1..100 默认 20）。 */
export async function listOrganizationInvitations(
  organizationId: EntityId,
  status?: InvitationStatus,
  limit?: number
): Promise<InvitationView[]> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/invitations'), {
    params: {
      ...(status && status !== 'unknown' ? { status } : {}),
      ...(limit != null && Number.isSafeInteger(limit) && limit > 0 ? { limit } : {}),
    },
  })
  const payload = requireApiPayload(response.data, 'GET organization invitations')
  const rows = Array.isArray(payload) ? payload : []
  return rows.map(toInvitationView)
}

/**
 * POST /api/adm/organizations/:id/invitations —— 创建邀请（body 键 target_user_id）。
 * 返回 InvitationCreatedReveal：token 明文只在本次响应出现，由调用方一次性展示，
 * 禁止落入 query cache / store / 日志（本函数不缓存任何中间形态）。
 */
export async function createOrganizationInvitation(
  organizationId: EntityId,
  userId: EntityId,
  expiresAt?: number
): Promise<InvitationCreatedReveal> {
  const body: Record<string, unknown> = { target_user_id: requireNonEmptyId(userId, 'user_id') }
  if (expiresAt != null && Number.isSafeInteger(expiresAt) && expiresAt > 0) {
    body['expires_at'] = expiresAt
  }
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/invitations'), body)
  const reveal = toInvitationCreatedReveal(requireApiPayload(response.data, 'POST organization invitation'))
  if (!reveal) {
    throw new Error('邀请创建响应缺少一次性 token（契约回归）')
  }
  return reveal
}

/** POST /api/adm/organizations/:id/invitations/:invitation_id/cancel —— 取消（幂等；App 面 revoke 的 adm 收敛）。 */
export async function cancelOrganizationInvitation(organizationId: EntityId, invitationId: EntityId): Promise<void> {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const invitation = requireNonEmptyId(invitationId, 'invitation_id')
  await client.post<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(org)}/invitations/${encodeURIComponent(invitation)}/cancel`,
    {}
  )
}

// ===========================================================================
// 部门治理（树形目录；rename/move 走 expected_version CAS）
// ===========================================================================

/** GET /api/adm/organizations/:id/departments —— 部门目录（status=all|active|archived，返回全量数组）。 */
export async function listDepartments(
  organizationId: EntityId,
  status: 'all' | 'active' | 'archived' = 'all'
): Promise<DepartmentRow[]> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/departments'), {
    params: { status },
  })
  const payload = requireApiPayload(response.data, 'GET organization departments')
  const rows = Array.isArray(payload) ? payload : []
  return rows.map(toDepartmentRow)
}

/** POST /api/adm/organizations/:id/departments —— 建部门（name 必填；parent_id 可空=根）。 */
export async function createDepartment(
  organizationId: EntityId,
  name: string,
  parentId: EntityId | null
): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/departments'), {
    name,
    parent_id: parentId,
  })
  return toDepartmentRow(requireApiPayload(response.data, 'POST department'))
}

/**
 * POST /api/adm/organizations/:id/departments/:department_id/rename —— 改名
 * （adm 面将 App 面 PATCH 收敛为 POST command；body {name, expected_version} CAS；
 * archived 禁改；版本/同名冲突 409 提示刷新）。
 */
export async function renameDepartment(
  organizationId: EntityId,
  departmentId: EntityId,
  name: string,
  expectedVersion: number
): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/rename`),
    { name, expected_version: expectedVersion }
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department rename'))
}

/**
 * POST /api/adm/organizations/:id/departments/:department_id/move —— 移动部门。
 * body 键 `parent_id`：null = 提升为根；expected_version CAS。409 = 版本/层级/
 * 归档冲突，提示刷新。
 */
export async function moveDepartment(
  organizationId: EntityId,
  departmentId: EntityId,
  parentId: EntityId | null,
  expectedVersion: number
): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/move`),
    { parent_id: parentId, expected_version: expectedVersion }
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department move'))
}

/** POST .../departments/:department_id/archive —— 归档部门（原子归档全部 active 后代，纯目录状态）。 */
export async function archiveDepartment(organizationId: EntityId, departmentId: EntityId): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/archive`),
    {}
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department archive'))
}

// ===========================================================================
// Workspace 只读关系（合同 read 端点；暂无 UI 旅程，仅 client 方法 + 单测）
// ===========================================================================

/** GET /api/adm/organizations/:id/workspaces —— 组织下 Workspace 关系分页（只读事实）。 */
export async function listOrganizationWorkspaces(
  organizationId: EntityId,
  page: number,
  size: number
): Promise<OrgPage<WorkspaceRow>> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/workspaces'), {
    params: { page, size },
  })
  return normalizeOrgPage(
    requireApiPayload(response.data, 'GET organization workspaces'),
    toWorkspaceRow,
    size
  )
}
