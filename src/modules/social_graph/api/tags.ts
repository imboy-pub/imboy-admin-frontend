import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'

type IdLike = string | number

export interface UserTagListParams {
  uid: IdLike
  scene: 'collect' | 'friend'
  page?: number
  size?: number
  keyword?: string
}

export interface UserTagItem {
  id: number
  creator_user_id: number
  scene: number
  name: string
  subtitle?: string
  created_at: string
  updated_at: string
}

/**
 * @deprecated Prefer `getUserTagListPayload` to consume typed payload directly.
 */
export async function getUserTagList(params: UserTagListParams): Promise<ApiResponse<PaginatedResponse<UserTagItem>>> {
  const { uid, scene, page = 1, size = 10, keyword } = params
  const response = await client.get('/user/tag/list', {
    params: {
      uid,
      scene,
      page,
      size,
      keyword,
    },
  })
  return response.data
}

export async function getUserTagListPayload(params: UserTagListParams): Promise<PaginatedResponse<UserTagItem>> {
  return requireApiPayload(await getUserTagList(params), '/user/tag/list')
}

export async function deleteUserTag(
  data: { uid: IdLike; scene: 'collect' | 'friend'; tag: string }
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/tag/delete', data)
  return response.data
}
