import client from './client'
import { requireApiPayload } from './responseAdapter'

export interface PushToken {
  user_id: string
  device_id: string
  device_type: string
  platform: string
  token: string
  created_at: string
  updated_at: string
}

export interface PushTokenListResponse {
  list: PushToken[]
  total: number
  page: number
  size: number
}

export function pushTokenQueryKey(page: number, size: number) {
  return ['push-token', 'list', page, size] as const
}

export async function listPushTokens(page: number, size: number): Promise<PushTokenListResponse> {
  const res = await client.get('/admin/push_token/list', { params: { page, size } })
  return requireApiPayload<PushTokenListResponse>(res.data, 'push_token/list')
}
