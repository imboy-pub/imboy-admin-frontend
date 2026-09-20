/**
 * SEAT-01：Seat 域独立 fetch API client（绝不复用 Admin axios client/store）。
 *
 * A01 认证域隔离（客户端侧硬约束）：
 * - 只允许 `/api/v1/cs/*` 与 QR 登录合同路径（`/api/v1/passport/qr_login/*`）；
 *   任何 `/api/adm` 或其他路径在发请求前直接抛错（物理不落线）；
 * - `credentials: 'omit'`：绝不携带 Admin Cookie；Seat 凭证只走
 *   `Authorization: Bearer`（QR create/status/subscribe/cancel 是免登录合同面，
 *   不附 JWT）。
 *
 * A03 token 卫生：
 * - JWT 只进 Authorization 头，永不进 URL；一次性 QR session_token 仅允许
 *   按 status/subscribe 合同进入查询串（路径 allowlist 强制），日志/错误消息
 *   一律经 redactSeatUrl 脱敏。
 *
 * TSID（A05）：响应一律经 parseSeatJson 精度保护解析。
 */
import { classifySeatError, seatInvalidResponse, seatNetworkError, SeatApiError } from './errors'
import { isRecord, nonEmptyString, parseSeatJson } from './tsid'

export const SEAT_API_BASE = '/api/v1'

/** Seat 域允许的路径前缀：客服坐席面 + QR 登录免登录合同面。
 * SEAT-02 增补 `/api/v1/enterprise/conversations/`：坐席消息历史/发送合同路径族
 * （cs_actions conversation_messages：auth_context=cs_seat + conversation.read，
 * 与访客/治理面无关）；仍走同前缀精确 allowlist，`/api/adm` 等一律拒绝（A01 不变）。 */
const SEAT_PATH_PREFIXES = ['/api/v1/cs/', '/api/v1/passport/qr_login/', '/api/v1/enterprise/conversations/'] as const

/** 一次性 QR session_token 唯一允许进查询串的合同路径（status/subscribe）。 */
export const QR_SESSION_TOKEN_QUERY_PATHS = [
  '/api/v1/passport/qr_login/status',
  '/api/v1/passport/qr_login/subscribe',
] as const

const TOKEN_LIKE_QUERY_KEYS = [
  'session_token',
  'token',
  'access_token',
  'refresh_token',
  'visit_token',
  'jwt',
] as const

export type SeatFetchLike = (_input: string, _init?: RequestInit) => Promise<Response>

/**
 * 日志/错误消息脱敏：把查询串中的 token 类键值替换为 `***`。
 * 键名保留（排障需要），值永不出现。
 */
export function redactSeatUrl(url: string): string {
  return url.replace(/((?:^|[?&])(?:session_token|token|access_token|refresh_token|visit_token|jwt)=)[^&]*/gi, '$1***')
}

function assertRelativeApexPath(path: string): void {
  if (!path.startsWith('/')) {
    throw new SeatApiError('validation', 'seat api path must be relative to same origin')
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new SeatApiError('validation', 'seat api path must not be an absolute URL')
  }
}

/**
 * A01 域隔离门：路径必须落在 Seat 域前缀内；`/api/adm` 等一律拒绝。
 * 独立导出以便测试与 SeatAuthGuard 复用。
 */
export function assertSeatApiPath(path: string): void {
  assertRelativeApexPath(path)
  const allowed = SEAT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
  if (!allowed) {
    throw new SeatApiError('validation', `seat api path outside seat domain: ${redactSeatUrl(path)}`)
  }
}

/**
 * A03 查询串凭证门：token 类键只允许 session_token 出现在 QR
 * status/subscribe 合同路径上；其余一律抛错（不发请求）。
 */
export function assertSeatQueryContract(path: string, query: Record<string, string>): void {
  for (const key of Object.keys(query)) {
    if (!(TOKEN_LIKE_QUERY_KEYS as readonly string[]).includes(key)) continue
    const allowlisted =
      key === 'session_token' && (QR_SESSION_TOKEN_QUERY_PATHS as readonly string[]).includes(path)
    if (!allowlisted) {
      throw new SeatApiError('validation', `credential-like query key is not allowed: ${key}`)
    }
  }
}

export type SeatRequestOptions = {
  method?: 'GET' | 'POST'
  /** 值会被 encodeURIComponent；凭证键受 assertSeatQueryContract 管制。 */
  query?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

/**
 * 平台响应信封 {code, msg, payload}（elib_response 约定）：
 * code===0 成功；非 0 按码位分类（HTTP 状态作 fallback）。
 */

function buildQuery(path: string, query: Record<string, string> | undefined): string {
  if (!query) return path
  const parts = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path
}

function unwrapEnvelope(raw: unknown, httpStatus: number): unknown {
  if (!isRecord(raw)) throw seatInvalidResponse('seat response is not a JSON object')
  if (raw.code === 0) {
    // 载荷允许对象或数组（elib_response:success/2 → map() | list()；列表端点
    // 如消息历史是裸数组载荷）。缺失/标量仍然 fail-closed。
    if (!isRecord(raw.payload) && !Array.isArray(raw.payload)) {
      throw seatInvalidResponse('seat response payload is missing or malformed')
    }
    return raw.payload
  }
  const code = typeof raw.code === 'number' ? raw.code : httpStatus
  const msg = nonEmptyString(raw.msg) ? raw.msg : `seat api error ${code}`
  throw classifySeatError(httpStatus, code, msg)
}

export class SeatApiClient {
  private readonly baseUrl: string
  private readonly getToken: () => string | null
  private readonly fetchImpl: SeatFetchLike

  constructor(options: { baseUrl?: string; getToken?: () => string | null; fetchImpl?: SeatFetchLike } = {}) {
    this.baseUrl = options.baseUrl ?? SEAT_API_BASE
    this.getToken = options.getToken ?? (() => null)
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  /**
   * 发起 Seat 域 JSON 请求并返回信封 payload（已做 TSID 精度保护）。
   * path 是相对 baseUrl 的路径（如 '/cs/me/seat-contexts'）；域隔离与
   * 查询串凭证 allowlist 都按拼接后的完整路径校验。
   * 抛 SeatApiError（分类见 errors.ts）。
   */
  async request<T = Record<string, unknown>>(path: string, options: SeatRequestOptions = {}): Promise<T> {
    const full = this.baseUrl + path
    assertSeatApiPath(full)
    assertSeatQueryContract(full, options.query ?? {})
    const url = buildQuery(full, options.query)
    const headers: Record<string, string> = { Accept: 'application/json' }
    const token = this.getToken()
    if (token !== null) headers.Authorization = `Bearer ${token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        // A01：Seat 域绝不携带（Admin）Cookie，也不接受 cookie 写入。
        credentials: 'omit',
        signal: options.signal,
      })
    } catch (error: unknown) {
      if (error instanceof SeatApiError) throw error
      throw seatNetworkError(error)
    }

    let raw: unknown
    try {
      raw = parseSeatJson(await response.text())
    } catch (error: unknown) {
      if (error instanceof SeatApiError) throw error
      if (!response.ok) throw classifySeatError(response.status, null, `seat http error ${response.status}`)
      throw seatInvalidResponse('seat response is not valid JSON')
    }
    const payload = unwrapEnvelope(raw, response.status)
    return payload as T
  }
}
