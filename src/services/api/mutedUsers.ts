import client from './client'
import { requireApiPayload } from './responseAdapter'

export interface MutedUser {
  uid: string
  mute_until: number
  remaining_seconds: number
}

export interface MutedUserListResponse {
  list: MutedUser[]
}

export function mutedUsersQueryKey() {
  return ['muted-users', 'list'] as const
}

export async function listMutedUsers(): Promise<MutedUserListResponse> {
  const res = await client.get('/admin/muted_users/list')
  return requireApiPayload<MutedUserListResponse>(res.data, 'muted_users/list')
}

export async function unmuteUser(uid: string): Promise<void> {
  const res = await client.post('/admin/muted_users/unmute', { uid })
  requireApiPayload(res.data, 'muted_users/unmute')
}
