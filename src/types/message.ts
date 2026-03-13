export type MessageScope = 'c2c' | 'c2g' | 'c2s' | 's2c'

type IdLike = string | number

export interface ManagedMessage {
  scope: MessageScope
  msg_id: string
  from_id: IdLike
  to_id: IdLike
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
  uid?: IdLike
  conversation?: string
  from_ts?: string
  to_ts?: string
  keyword?: string
}
