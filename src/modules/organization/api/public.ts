/**
 * Organization 治理 API（ORG-14）——只调 `/api/v1/organizations/*`（App 面）。
 *
 * 契约真源：后端 `imboy_router.erl`（ORG-10 集中注册段）+ organization 系列
 * handler/application 模块。**冻结契约里不存在 admin 专用 organization 端点**，
 * 管理端 UX 基于同一 App 面 + 服务端 member_role 事实做 org 级裁决。
 *
 * 会话边界（ORG-A14）：v1 面要求用户 Bearer token；admin 控制台会话（adm cookie）
 * 不携带该凭据时后端按 401 拒绝。本模块不做、也不引入任何身份冒充。
 * 该 401 属管理端**常态受限场景**：全部请求跳过全局「401 → 登出」事件
 * （SKIP_AUTH_EXPIRED_EVENT_FLAG），由页面 restricted 态呈现（G07 E2E 实测抓出：
 * 缺此标志会把整个管理会话踢回 /login，组织页受限态永远无法呈现）。
 *
 * 纪律：
 * - 复用全局 client（big-integer safe JSON 解析 / loading / 401 事件），
 *   以 per-request baseURL 覆盖指向 /api/v1，不改公共 client；
 * - TSID 全程 string（EntityId）；body 中 id 字段以 string 发送，
 *   后端 elib_cnv:safe_to_integer 归一（与 adm 面历史口径一致）；
 * - mutation 全部走受保护 API，不直接写 DB；
 * - 不调用 legacy direct-add（POST /organizations/:id/members）——邀请只走
 *   invitation command（C11/C18 术语冻结）。
 */
import client from '@/services/api/client'
import { BASE_URL, SKIP_AUTH_EXPIRED_EVENT_FLAG } from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  toDeletionPreflight,
  toDepartmentMemberRow,
  toDepartmentRow,
  toInvitationCreatedReveal,
  toInvitationView,
  toMemberLifecycleResult,
  toOrganizationMemberRow,
  toOrganizationSummary,
  normalizeOrgPage,
  type DeletionPreflight,
  type DepartmentMemberRow,
  type DepartmentRow,
  type InvitationCreatedReveal,
  type InvitationStatus,
  type InvitationView,
  type MemberLifecycleResult,
  type OrganizationMemberRow,
  type OrganizationSummary,
  type OrgPage,
} from './pureFunctions'

/** v1 App 面基址：由公共 client 的 /api/adm 基址派生（生产占位符同源替换）。 */
export const ORG_V1_BASE = BASE_URL.replace(/\/api\/adm\/?$/, '/api/v1')

/**
 * 组织模块全部请求的共用配置：v1 App 面 + 跳过全局 401 登出事件。
 * 管理员本无 App 面会话，401 是预期受限态而非管理会话失效。
 */
const V1_REQUEST = {
  baseURL: ORG_V1_BASE,
  [SKIP_AUTH_EXPIRED_EVENT_FLAG]: true,
} as const

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
// 组织本体（查询 / lifecycle / 删除预检）
// ===========================================================================

/** GET /api/v1/organizations/mine —— 当前用户（active 成员）视角的组织分页。 */
export async function getMyOrganizations(page: number, size: number): Promise<OrgPage<OrganizationSummary>> {
  const response = await client.get<ApiResponse<unknown>>('/organizations/mine', {
    ...V1_REQUEST,
    params: { page, size },
  })
  return normalizeOrgPage(
    requireApiPayload(response.data, 'GET organizations/mine'),
    toOrganizationSummary,
    size
  )
}

/** POST /api/v1/organizations —— 以当前用户身份创建组织（创建者成为 owner）。 */
export async function createOrganization(name: string): Promise<OrganizationSummary> {
  const response = await client.post<ApiResponse<unknown>>('/organizations', { name }, V1_REQUEST)
  return toOrganizationSummary(requireApiPayload(response.data, 'POST organizations'))
}

/** GET /api/v1/organizations/:id —— 详情（仅成员可读；响应含 member_role 事实）。 */
export async function getOrganizationDetail(organizationId: EntityId): Promise<OrganizationSummary> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId), V1_REQUEST)
  return toOrganizationSummary(requireApiPayload(response.data, 'GET organization detail'))
}

/** PATCH /api/v1/organizations/:id —— 改名（owner/admin；archived 409）。 */
export async function updateOrganizationName(organizationId: EntityId, name: string): Promise<OrganizationSummary> {
  const response = await client.patch<ApiResponse<unknown>>(orgPath(organizationId), { name }, V1_REQUEST)
  return toOrganizationSummary(requireApiPayload(response.data, 'PATCH organization'))
}

/** POST /api/v1/organizations/:id/archive —— 归档（owner/admin，幂等 command，C16）。 */
export async function archiveOrganization(organizationId: EntityId): Promise<OrganizationSummary> {
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/archive'), {}, V1_REQUEST)
  return toOrganizationSummary(requireApiPayload(response.data, 'POST organization archive'))
}

/** POST /api/v1/organizations/:id/restore —— 恢复（owner/admin，幂等，archived 态唯一放行写）。 */
export async function restoreOrganization(organizationId: EntityId): Promise<OrganizationSummary> {
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/restore'), {}, V1_REQUEST)
  return toOrganizationSummary(requireApiPayload(response.data, 'POST organization restore'))
}

/**
 * GET /api/v1/organizations/deletion-preflight —— 用户删除预检（C17）。
 * 注意：subject 是**当前用户**（服务端只收 Uid，不带 org 参数）；返回冻结五域
 * facts + 聚合 blockers；任何缺域/超时 → 503 DEPENDENCY_FACTS_UNAVAILABLE fail-closed。
 */
export async function getDeletionPreflight(): Promise<DeletionPreflight> {
  const response = await client.get<ApiResponse<unknown>>('/organizations/deletion-preflight', V1_REQUEST)
  return toDeletionPreflight(requireApiPayload(response.data, 'GET deletion-preflight'))
}

/** GET /api/v1/organizations/:id/default-workspace —— 默认 Workspace 指针（只读事实）。 */
export async function getDefaultWorkspace(organizationId: EntityId): Promise<EntityId | null> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/default-workspace'), {
    ...V1_REQUEST,
  })
  const payload = requireApiPayload(response.data, 'GET default-workspace') as Record<string, unknown>
  const wsId = payload['default_workspace_id']
  return wsId == null ? null : coerceWsId(wsId)
}

function coerceWsId(value: unknown): EntityId {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new Error('default_workspace_id 形状不合法')
}

// ===========================================================================
// 成员治理（owner/admin/member 严格区分；无万能角色 UI）
// ===========================================================================

/** GET /api/v1/organizations/:id/members —— 成员分页（owner/admin）。 */
export async function getOrganizationMembers(
  organizationId: EntityId,
  page: number,
  size: number
): Promise<OrgPage<OrganizationMemberRow>> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/members'), {
    ...V1_REQUEST,
    params: { page, size },
  })
  return normalizeOrgPage(
    requireApiPayload(response.data, 'GET organization members'),
    toOrganizationMemberRow,
    size
  )
}

/** PUT /api/v1/organizations/:id/members/:user_id/role —— 角色调整（仅 admin|member）。 */
export async function changeMemberRole(organizationId: EntityId, userId: EntityId, role: 'admin' | 'member'): Promise<void> {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const target = requireNonEmptyId(userId, 'user_id')
  await client.put<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(org)}/members/${encodeURIComponent(target)}/role`,
    { role },
    V1_REQUEST
  )
}

// ---------------------------------------------------------------------------
// 成员生命周期命令（EB-D07/EB-08）：suspend / restore / offboard
// 三者都是 POST command（路径绑定 organization_id + user_id，无请求体）；
// 响应 data 为 member_result：suspend/restore 含 role，offboard（removed 终态）无 role。
// 离场单一入口：UI 一律走 POST offboard，不再调 legacy DELETE .../members/:uid。
// ---------------------------------------------------------------------------

/** 组装成员生命周期命令路径并校验 TSID（EntityId 全程 string）。 */
function memberLifecyclePath(organizationId: EntityId, userId: EntityId, action: 'suspend' | 'restore' | 'offboard'): string {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const target = requireNonEmptyId(userId, 'user_id')
  return `/organizations/${encodeURIComponent(org)}/members/${encodeURIComponent(target)}/${action}`
}

/** POST /api/v1/organizations/:id/members/:user_id/suspend —— 停用（active→suspended，可恢复撤权第一步）。 */
export async function suspendOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'suspend'),
    {},
    V1_REQUEST
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member suspend'))
}

/** POST /api/v1/organizations/:id/members/:user_id/restore —— 恢复（仅 suspended→active）。 */
export async function restoreOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'restore'),
    {},
    V1_REQUEST
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member restore'))
}

/**
 * POST /api/v1/organizations/:id/members/:user_id/offboard —— 离场（active|suspended→removed 终态）。
 * 与后端 offboarding 数据库守卫同名同义：仍被依赖资源引用（如 active 经办关系）时 409 拒绝并要求先交接。
 */
export async function offboardOrganizationMember(organizationId: EntityId, userId: EntityId): Promise<MemberLifecycleResult> {
  const response = await client.post<ApiResponse<unknown>>(
    memberLifecyclePath(organizationId, userId, 'offboard'),
    {},
    V1_REQUEST
  )
  return toMemberLifecycleResult(requireApiPayload(response.data, 'POST member offboard'))
}

/** POST /api/v1/organizations/:id/members/transfer_owner —— Owner 转移（主 Owner 专属，危险动作）。 */
export async function transferOrganizationOwner(organizationId: EntityId, userId: EntityId): Promise<void> {
  await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, '/members/transfer_owner'),
    { user_id: requireNonEmptyId(userId, 'user_id') },
    V1_REQUEST
  )
}

// ===========================================================================
// 邀请治理（token 明文只在 create 响应出现一次）
// ===========================================================================

/** GET /api/v1/organizations/:id/invitations —— 组织视角邀请列表（owner/admin；limit 1..100 默认 20）。 */
export async function listOrganizationInvitations(
  organizationId: EntityId,
  status?: InvitationStatus,
  limit?: number
): Promise<InvitationView[]> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/invitations'), {
    ...V1_REQUEST,
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
 * POST /api/v1/organizations/:id/invitations —— 创建邀请。
 * 返回 InvitationCreatedReveal：token 明文只在本次响应出现，由调用方一次性展示，
 * 禁止落入 query cache / store / 日志（本函数不缓存任何中间形态）。
 */
export async function createOrganizationInvitation(
  organizationId: EntityId,
  userId: EntityId,
  expiresAt?: number
): Promise<InvitationCreatedReveal> {
  const body: Record<string, unknown> = { user_id: requireNonEmptyId(userId, 'user_id') }
  if (expiresAt != null && Number.isSafeInteger(expiresAt) && expiresAt > 0) {
    body['expires_at'] = expiresAt
  }
  const response = await client.post<ApiResponse<unknown>>(orgPath(organizationId, '/invitations'), body, {
    ...V1_REQUEST,
  })
  const reveal = toInvitationCreatedReveal(requireApiPayload(response.data, 'POST organization invitation'))
  if (!reveal) {
    throw new Error('邀请创建响应缺少一次性 token（契约回归）')
  }
  return reveal
}

/** POST /api/v1/organizations/:id/invitations/:invitation_id/revoke —— 撤销（owner/admin，幂等）。 */
export async function revokeOrganizationInvitation(organizationId: EntityId, invitationId: EntityId): Promise<void> {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const invitation = requireNonEmptyId(invitationId, 'invitation_id')
  await client.post<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(org)}/invitations/${encodeURIComponent(invitation)}/revoke`,
    {},
    V1_REQUEST
  )
}

// ===========================================================================
// 部门治理（树形目录；update/move 走 expected_version CAS）
// ===========================================================================

/** GET /api/v1/organizations/:id/departments —— 部门目录（status=all|active|archived，返回全量数组）。 */
export async function listDepartments(
  organizationId: EntityId,
  status: 'all' | 'active' | 'archived' = 'all'
): Promise<DepartmentRow[]> {
  const response = await client.get<ApiResponse<unknown>>(orgPath(organizationId, '/departments'), {
    ...V1_REQUEST,
    params: { status },
  })
  const payload = requireApiPayload(response.data, 'GET organization departments')
  const rows = Array.isArray(payload) ? payload : []
  return rows.map(toDepartmentRow)
}

/** POST /api/v1/organizations/:id/departments —— 建部门（name 必填；parent_id 可空=根）。 */
export async function createDepartment(
  organizationId: EntityId,
  name: string,
  parentId: EntityId | null
): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, '/departments'),
    { name, parent_id: parentId },
    V1_REQUEST
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department'))
}

/** PATCH /api/v1/organizations/:id/departments/:department_id —— 改名（expected_version CAS；archived 禁改）。 */
export async function renameDepartment(
  organizationId: EntityId,
  departmentId: EntityId,
  name: string,
  expectedVersion: number
): Promise<DepartmentRow> {
  const response = await client.patch<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}`),
    { name, expected_version: expectedVersion },
    V1_REQUEST
  )
  return toDepartmentRow(requireApiPayload(response.data, 'PATCH department'))
}

/**
 * POST /api/v1/organizations/:id/departments/:department_id/move —— 移动部门。
 * body 键 `parent_id`：null = 提升为根；expected_version CAS。409 = 层级成环 /
 * 父已归档 / 版本冲突，提示刷新。
 */
export async function moveDepartment(
  organizationId: EntityId,
  departmentId: EntityId,
  parentId: EntityId | null,
  expectedVersion: number
): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/move`),
    { parent_id: parentId, expected_version: expectedVersion },
    V1_REQUEST
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department move'))
}

/** POST .../departments/:department_id/archive —— 归档部门（原子归档全部 active 后代，纯目录状态）。 */
export async function archiveDepartment(organizationId: EntityId, departmentId: EntityId): Promise<DepartmentRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/archive`),
    {},
    V1_REQUEST
  )
  return toDepartmentRow(requireApiPayload(response.data, 'POST department archive'))
}

/** GET .../departments/:department_id/members —— 部门成员列表（archived 部门也可读：目录事实可审计）。 */
export async function listDepartmentMembers(organizationId: EntityId, departmentId: EntityId): Promise<DepartmentMemberRow[]> {
  const response = await client.get<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/members`),
    V1_REQUEST
  )
  const payload = requireApiPayload(response.data, 'GET department members')
  const rows = Array.isArray(payload) ? payload : []
  return rows.map(toDepartmentMemberRow)
}

/** POST .../departments/:department_id/members —— 挂载成员（user_id 必须已是本 Org active 成员）。 */
export async function addDepartmentMember(organizationId: EntityId, departmentId: EntityId, userId: EntityId): Promise<DepartmentMemberRow> {
  const response = await client.post<ApiResponse<unknown>>(
    orgPath(organizationId, `/departments/${encodeURIComponent(requireNonEmptyId(departmentId, 'department_id'))}/members`),
    { user_id: requireNonEmptyId(userId, 'user_id') },
    V1_REQUEST
  )
  return toDepartmentMemberRow(requireApiPayload(response.data, 'POST department member'))
}

/** DELETE .../departments/:department_id/members/:user_id —— 卸载成员（幂等）。 */
export async function removeDepartmentMember(organizationId: EntityId, departmentId: EntityId, userId: EntityId): Promise<void> {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const dept = requireNonEmptyId(departmentId, 'department_id')
  const target = requireNonEmptyId(userId, 'user_id')
  await client.delete<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(org)}/departments/${encodeURIComponent(dept)}/members/${encodeURIComponent(target)}`,
    V1_REQUEST
  )
}

/** PUT .../departments/:department_id/members/:user_id/admin —— 设/取消部门管理员（局部目录角色，非权限）。 */
export async function setDepartmentMemberAdmin(
  organizationId: EntityId,
  departmentId: EntityId,
  userId: EntityId,
  admin: boolean
): Promise<void> {
  const org = requireNonEmptyId(organizationId, 'organization_id')
  const dept = requireNonEmptyId(departmentId, 'department_id')
  const target = requireNonEmptyId(userId, 'user_id')
  await client.put<ApiResponse<unknown>>(
    `/organizations/${encodeURIComponent(org)}/departments/${encodeURIComponent(dept)}/members/${encodeURIComponent(target)}/admin`,
    { admin },
    V1_REQUEST
  )
}
