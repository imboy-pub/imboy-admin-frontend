import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'

export interface MutedUser {
  uid: EntityId
  user_id?: EntityId
  mute_until: number
  remaining_seconds: number
}

export interface MutedUserListParams {
  page?: number
  size?: number
}

export interface MutedUserListResponse {
  list: MutedUser[]
  total: number
  page: number
  size: number
}

export function mutedUsersQueryKey(params?: MutedUserListParams) {
  return ['muted-users', 'list', params ?? {}] as const
}

export async function listMutedUsers(
  params: MutedUserListParams = { page: 1, size: 50 }
): Promise<MutedUserListResponse> {
  const res = await client.get('/admin/muted_users/list', { params })
  const payload = requireApiPayload<Partial<MutedUserListResponse>>(res.data, 'muted_users/list')
  return {
    list: payload.list ?? [],
    total: payload.total ?? (payload.list?.length ?? 0),
    page: payload.page ?? params.page ?? 1,
    size: payload.size ?? params.size ?? 50,
  }
}

export async function unmuteUser(uid: EntityId): Promise<void> {
  const res = await client.post('/admin/muted_users/unmute', { uid })
  requireApiPayload(res.data, 'muted_users/unmute')
}

export async function unmuteUsers(uids: EntityId[]): Promise<void> {
  const res = await client.post('/admin/muted_users/unmute_batch', { uids })
  requireApiPayload(res.data, 'muted_users/unmute_batch')
}
