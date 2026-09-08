import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

// ─── R-04 处置申诉复审 ────────────────────────────────────────────────────────

export type AppealStatus = 'pending' | 'accepted' | 'rejected'

export interface AppealItem {
  id: EntityId
  action_id: EntityId
  case_id: EntityId
  appellant_uid: EntityId
  reason: string
  status: AppealStatus
  reviewer_id: EntityId
  review_reason: string
  reviewed_at: string | null
  created_at: string
}

interface AppealListParams {
  page?: number
  size?: number
  status?: AppealStatus
}

async function getAppealList(
  params: AppealListParams
): Promise<ApiResponse<{ list: AppealItem[]; page: number }>> {
  const response = await client.get('/appeal/list', { params })
  return response.data
}

export async function getAppealListPayload(
  params: AppealListParams
): Promise<{ list: AppealItem[]; page: number }> {
  return requireApiPayload(await getAppealList(params), '/appeal/list')
}

export async function reviewAppeal(
  id: EntityId,
  verdict: 'accept' | 'reject',
  reviewReason?: string
): Promise<ApiResponse<{ appeal: Record<string, unknown> }>> {
  const response = await client.post('/appeal/review', {
    id,
    verdict,
    review_reason: reviewReason,
  })
  return response.data
}
