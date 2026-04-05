import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { ApiResponse, ApiError } from '@/types/api'
import { startTopLoading, finishTopLoading } from '@/components/shared/TopLoadingBar'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/adm'
export const AUTH_EXPIRED_EVENT = 'imboy:auth-expired'
export const SKIP_AUTH_EXPIRED_EVENT_FLAG = 'skipAuthExpiredEvent'

export function emitAuthExpired() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
}

export function handleUnauthorizedStatus(status?: number) {
  if (status === 401) {
    emitAuthExpired()
    return true
  }
  return false
}

export function toApiError(error: Pick<AxiosError<ApiResponse>, 'response' | 'message'>): ApiError {
  return {
    code: error.response?.data?.code || error.response?.status || -1,
    msg: error.response?.data?.msg || error.message || '网络错误',
  }
}

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// 请求拦截器
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    startTopLoading()
    return config
  },
  (error: AxiosError) => {
    finishTopLoading()
    return Promise.reject(error)
  }
)

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    finishTopLoading()
    // 登录页等接口会返回 HTML，不做 API 包装校验
    if (typeof response.data === 'string') {
      return response
    }

    const data = response.data as ApiResponse

    if (data.code !== 0) {
      const error: ApiError = {
        code: data.code,
        msg: data.msg || '请求失败',
      }
      return Promise.reject(error)
    }
    return response
  },
  (error: AxiosError<ApiResponse>) => {
    finishTopLoading()
    const requestConfig = error.config as (InternalAxiosRequestConfig & {
      [SKIP_AUTH_EXPIRED_EVENT_FLAG]?: boolean
    }) | undefined
    const skipAuthExpiredEvent = Boolean(requestConfig?.[SKIP_AUTH_EXPIRED_EVENT_FLAG])

    // 通过事件通知路由守卫处理会话失效，避免网络层直接耦合页面跳转
    if (!skipAuthExpiredEvent) {
      handleUnauthorizedStatus(error.response?.status)
    }

    const apiError: ApiError = toApiError(error)
    return Promise.reject(apiError)
  }
)

export default client

// 通用请求方法
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await client.get<ApiResponse<T>>(url, { params })
  return response.data
}

export async function apiPost<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await client.post<ApiResponse<T>>(url, data)
  return response.data
}

export async function apiPut<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await client.put<ApiResponse<T>>(url, data)
  return response.data
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  const response = await client.delete<ApiResponse<T>>(url)
  return response.data
}
