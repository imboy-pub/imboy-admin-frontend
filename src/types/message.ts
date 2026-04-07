import type { EntityId } from './common'

export type MessageScope = 'c2c' | 'c2g' | 'c2s' | 's2c'

export interface ManagedMessage {
  scope: MessageScope
  msg_id: string
  from_id: EntityId
  to_id: EntityId
  msg_type: string
  action: string
  payload: string
  created_at: string
  server_ts: string
}

export interface MessageListParams {
  page?: number
  size?: number
  msg_scope?: MessageScope | 'all'
  uid?: EntityId
  conversation?: string
  from_ts?: string
  to_ts?: string
  keyword?: string
}
