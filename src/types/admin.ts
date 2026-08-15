import type { EntityId } from './common'

export interface Admin {
  id: EntityId
  account: string
  nickname: string
  avatar: string
  email?: string
  mobile?: string
  /** TSID 角色 ID；后端 JSON integer 经 safeParseBigIntJson 转为 string */
  role_id: EntityId | EntityId[]
  login_count: number
  last_login_ip: string
  last_login_at: string
  status: number
  created_at: string
}
