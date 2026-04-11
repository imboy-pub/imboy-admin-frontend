import type { EntityId } from './common'

export interface Group {
  id: EntityId
  title: string
  avatar?: string
  introduction?: string
  owner_uid: EntityId
  creator_uid?: EntityId
  member_count: number
  member_max?: number
  type: number
  join_limit?: number
  status: number
  created_at: string
}

export interface GroupMember {
  id: EntityId
  group_id: EntityId
  user_id: EntityId
  nickname: string
  avatar?: string
  role: number
  status: number
  joined_at: string
}
