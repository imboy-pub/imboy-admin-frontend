/**
 * Organization 治理面纯函数（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）。
 *
 * 契约真源（后端 worktree codex/org-v1-backend-20260916，adm 面）：
 *   - `src/adm/adm_organization_handler.erl`（路由分派 + 出站归一化）
 *   - `src/logic/organization_admin_logic.erl`（admin_page / admin_detail /
 *     lifecycle / member_transition / invitation / department）
 *   - 冻结合同 `control/org15/adm-org-api-contract.md`（A0 冻结版 r1）
 *
 * 关键口径（与 W2 实现逐条核对过）：
 *   - 组织列表/详情分页信封 `{list,page,size,total,total_page}`；list/detail 行
 *     无 member_role（平台管理员不是组织成员），但携带 owner_nickname /
 *     owner_account / member_count / workspace_count 平台事实（可选投影）；
 *   - archive/restore 响应为 lifecycle 结果 `{organization_id,status,changed}`
 *     （与 App 面返回组织全量投影不同——adm 面合同偏差，已回报 A0）；
 *   - 部门 rename/move 的并发冲突字段是 `expected_version`（CAS，仅部门域有）；
 *   - 成员行键 `organization_id/user_id/role/invited_by/joined_at/status/nickname/avatar/account`；
 *   - 邀请明文 token 只在 create 响应出现一次（view 白名单永不含 token/token_digest）；
 *   - C16：archived 组织禁新写（409），restore 是唯一放行写；
 *   - 权限矩阵：adm_acl organizations:read / organizations:write 分权，
 *     read-only 角色对全部 mutation = 403（member_role 事实不再参与裁决）。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'

// ===========================================================================
// 类型（出站白名单投影；敏感内部字段永不进入）
// ===========================================================================

export type OrgRole = 'owner' | 'admin' | 'member' | null

export type OrgStatus = 'active' | 'archived' | 'unknown'

export type OrganizationSummary = {
  id: EntityId
  name: string
  ownerId: EntityId
  status: OrgStatus
  memberRole: OrgRole
  createdAt: string
  updatedAt: string
  /** branding/settings 只投影键名（键值可能含租户私有配置，不渲染取值） */
  brandingKeys: string[]
  settingsKeys: string[]
  /**
   * 平台面可选事实（adm list/detail 行新增；App 面 /mine 旅程无这些键）：
   * owner 昵称/账号 + 关系计数。缺键时为 null/undefined，页面按 '-' 呈现。
   */
  ownerNickname?: string
  ownerAccount?: string
  memberCount?: number | null
  workspaceCount?: number | null
}

export type OrganizationMemberRow = {
  organizationId: EntityId
  userId: EntityId
  role: Exclude<OrgRole, null> | 'unknown'
  status: string
  invitedBy: EntityId
  joinedAt: string
  nickname: string
  account: string
}

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'expired'
  | 'unknown'

export type InvitationView = {
  invitationId: EntityId
  organizationId: EntityId
  targetUserId: EntityId
  invitedBy: EntityId
  status: InvitationStatus
  expiresAt: number | null
  respondedAt: number | null
  createdAt: number | null
}

export type DepartmentStatus = 'active' | 'archived' | 'unknown'

export type DepartmentRow = {
  id: EntityId
  organizationId: EntityId
  parentId: EntityId | null
  name: string
  status: DepartmentStatus
  version: number
  createdAt: string
  updatedAt: string
}

export type DepartmentTreeNode = DepartmentRow & {
  children: DepartmentTreeNode[]
  depth: number
}

/**
 * Workspace 只读关系行（GET /api/adm/organizations/:id/workspaces）。
 * 合同 read 端点，暂无 UI 旅程——形状按 W2 admin_workspace_page SQL 列投影。
 */
export type WorkspaceRow = {
  id: EntityId
  name: string
  ownerId: EntityId
  organizationId: EntityId
  status: string
  createdAt: string
  updatedAt: string
}

export type OrgPage<T> = {
  items: T[]
  page: number
  size: number
  total: number
  totalPage: number
}

// ===========================================================================
// 错误分类（400/401/403/404/409/422/503 稳定归类；只呈现安全归类与可重试动作）
// ===========================================================================

export type OrgFailureKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'facts_unavailable'
  | 'server'
  | 'network'
  | 'unknown'

export type OrgFailure = {
  kind: OrgFailureKind
  message: string
  /** 409 并发/状态冲突：建议刷新服务端事实后重试 */
  suggestRefresh: boolean
}

/** 管理会话边界说明：adm 面与整个管理控制台共用 cookie 会话。 */
export const ADM_SESSION_HINT =
  '该面板走 /api/adm 平台会话（adm cookie）；401 表示管理会话已失效，请重新登录。'

export function orgFailureKindFromStatus(status: number): OrgFailureKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status === 503) return 'facts_unavailable'
  if (status >= 500) return 'server'
  if (status >= 400) return 'validation'
  return 'unknown'
}

export function orgFailureMessage(kind: OrgFailureKind, detail: string): string {
  switch (kind) {
    case 'unauthorized':
      return `未认证（401）：${detail}。${ADM_SESSION_HINT}`
    case 'forbidden':
      return `无权限（403）：${detail}`
    case 'not_found':
      return `目标不存在（404）：${detail}`
    case 'conflict':
      return `状态或并发冲突（409）：${detail}。数据可能已被他人修改，请刷新后重试`
    case 'facts_unavailable':
      return `依赖域事实不可用（503 fail-closed）：${detail}`
    case 'validation':
      return `参数校验失败（422/400）：${detail}`
    case 'server':
      return `服务端错误：${detail}。可稍后重试`
    case 'network':
      return `网络错误：${detail}`
    default:
      return detail
  }
}

/**
 * 把任意抛出的错误归类为稳定 OrgFailure。
 * 拦截器 reject 的是 ApiError {code,msg}；code 即后端 envelope 的 HTTP 语义码。
 */
export function classifyOrgError(err: unknown): OrgFailure {
  const detail = getDetailMessage(err)
  if (isNetworkError(err)) {
    return { kind: 'network', message: orgFailureMessage('network', detail), suggestRefresh: false }
  }
  const status = extractStatusCode(err)
  const kind = orgFailureKindFromStatus(status)
  return {
    kind,
    message: orgFailureMessage(kind, detail),
    suggestRefresh: kind === 'conflict',
  }
}

export function isOrgConflict(err: unknown): boolean {
  return classifyOrgError(err).kind === 'conflict'
}

/**
 * 带 expected_version 的 CAS mutation（部门 rename/move）失败时是否总提供
 * 「刷新目录」入口。后端部门错误表（organization_api_handler:map_dept_error/1）
 * 只把层级/归档冲突映射为 409，版本冲突 {error, conflict} 落 400 兜底——
 * 因此对 CAS mutation 不能只认 409 才给刷新入口（任何失败都允许刷新重试）。
 */
export function suggestRefreshForCasMutation(kind: OrgFailureKind): boolean {
  return kind !== 'network' && kind !== 'unauthorized'
}

function getDetailMessage(err: unknown): string {
  if (err == null) return '未知错误'
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e['msg'] === 'string' && e['msg']) return e['msg']
    if (typeof e['message'] === 'string' && e['message']) return e['message']
  }
  if (typeof err === 'string' && err) return err
  return '未知错误'
}

function extractStatusCode(err: unknown): number {
  if (typeof err === 'object' && err != null) {
    const e = err as Record<string, unknown>
    if (typeof e['code'] === 'number' && Number.isFinite(e['code'])) return e['code']
    if (typeof e['status'] === 'number' && Number.isFinite(e['status'])) return e['status']
  }
  return -1
}

function isNetworkError(err: unknown): boolean {
  if (typeof err === 'object' && err != null) {
    const e = err as Record<string, unknown>
    if (e['code'] === -1 || e['code'] === 'ECONNABORTED') return true
  }
  return false
}

// ===========================================================================
// 权限与状态机（adm 面：RBAC=adm_acl，read/write 分权）
//
// 服务端事实真源（adm_organization_handler / organization_admin_logic）：
//   * 页面可达性与读 = organizations:read；全部 mutation = organizations:write
//     （read-only 角色对 mutation 恒 403）——UI 门控由 useAdminPermission 驱动；
//   * Platform Admin 不映射 org owner/admin：list/detail 行无 member_role；
//   * 组织状态机（C16）：archived 禁新写，restore 是唯一放行的写入口；
//   * 成员命令行级守卫：owner 目标 suspend/remove 均 409（先转移 Owner）；
//   * owner-transfer：组织须 active，目标须是本组织成员，自转移 400。
// ===========================================================================

/** C16：archived 禁新写；restore 是 archived 态唯一放行的写入口。 */
export function isOrgWriteAllowed(status: OrgStatus, action: 'archive' | 'restore' | 'update'): boolean {
  if (status === 'active') return true
  if (status === 'archived') return action === 'restore'
  return false
}

/**
 * 成员生命周期命令的行级谓词（平台写权限前提下的服务端 409 镜像）：
 * owner 行不可 suspend / remove（须先转移 Owner）；restore 仅面向本会话停用记录。
 */
export function canTargetMemberRow(row: Pick<OrganizationMemberRow, 'role'>): boolean {
  return row.role !== 'owner'
}

// ===========================================================================
// 成员生命周期命令（EB-D07/EB-D08 平台通道：suspend / restore / remove）
//
// 服务端契约（organization_admin_logic member_transition，逐条核对）：
//   * suspend  POST .../members/:uid/suspend —— 组织须 active；目标仅 active；
//     owner 目标 409「请先转移 Owner」；adm 面无「admin 目标需主 Owner」限制；
//   * restore  POST .../members/:uid/restore —— 目标仅 suspended
//     （active/removed 均 409 明确拒绝，恢复 removed 走重新邀请）；
//   * remove   POST .../members/:uid/remove —— 即 removed 终态（App 面 offboard
//     的 adm 收敛）；目标 active|suspended；owner 目标 409；仍被依赖资源引用时
//     数据库守卫 → 409。
// 成员列表分页只含 active（page_by_organization WHERE status='active'），因此
// suspended 成员不出现在列表里：恢复入口来自本页会话内的停用记录（见页面）。
// ===========================================================================

/** 生命周期命令响应的 status 窄化（suspend→suspended / restore→active / remove→removed）。 */
export type MemberLifecycleStatus = 'active' | 'suspended' | 'removed' | 'unknown'

/** suspend/restore/remove 响应 data 投影（后端 member_result/4）。
 * suspend/restore 含 role；remove（removed 终态）响应无 role → null。 */
export type MemberLifecycleResult = {
  organizationId: EntityId
  userId: EntityId
  role: OrgRole
  status: MemberLifecycleStatus
}

export function toMemberLifecycleResult(raw: unknown): MemberLifecycleResult {
  const record = asRecord(raw)
  const status = record['status']
  return {
    organizationId: coerceEntityId(record['organization_id']),
    userId: coerceEntityId(record['user_id']),
    role: asOrgRole(record['role']),
    status: status === 'active' || status === 'suspended' || status === 'removed' ? status : 'unknown',
  }
}

// ===========================================================================
// 组织 lifecycle 结果（adm 面 archive/restore 响应信封）
// ===========================================================================

/**
 * POST archive / POST restore 响应 data 投影（organization_admin_logic transition）：
 * `{organization_id, status, changed}`——changed=false 表示幂等重放（状态未变，零写入）。
 * 与 App 面返回组织全量投影不同，这是 adm 面的合同实现形态。
 */
export type OrgLifecycleResult = {
  organizationId: EntityId
  status: OrgStatus
  changed: boolean
}

export function toOrgLifecycleResult(raw: unknown): OrgLifecycleResult {
  const record = asRecord(raw)
  return {
    organizationId: coerceEntityId(record['organization_id']),
    status: asStatus(record['status']),
    changed: record['changed'] === true,
  }
}

// ===========================================================================
// 投影 / 归一化
// ===========================================================================

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asVersion(value: unknown): number {
  const n = asNumberOrNull(value)
  return n != null && n >= 1 ? n : 1
}

function asStatus(value: unknown): 'active' | 'archived' | 'unknown' {
  return value === 'active' || value === 'archived' ? value : 'unknown'
}

/** branding/settings 只列键名：键值可能含租户私有配置，白名单不投影取值。 */
export function safeJsonKeyNames(value: unknown): string[] {
  const record = asRecord(value)
  return Object.keys(record).sort()
}

export function toOrganizationSummary(raw: unknown): OrganizationSummary {
  const record = asRecord(raw)
  return {
    id: coerceEntityId(record['id']),
    name: asString(record['name']) || `#${coerceEntityId(record['id']) || '未知'}`,
    ownerId: coerceEntityId(record['owner_id']),
    status: asStatus(record['status']),
    // adm 面 list/detail 行无 member_role（平台管理员不是组织成员）→ 恒 null；
    // App 面 /mine 旅程的 role/member_role 键仍可被防御读取。
    memberRole: asOrgRole(record['member_role'] ?? record['role']),
    createdAt: asString(record['created_at']),
    updatedAt: asString(record['updated_at']),
    brandingKeys: safeJsonKeyNames(record['branding']),
    settingsKeys: safeJsonKeyNames(record['settings']),
    ownerNickname: asString(record['owner_nickname']) || undefined,
    ownerAccount: asString(record['owner_account']) || undefined,
    memberCount: asNumberOrNull(record['member_count']),
    workspaceCount: asNumberOrNull(record['workspace_count']),
  }
}

export function asOrgRole(value: unknown): OrgRole {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : null
}

export function toOrganizationMemberRow(raw: unknown): OrganizationMemberRow {
  const record = asRecord(raw)
  const role = asOrgRole(record['role'])
  return {
    organizationId: coerceEntityId(record['organization_id']),
    userId: coerceEntityId(record['user_id']),
    role: role ?? 'unknown',
    status: asString(record['status']) || 'unknown',
    invitedBy: coerceEntityId(record['invited_by']),
    joinedAt: asString(record['joined_at']),
    nickname: asString(record['nickname']),
    account: asString(record['account']),
  }
}

export function asInvitationStatus(value: unknown): InvitationStatus {
  return value === 'pending' || value === 'accepted' || value === 'rejected' || value === 'revoked' || value === 'expired'
    ? value
    : 'unknown'
}

export function toInvitationView(raw: unknown): InvitationView {
  const record = asRecord(raw)
  return {
    invitationId: coerceEntityId(record['invitation_id'] ?? record['id']),
    organizationId: coerceEntityId(record['organization_id']),
    targetUserId: coerceEntityId(record['target_user_id']),
    invitedBy: coerceEntityId(record['invited_by']),
    status: asInvitationStatus(record['status']),
    expiresAt: asNumberOrNull(record['expires_at']),
    respondedAt: asNumberOrNull(record['responded_at']),
    createdAt: asNumberOrNull(record['created_at']),
  }
}

export function toDepartmentRow(raw: unknown): DepartmentRow {
  const record = asRecord(raw)
  const parent = record['parent_id']
  return {
    id: coerceEntityId(record['id']),
    organizationId: coerceEntityId(record['organization_id']),
    parentId:
      parent === null || parent === undefined || parent === ''
        ? coerceEntityId(parent) === ''
          ? null
          : coerceEntityId(parent)
        : coerceEntityId(parent) || null,
    name: asString(record['name']),
    status: asStatus(record['status']),
    version: asVersion(record['version']),
    createdAt: asString(record['created_at']),
    updatedAt: asString(record['updated_at']),
  }
}

export function toWorkspaceRow(raw: unknown): WorkspaceRow {
  const record = asRecord(raw)
  return {
    id: coerceEntityId(record['id']),
    name: asString(record['name']),
    ownerId: coerceEntityId(record['owner_id']),
    organizationId: coerceEntityId(record['organization_id']),
    status: asString(record['status']) || 'unknown',
    createdAt: asString(record['created_at']),
    updatedAt: asString(record['updated_at']),
  }
}

/**
 * 分页信封归一化：后端 `{list,page,size,total,total_page}` → OrgPage。
 * 与 responseAdapter.normalizeLegacyPagination 同口径（list→items），
 * 但显式返回强类型，缺字段走防御默认。
 */
export function normalizeOrgPage<T>(raw: unknown, mapItem: (_item: unknown) => T, fallbackSize = 10): OrgPage<T> {
  const record = asRecord(raw)
  const list = Array.isArray(record['list']) ? record['list'] : Array.isArray(record['items']) ? record['items'] : []
  const page = asNumberOrNull(record['page']) ?? 1
  const size = asNumberOrNull(record['size']) ?? fallbackSize
  const total = asNumberOrNull(record['total']) ?? list.length
  const totalPage = asNumberOrNull(record['total_page'] ?? record['total_pages']) ?? (size > 0 ? Math.ceil(total / size) : 1)
  return {
    items: list.map(mapItem),
    page: Math.max(1, page),
    size: Math.max(1, size),
    total: Math.max(0, total),
    totalPage: Math.max(0, totalPage),
  }
}

// ===========================================================================
// 部门树构造
// ===========================================================================

/**
 * 由扁平部门列表构造树。孤儿节点（parent 不在集合内，如父级被过滤）与
 * 环状数据（后端守卫拒绝环，但历史/过滤视图可能出现）都提升为根，
 * 保证任意输入下每个节点恰好出现一次（不丢目录事实）。
 */
export function buildDepartmentTree(rows: DepartmentRow[]): DepartmentTreeNode[] {
  const byId = new Map<EntityId, DepartmentTreeNode>()
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [], depth: 0 })
  }
  const roots: DepartmentTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId != null ? byId.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // 可达性遍历：访问节点时剔除指向已访问节点的边（打断环），保证每个节点
  // 在输出树中恰好出现一次；环上节点（无天然根）随后被提升为根。
  const visited = new Set<EntityId>()
  const visit = (node: DepartmentTreeNode) => {
    if (visited.has(node.id)) return
    visited.add(node.id)
    node.children = node.children.filter((child) => !visited.has(child.id) && child.id !== node.id)
    for (const child of node.children) visit(child)
  }
  for (const root of roots) visit(root)
  for (const node of byId.values()) {
    if (!visited.has(node.id)) {
      roots.push(node)
      visit(node)
    }
  }
  const assignDepth = (nodes: DepartmentTreeNode[], depth: number) => {
    for (const node of nodes) {
      node.depth = depth
      assignDepth(node.children, depth + 1)
    }
  }
  assignDepth(roots, 0)
  const sortNodes = (nodes: DepartmentTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || (a.id < b.id ? -1 : 1))
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}

/** 归档某部门时会被原子归档的全部后代 id（服务端 archive_subtree_tx 语义镜像，仅用于确认文案）。 */
export function descendantIdsOf(rows: DepartmentRow[], departmentId: EntityId): EntityId[] {
  const childrenOf = new Map<EntityId, EntityId[]>()
  for (const row of rows) {
    if (row.parentId == null) continue
    const bucket = childrenOf.get(row.parentId) ?? []
    bucket.push(row.id)
    childrenOf.set(row.parentId, bucket)
  }
  const result: EntityId[] = []
  const queue = [departmentId]
  const seen = new Set<EntityId>([departmentId])
  while (queue.length > 0) {
    const current = queue.shift() ?? ''
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      result.push(child)
      queue.push(child)
    }
  }
  return result
}

// ===========================================================================
// 邀请 token 一次性展示语义
// ===========================================================================

/**
 * 创建邀请响应的出站形状：token 明文只在此对象出现一次，
 * 调用方必须只存组件局部 state（不进 query cache / store / 日志）。
 */
export type InvitationCreatedReveal = {
  view: InvitationView
  token: string
}

export function toInvitationCreatedReveal(raw: unknown): InvitationCreatedReveal | null {
  const record = asRecord(raw)
  const token = asString(record['token'])
  if (!token) return null
  return { view: toInvitationView(record), token }
}

/** token 中段打码（用于任何非一次性展示场景的日志/占位）。 */
export function redactToken(token: string): string {
  if (token.length <= 8) return '****'
  return `${token.slice(0, 4)}****${token.slice(-4)}`
}

// ===========================================================================
// 标签
// ===========================================================================

export function orgRoleLabel(role: OrgRole): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Admin'
    case 'member':
      return 'Member'
    default:
      return '非成员'
  }
}

export function orgStatusLabel(status: OrgStatus): string {
  switch (status) {
    case 'active':
      return 'active'
    case 'archived':
      return 'archived'
    default:
      return 'unknown'
  }
}

export function invitationStatusLabel(status: InvitationStatus): string {
  switch (status) {
    case 'pending':
      return '待处理'
    case 'accepted':
      return '已接受'
    case 'rejected':
      return '已拒绝'
    case 'revoked':
      return '已撤销'
    case 'expired':
      return '已过期'
    default:
      return 'unknown'
  }
}

export function departmentStatusLabel(status: DepartmentStatus): string {
  switch (status) {
    case 'active':
      return 'active'
    case 'archived':
      return 'archived'
    default:
      return 'unknown'
  }
}

/** epoch 秒 → 本地可读时间（后端 expires_at/created_at 为 epoch 秒）。 */
export function formatEpochSeconds(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '-'
  return new Date(seconds * 1000).toLocaleString('zh-CN')
}

// ===========================================================================
// 创建组织（EADM-04 / C2 集合路由 POST /api/adm/organizations）
//
// 关键约束（与后端 org_create_write/4 对齐）：
//   * 请求体严格三键：name / owner_user_id / default_workspace_name；
//     owner_user_id 必须为非空 string（TSID）——**禁止**前端手填裸 TSID 之外的
//     任意形态；owner 必须经由用户搜索选择（见 OrganizationCreateDialog）。
//   * 响应 {organization, default_workspace, created}；created=false 是幂等命中
//     （同 owner + 归一化同名已有 active 组织），UI 必须区别于"真实新建"，
//     且不得呈现为失败态。
//   * Owner 选择：User 类型无 account_type 字段，前端**无法判定 human**——
//     仅能按可见 status 过滤 active（1=正常）；后端 fail-closed 拒绝非 human，
//     UI 不假装能判定（已知限制，记录于 RESULT）。
// ===========================================================================

/** 用户 status 约定（src/types/logoutApplication.ts: user_status 1=正常）。 */
export const ACTIVE_USER_STATUS = 1

/**
 * Owner 可见可选性判定：仅过滤 active（status=1）。
 * 注意：无 account_type 字段，human 无法由 UI 判定，此为已知盲区。
 */
export function isUserSelectableForOwner(user: { status: number }): boolean {
  return user.status === ACTIVE_USER_STATUS
}

export type CreateOrganizationInput = {
  name: string
  /** Owner 用户 TSID（string）。必须来自用户搜索选择，不得手填裸 TSID。 */
  ownerUserId: EntityId
  /** 默认 Workspace 名称；UI 默认取 name。 */
  defaultWorkspaceName: string
}

/**
 * 严格构造创建请求体：仅三键；owner_user_id 必须为非空 string（TSID）。
 * 任意缺字段 / 空白均抛错——充当契约回归护栏（测试据此断言形状）。
 */
export function buildCreateOrganizationBody(input: CreateOrganizationInput): {
  name: string
  owner_user_id: string
  default_workspace_name: string
} {
  const name = input.name.trim()
  const ownerUserId = typeof input.ownerUserId === 'string' ? input.ownerUserId.trim() : ''
  const defaultWorkspaceName = input.defaultWorkspaceName.trim()
  if (name.length === 0) throw new Error('组织名称不能为空')
  if (ownerUserId.length === 0) throw new Error('必须选择 Owner（禁止手动填写 TSID）')
  if (defaultWorkspaceName.length === 0) throw new Error('默认工作区名称不能为空')
  // 严格三键，且 owner_user_id 保持 string（TSID）。
  return {
    name,
    owner_user_id: ownerUserId,
    default_workspace_name: defaultWorkspaceName,
  }
}

/** 创建成功响应出站投影（与 C2 响应对齐；TSID 全 string）。 */
export type CreateOrganizationResult = {
  organization: OrganizationSummary
  defaultWorkspace: WorkspaceRow
  created: boolean
}

/**
 * 区分"真实新建"与"幂等命中"（created=false）：二者都应导向同一详情页，
 * 但呈现金字塔不同——UI 不得把幂等命中当失败。
 */
export type CreateOrganizationOutcome =
  | { kind: 'created'; organizationId: EntityId; workspaceId: EntityId }
  | { kind: 'idempotent'; organizationId: EntityId; workspaceId: EntityId }

export function classifyCreateOutcome(result: CreateOrganizationResult): CreateOrganizationOutcome {
  const organizationId = result.organization?.id
  const workspaceId = result.defaultWorkspace?.id
  if (result.created) {
    return { kind: 'created', organizationId, workspaceId }
  }
  return { kind: 'idempotent', organizationId, workspaceId }
}

/**
 * 创建错误分类文案（400/403/404/409/500 各自可行动提示）。
 * 直接复用 classifyOrgError 的稳定归类，再补充创建旅程特有的行动指引。
 */
export function createOrgErrorHint(failure: OrgFailure): string {
  switch (failure.kind) {
    case 'validation':
      return `创建失败（400 校验）：${failure.message}。请检查组织名 / Owner / 默认工作区名称；Owner 必须是正整数 TSID。`
    case 'forbidden':
      return `无权限（403）：当前管理员缺少 organizations:write，无法创建组织（授权由服务端 fail-closed 判定，前端入口仅作提示）。`
    case 'not_found':
      return `Owner 不存在（404）：所选用户无法作为组织 Owner，请重新选择一个有效且 active 的用户。`
    case 'conflict':
      return `冲突（409）：${failure.message}。可能已存在同名组织，请刷新后重试或改用既有组织。`
    case 'server':
      return `服务端事务失败（500）：${failure.message}。事务已整体回滚，可稍后重试。`
    default:
      return failure.message
  }
}

/**
 * Owner 转移错误分类文案（POST /organizations/:id/owner-transfer 旅程特有指引）。
 * 服务端裁决链：400 自转移/参数、403 adm_acl、404 组织不存在、
 * 409 组织已归档 / 目标非本组织 active 成员 / 已是 owner；500 事务整体回滚。
 */
export function ownerTransferErrorHint(failure: OrgFailure): string {
  switch (failure.kind) {
    case 'validation':
      return `转移被拒绝（400 校验）：${failure.message}。不能转移到当前 Owner 本人（自转移），请重新选择目标用户。`
    case 'forbidden':
      return `无权限（403）：当前管理员缺少 organizations:write，无法转移 Owner（授权由服务端 fail-closed 判定）。`
    case 'not_found':
      return `组织不存在（404）：${failure.message}。请刷新组织事实后重试。`
    case 'conflict':
      return `转移被拒绝（409）：${failure.message}。新 Owner 必须是本组织的 active 成员，且组织未归档。`
    case 'server':
      return `服务端事务失败：${failure.message}。事务已整体回滚，可稍后重试。`
    default:
      return failure.message
  }
}
