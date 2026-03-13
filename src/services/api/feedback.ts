import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

export interface Feedback {
  id: number
  user_id: number
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
  feedback_id: number
  reply: string
}

type RawFeedback = Feedback & {
  feedback_id?: number
  body?: string
  reply_body?: string
}

function normalizeFeedback(item: RawFeedback): Feedback {
  const id = Number(item.id ?? item.feedback_id ?? 0)
  const userId = Number(item.user_id ?? 0)
  const status = Number(item.status)
  return {
    ...item,
    id: Number.isFinite(id) ? id : 0,
    user_id: Number.isFinite(userId) ? userId : 0,
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
