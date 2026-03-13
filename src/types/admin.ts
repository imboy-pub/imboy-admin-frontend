export interface Admin {
  id: string
  account: string
  nickname: string
  avatar: string
  email?: string
  mobile?: string
  role_id: number
  login_count: number
  last_login_ip: string
  last_login_at: string
  status: number
  created_at: string
}

export interface Role {
  id: number
  name: string
  description?: string
  permissions: string[]
  status: number
  created_at: string
}
