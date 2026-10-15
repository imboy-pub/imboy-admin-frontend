/**
 * AI 管理面 API（v4 P0-10，G.4 冻结路径族 /api/adm/cs/ai/*）。
 *
 * 纪律：
 * - TSID 全程 string；只调 /api/adm 域；
 * - 权限：读 customer_service:read / 写 customer_service:write（fail-closed
 *   由 useAdminPermission 在页面门处裁决，此处不二次判定）。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

const BASE = '/cs/ai'

export type AiAutoReplyMode = 'disabled' | 'observe' | 'canary' | 'enabled'

export type AiConfig = {
  id?: EntityId
  name?: string
  provider?: string
  model?: string
  system_prompt?: string
  greeting?: string
  auto_reply_mode?: AiAutoReplyMode
  config_version?: number
  seat_identity_id?: EntityId
  max_unresolved_turns?: number
  faq_require_hit?: boolean
  max_inflight?: number
  job_timeout_ms?: number
  max_job_age_ms?: number
  configured?: boolean
}

export type AiFaq = {
  id: EntityId
  question: string
  answer?: string
  intent?: string
  category?: string
  keywords?: string[]
  status?: 'draft' | 'published' | 'paused' | 'retired'
  hit_count?: number
  version?: number
  embedded?: boolean
}

export type AiFaqUpsertInput = {
  id?: EntityId
  question: string
  answer?: string
  intent?: string
  category?: string
  keywords?: string[]
  status?: AiFaq['status']
}

export type AiTurn = {
  seq: number
  direction?: string
  intent?: string
  model_reported_confidence?: number
  action?: string
  reply_text?: string
  model?: string
  latency_ms?: number
}

type AiStats = Record<string, unknown>

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const response = await client.get<ApiResponse<T>>(`${BASE}${path}`, { params })
  return requireApiPayload(response.data, `GET ${path}`)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await client.post<ApiResponse<T>>(`${BASE}${path}`, body)
  return requireApiPayload(response.data, `POST ${path}`)
}

export async function getAiConfig(orgId: EntityId): Promise<AiConfig> {
  return get<AiConfig>('/config', { org_id: orgId })
}

export async function setAiConfig(orgId: EntityId, input: Partial<AiConfig>): Promise<AiConfig> {
  return post<AiConfig>('/config/set', { org_id: orgId, ...input })
}

export async function getAiFaqList(
  orgId: EntityId,
  params: { intent?: string; limit?: number; offset?: number } = {}
): Promise<AiFaq[]> {
  const query: Record<string, string | number> = { org_id: orgId }
  if (params.intent) query.intent = params.intent
  if (params.limit != null) query.limit = params.limit
  if (params.offset != null) query.offset = params.offset
  return get<AiFaq[]>('/faq', query)
}

export async function upsertAiFaq(orgId: EntityId, input: AiFaqUpsertInput): Promise<AiFaq> {
  return post<AiFaq>('/faq/upsert', { org_id: orgId, ...input })
}

export async function deleteAiFaq(orgId: EntityId, id: EntityId): Promise<unknown> {
  return post<unknown>('/faq/delete', { org_id: orgId, id })
}

export async function getAiSessions(
  orgId: EntityId,
  params: { limit?: number; offset?: number; workspace_id?: EntityId } = {}
): Promise<Record<string, unknown>> {
  const query: Record<string, string | number> = { org_id: orgId }
  if (params.limit != null) query.limit = params.limit
  if (params.offset != null) query.offset = params.offset
  if (params.workspace_id) query.workspace_id = params.workspace_id
  return get<Record<string, unknown>>('/sessions', query)
}

export async function getAiSessionTurns(
  orgId: EntityId,
  sessionId: EntityId,
  params: { limit?: number; workspace_id?: EntityId } = {}
): Promise<AiTurn[]> {
  const query: Record<string, string | number> = { org_id: orgId, session_id: sessionId }
  if (params.limit != null) query.limit = params.limit
  if (params.workspace_id) query.workspace_id = params.workspace_id
  return get<AiTurn[]>('/session_turns', query)
}

export async function getAiStats(
  orgId: EntityId,
  params: { date?: string; workspace_id?: EntityId } = {}
): Promise<AiStats> {
  const query: Record<string, string | number> = { org_id: orgId }
  if (params.date) query.date = params.date
  if (params.workspace_id) query.workspace_id = params.workspace_id
  return get<AiStats>('/stats', query)
}
