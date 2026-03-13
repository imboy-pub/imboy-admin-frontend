import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { Group, GroupMember } from '@/types/group'
import { requireApiPayload } from './responseAdapter'

type IdLike = string | number

export interface GroupListParams {
  page?: number
  size?: number
  status?: number
  type?: number
  keyword?: string
}

/**
 * @deprecated Prefer `getGroupListPayload` to consume typed payload directly.
 */
export async function getGroupList(params: GroupListParams): Promise<ApiResponse<PaginatedResponse<Group>>> {
  const response = await client.get('/group/list', { params })
  return response.data
}

export async function getGroupListPayload(params: GroupListParams): Promise<PaginatedResponse<Group>> {
  return requireApiPayload(await getGroupList(params), '/group/list')
}

export type GroupDetail = Group & {
  owner: { id: string; nickname: string; avatar: string }
}

/**
 * @deprecated Prefer `getGroupDetailPayload` to consume typed payload directly.
 */
export async function getGroupDetail(gid: IdLike): Promise<ApiResponse<GroupDetail>> {
  const response = await client.get('/group/detail', { params: { gid } })
  return response.data
}

export async function getGroupDetailPayload(gid: IdLike): Promise<GroupDetail> {
  return requireApiPayload(await getGroupDetail(gid), '/group/detail')
}

export async function dissolveGroup(gid: IdLike): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/dissolve', { gid })
  return response.data
}

/**
 * @deprecated Prefer `searchGroupsPayload` to consume typed payload directly.
 */
export async function searchGroups(keyword: string, page = 1, size = 20): Promise<ApiResponse<PaginatedResponse<Group>>> {
  const response = await client.get('/group/search', { params: { keyword, page, size } })
  return response.data
}

export async function searchGroupsPayload(keyword: string, page = 1, size = 20): Promise<PaginatedResponse<Group>> {
  return requireApiPayload(await searchGroups(keyword, page, size), '/group/search')
}

/**
 * @deprecated Prefer `getGroupMembersPayload` to consume typed payload directly.
 */
export async function getGroupMembers(gid: IdLike, page = 1, size = 20): Promise<ApiResponse<PaginatedResponse<GroupMember>>> {
  const response = await client.get('/group/members', { params: { gid, page, size } })
  return response.data
}

export async function getGroupMembersPayload(gid: IdLike, page = 1, size = 20): Promise<PaginatedResponse<GroupMember>> {
  return requireApiPayload(await getGroupMembers(gid, page, size), '/group/members')
}
