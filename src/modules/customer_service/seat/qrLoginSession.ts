/**
 * SEAT-01：QR 扫码登录会话流（复用既有 create/subscribe/status 合同）。
 *
 * 后端合同（qr_login_handler / qr_login_sse_handler，免登录白名单面）：
 * - POST /api/v1/passport/qr_login/create  body {device_id, device_name, platform}
 *   → payload {qr_token, session_token, expires_in(s), status:'waiting'}
 * - GET  /api/v1/passport/qr_login/subscribe?session_token=  （SSE）
 *   data 帧 = {status: waiting|scanned|confirmed|expired|cancelled, token?: JWT}；
 *   confirmed → 服务端 stop；expired → stop。
 * - GET  /api/v1/passport/qr_login/status?session_token=  （2 秒轮询 fallback）
 *   confirmed 的 token 一次性消费（取走即销毁会话）。
 * - POST /api/v1/passport/qr_login/cancel  body {qr_token}（尽力而为）。
 *
 * A02：confirmed → onConfirmed(JWT)（调用方 establishSeatSession）；
 *      expired/cancelled/401 → onEnded(...) → 调用方清会话回登录。
 * A03：session_token 是一次性 QR 会话令牌（非 JWT），仅按 status/subscribe
 *      合同进查询串（SeatApiClient allowlist 强制），日志/错误一律脱敏；
 *      它只存本类内存，dispose 即清空。
 */
import { isSeatApiError, seatInvalidResponse, SeatApiError } from './errors'
import { SEAT_API_BASE, type SeatApiClient, type SeatFetchLike } from './seatApiClient'
import { createSeatSseParser } from './seatSseProtocol'
import { SeatTokenVault } from './seatAuthStore'

/** 相对 SEAT_API_BASE（/api/v1）的 QR 登录合同路径。 */
export const QR_LOGIN_CREATE_PATH = '/passport/qr_login/create'
export const QR_LOGIN_STATUS_PATH = '/passport/qr_login/status'
export const QR_LOGIN_SUBSCRIBE_PATH = '/passport/qr_login/subscribe'
export const QR_LOGIN_CANCEL_PATH = '/passport/qr_login/cancel'

/** 计划卡：QR SSE 失败可 2 秒轮询 fallback。 */
export const QR_LOGIN_POLL_INTERVAL_MS = 2000

export type QrLoginPhase = 'creating' | 'awaiting_scan' | 'scanned' | 'confirmed' | 'ended'

export type QrLoginCreated = {
  /** 渲染二维码用的 qr_token（非凭证，后端 60s 自过期）。 */
  qrToken: string
  expiresInMs: number
}

export type QrLoginEndReason = 'expired' | 'cancelled' | 'unauthorized'

export type QrLoginCallbacks = {
  onQrCreated: (_created: QrLoginCreated) => void
  onScanned?: () => void
  /** 拿到用户 JWT（已过 JWT 形状 sanity）；调用方负责建立会话。 */
  onConfirmed: (_token: string) => void
  onEnded: (_reason: QrLoginEndReason) => void
  onError?: (_error: SeatApiError) => void
}

export type QrLoginDevice = {
  deviceId: string
  deviceName?: string
  platform?: string
}

/** 从 SSE/轮询载荷中收敛 (status, token)；形状非法返回 null（fail-closed）。 */
export function toQrStatusFrame(raw: unknown): { status: string; token: string | null } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.status !== 'string' || record.status.length === 0) return null
  const token =
    typeof record.token === 'string' && SeatTokenVault.isJwtShape(record.token) ? record.token : null
  return { status: record.status, token }
}

export class QrLoginSession {
  private readonly client: SeatApiClient
  private readonly fetchImpl: SeatFetchLike
  private readonly callbacks: QrLoginCallbacks
  private readonly pollIntervalMs: number

  private sessionToken: string | null = null
  private qrToken: string | null = null
  private phase: QrLoginPhase = 'creating'
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private subscribeController: AbortController | null = null
  private settled = false
  private scannedNotified = false

  constructor(options: {
    client: SeatApiClient
    fetchImpl?: SeatFetchLike
    pollIntervalMs?: number
    callbacks: QrLoginCallbacks
  }) {
    this.client = options.client
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
    this.pollIntervalMs = options.pollIntervalMs ?? QR_LOGIN_POLL_INTERVAL_MS
    this.callbacks = options.callbacks
  }

  getPhase(): QrLoginPhase {
    return this.phase
  }

  /** 创建二维码并开始监听（SSE 优先，失败退 2s 轮询）。 */
  async start(device: QrLoginDevice): Promise<void> {
    if (this.sessionToken !== null) return
    if (device.deviceId.length === 0) throw new SeatApiError('validation', 'qr login requires device_id')
    const payload = (await this.client.request(QR_LOGIN_CREATE_PATH, {
      method: 'POST',
      body: {
        device_id: device.deviceId,
        device_name: device.deviceName ?? 'Web Browser',
        platform: device.platform ?? 'web',
        purpose: 'seat',
      },
    })) as Record<string, unknown>
    const qrToken = typeof payload.qr_token === 'string' ? payload.qr_token : null
    const sessionToken = typeof payload.session_token === 'string' ? payload.session_token : null
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 60
    if (qrToken === null || sessionToken === null) {
      throw seatInvalidResponse('qr login create payload is invalid')
    }
    this.qrToken = qrToken
    this.sessionToken = sessionToken
    this.phase = 'awaiting_scan'
    this.callbacks.onQrCreated({ qrToken, expiresInMs: expiresIn * 1000 })
    void this.watchBySse()
  }

  /** 手机端取消 / 用户换码：尽力而为 cancel + 本地清理回登录。 */
  async cancel(): Promise<void> {
    const qrToken = this.qrToken
    this.cleanup('cancelled')
    if (qrToken === null) return
    try {
      await this.client.request(QR_LOGIN_CANCEL_PATH, { method: 'POST', body: { qr_token: qrToken } })
    } catch (error: unknown) {
      // 尽力而为：会话很快自过期，cancel 失败不影响回登录。
      if (isSeatApiError(error)) this.callbacks.onError?.(error)
    }
  }

  /** 清理全部监听与内存态（幂等）。 */
  dispose(): void {
    if (!this.settled) this.cleanup('cancelled')
    else this.teardownTimers()
  }

  private teardownTimers(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    try {
      this.subscribeController?.abort()
    } catch {
      /* 忽略 */
    }
    this.subscribeController = null
    this.sessionToken = null
    this.qrToken = null
  }

  private cleanup(endReason: QrLoginEndReason): void {
    this.teardownTimers()
    if (this.settled) return
    this.settled = true
    this.phase = 'ended'
    this.callbacks.onEnded(endReason)
  }

  private settleConfirmed(token: string): void {
    this.teardownTimers()
    if (this.settled) return
    this.settled = true
    this.phase = 'confirmed'
    this.callbacks.onConfirmed(token)
  }

  /** SSE subscribe 监听；连接失败/中断且未定型 → 退 2s 轮询。 */
  private async watchBySse(): Promise<void> {
    const sessionToken = this.sessionToken
    if (sessionToken === null || this.settled) return
    this.subscribeController = new AbortController()
    try {
      // 一次性 session_token 按 subscribe 合同进查询串（allowlist 唯二路径之一）。
      const subscribeUrl = `${SEAT_API_BASE}${QR_LOGIN_SUBSCRIBE_PATH}?session_token=${encodeURIComponent(sessionToken)}`
      const response = await this.fetchImpl(subscribeUrl, {
        headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
        credentials: 'omit',
        signal: this.subscribeController.signal,
      })
      if (!response.ok || response.body === null) {
        this.startPolling()
        return
      }
      const parser = createSeatSseParser()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done || this.settled) break
        const { events } = parser.push(decoder.decode(value, { stream: true }))
        for (const event of events) {
          if (this.consumeQrFrame(event.data)) return
        }
      }
      // 流正常结束且未 confirmed（服务端 confirmed/expired 后 stop）——
      // 若仍未定型（例如断线），退轮询兜底。
      if (!this.settled) this.startPolling()
    } catch {
      if (!this.settled) this.startPolling()
    }
  }

  /** 消费一帧 QR 状态载荷；返回 true 表示会话已定型（外层应停止读流）。 */
  private consumeQrFrame(data: string): boolean {
    let raw: unknown
    try {
      raw = JSON.parse(data) as unknown
    } catch {
      return false
    }
    const frame = toQrStatusFrame(raw)
    if (frame === null) return false
    return this.applyStatus(frame.status, frame.token)
  }

  /** 状态机收敛；返回 true = 已定型。 */
  private applyStatus(status: string, token: string | null): boolean {
    switch (status) {
      case 'waiting':
        return false
      case 'scanned':
        this.phase = 'scanned'
        if (!this.scannedNotified) {
          this.scannedNotified = true
          this.callbacks.onScanned?.()
        }
        return false
      case 'confirmed':
        if (token === null) {
          // confirmed 但 token 缺失/形状非法 → fail-closed 回登录。
          this.cleanup('expired')
          return true
        }
        this.settleConfirmed(token)
        return true
      case 'expired':
        this.cleanup('expired')
        return true
      case 'cancelled':
        this.cleanup('cancelled')
        return true
      default:
        return false
    }
  }

  /** 2s 轮询 fallback（计划卡合同）。 */
  private startPolling(): void {
    if (this.settled || this.pollTimer !== null) return
    const tick = (): void => {
      if (this.settled) return
      void this.pollOnce()
    }
    this.pollTimer = setTimeout(tick, this.pollIntervalMs)
  }

  private async pollOnce(): Promise<void> {
    const sessionToken = this.sessionToken
    if (sessionToken === null || this.settled) return
    const next = await this.pollAttempt(sessionToken)
    if (next && !this.settled) this.pollTimer = setTimeout(() => void this.pollOnce(), this.pollIntervalMs)
  }

  /** 单次轮询尝试；返回 true = 会话未定型，继续下一轮。 */
  private async pollAttempt(sessionToken: string): Promise<boolean> {
    try {
      const payload = (await this.client.request(QR_LOGIN_STATUS_PATH, {
        query: { session_token: sessionToken },
      })) as Record<string, unknown>
      const frame = toQrStatusFrame(payload)
      if (frame === null) throw seatInvalidResponse('qr login status payload is invalid')
      return !this.applyStatus(frame.status, frame.token)
    } catch (error: unknown) {
      return this.handlePollError(error)
    }
  }

  private handlePollError(error: unknown): boolean {
    if (!isSeatApiError(error)) {
      this.callbacks.onError?.(new SeatApiError('network', 'qr login poll failed'))
      return true // 网络层异常：停止轮询并回登录（保守）
    }
    switch (error.kind) {
      case 'qr_expired':
      case 'not_found':
        // 404「会话不存在或已过期」/ 5201/5203 → 过期回登录。
        this.cleanup('expired')
        return false
      case 'qr_cancelled':
        this.cleanup('cancelled')
        return false
      case 'unauthorized':
        this.cleanup('unauthorized')
        return false
      case 'qr_not_scanned':
        // cancel 撞上 waiting 的过渡态：继续等待。
        return true
      case 'server':
      case 'network':
      case 'rate_limited':
        // 瞬时错误：继续轮询（退避由固定 2s 节奏承担）。
        this.callbacks.onError?.(error)
        return true
      default:
        this.callbacks.onError?.(error)
        this.cleanup('expired')
        return false
    }
  }
}
