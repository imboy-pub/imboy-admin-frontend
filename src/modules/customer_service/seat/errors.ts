/**
 * SEAT-01：Seat 域错误分类。
 *
 * 分类语义（与后端 cs_http:reply_error / elib_response:error 的码位对齐）：
 * - unauthorized (401)：凭证缺失/无效/撤销 → 调用方必须清会话回登录（A02/A04）；
 * - forbidden (403)：非成员/无 assignment/seat disabled/缺 permission/跨域游标
 *   → fail-closed，不重试（A04）；
 * - validation (400)：请求形状错误（含非法 Last-Event-ID/after_id）；
 * - QR 专属码：5201 expired / 5202 cancelled / 5203 already_used / 5204 not_scanned。
 */

export type SeatErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'invalid_response'
  /** QR 登录专属：会话过期/已使用 */
  | 'qr_expired'
  /** QR 登录专属：已被手机端取消 */
  | 'qr_cancelled'
  /** QR 登录专属：尚未扫码（cancel 等场景的过渡态） */
  | 'qr_not_scanned'

export type SeatApiErrorInit = {
  status?: number | null
  code?: number | null
  cause?: unknown
}

/** Seat 域统一错误：kind 是唯一可信分类，message 面向日志（已脱敏）。 */
export class SeatApiError extends Error {
  readonly kind: SeatErrorKind
  readonly status: number | null
  readonly code: number | null

  constructor(kind: SeatErrorKind, message: string, init: SeatApiErrorInit = {}) {
    super(message)
    this.name = 'SeatApiError'
    this.kind = kind
    this.status = init.status ?? null
    this.code = init.code ?? null
  }
}

export function isSeatApiError(value: unknown): value is SeatApiError {
  return value instanceof SeatApiError
}

/** HTTP 状态 / 业务 code → 分类（码位与后端 error_code.hrl 对齐）。 */
export function classifySeatError(status: number | null, code: number | null, msg: string): SeatApiError {
  const effective = code ?? status
  const init: SeatApiErrorInit = { status, code }
  if (effective === 400) return new SeatApiError('validation', msg, init)
  if (effective === 401) return new SeatApiError('unauthorized', msg, init)
  if (effective === 403) return new SeatApiError('forbidden', msg, init)
  if (effective === 404) return new SeatApiError('not_found', msg, init)
  if (effective === 409) return new SeatApiError('conflict', msg, init)
  if (effective === 429) return new SeatApiError('rate_limited', msg, init)
  if (effective === 5201) return new SeatApiError('qr_expired', msg, init)
  if (effective === 5202) return new SeatApiError('qr_cancelled', msg, init)
  if (effective === 5203) return new SeatApiError('qr_expired', msg, init)
  if (effective === 5204) return new SeatApiError('qr_not_scanned', msg, init)
  if (effective !== null && effective >= 500) return new SeatApiError('server', msg, init)
  if (effective !== null && effective > 0) return new SeatApiError('validation', msg, init)
  return new SeatApiError('server', msg || 'unknown seat api error', init)
}

/** fetch 抛错 / 流中断 → network（不携带任何响应体内容进 message，防泄漏）。 */
export function seatNetworkError(cause?: unknown): SeatApiError {
  return new SeatApiError('network', 'seat network error', { cause })
}

/** 响应形状非法（fail-closed：不猜测、不部分采纳）。 */
export function seatInvalidResponse(message: string): SeatApiError {
  return new SeatApiError('invalid_response', message)
}
