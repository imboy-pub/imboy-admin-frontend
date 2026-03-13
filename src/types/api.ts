// API 响应类型
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  payload?: T
  sv_ts?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  size: number
  total: number
  total_pages: number
}

export interface ApiError {
  code: number
  msg: string
}
