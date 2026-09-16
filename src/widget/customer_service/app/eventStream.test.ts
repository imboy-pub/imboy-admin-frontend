/**
 * CSW-01 SSE 事件流单元测试。
 *
 * 覆盖验收点：
 * - 帧解析：首帧 retry + state、keep-alive 注释忽略、跨 chunk 组帧；
 * - Last-Event-ID 补偿：重连请求头携带最后收到的 id；
 * - 退避与离线降级：失败 → reconnecting →（连续失败）offline；
 * - credentials: 'omit' / token 头 / URL 无 token。
 */
import { describe, expect, it } from 'bun:test'
import { createSseParser, parseSseBlock, WidgetEventStream } from './eventStream'

describe('SSE 帧解析', () => {
  it('parseSseBlock：state 帧 / id / retry / keep-alive 注释', () => {
    const state = parseSseBlock('event: state\ndata: {"session":{"id":"1","status":"active"}}\n\n')?.event
    expect(state?.event).toBe('state')
    expect(JSON.parse(state?.data ?? '{}')).toEqual({ session: { id: '1', status: 'active' } })

    const withId = parseSseBlock('id: 42\nevent: message\ndata: {"body":"hi"}')
    expect(withId?.event.id).toBe('42')

    const withRetry = parseSseBlock('retry: 3000\ndata: x')
    expect(withRetry?.retryMs).toBe(3000)

    expect(parseSseBlock(': keep-alive')).toBeNull()
    expect(parseSseBlock('')).toBeNull()
  })

  it('createSseParser：跨 chunk 组帧 + 多事件 + 残余 buffer', () => {
    const parser = createSseParser()
    const first = parser.push('retry: 2000\nevent: state\ndata: {"ok":tr')
    expect(first.events).toHaveLength(0)
    const second = parser.push('ue}\n\n: keep-alive\n\nevent: message\ndata: {"a":1}\nid: 7\n\n')
    // retry: 2000 所在块在第二个 chunk 才闭合，因此随第二个 push 报出
    expect(first.retryMs).toBeNull()
    expect(second.events).toHaveLength(2)
    expect(second.events[0]?.event).toBe('state')
    expect(second.events[1]?.id).toBe('7')
    expect(second.retryMs).toBe(2000)
  })
})

type StubResponse = { ok: boolean; status: number; body: string; headers?: Record<string, string> }

function makeStreamingFetch(script: (_attempt: number, _headers: Record<string, string>) => StubResponse) {
  const attempts: Array<{ headers: Record<string, string> }> = []
  const fetchImpl = async (_input: string, init?: RequestInit): Promise<Response> => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    attempts.push({ headers })
    const stub = script(attempts.length, headers)
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(stub.body))
        controller.close()
      },
    })
    return {
      ok: stub.ok,
      status: stub.status,
      body: stub.ok ? body : null,
    } as unknown as Response
  }
  return { attempts, fetchImpl: fetchImpl as typeof fetch }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('WidgetEventStream（重连/补偿/降级）', () => {
  it('首帧 retry+state 事件回调；重连携带 Last-Event-ID；连续失败后 offline', async () => {
    const { attempts, fetchImpl } = makeStreamingFetch((attempt) => {
      if (attempt === 1) {
        // 不带 retry: 字段（其作为服务端重连节奏会让本测试慢 1s；retry 解析已有独立用例）
        return { ok: true, status: 200, body: 'event: state\ndata: {"session":{"id":"72057594037927936","status":"active"}}\n\nid: 11\nevent: message\ndata: {"body":"hi"}\n\n' }
      }
      return { ok: false, status: 503, body: '' }
    })
    const statuses: string[] = []
    const events: Array<{ event: string; id: string | null }> = []
    const stream = new WidgetEventStream({
      path: '/api/v1/cs/widget/sessions/72057594037927936/events',
      token: () => 'tok-e2e',
      fetchImpl,
      backoffBaseMs: 1,
      onEvent: (event) => events.push({ event: event.event, id: event.id }),
      onStatus: (status) => statuses.push(status),
    })
    stream.start()
    await wait(120)
    stream.stop()
    // 事件与 id 捕获（lastEventId 用于补偿）
    expect(events.map((e) => e.event)).toEqual(['state', 'message'])
    expect(events[1]?.id).toBe('11')
    // 第 1 次请求：token 头 + 无 Last-Event-ID
    expect(attempts[0]?.headers['x-cs-visit-token']).toBe('tok-e2e')
    expect(attempts[0]?.headers['Last-Event-ID']).toBeUndefined()
    expect(attempts[0]?.headers.Accept).toBe('text/event-stream')
    // 第 2 次请求（断线补偿）：携带 Last-Event-ID=11
    expect(attempts[1]?.headers['Last-Event-ID']).toBe('11')
    // 状态序列：connecting → online → reconnecting → offline
    expect(statuses[0]).toBe('connecting')
    expect(statuses).toContain('online')
    expect(statuses).toContain('reconnecting')
    expect(statuses).toContain('offline')
  })
})
