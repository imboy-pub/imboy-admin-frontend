import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

// ─── 敏感词管理 ────────────────────────────────────────────────────────────────

export interface SensitiveWord {
  id: EntityId
  word: string
  category: string
  severity: 'low' | 'medium' | 'high'
  created_at: string
}

export interface SensitiveWordListParams {
  page?: number
  size?: number
  keyword?: string
  category?: string
}

export async function getSensitiveWordList(
  params: SensitiveWordListParams
): Promise<ApiResponse<PaginatedResponse<SensitiveWord>>> {
  const response = await client.get('/moderation/sensitive-words', { params })
  return response.data
}

export async function getSensitiveWordListPayload(
  params: SensitiveWordListParams
): Promise<PaginatedResponse<SensitiveWord>> {
  return requireApiPayload(await getSensitiveWordList(params), '/moderation/sensitive-words')
}

export async function createSensitiveWord(
  data: Omit<SensitiveWord, 'id' | 'created_at'>
): Promise<ApiResponse<SensitiveWord>> {
  const response = await client.post('/moderation/sensitive-words', data)
  return response.data
}

export async function deleteSensitiveWord(id: EntityId): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(`/moderation/sensitive-words/${id}`)
  return response.data
}

export async function importSensitiveWords(
  words: Array<{ word: string; category: string; severity: SensitiveWord['severity'] }>
): Promise<ApiResponse<{ imported: number; skipped: number }>> {
  const response = await client.post('/moderation/sensitive-words/import', { words })
  return response.data
}

// ─── 消息人工复审 ───────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ReviewQueueItem {
  id: EntityId
  msg_id: EntityId
  msg_type: string
  content: string
  from_id: EntityId
  from_account: string
  to_id: EntityId
  to_type: 'user' | 'group' | 'channel'
  hit_words: string[]
  review_status: ReviewStatus
  reviewer_id?: EntityId
  reviewed_at?: string
  created_at: string
}

export interface ReviewQueueParams {
  page?: number
  size?: number
  status?: ReviewStatus | 'all'
  keyword?: string
  start?: string
  end?: string
}

export async function getReviewQueue(
  params: ReviewQueueParams
): Promise<ApiResponse<PaginatedResponse<ReviewQueueItem>>> {
  const response = await client.get('/moderation/review-queue', { params })
  return response.data
}

export async function getReviewQueuePayload(
  params: ReviewQueueParams
): Promise<PaginatedResponse<ReviewQueueItem>> {
  return requireApiPayload(await getReviewQueue(params), '/moderation/review-queue')
}

export async function moderateMessage(
  id: EntityId,
  action: 'approve' | 'reject',
  reason?: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post(`/moderation/review-queue/${id}/moderate`, { action, reason })
  return response.data
}
