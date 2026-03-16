// Compatibility API location kept during module migration.
// New admin callers should prefer '@/modules/identity/api'.
import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { User } from '@/types/user'
import { requireApiPayload } from './responseAdapter'

type IdLike = string | number

export interface UserListParams {
  page?: number
  size?: number
  status?: number
  keyword?: string
}

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

export interface UserCollectListParams {
  uid: IdLike
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
export async function getUserDetail(uid: IdLike): Promise<ApiResponse<UserDetail>> {
  const response = await client.get('/user/detail', { params: { uid } })
  return response.data
}

export async function getUserDetailPayload(uid: IdLike): Promise<UserDetail> {
  return requireApiPayload(await getUserDetail(uid), '/user/detail')
}

export async function banUser(uid: IdLike): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/ban', { uid })
  return response.data
}

export async function unbanUser(uid: IdLike): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/unban', { uid })
  return response.data
}

/**
 * @deprecated Prefer `searchUsersPayload` to consume typed payload directly.
 */
export async function searchUsers(keyword: string, page = 1, size = 20): Promise<ApiResponse<PaginatedResponse<User>>> {
  const response = await client.get('/user/search', { params: { keyword, page, size } })
  return response.data
}

export async function searchUsersPayload(keyword: string, page = 1, size = 20): Promise<PaginatedResponse<User>> {
  return requireApiPayload(await searchUsers(keyword, page, size), '/user/search')
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

export async function deleteUserTag(data: { uid: IdLike; scene: 'collect' | 'friend'; tag: string }): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/tag/delete', data)
  return response.data
}

/**
 * @deprecated Prefer `getUserCollectListPayload` to consume typed payload directly.
 */
export async function getUserCollectList(params: UserCollectListParams): Promise<ApiResponse<PaginatedResponse<UserCollectItem>>> {
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

export async function removeUserCollect(data: { uid: IdLike; kind_id: string }): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/collect/remove', data)
  return response.data
}
