import type { EntityId } from './common'

export interface LogoutApplication {
  uid: EntityId
  account: string
  nickname: string
  user_status: number // 1=正常, 2=申请注销中, -1=已删除
  app_vsn: string
  did: string
  dtype: string
  ip: string
  created_at: string
  body: string
}

export interface LogoutApplicationListParams {
  page?: number
  size?: number
  uid?: EntityId
  keyword?: string
  from_ts?: string
  to_ts?: string
}
