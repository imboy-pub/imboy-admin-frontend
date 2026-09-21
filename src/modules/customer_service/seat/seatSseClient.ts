/**
 * SEAT-01：§3.6 坐席事件流 client（fetch streaming，Bearer JWT）。
 *
 * 为什么不用 EventSource：合同要求 `Authorization: Bearer` 头 + `Last-Event-ID`
 * 补偿头，EventSource 无法自定义请求头 → fetch + ReadableStream。
 *
 * 端点（BE-S01b）：GET /api/v1/cs/organizations/:org_id/seats/me/events?workspace_id=<TSID>
 * - `Last-Event-ID` 存在时优先于 `after_id`（合同）；本实现只在有游标时发头，
 *   无游标且调用方给 initialAfterId 时才落 after_id 查询参数；
 * - 响应头 `X-CS-Event-Retention-Seconds`（V1 默认 86400）经 onRetention 上报；
 * - 首帧 `retry: 2000` 作为服务端建议重连节奏；
 * - resync.required：清空去重器与游标 → onResync() 触发权威全量刷新
 *   （合成帧的 event_id 是续传水位，不作为客户端游标——合同明说清空游标）；
 * - 401/403 fail-closed：停流 + onEnded，绝不重试风暴（A04）；
 * - 事件经 event_id 去重后只触发 onEnvelope（调用方做权威刷新，payload 不是
 *   业务真源）；重复事件仍推进游标，避免断线重连重复补发。
 */
import type { SeatFetchLike } from './seatApiClient'
import {
  createSeatSseParser,
  parseSeatSseEnvelope,
  SeatSseEventIdDeduper,
  type SeatSseEnvelope,
} from './seatSseProtocol'

export const SEAT_EVENTS_PATH_TEMPLATE = '/api/v1/cs/organizations/:org_id/seats/me/events'

export type SeatEventStreamStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline' | 'closed'

export type SeatEventStreamEndReason = 'unauthorized' | 'forbidden'

export type SeatEventStreamOptions = {
  baseUrl?: string
  getToken: () => string | null
  fetchImpl?: SeatFetchLike
  /** 去重后的事件信封；调用方只据此触发权威刷新（列表/detail/messages）。 */
  onEnvelope: (_envelope: SeatSseEnvelope) => void
  /** resync.required → 游标已清空，调用方必须全量权威刷新。 */
  onResync: () => void
  onStatus?: (_status: SeatEventStreamStatus) => void
  /** 401/403 → 停流并通知（调用方清会话/降级）。 */
  onEnded?: (_reason: SeatEventStreamEndReason) => void
  /** 服务端 retention 窗口（X-CS-Event-Retention-Seconds，秒）。 */
  onRetention?: (_seconds: number) => void
  backoffBaseMs?: number
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 15000
const OFFLINE_AFTER_FAILURES = 3

function isTsidString(value: string): boolean {
  return /^\d+$/.test(value)
}

export class SeatEventStream {
  private readonly baseUrl: string
  private readonly getToken: () => string | null
  private readonly fetchImpl: SeatFetchLike
  private readonly onEnvelope: (_envelope: SeatSseEnvelope) => void
  private readonly onResync: () => void
  private readonly onStatus: (_status: SeatEventStreamStatus) => void
  private readonly onEnded: (_reason: SeatEventStreamEndReason) => void
  private readonly onRetention: (_seconds: number) => void
  private readonly backoffBaseMs: number

  private readonly deduper = new SeatSseEventIdDeduper()
  private lastEventId: string | null = null
  private serverRetryMs: number | null = null
  private controller: AbortController | null = null
  private stopped = true
  private consecutiveFailures = 0
  private scope: { organizationId: string; workspaceId: string; initialAfterId: string | null } | null = null

  constructor(options: SeatEventStreamOptions) {
    this.baseUrl = options.baseUrl ?? '/api/v1'
    this.getToken = options.getToken
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
    this.onEnvelope = options.onEnvelope
    this.onResync = options.onResync
    this.onStatus = options.onStatus ?? (() => {})
    this.onEnded = options.onEnded ?? (() => {})
    this.onRetention = options.onRetention ?? (() => {})
    this.backoffBaseMs = options.backoffBaseMs ?? BASE_BACKOFF_MS
  }

  /** 开始监听某 Org+Workspace 的坐席事件流（幂等：重复 start 被忽略）。 */
  start(scope: { organizationId: string; workspaceId: string; initialAfterId?: string }): void {
    if (!isTsidString(scope.organizationId) || !isTsidString(scope.workspaceId)) {
      throw new Error('seat event stream requires TSID-string organizationId/workspaceId')
    }
    if (scope.initialAfterId !== undefined && !isTsidString(scope.initialAfterId)) {
      throw new Error('seat event stream initialAfterId must be a TSID-string')
    }
    this.scope = {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      initialAfterId: scope.initialAfterId ?? null,
    }
    if (!this.stopped) return
    this.stopped = false
    this.consecutiveFailures = 0
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    this.scope = null
    try {
      this.controller?.abort()
    } catch {
      /* 中止失败不致命 */
    }
    this.controller = null
    this.onStatus('closed')
  }

  /** 当前游标（断线补偿诊断用；Last-Event-ID 语义）。 */
  getCursor(): string | null {
    return this.lastEventId
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.scope === null) return
    this.consecutiveFailures += 1
    this.onStatus(this.consecutiveFailures >= OFFLINE_AFTER_FAILURES ? 'offline' : 'reconnecting')
    const localBackoff = Math.min(this.backoffBaseMs * 2 ** Math.min(this.consecutiveFailures, 4), MAX_BACKOFF_MS)
    const backoff = this.serverRetryMs ?? localBackoff
    setTimeout(() => void this.connect(), backoff)
  }

  private buildUrl(): string {
    const scope = this.scope
    if (scope === null) throw new Error('seat event stream is not started')
    const path = this.baseUrl + `/cs/organizations/${scope.organizationId}/seats/me/events`
    const query = `workspace_id=${encodeURIComponent(scope.workspaceId)}`
    // after_id 只在尚无游标且调用方显式给初值时使用；有游标一律走 Last-Event-ID 头。
    const initial = scope.initialAfterId
    return this.lastEventId === null && initial !== null ? `${path}?${query}&after_id=${encodeURIComponent(initial)}` : `${path}?${query}`
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.scope === null) return
    const token = this.getToken()
    if (token === null) {
      // fail-closed：无凭证不开流。
      this.onEnded('unauthorized')
      this.stopped = true
      this.onStatus('closed')
      return
    }
    this.controller = new AbortController()
    this.onStatus(this.consecutiveFailures === 0 ? 'connecting' : 'reconnecting')
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Authorization: `Bearer ${token}`,
    }
    if (this.lastEventId !== null) headers['Last-Event-ID'] = this.lastEventId
    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(), {
        headers,
        credentials: 'omit',
        signal: this.controller.signal,
      })
    } catch {
      if (!this.stopped) this.scheduleReconnect()
      return
    }
    if (response.status === 401 || response.status === 403) {
      // A04 fail-closed：撤权/停用绝不重试风暴。
      this.stopped = true
      this.onStatus('closed')
      this.onEnded(response.status === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    if (!response.ok || response.body === null) {
      this.scheduleReconnect()
      return
    }
    const retention = response.headers.get('X-CS-Event-Retention-Seconds')
    if (retention !== null) {
      const seconds = Number(retention)
      if (Number.isFinite(seconds) && seconds > 0) this.onRetention(seconds)
    }
    this.consecutiveFailures = 0
    this.onStatus('online')
    await this.readStream(response)
    // 服务端到 deadline 正常 fin——凭 Last-Event-ID 无损重连续传。
    if (!this.stopped) this.scheduleReconnect()
  }

  private async readStream(response: Response): Promise<void> {
    const parser = createSeatSseParser()
    const reader = response.body?.getReader()
    if (reader === undefined) return
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || this.stopped) break
        const { events, retryMs } = parser.push(decoder.decode(value, { stream: true }))
        if (retryMs !== null) this.serverRetryMs = retryMs
        for (const event of events) this.consumeEvent(event)
      }
    } catch {
      // 读流中断 → 走重连（游标仍在，无损续传）。
      if (!this.stopped) this.scheduleReconnect()
      return
    }
  }

  /** 单帧消费：信封 fail-closed 解析 → resync / 去重 / 游标推进 / 上报。 */
  private consumeEvent(event: { id: string | null; event: string; data: string }): void {
    const envelope = parseSeatSseEnvelope(event.data)
    if (envelope === null) {
      // 垃圾帧（含异常形状）不推进游标、不触发刷新。
      return
    }
    if (envelope.type === 'resync.required') {
      // 合同：清空游标并全量刷新；合成帧水位不作为客户端游标。
      this.deduper.reset()
      this.lastEventId = null
      this.onResync()
      return
    }
    const duplicate = this.deduper.isDuplicate(envelope.eventId)
    // 重复事件仍推进游标（at-least-once：断线重连避免重复补发已见事件）。
    const cursorCandidate = event.id ?? envelope.eventId
    if (cursorCandidate !== null && /^\d+$/.test(cursorCandidate)) this.lastEventId = cursorCandidate
    if (duplicate) return
    this.onEnvelope(envelope)
  }
}
