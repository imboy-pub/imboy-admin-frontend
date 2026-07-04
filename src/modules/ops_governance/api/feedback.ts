import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'

export interface Feedback {
  id: EntityId
  user_id: EntityId
  content: string
  status: number
  created_at: string
  updated_at: string
  reply?: string
  reply_at?: string
  // 扩展字段
  nickname?: string
  avatar?: string
}

export interface FeedbackListParams {
  page?: number
  size?: number
  status?: number
}

export interface FeedbackReplyParams {
  feedback_id: EntityId
  reply: string
}

type RawFeedback = Feedback & {
  feedback_id?: EntityId
  body?: string
  reply_body?: string
}

function normalizeFeedback(item: RawFeedback): Feedback {
  const status = Number(item.status)
  return {
    ...item,
    id: coerceEntityId(item.id ?? item.feedback_id, '0'),
    user_id: coerceEntityId(item.user_id, '0'),
    status: Number.isFinite(status) ? status : 1,
    content: item.content ?? item.body ?? '',
    reply: item.reply ?? item.reply_body,
  }
}

/**
 * @deprecated Prefer `getFeedbackListPayload` to consume typed payload directly.
 */
export async function getFeedbackList(params: FeedbackListParams): Promise<ApiResponse<PaginatedResponse<Feedback>>> {
  const response = await client.get('/feedback/index', { params })
  return response.data
}

export async function getFeedbackListPayload(params: FeedbackListParams): Promise<PaginatedResponse<Feedback>> {
  const payload = requireApiPayload(await getFeedbackList(params), '/feedback/index')
  const items = Array.isArray(payload.items) ? payload.items.map((item) => normalizeFeedback(item as RawFeedback)) : []
  return { ...payload, items }
}

export async function replyFeedback(data: FeedbackReplyParams): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/feedback/reply', {
    feedback_id: data.feedback_id,
    body: data.reply,
  })
  return response.data
}

export async function deleteFeedback(feedbackId: EntityId): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/feedback/delete', { feedback_id: feedbackId })
  return response.data
}

/** 反馈状态：1 待处理 · 2 处理中（已回复）· 3 已完结。 */
export type FeedbackStatus = 1 | 2 | 3

/** 更新反馈状态（POST /adm/feedback/status）。 */
export async function updateFeedbackStatus(
  feedbackId: EntityId,
  status: FeedbackStatus
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/feedback/status', {
    feedback_id: feedbackId,
    status,
  })
  return response.data
}
