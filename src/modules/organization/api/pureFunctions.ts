/**
 * Organization 治理面纯函数（ORG-14）。
 *
 * 契约真源（后端 worktree codex/org-v1-backend-20260916）：
 *   - `src/api/organization_handler.erl` / `organization_member_handler.erl`
 *   - `src/lib/organization/interfaces/organization_api_handler.erl`
 *   - `src/lib/organization/application/*`（invitation / department / lifecycle / preflight）
 *
 * 关键口径（与实现逐条核对过）：
 *   - 组织列表分页信封 `{list,page,size,total,total_page}`（organization_repo:page_by_member）；
 *   - 部门 move/update 的并发冲突字段是 `expected_version`（CAS，仅部门域有）；
 *   - 成员行键 `organization_id/user_id/role/invited_by/joined_at/status/nickname/avatar/account`；
 *   - 部门成员行键 `organization_id/department_id/user_id/is_admin/created_at/updated_at`；
 *   - 邀请明文 token 只在 create 响应出现一次（view 白名单永不含 token/token_digest）；
 *   - C16：archived 组织禁新写（409），restore 是唯一放行写；
 *   - C17：删除预检 503 = DEPENDENCY_FACTS_UNAVAILABLE（fail-closed，不得继续）。
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

export type DepartmentMemberRow = {
  organizationId: EntityId
  departmentId: EntityId
  userId: EntityId
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

export type DeletionBlocker = {
  code: string
  resourceType: string
  resourceId: string
  organizationId: EntityId | null
}

export type DeletionPreflightFactDomain =
  | 'organization'
  | 'workspace'
  | 'enterprise_business'
  | 'customer_service'
  | 'agent'
  | string

export type DeletionPreflightFact = {
  domain: DeletionPreflightFactDomain
  factVersion: number
  observedAt: number
}

export type DeletionPreflight = {
  subjectUserId: EntityId
  blockers: DeletionBlocker[]
  facts: DeletionPreflightFact[]
  observedAt: number
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

/** 管理端会话边界说明：v1 面需要用户 Bearer token，admin cookie 会话不可用。 */
export const V1_SESSION_HINT =
  '该面板走 /api/v1 用户会话（Bearer token）；当前管理端会话未携带该凭据时请求会被拒绝（401）。此为部署边界，不做身份冒充。'

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
      return `未认证（401）：${detail}。${V1_SESSION_HINT}`
    case 'forbidden':
      return `无权限（403）：${detail}`
    case 'not_found':
      return `目标不存在（404）：${detail}`
    case 'conflict':
      return `状态或并发冲突（409）：${detail}。数据可能已被他人修改，请刷新后重试`
    case 'facts_unavailable':
      return `依赖域事实不可用（503 fail-closed）：${detail}。删除预检被拒绝，不允许继续删除动作`
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
// 权限矩阵（ORG-A14：Platform Admin 不映射为 Org owner/admin）
//
// 服务端事实真源：
//   * 组织本体写（改名/archive/restore）：仅 active owner/admin（C16）；
//   * 成员列表/邀请治理：仅 owner/admin；
//   * admin 角色授予/移除 admin 成员：仅主 Owner（ensure_primary_owner）；
//   * owner 转移：仅主 Owner（organization_owner_transfer）；
//   * 部门域写基线：同 Org active 成员（organization_department_app require_actor）。
// 平台侧 RBAC 只控制「能否进入本模块页面」，org 级裁决完全由 member_role 驱动。
// ===========================================================================

export function canViewOrgDetail(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

/** 组织本体写（改名/archive/restore）：owner/admin，且组织未归档（restore 除外）。 */
export function canOrgWrite(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** C16：archived 禁新写；restore 是 archived 态唯一放行的写入口。 */
export function isOrgWriteAllowed(status: OrgStatus, action: 'archive' | 'restore' | 'update'): boolean {
  if (status === 'active') return true
  if (status === 'archived') return action === 'restore'
  return false
}

export function canViewMembers(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** admin 角色管理 / 移除 admin 成员：仅主 Owner。 */
export function canManageAdminRole(role: OrgRole): boolean {
  return role === 'owner'
}

export function canTransferOwner(role: OrgRole): boolean {
  return role === 'owner'
}

export function canManageInvitations(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** 部门域写基线 = 同 Org active 成员（服务端口径，含局部目录管理员委托）。 */
export function canWriteDepartments(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
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
    memberRole: asOrgRole(record['member_role'] ?? record['role']),
    createdAt: asString(record['created_at']),
    updatedAt: asString(record['updated_at']),
    brandingKeys: safeJsonKeyNames(record['branding']),
    settingsKeys: safeJsonKeyNames(record['settings']),
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

export function toDepartmentMemberRow(raw: unknown): DepartmentMemberRow {
  const record = asRecord(raw)
  return {
    organizationId: coerceEntityId(record['organization_id']),
    departmentId: coerceEntityId(record['department_id']),
    userId: coerceEntityId(record['user_id']),
    isAdmin: record['is_admin'] === true,
    createdAt: asString(record['created_at']),
    updatedAt: asString(record['updated_at']),
  }
}

export function toDeletionPreflight(raw: unknown): DeletionPreflight {
  const record = asRecord(raw)
  const blockers = Array.isArray(record['blockers'])
    ? record['blockers'].map((item) => {
        const b = asRecord(item)
        return {
          code: asString(b['code']),
          resourceType: asString(b['resource_type']),
          resourceId: asString(b['resource_id']),
          organizationId: b['organization_id'] == null ? null : coerceEntityId(b['organization_id']),
        }
      })
    : []
  const facts = Array.isArray(record['facts'])
    ? record['facts'].map((item) => {
        const f = asRecord(item)
        return {
          domain: asString(f['domain']),
          factVersion: asVersion(f['fact_version']),
          observedAt: asNumberOrNull(f['observed_at']) ?? 0,
        }
      })
    : []
  return {
    subjectUserId: coerceEntityId(record['subject_user_id']),
    blockers,
    facts,
    observedAt: asNumberOrNull(record['observed_at']) ?? 0,
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
