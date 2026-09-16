/**
 * CSW-01：Widget SSE 事件流（fetch 流式实现）。
 *
 * 为什么不用 EventSource：冻结合同要求凭证只走 `x-cs-visit-token` 请求头 +
 * `Last-Event-ID` 补偿头；EventSource 无法自定义请求头，因此用 fetch + ReadableStream。
 *
 * 合同（GET /api/v1/cs/widget/sessions/:id/events）：
 * - text/event-stream；首帧 `retry:` + `event: state`（会话快照）；
 * - `Last-Event-ID` 请求头用于断线补偿；
 * - `: keep-alive` 注释行保活（解析层忽略）。
 * 桩=E2E 替身声明：真实后端联调归 CSX-01。
 */
import { assertNoTokenInUrl } from './widgetApi'

export type SseEvent = { id: string | null; event: string; data: string }
export type StreamStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'
export type FetchLike = (_input: string, _init?: RequestInit) => Promise<Response>

/** 解析单个 SSE 块（以空行分隔）；`: keep-alive` 注释返回 null。 */
export function parseSseBlock(raw: string): { event: SseEvent; retryMs: number | null } | null {
  let eventName = 'message'
  const dataLines: string[] = []
  let id: string | null = null
  let retryMs: number | null = null
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') dataLines.push(value)
    else if (field === 'id') id = value
    else if (field === 'retry') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) retryMs = parsed
    }
  }
  if (dataLines.length === 0 && id === null && retryMs === null) return null
  return { event: { id, event: eventName, data: dataLines.join('\n') }, retryMs }
}

/** 有状态解析器：把任意切分的 chunk 组装成完整事件（保持残余 buffer）。 */
export function createSseParser(): { push: (_chunk: string) => { events: SseEvent[]; retryMs: number | null } } {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      const events: SseEvent[] = []
      let retryMs: number | null = null
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1) {
        const parsed = parseSseBlock(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
        if (parsed !== null) {
          events.push(parsed.event)
          if (parsed.retryMs !== null) retryMs = parsed.retryMs
        }
        separator = buffer.indexOf('\n\n')
      }
      return { events, retryMs }
    },
  }
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 15000
const OFFLINE_AFTER_FAILURES = 3

export class WidgetEventStream {
  private readonly path: string
  private readonly token: () => string
  private readonly fetchImpl: FetchLike
  private readonly backoffBaseMs: number
  private readonly onEvent: (_event: SseEvent) => void
  private readonly onStatus: (_status: StreamStatus) => void
  private lastEventId: string | null = null
  private serverRetryMs: number | null = null
  private controller: AbortController | null = null
  private stopped = true
  private consecutiveFailures = 0
  private hasConnectedOnce = false

  constructor(options: {
    path: string
    token: () => string
    fetchImpl?: FetchLike
    /** 测试注入用：重连退避基数（默认 1000ms） */
    backoffBaseMs?: number
    onEvent: (_event: SseEvent) => void
    onStatus: (_status: StreamStatus) => void
  }) {
    this.path = options.path
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
    this.backoffBaseMs = options.backoffBaseMs ?? BASE_BACKOFF_MS
    this.onEvent = options.onEvent
    this.onStatus = options.onStatus
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.consecutiveFailures = 0
    this.hasConnectedOnce = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    try {
      this.controller?.abort()
    } catch {
      /* 中止失败不致命 */
    }
    this.controller = null
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    this.consecutiveFailures += 1
    this.onStatus(this.consecutiveFailures >= OFFLINE_AFTER_FAILURES ? 'offline' : 'reconnecting')
    const localBackoff = Math.min(this.backoffBaseMs * 2 ** Math.min(this.consecutiveFailures, 4), MAX_BACKOFF_MS)
    const backoff = this.serverRetryMs ?? localBackoff
    setTimeout(() => void this.connect(), backoff)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    assertNoTokenInUrl(this.path)
    this.controller = new AbortController()
    this.onStatus(this.hasConnectedOnce ? 'reconnecting' : 'connecting')
    try {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'x-cs-visit-token': this.token(),
      }
      // Last-Event-ID 断线补偿（合同：服务端按该 id 之后的事件补发）
      if (this.lastEventId !== null) headers['Last-Event-ID'] = this.lastEventId
      const response = await this.fetchImpl(this.path, {
        headers,
        credentials: 'omit',
        signal: this.controller.signal,
      })
      if (!response.ok || response.body === null) {
        this.scheduleReconnect()
        return
      }
      this.hasConnectedOnce = true
      this.consecutiveFailures = 0
      this.onStatus('online')
      const parser = createSseParser()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done || this.stopped) break
        const decoded = decoder.decode(value, { stream: true })
        const { events, retryMs } = parser.push(decoded)
        for (const event of events) {
          if (event.id !== null) this.lastEventId = event.id
          this.onEvent(event)
        }
        // 服务端 retry: 提示作为下次重连节奏（合同语义保留）
        if (retryMs !== null) this.serverRetryMs = retryMs
      }
      if (!this.stopped) this.scheduleReconnect()
    } catch {
      if (!this.stopped) this.scheduleReconnect()
    }
  }
}
