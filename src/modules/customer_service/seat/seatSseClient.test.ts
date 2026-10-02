/**
 * SEAT-01：SeatEventStream（§3.6 fetch-stream SSE client）单测。
 *
 * 覆盖：
 * - 端点/Bearer/credentials omit/Last-Event-ID 优先于 after_id（A05 游标合同）；
 * - resync.required → 清游标+去重器 + onResync 权威刷新（不取合成帧水位为游标）；
 * - event_id 去重（重复事件只刷新一次但游标仍推进）；
 * - 401/403 fail-closed 停流不重试（A04）；retention 头上报；
 * - 垃圾帧不推进游标、不触发刷新。
 */
import { describe, expect, it } from 'bun:test'
import { SeatEventStream } from './seatSseClient'

const ORG = '2000000000000000002'
const WS = '3000000000000000003'
const JWT = 'eyJh.eyJi.c2ln'

function envelopeFrame(eventId: string, type = 'message.appended'): string {
  return `id: ${eventId}\nevent: ${type}\ndata: ${JSON.stringify({
    event_id: eventId,
    type,
    organization_id: ORG,
    workspace_id: WS,
    resource_type: 'message',
    resource_id: '4000000000000000004',
    resource_version: 1,
    occurred_at: '2026-09-20T05:14:47Z',
    reason: 'created',
  })}\n\n`
}

const RESYNC_FRAME =
  'id: 9000000000000000099\nevent: resync.required\ndata: ' +
  JSON.stringify({
    event_id: '9000000000000000099',
    type: 'resync.required',
    organization_id: ORG,
    workspace_id: WS,
    resource_type: 'queue',
    resource_id: null,
    resource_version: 1,
    occurred_at: '2026-09-20T05:14:47Z',
    reason: 'unknown',
  }) +
  '\n\n'

function sseResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: init.status ?? 200, headers: init.headers })
}

type RecordedCall = { url: string; init: RequestInit | undefined }

function makeStreamFetch(responder: (_callIndex: number, _url: string, _init: RequestInit | undefined) => Response): {
  calls: RecordedCall[]
  fetchImpl: (_input: string, _init?: RequestInit) => Promise<Response>
} {
  const calls: RecordedCall[] = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return responder(calls.length - 1, url, init)
    },
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function baseHarness(responder: (_callIndex: number, _url: string, _init: RequestInit | undefined) => Response) {
  const { calls, fetchImpl } = makeStreamFetch(responder)
  const delivered: string[] = []
  let resyncs = 0
  const ended: string[] = []
  const statuses: string[] = []
  let retention: number | null = null
  const stream = new SeatEventStream({
    getToken: () => JWT,
    fetchImpl,
    backoffBaseMs: 5,
    onEnvelope: (envelope) => delivered.push(envelope.eventId),
    onResync: () => {
      resyncs += 1
    },
    onEnded: (reason) => ended.push(reason),
    onStatus: (status) => statuses.push(status),
    onRetention: (seconds) => {
      retention = seconds
    },
  })
  return { calls, delivered, resyncs: () => resyncs, ended, statuses, retention: () => retention, stream }
}

describe('端点与游标合同（A05）', () => {
  it('URL 落在 seats/me/events；Bearer 头；credentials omit；retention 头上报', async () => {
    const harness = baseHarness(() =>
      sseResponse(`retry: 2000\n${envelopeFrame('1000000000000000001')}`, {
        headers: { 'X-CS-Event-Retention-Seconds': '86400' },
      }),
    )
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(30)
    expect(harness.calls).toHaveLength(1)
    const call = harness.calls[0]
    expect(call?.url).toBe(`/api/v1/seat/cs/organizations/${ORG}/seats/me/events?workspace_id=${WS}`)
    expect((call?.init as RequestInit).credentials).toBe('omit')
    expect(((call?.init as RequestInit).headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`)
    expect(harness.retention()).toBe(86400)
    expect(harness.delivered).toEqual(['1000000000000000001'])
    expect(harness.stream.getCursor()).toBe('1000000000000000001')
    harness.stream.stop()
  })

  it('initialAfterId 仅在无游标首连时作 after_id；有游标重连改用 Last-Event-ID 头', async () => {
    let callIndex = 0
    const harness = baseHarness((_i) => {
      callIndex += 1
      if (callIndex === 1) return sseResponse(envelopeFrame('1000000000000000001'))
      return sseResponse(envelopeFrame('1000000000000000002'))
    })
    harness.stream.start({ organizationId: ORG, workspaceId: WS, initialAfterId: '1000000000000000000' })
    await sleep(60)
    expect(harness.calls.length).toBeGreaterThanOrEqual(2)
    expect(harness.calls[0]?.url).toContain('after_id=1000000000000000000')
    const secondHeaders = (harness.calls[1]?.init as RequestInit).headers as Record<string, string>
    expect(secondHeaders['Last-Event-ID']).toBe('1000000000000000001')
    expect(harness.calls[1]?.url).not.toContain('after_id')
    harness.stream.stop()
  })

  it('TSID 形状非法的 scope 拒绝开流', () => {
    const harness = baseHarness(() => sseResponse(''))
    expect(() =>
      harness.stream.start({ organizationId: '../evil', workspaceId: WS }),
    ).toThrow(/TSID-string/)
  })
})

describe('resync / 去重（A02/A05 权威刷新收敛）', () => {
  it('resync.required → 清游标+重置去重器+onResync；合成帧水位不作游标', async () => {
    const harness = baseHarness(() => sseResponse(RESYNC_FRAME))
    harness.stream.start({ organizationId: ORG, workspaceId: WS, initialAfterId: '1000000000000000000' })
    await sleep(30)
    // 流正常 fin 后按合同无损重连；每次连接都会收到一次合成 resync 帧。
    expect(harness.resyncs()).toBeGreaterThanOrEqual(1)
    expect(harness.stream.getCursor()).toBe(null)
    harness.stream.stop()
  })

  it('重复 event_id 只触发一次刷新，但游标推进到最新', async () => {
    const harness = baseHarness(() =>
      sseResponse(`${envelopeFrame('1000000000000000001')}${envelopeFrame('1000000000000000001')}`),
    )
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(30)
    expect(harness.delivered).toEqual(['1000000000000000001'])
    expect(harness.stream.getCursor()).toBe('1000000000000000001')
    harness.stream.stop()
  })

  it('resync 后同一 event_id 允许再次出现（去重器已清空）', async () => {
    let callIndex = 0
    const harness = baseHarness((_i) => {
      callIndex += 1
      return callIndex === 1 ? sseResponse(RESYNC_FRAME) : sseResponse(RESYNC_FRAME)
    })
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(60)
    expect(harness.resyncs()).toBeGreaterThanOrEqual(2)
    harness.stream.stop()
  })

  it('垃圾帧（信封非法）不推进游标、不触发刷新', async () => {
    const harness = baseHarness(() => sseResponse('data: not-json\n\ndata: {"x":1}\n\n'))
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(30)
    expect(harness.delivered).toEqual([])
    expect(harness.stream.getCursor()).toBe(null)
    harness.stream.stop()
  })
})

describe('A04 fail-closed（401/403 停流）', () => {
  it('401 → onEnded(unauthorized) 且不重连', async () => {
    const harness = baseHarness(() => new Response(null, { status: 401 }))
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(40)
    expect(harness.ended).toEqual(['unauthorized'])
    expect(harness.calls).toHaveLength(1)
    harness.stream.stop()
  })

  it('403（disabled seat / 无 assignment / 缺 permission）→ onEnded(forbidden) 不重连', async () => {
    const harness = baseHarness(() => new Response(null, { status: 403 }))
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(40)
    expect(harness.ended).toEqual(['forbidden'])
    expect(harness.calls).toHaveLength(1)
    harness.stream.stop()
  })

  it('无 token 时不开流直接 unauthorized（fail-closed）', async () => {
    const calls: RecordedCall[] = []
    const ended: string[] = []
    const stream = new SeatEventStream({
      getToken: () => null,
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        return sseResponse('')
      },
      onEnvelope: () => {},
      onResync: () => {},
      onEnded: (reason) => ended.push(reason),
    })
    stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(20)
    expect(calls).toHaveLength(0)
    expect(ended).toEqual(['unauthorized'])
  })

  it('网络错误 → 退避重连（非 401/403 不终局）', async () => {
    let callIndex = 0
    const harness = baseHarness((_i) => {
      callIndex += 1
      if (callIndex === 1) throw new TypeError('network down')
      return sseResponse(envelopeFrame('1000000000000000003'))
    })
    harness.stream.start({ organizationId: ORG, workspaceId: WS })
    await sleep(60)
    expect(harness.calls.length).toBeGreaterThanOrEqual(2)
    expect(harness.ended).toEqual([])
    expect(harness.delivered).toEqual(['1000000000000000003'])
    harness.stream.stop()
  })
})
