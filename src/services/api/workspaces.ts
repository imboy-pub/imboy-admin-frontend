import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'
import type { PaginatedResponse } from '@/types/api'

/**
 * Workspace/Project 运营管理 API（双体验 v2.5.2 WP7/T11b）
 *
 * 后端：/api/adm/workspace/* 与 /api/adm/project/*（adm_workspace_handler）
 * 鉴权：workspaces:read / workspaces:update（fail-closed 403）
 * TSID 一律 EntityId（string），禁止 Number(id) 回转。
 */

// 内部类型：仅本模块函数签名使用，外部消费者通过函数返回值推导
type WorkspaceStatus = 'active' | 'archived'

export interface WorkspaceAdminRow {
  id: EntityId
  name: string
  logo?: string
  owner_id: EntityId
  owner_nickname?: string | null
  owner_account?: string | null
  status: WorkspaceStatus
  branding?: Record<string, unknown>
  archived_at?: string | null
  archived_by?: EntityId | null
  created_at: string
  updated_at?: string | null
  project_count: number
  group_count: number
  channel_count: number
  member_count: number
}

/**
 * 工作区详情（/workspace/detail）。与列表行（WorkspaceAdminRow）不同，后端详情
 * payload 为嵌套形状（实测 2026-08-31）：
 * - owner 为嵌套对象 {id,nickname,account,avatar}，无扁平 owner_nickname/owner_account
 * - 无 project_count/group_count/channel_count/member_count 数值字段；
 *   projects/groups/channels 为有界数组（后端 admin_resource_list 截断前 20 条），
 *   members 为嵌套分页 {list,page,size,total,total_page}（total 为准确总数）
 * 计数类字段经 Omit 移除，防止页面误读不存在扁平字段恒取 0/undefined。
 */
export type WorkspaceAdminDetail = Omit<
  WorkspaceAdminRow,
  'project_count' | 'group_count' | 'channel_count' | 'member_count'
> & {
  owner?: { id: EntityId; nickname?: string | null; account?: string | null; avatar?: string | null } | null
  /** 后端下发为嵌套分页 {list,...}；getWorkspaceDetailPayload 归一补 items */
  members: PaginatedResponse<WorkspaceMemberRow>
  /** 有界资源数组（后端截断前 20 条），计数只能作下限估计 */
  projects: WorkspaceResourceRow[]
  groups: WorkspaceResourceRow[]
  channels: WorkspaceResourceRow[]
}

export interface WorkspaceMemberRow {
  workspace_id: EntityId
  user_id: EntityId
  nickname?: string | null
  account?: string | null
  avatar?: string | null
  /** 工作区成员角色：owner / member / guest */
  role: 'owner' | 'member' | 'guest'
  invited_by?: EntityId | null
  joined_at: string
  status: 'active' | 'removed'
}

export interface WorkspaceResourceRow {
  id: EntityId
  name?: string
  title?: string
  status: string | number
  owner_id?: EntityId
  owner_uid?: EntityId
  creator_uid?: EntityId
  member_count?: number
  subscriber_count?: number
  created_at: string
}

export interface ProjectAdminRow {
  id: EntityId
  workspace_id: EntityId
  owner_id: EntityId
  owner_nickname?: string | null
  owner_account?: string | null
  name: string
  description?: string | null
  status: 'active' | 'done'
  workspace_name?: string | null
  workspace_status?: WorkspaceStatus | null
  created_at: string
  updated_at?: string | null
  task_total: number
  task_done: number
}

interface ProjectAssigneeRow {
  assignee_id: EntityId
  nickname?: string | null
  account?: string | null
  avatar?: string | null
  total: number
  done: number
}

interface ProjectAdminDetail extends ProjectAdminRow {
  workspace?: { id?: EntityId; name?: string | null; status?: WorkspaceStatus | null } | null
  owner?: { id?: EntityId; nickname?: string | null; account?: string | null } | null
  task_stats: Record<string, number>
  assignees: ProjectAssigneeRow[]
}

interface ProductExperienceConfig {
  effective_product_experience: 'chat' | 'workspace'
  config_version: string
  configured_value: 'chat' | 'workspace'
  configured_raw: string
  source: string
  level: string
}

interface WorkspaceListParams {
  page?: number
  size?: number
  status?: string
  keyword?: string
}

interface ProjectListParams {
  page?: number
  size?: number
  status?: string
  keyword?: string
}

export function workspaceListQueryKey(params?: WorkspaceListParams) {
  return params !== undefined
    ? (['workspaces', 'list', params] as const)
    : (['workspaces', 'list'] as const)
}

export function workspaceDetailQueryKey(id?: EntityId) {
  return ['workspaces', 'detail', id ?? ''] as const
}

export function projectListQueryKey(params?: ProjectListParams) {
  return params !== undefined
    ? (['workspaces', 'projects', 'list', params] as const)
    : (['workspaces', 'projects', 'list'] as const)
}

export function projectDetailQueryKey(id?: EntityId) {
  return ['workspaces', 'projects', 'detail', id ?? ''] as const
}

export function productExperienceQueryKey() {
  return ['workspaces', 'product-experience'] as const
}

export async function getWorkspaceListPayload(
  params: WorkspaceListParams
): Promise<PaginatedResponse<WorkspaceAdminRow>> {
  const res = await client.get('/workspace/list', { params })
  return requireApiPayload<PaginatedResponse<WorkspaceAdminRow>>(res.data, 'workspace/list')
}

/**
 * 归一 detail 嵌套 members 分页：后端下发 {list,page,size,total,total_page}，
 * responseAdapter 的 list→items 归一只处理 payload 根，嵌套对象不触及 → 此处补 items。
 * 不可变：返回新对象，不改入参。
 */
function normalizeDetailMembers(
  members: PaginatedResponse<WorkspaceMemberRow> | undefined,
): PaginatedResponse<WorkspaceMemberRow> | undefined {
  if (!members || Array.isArray(members.items)) return members
  const raw = members as PaginatedResponse<WorkspaceMemberRow> & { list?: WorkspaceMemberRow[] }
  const list = Array.isArray(raw.list) ? raw.list : []
  const total = typeof raw.total === 'number' ? raw.total : list.length
  const size = typeof raw.size === 'number' && raw.size > 0 ? raw.size : list.length || 1
  return {
    ...raw,
    items: list,
    total,
    total_pages: Math.ceil(total / size),
  }
}

export async function getWorkspaceDetailPayload(id: EntityId): Promise<WorkspaceAdminDetail> {
  const res = await client.get('/workspace/detail', { params: { workspace_id: id } })
  const detail = requireApiPayload<WorkspaceAdminDetail>(res.data, 'workspace/detail')
  // 后端 members 为嵌套分页 {list,...}，兜底归一为 items（WorkspaceDetailPage 消费 items/total）
  return { ...detail, members: normalizeDetailMembers(detail.members) as PaginatedResponse<WorkspaceMemberRow> }
}

export async function archiveWorkspace(id: EntityId): Promise<void> {
  const res = await client.post('/workspace/archive', { workspace_id: id })
  requireApiPayload(res.data, 'workspace/archive')
}

export async function restoreWorkspace(id: EntityId): Promise<void> {
  const res = await client.post('/workspace/restore', { workspace_id: id })
  requireApiPayload(res.data, 'workspace/restore')
}

export async function getProjectListPayload(
  params: ProjectListParams
): Promise<PaginatedResponse<ProjectAdminRow>> {
  const res = await client.get('/project/list', { params })
  return requireApiPayload<PaginatedResponse<ProjectAdminRow>>(res.data, 'project/list')
}

export async function getProjectDetailPayload(id: EntityId): Promise<ProjectAdminDetail> {
  const res = await client.get('/project/detail', { params: { project_id: id } })
  return requireApiPayload<ProjectAdminDetail>(res.data, 'project/detail')
}

// ---------------------------------------------------------------------------
// W2 项目治理面（只读；Admin 契约 ZC-05 冻结，ACL=workspaces:read，403 fail-closed）
// 后端：/api/adm/project/{members,milestones,channels,aggregations}
// 分页响应统一 {list,page,size,total,total_page}，经 requireApiPayload 归一化为
// PaginatedResponse（list→items、total_pages 补算）。TSID 一律 EntityId string。
// ---------------------------------------------------------------------------

export type ProjectMilestoneStatusFilter = 'all' | 'planned' | 'reached'

export type ProjectAggregationType = 'pinned' | 'resources' | 'activity' | 'related_posts'

export interface ProjectMemberRow {
  project_id: EntityId
  user_id: EntityId
  nickname?: string | null
  account?: string | null
  avatar?: string | null
  /** 项目成员角色（后端契约未细化，仅展示） */
  role?: string | null
  joined_at?: string | null
}

export interface ProjectMilestoneRow {
  id: EntityId
  project_id: EntityId
  name?: string | null
  title?: string | null
  status: 'planned' | 'reached'
  planned_at?: string | null
  reached_at?: string | null
  created_at?: string | null
}

/**
 * 项目关联频道行（/project/channels，后端 SQL JOIN project_channel_rel × channel，实测 2026-08-31）：
 * {channel_id, workspace_id, linked_at, name, avatar, channel_status}——
 * 无 id/subscriber_count/created_at 字段（关联时间键为 linked_at = rel.created_at）。
 */
export interface ProjectChannelRow {
  channel_id: EntityId
  workspace_id?: EntityId
  name?: string | null
  avatar?: string | null
  /** 频道状态（channel.status，数字枚举） */
  channel_status?: string | number
  /** 关联时间（project_channel_rel.created_at，epoch ms） */
  linked_at?: number | string | null
}

export interface ProjectAggregationRow {
  id: EntityId
  project_id?: EntityId
  type: ProjectAggregationType
  title?: string | null
  target_id?: EntityId | null
  operator_id?: EntityId | null
  created_at?: string | null
  /** 各聚合类型差异字段兜底（后端契约未逐字段冻结） */
  extra?: Record<string, unknown>
}

export interface ProjectMembersParams {
  page?: number
  size?: number
}

export interface ProjectMilestonesParams {
  page?: number
  size?: number
  status?: ProjectMilestoneStatusFilter
}

export interface ProjectChannelsParams {
  page?: number
  size?: number
}

export interface ProjectAggregationsParams {
  page?: number
  size?: number
  type?: ProjectAggregationType
}

export function projectMembersQueryKey(projectId: EntityId, params?: ProjectMembersParams) {
  return params !== undefined
    ? (['workspaces', 'projects', 'members', projectId, params] as const)
    : (['workspaces', 'projects', 'members', projectId] as const)
}

export function projectMilestonesQueryKey(projectId: EntityId, params?: ProjectMilestonesParams) {
  return params !== undefined
    ? (['workspaces', 'projects', 'milestones', projectId, params] as const)
    : (['workspaces', 'projects', 'milestones', projectId] as const)
}

export function projectChannelsQueryKey(projectId: EntityId, params?: ProjectChannelsParams) {
  return params !== undefined
    ? (['workspaces', 'projects', 'channels', projectId, params] as const)
    : (['workspaces', 'projects', 'channels', projectId] as const)
}

export function projectAggregationsQueryKey(projectId: EntityId, params?: ProjectAggregationsParams) {
  return params !== undefined
    ? (['workspaces', 'projects', 'aggregations', projectId, params] as const)
    : (['workspaces', 'projects', 'aggregations', projectId] as const)
}

/** 判定 client 响应拦截器 reject 的 ApiError 是否为 403（workspaces:read fail-closed） */
export function isForbiddenError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { code?: unknown }).code === 403
}

export async function getProjectMembersPayload(
  projectId: EntityId,
  params: ProjectMembersParams = {}
): Promise<PaginatedResponse<ProjectMemberRow>> {
  const res = await client.get('/project/members', { params: { project_id: projectId, ...params } })
  return requireApiPayload<PaginatedResponse<ProjectMemberRow>>(res.data, 'project/members')
}

export async function getProjectMilestonesPayload(
  projectId: EntityId,
  params: ProjectMilestonesParams = {}
): Promise<PaginatedResponse<ProjectMilestoneRow>> {
  const res = await client.get('/project/milestones', {
    params: { project_id: projectId, ...params },
  })
  return requireApiPayload<PaginatedResponse<ProjectMilestoneRow>>(res.data, 'project/milestones')
}

export async function getProjectChannelsPayload(
  projectId: EntityId,
  params: ProjectChannelsParams = {}
): Promise<PaginatedResponse<ProjectChannelRow>> {
  const res = await client.get('/project/channels', {
    params: { project_id: projectId, ...params },
  })
  return requireApiPayload<PaginatedResponse<ProjectChannelRow>>(res.data, 'project/channels')
}

export async function getProjectAggregationsPayload(
  projectId: EntityId,
  params: ProjectAggregationsParams = {}
): Promise<PaginatedResponse<ProjectAggregationRow>> {
  const res = await client.get('/project/aggregations', {
    params: { project_id: projectId, ...params },
  })
  return requireApiPayload<PaginatedResponse<ProjectAggregationRow>>(res.data, 'project/aggregations')
}

/**
 * Product Experience 安装级配置（只读；双体验 v2.5.2 WP7/T11）。
 * 无运行时写接口——变更 = 修改部署配置并受控重启。
 */
export async function getProductExperienceConfig(): Promise<ProductExperienceConfig> {
  const res = await client.get('/admin/config/product-experience')
  return requireApiPayload<ProductExperienceConfig>(res.data, 'admin/config/product-experience')
}
