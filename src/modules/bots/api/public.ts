// Bot 开发者服务管理 API / Bot developer-service management API
// 后端: src/adm/adm_bot_handler.erl（baseURL /api/adm，调用不写前缀）
// RBAC: bots:read（list/detail）、bots:update（disable/enable）
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

// status: -1=deleted 0=disabled 1=active
export type BotStatus = -1 | 0 | 1

/** admin 列表行（bot_repo:page JOIN user） */
export interface BotListItem {
  user_id: EntityId
  name: string
  username: string
  description: string
  owner_uid: EntityId
  /** 属主昵称（JOIN user.nickname） */
  nickname: string
  /** 属主头像（JOIN user.avatar） */
  avatar: string
  is_public: boolean
  status: BotStatus
}

/** Bot 详情（bot_logic:get/1，已过滤 api_token/verify_token 敏感字段） */
export interface BotDetail extends BotListItem {
  webhook_url: string
  /** 后端返回 JSON 编码字符串，API 层解析为数组 */
  commands: string[]
  /** 后端返回 JSON 编码字符串，API 层解析为数组 */
  permissions: string[]
  /** 后端返回 JSON 编码字符串，API 层解析为数组 */
  events: string[]
  created_at?: string
  updated_at?: string
}

export interface BotListParams {
  page: number
  size: number
}

export async function getBotList(
  params: BotListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<BotListItem>> {
  const response = await client.get('/bot/list', { params })
  const payload = requireApiPayload<PaginatedResponse<BotListItem>>(response.data, '/bot/list')
  return { ...payload, items: Array.isArray(payload.items) ? payload.items : [] }
}

export async function getBotDetail(botId: EntityId): Promise<BotDetail> {
  const response = await client.get('/bot/detail', { params: { bot_id: botId } })
  const detail = requireApiPayload<BotDetail>(response.data, '/bot/detail')
  return {
    ...detail,
    commands: parseJsonArray(detail.commands),
    permissions: parseJsonArray(detail.permissions),
    events: parseJsonArray(detail.events),
  }
}

/** 平台处置：启停 Bot（adm 权限 bots:update，无属主校验；后端为独立两端点） */
export async function setBotStatus(botId: EntityId, status: 0 | 1): Promise<ApiResponse> {
  const endpoint = status === 1 ? '/bot/enable' : '/bot/disable'
  const response = await client.post(endpoint, { bot_id: botId })
  return response.data
}

/** bot 表 jsonb 列（'["a","b"]'）→ 数组；异常输入回退 [] */
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}
