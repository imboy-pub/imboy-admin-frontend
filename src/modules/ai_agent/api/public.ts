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
  created_at?: string
}

/** agent 详情（ai_agent_ds:get，含 system_prompt 长文本） */
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
}

/** 更新/新建入参（后端按 user_id 有无区分 create/update） */
export interface AiAgentUpsertInput {
  user_id?: EntityId
  nickname?: string
  account?: string
  provider: string
  model?: string
  system_prompt?: string
  description?: string
  visibility?: AgentVisibility
  status?: AgentStatus
}

/** 新手引导配置（config 表 onboarding.* 键） */
export interface OnboardingConfig {
  enabled: boolean
  welcome_agent_uid: EntityId
  default_channels: string[]
  welcome_template: string
  welcome_llm_enabled: boolean
}

export interface AiAgentListParams {
  page: number
  size: number
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
  return requireApiPayload<AiAgentDetail>(response.data, '/ai_agent/detail')
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
