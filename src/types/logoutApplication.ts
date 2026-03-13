type IdLike = string | number

export interface LogoutApplication {
  uid: IdLike
  account: string
  nickname: string
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
  uid?: IdLike
  keyword?: string
  from_ts?: string
  to_ts?: string
}
