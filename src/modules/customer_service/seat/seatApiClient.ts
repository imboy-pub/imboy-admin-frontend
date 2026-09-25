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
 * SEAT-02 增补 `/api/v1/enterprise/conversations/`：坐席消息历史合同路径族
 * （cs_actions conversation_messages GET：auth_context=cs_seat + conversation.read，
 * 与访客/治理面无关）；
 * DF-9 增补 `/api/v1/enterprise/organizations/`：坐席发送消息的企业真源写路径族
 * （POST /enterprise/organizations/:org/conversations/:id/messages，
 * eb_tenant_handler conversation_messages；职能白名单 sales|customer_service）。
 * 均走前缀精确 allowlist，`/api/adm` 等一律拒绝（A01 不变）。 */
const SEAT_PATH_PREFIXES = [
  '/api/v1/cs/',
  '/api/v1/passport/qr_login/',
  '/api/v1/enterprise/conversations/',
  '/api/v1/enterprise/organizations/',
] as const

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
  method?: 'GET' | 'POST' | 'PUT'
  /** 值会被 encodeURIComponent；凭证键受 assertSeatQueryContract 管制。 */
  query?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

/** CS-WEB-01：二进制内容请求（附件 content 端点；成功是原始字节流）。 */
export type SeatBlobRequestOptions = {
  signal?: AbortSignal
}

/** CS-WEB-02：裸 PUT 上传选项（presign 下发的 upload.url；目标由服务端权威签发）。 */
export type SeatUploadPutOptions = {
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

  /**
   * CS-WEB-01：Seat 域二进制内容请求（附件 content 端点；成功响应是原始
   * 字节流，不是 {code,msg,payload} 信封）。
   * - 与 request 同一域门/凭证卫生：Bearer 只进 Authorization 头、
   *   credentials: 'omit'（A01/A03 不变）、路径必须落 Seat 域 allowlist；
   * - 非 2xx：优先读 JSON 信封 code（有则按码位分类），否则按 HTTP 状态；
   * - 错误 message 不含 URL/响应体（token/对象引用不进日志）。
   * 调用方负责 ObjectURL 生命周期（预览/下载后 revoke）。
   */
  async requestBlob(path: string, options: SeatBlobRequestOptions = {}): Promise<Blob> {
    const full = this.baseUrl + path
    assertSeatApiPath(full)
    const headers: Record<string, string> = { Accept: 'application/octet-stream, */*' }
    const token = this.getToken()
    if (token !== null) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      response = await this.fetchImpl(full, {
        method: 'GET',
        headers,
        // A01：Seat 域绝不携带（Admin）Cookie，也不接受 cookie 写入。
        credentials: 'omit',
        signal: options.signal,
      })
    } catch (error: unknown) {
      if (error instanceof SeatApiError) throw error
      throw seatNetworkError(error)
    }

    if (!response.ok) {
      throw classifySeatError(response.status, await readEnvelopeCode(response), `seat content http error ${response.status}`)
    }
    try {
      return await response.blob()
    } catch (error: unknown) {
      if (error instanceof SeatApiError) throw error
      throw seatNetworkError(error)
    }
  }

  /**
   * CS-WEB-02：裸 PUT 上传通道（presign 响应 `upload.url` 的专用出口）。
   * 与 JSON/内容通道的三点差异（widget uploader 同款纪律）：
   * - URL 是服务端 presign 权威下发的上传目标，**不经 Seat 域路径门**
   *   （可能同源相对路径或 http(s) 绝对地址）；协议白名单 http/https + 相对
   *   路径，其余（javascript:/data:…）发请求前直接抛错；
   * - 只带 Content-Type: application/octet-stream，**不带 Authorization、
   *   credentials: 'omit'**（目标凭证由 URL 自带，JWT/cookie 绝不出Seat域）；
   * - 非 2xx：优先读 JSON 信封 code（有则按码位分类），否则按 HTTP 状态；
   *   错误 message 不含 URL/响应体（upload 引用不进日志）。
   */
  async putUploadObject(url: string, blob: Blob, options: SeatUploadPutOptions = {}): Promise<void> {
    assertUploadTargetUrl(url)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'application/octet-stream' },
        // A01：裸 PUT 绝不携带（Admin）Cookie 或 Seat JWT。
        credentials: 'omit',
        signal: options.signal,
      })
    } catch (error: unknown) {
      if (error instanceof SeatApiError) throw error
      throw seatNetworkError(error)
    }
    if (!response.ok) {
      throw classifySeatError(response.status, await readEnvelopeCode(response), `seat upload http error ${response.status}`)
    }
  }
}

/** 裸 PUT 目标协议门：http(s) 绝对 URL 或同源相对路径；其余一律拒绝（不发请求）。 */
function assertUploadTargetUrl(url: string): void {
  if (url.startsWith('/')) {
    if (url.startsWith('//')) {
      throw new SeatApiError('validation', 'seat upload target must not be protocol-relative')
    }
    return
  }
  if (/^https?:\/\//i.test(url)) return
  throw new SeatApiError('validation', 'seat upload target must be an http(s) URL or a relative path')
}

/** 错误体若携带 {code} 信封则提取码位（解析失败/非对象 → null，不猜）。 */
async function readEnvelopeCode(response: Response): Promise<number | null> {
  try {
    const raw = parseSeatJson(await response.text())
    return isRecord(raw) && typeof raw.code === 'number' ? raw.code : null
  } catch {
    return null
  }
}
