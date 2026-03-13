export interface User {
  id: string
  account: string
  nickname: string
  avatar?: string
  mobile?: string
  email?: string
  gender?: number
  status: number
  region?: string
  sign?: string
  experience?: number
  created_at: string
  updated_at?: string
}

export interface UserDevice {
  id: string
  user_id: string
  device_id: string
  device_name: string
  device_type: string
  last_active_at: string
  status: number
}
