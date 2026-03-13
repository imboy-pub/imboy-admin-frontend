export interface Group {
  id: string
  title: string
  avatar?: string
  introduction?: string
  owner_uid: string
  creator_uid?: string
  member_count: number
  member_max?: number
  type: number
  join_limit?: number
  status: number
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  nickname: string
  avatar?: string
  role: number
  status: number
  joined_at: string
}
