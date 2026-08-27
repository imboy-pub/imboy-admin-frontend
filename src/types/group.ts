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
  /** 归属维度（双体验 v2.5.2）：personal 个人群 | workspace 工作区群 */
  scope?: 'personal' | 'workspace'
  /** 所属工作区 ID（scope=personal 时为 null） */
  workspace_id?: EntityId | null
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
