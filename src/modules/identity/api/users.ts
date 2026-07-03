import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { User } from '@/types/user'
import type { EntityId } from '@/types/common'

export interface UserListParams {
  page?: number
  size?: number
  status?: number
  keyword?: string
}

/**
 * @deprecated Prefer `getUserListPayload` to consume typed payload directly.
 */
export async function getUserList(params: UserListParams): Promise<ApiResponse<PaginatedResponse<User>>> {
  const response = await client.get('/user/list', { params })
  return response.data
}

export async function getUserListPayload(params: UserListParams): Promise<PaginatedResponse<User>> {
  return requireApiPayload(await getUserList(params), '/user/list')
}

export type UserDetail = User & {
  device_count: number
  friend_count: number
  group_count: number
}

/**
 * @deprecated Prefer `getUserDetailPayload` to consume typed payload directly.
 */
export async function getUserDetail(uid: EntityId): Promise<ApiResponse<UserDetail>> {
  const response = await client.get('/user/detail', { params: { user_id: uid } })
  return response.data
}

export async function getUserDetailPayload(uid: EntityId): Promise<UserDetail> {
  return requireApiPayload(await getUserDetail(uid), '/user/detail')
}

export async function banUser(uid: EntityId, reason?: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/ban', { user_id: uid, ...(reason ? { reason } : {}) })
  return response.data
}

export async function unbanUser(uid: EntityId): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/unban', { user_id: uid })
  return response.data
}

/**
 * @deprecated Prefer `searchUsersPayload` to consume typed payload directly.
 */
export async function searchUsers(
  keyword: string,
  page = 1,
  size = DEFAULT_PAGE_SIZE
): Promise<ApiResponse<PaginatedResponse<User>>> {
  const response = await client.get('/user/search', { params: { keyword, page, size } })
  return response.data
}

export async function searchUsersPayload(keyword: string, page = 1, size = DEFAULT_PAGE_SIZE): Promise<PaginatedResponse<User>> {
  return requireApiPayload(await searchUsers(keyword, page, size), '/user/search')
}
