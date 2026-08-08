// AI 助手管理 API / AI agent management API
// 后端: src/adm/adm_ai_agent_handler.erl（baseURL /api/adm，调用不写前缀）
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

// visibility: 0=私有 1=公开可发现（进助手广场）
export type AgentVisibility = 0 | 1
// status: 0=停用 1=启用
export type AgentStatus = 0 | 1

/** admin 列表行（ai_agent_repo:page JOIN user） */
export interface AiAgentListItem {
  user_id: EntityId
  nickname: string
  avatar: string
  provider: string
  model: string
  description: string
  visibility: AgentVisibility
  status: AgentStatus
  owner_uid: EntityId
  /** 分类（迁移 000057 扩展列，供列表筛选） */
  category: string
  role_id?: string
  role_name?: string
  role_version?: number
  created_at?: string
}

/** 助手能力集（capabilities jsonb → JSON 编码字符串 → 前端解析为对象） */
export type AiAgentCapabilities = Record<string, boolean>

/** agent 详情（ai_agent_ds:get，含 system_prompt 长文本 + 定制扩展字段） */
export interface AiAgentDetail {
  user_id: EntityId
  provider: string
  model: string
  role_id: string
  system_prompt: string
  owner_uid: EntityId
  status: AgentStatus
  description: string
  visibility: AgentVisibility
  category: string
  voice_id: string
  greeting: string
  /** 后端返回 JSON 编码字符串，API 层解析为对象 */
  capabilities: AiAgentCapabilities
  temperature: number
}

/** 更新/新建入参（后端按 user_id 有无区分 create/update） */
export interface AiAgentUpsertInput {
  user_id?: EntityId
  nickname?: string
  account?: string
  /** 头像 URL（admin 上传后随 update 提交，后端同步写 user.avatar） */
  avatar?: string
  provider: string
  role_id?: string
  model?: string
  system_prompt?: string
  description?: string
  visibility?: AgentVisibility
  status?: AgentStatus
  category?: string
  voice_id?: string
  greeting?: string
  capabilities?: AiAgentCapabilities
  temperature?: number
}

/** ai_roles 人格 KV：role_id → system_prompt */
export type AiRolesMap = Record<string, string>

/** 新手引导配置（config 表 onboarding.* 键） */
export interface OnboardingConfig {
  enabled: boolean
  welcome_agent_uid: EntityId
  default_channels: string[]
  welcome_template: string
  welcome_llm_enabled: boolean
}

/** 知识库配置（config 表 ai_agent.kb.* 键；供 @管家 答疑注入） */
export interface KnowledgeConfig {
  enabled: boolean
  group_rule: string
  faq: string
}

export interface AiAgentListParams {
  page: number
  size: number
  category?: string
}

export type AiRoleStatus = 0 | 1

export type AiRoleCapabilityPolicy = {
  knowledge?: {
    mode: 'off' | 'on_demand' | 'required'
    source?: 'all' | 'faq' | 'group_rule'
    max_context_bytes?: number
  }
  group_reply?: { mode: 'off' | 'mention_only' }
  proactive?: { mode: 'off' | 'welcome_only'; daily_limit?: number }
}

export interface AiRoleListItem {
  code: string
  name: string
  description: string
  status: AiRoleStatus
  active_version: number
  bound_agent_count?: number
  updated_at?: string
}

export interface AiRoleDetail extends AiRoleListItem {
  version_id?: EntityId
  version?: number
  state?: 'draft' | 'published' | 'archived'
  system_prompt?: string
  capabilities: AiAgentCapabilities
  knowledge_policy: AiRoleCapabilityPolicy
}

export interface AiRolePageParams {
  page: number
  size: number
  keyword?: string
  status?: AiRoleStatus
}

// --- API 调用 ---

export async function getAiAgentList(
  params: AiAgentListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<AiAgentListItem>> {
  const response = await client.get('/ai_agent/list', { params })
  const payload = requireApiPayload<PaginatedResponse<AiAgentListItem>>(
    response.data,
    '/ai_agent/list'
  )
  const items = Array.isArray(payload.items) ? payload.items : []
  return { ...payload, items }
}

export async function getAiAgentDetail(userId: EntityId): Promise<AiAgentDetail> {
  const response = await client.get('/ai_agent/detail', { params: { user_id: userId } })
  const detail = requireApiPayload<AiAgentDetail>(response.data, '/ai_agent/detail')
  return { ...detail, capabilities: parseCapabilities(detail.capabilities) }
}

export async function createAiAgent(input: AiAgentUpsertInput): Promise<{ user_id: EntityId }> {
  const response = await client.post('/ai_agent/create', input)
  return requireApiPayload<{ user_id: EntityId }>(response.data, '/ai_agent/create')
}

export async function updateAiAgent(input: AiAgentUpsertInput): Promise<{ user_id: EntityId }> {
  const response = await client.post('/ai_agent/update', input)
  return requireApiPayload<{ user_id: EntityId }>(response.data, '/ai_agent/update')
}

export async function setAiAgentStatus(
  userId: EntityId,
  status: AgentStatus
): Promise<ApiResponse> {
  const response = await client.post('/ai_agent/set_status', { user_id: userId, status })
  return response.data
}

export async function getAiRolePage(
  params: AiRolePageParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<AiRoleListItem>> {
  const response = await client.get('/ai_agent/role/list', { params })
  const payload = requireApiPayload<PaginatedResponse<AiRoleListItem>>(
    response.data,
    '/ai_agent/role/list'
  )
  return { ...payload, items: Array.isArray(payload.items) ? payload.items : [] }
}

export async function getAiRoleDetail(code: string): Promise<AiRoleDetail> {
  const response = await client.get('/ai_agent/role/detail', { params: { role_code: code } })
  const detail = requireApiPayload<AiRoleDetail>(response.data, '/ai_agent/role/detail')
  return {
    ...detail,
    capabilities: parseCapabilities(detail.capabilities),
    knowledge_policy: parseKnowledgePolicy(detail.knowledge_policy),
  }
}

export async function createAiRole(input: {
  code: string
  name: string
  description?: string
}): Promise<AiRoleListItem> {
  const response = await client.post('/ai_agent/role/create', input)
  return requireApiPayload<AiRoleListItem>(response.data, '/ai_agent/role/create')
}

export async function saveAiRoleDraft(
  roleCode: string,
  input: {
    version: number
    name?: string
    description?: string
    system_prompt: string
    capabilities: AiAgentCapabilities
    knowledge_policy: AiRoleCapabilityPolicy
  }
): Promise<unknown> {
  const response = await client.post('/ai_agent/role/draft', {
    role_code: roleCode,
    ...input,
  })
  return requireApiPayload(response.data, '/ai_agent/role/draft')
}

export async function publishAiRole(
  roleCode: string,
  version: number
): Promise<unknown> {
  const response = await client.post('/ai_agent/role/publish', {
    role_code: roleCode,
    version,
  })
  return requireApiPayload(response.data, '/ai_agent/role/publish')
}

export async function setAiRoleStatus(code: string, status: AiRoleStatus): Promise<ApiResponse> {
  const response = await client.post('/ai_agent/role/set_status', { role_code: code, status })
  return response.data
}

export async function getOnboardingConfig(): Promise<OnboardingConfig> {
  const response = await client.get('/ai_agent/onboarding_config')
  return requireApiPayload<OnboardingConfig>(response.data, '/ai_agent/onboarding_config')
}

export async function putOnboardingConfig(
  patch: Partial<OnboardingConfig>
): Promise<OnboardingConfig> {
  const response = await client.post('/ai_agent/onboarding_config', patch)
  return requireApiPayload<OnboardingConfig>(response.data, '/ai_agent/onboarding_config')
}

export async function getKnowledgeConfig(): Promise<KnowledgeConfig> {
  const response = await client.get('/ai_agent/knowledge_config')
  return requireApiPayload<KnowledgeConfig>(response.data, '/ai_agent/knowledge_config')
}

export async function putKnowledgeConfig(
  patch: Partial<KnowledgeConfig>
): Promise<KnowledgeConfig> {
  const response = await client.post('/ai_agent/knowledge_config', patch)
  return requireApiPayload<KnowledgeConfig>(response.data, '/ai_agent/knowledge_config')
}

// --- 角色管理（ai_roles 人格 KV） ---

/** GET /ai_agent/roles：全量角色 */
export async function getAiRoles(): Promise<AiRolesMap> {
  const response = await client.get('/ai_agent/roles')
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

/** POST /ai_agent/roles action=save：保存单个角色，回读全量 */
export async function saveAiRole(roleId: string, prompt: string): Promise<AiRolesMap> {
  const response = await client.post('/ai_agent/roles', {
    action: 'save',
    role_id: roleId,
    prompt,
  })
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

/** POST /ai_agent/roles action=delete：删除单个角色，回读全量 */
export async function deleteAiRole(roleId: string): Promise<AiRolesMap> {
  const response = await client.post('/ai_agent/roles', {
    action: 'delete',
    role_id: roleId,
  })
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

// --- 头像上传（multipart → Garage → URL） ---

/** POST /ai_agent/upload_avatar：multipart 上传头像，返回可访问 URL */
export async function uploadAgentAvatar(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)
  // axios 检测 FormData 自动设置 multipart boundary；body 不经 JSON transform
  const response = await client.post('/ai_agent/upload_avatar', form)
  return requireApiPayload<{ url: string }>(response.data, '/ai_agent/upload_avatar')
}

/** capabilities 后端为 JSON 编码字符串（jsone:encode），解析失败给空对象兜底 */
function parseCapabilities(raw: unknown): AiAgentCapabilities {
  if (raw && typeof raw === 'object') return raw as AiAgentCapabilities
  if (typeof raw === 'string' && raw !== '') {
    try {
      return JSON.parse(raw) as AiAgentCapabilities
    } catch {
      return {}
    }
  }
  return {}
}

function parseKnowledgePolicy(raw: unknown): AiRoleCapabilityPolicy {
  if (raw && typeof raw === 'object') return raw as AiRoleCapabilityPolicy
  if (typeof raw === 'string' && raw !== '') {
    try {
      return JSON.parse(raw) as AiRoleCapabilityPolicy
    } catch {
      return {}
    }
  }
  return {}
}
