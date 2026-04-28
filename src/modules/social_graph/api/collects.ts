import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export interface UserCollectListParams {
  uid: EntityId
  page?: number
  size?: number
  kind?: number
  keyword?: string
  tag?: string
  order?: 'recent_use'
}

export interface UserCollectItem {
  kind: number
  kind_id: string
  source: string
  tag?: string
  info?: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * @deprecated Prefer `getUserCollectListPayload` to consume typed payload directly.
 */
export async function getUserCollectList(
  params: UserCollectListParams
): Promise<ApiResponse<PaginatedResponse<UserCollectItem>>> {
  const { uid, page = 1, size = 10, kind = 0, keyword, tag, order } = params
  const response = await client.get('/user/collect/list', {
    params: {
      uid,
      page,
      size,
      kind,
      keyword,
      tag,
      order,
    },
  })
  return response.data
}

export async function getUserCollectListPayload(params: UserCollectListParams): Promise<PaginatedResponse<UserCollectItem>> {
  return requireApiPayload(await getUserCollectList(params), '/user/collect/list')
}

export async function removeUserCollect(
  data: { uid: EntityId; kind_id: string }
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/collect/remove', data)
  return response.data
}
