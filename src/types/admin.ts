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
