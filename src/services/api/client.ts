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

/** HTTP 状态码 → 用户友好提示 */
function httpStatusMessage(status?: number): string {
  switch (status) {
    case 403: return '您无权访问此资源'
    case 404: return '请求的资源不存在'
    case 422: return '请求数据验证失败'
    case 429: return '请求过于频繁，请稍后重试'
    default:
      if (status && status >= 500) return '服务器错误，请稍后重试'
      return '网络错误'
  }
}

export function toApiError(error: Pick<AxiosError<ApiResponse>, 'response' | 'message'>): ApiError {
  return {
    code: error.response?.data?.code || error.response?.status || -1,
    msg: error.response?.data?.msg || httpStatusMessage(error.response?.status) || error.message || '网络错误',
  }
}

/**
 * TSID 安全防护: 将 JSON 文本中超出 Number.MAX_SAFE_INTEGER 的纯整数转为字符串。
 *
 * 后端 TSID 为 64 位 BIGINT (最大 19 位十进制)，如果后端偶尔以 JSON number
 * 而非 string 形式返回，标准 JSON.parse 会丢失精度。此函数在解析前将这类
 * 大数字加上引号，确保前端始终以 string 接收。
 *
 * 匹配规则: 独立的 16 位及以上纯数字 (不匹配小数、科学计数法、已在引号内的字符串)。
 */
function safeParseBigIntJson(text: string): unknown {
  // 仅处理看起来像 JSON 的文本
  const trimmed = text.trim()
  if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return JSON.parse(text)
  }

  // 将 16 位及以上的整数字面量包裹成字符串
  // 负向前瞻/后顾确保不匹配已在引号内的值或小数
  const safeText = trimmed.replace(
    /(?<=[:,\[\s])(-?\d{16,})(?=[,\]\}\s])/g,
    '"$1"'
  )

  return JSON.parse(safeText)
}

// CSRF 防护说明:
// - 登录请求通过 csrf_token 参数保护 (见 modules/identity/api/auth.ts)
// - 登录后的 API 请求依赖 Cookie session + 后端 SameSite 策略
// - 如需增强: 可在请求拦截器中为 POST/PUT/DELETE 添加 X-CSRF-Token header
const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  // 覆盖默认 JSON 解析，防止大整数 (TSID) 精度丢失
  transformResponse: [
    (data: unknown) => {
      if (typeof data !== 'string') return data
      try {
        return safeParseBigIntJson(data)
      } catch {
        // 非 JSON 响应 (如 HTML)，原样返回
        return data
      }
    },
  ],
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
