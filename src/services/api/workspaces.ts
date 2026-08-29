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

interface WorkspaceAdminDetail extends WorkspaceAdminRow {
  owner: { id: EntityId; nickname?: string | null; account?: string | null; avatar?: string | null } | Record<string, never>
  members: PaginatedResponse<WorkspaceMemberRow>
  projects: WorkspaceResourceRow[]
  groups: WorkspaceResourceRow[]
  channels: WorkspaceResourceRow[]
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

export async function getWorkspaceDetailPayload(id: EntityId): Promise<WorkspaceAdminDetail> {
  const res = await client.get('/workspace/detail', { params: { workspace_id: id } })
  return requireApiPayload<WorkspaceAdminDetail>(res.data, 'workspace/detail')
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

export interface ProjectChannelRow {
  id: EntityId
  project_id?: EntityId
  name?: string | null
  subscriber_count?: number
  status?: string | number
  created_at?: string | null
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
