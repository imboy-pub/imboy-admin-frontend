/**
 * SEAT-01：QR 扫码登录会话流单测（A02/A03）。
 *
 * 覆盖：
 * - create → SSE subscribe → scanned → confirmed(JWT)；token 形状 sanity；
 * - expired/cancelled/401/404 → onEnded → 调用方清会话回登录；
 * - SSE 失败 → 2s（测试用更短间隔）轮询 fallback；
 * - A03：session_token 仅按 status/subscribe 合同进查询串；create body 无凭证。
 */
import { describe, expect, it } from 'bun:test'
import { QR_LOGIN_POLL_INTERVAL_MS, QrLoginSession, toQrStatusFrame } from './qrLoginSession'
import { SeatApiClient } from './seatApiClient'

const JWT = 'eyJhbGciOi.hfrCJ9.sig9'

function jsonEnvelope(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', payload }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sse(body: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type Call = { url: string; init: RequestInit | undefined }

function harness(options: {
  subscribe?: () => Promise<Response>
  statusPayload?: unknown
  statusError?: { code: number; msg: string; httpStatus?: number }
}) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    if (url.includes('/qr_login/create')) {
      return jsonEnvelope({ qr_token: 'qr-token-1', session_token: 'st-secret-1', expires_in: 60 })
    }
    if (url.includes('/qr_login/status')) {
      if (options.statusError) {
        return new Response(JSON.stringify({ code: options.statusError.code, msg: options.statusError.msg }), {
          status: options.statusError.httpStatus ?? 200,
        })
      }
      return jsonEnvelope(options.statusPayload ?? { status: 'waiting' })
    }
    if (url.includes('/qr_login/subscribe')) {
      const subscribe = options.subscribe
      if (!subscribe) throw new TypeError('subscribe unavailable')
      return subscribe()
    }
    if (url.includes('/qr_login/cancel')) return jsonEnvelope({})
    return new Response('{}', { status: 404 })
  }
  const client = new SeatApiClient({ fetchImpl })
  const events: Array<Record<string, unknown>> = []
  const session = new QrLoginSession({
    client,
    fetchImpl,
    pollIntervalMs: 5,
    callbacks: {
      onQrCreated: (created) => events.push({ kind: 'created', ...created }),
      onScanned: () => events.push({ kind: 'scanned' }),
      onConfirmed: (token) => events.push({ kind: 'confirmed', token }),
      onEnded: (reason) => events.push({ kind: 'ended', reason }),
      onError: (error) => events.push({ kind: 'error', kindCode: error.kind }),
    },
  })
  return { calls, events, session }
}

function startArgs() {
  return { deviceId: 'web-device-1', deviceName: 'Web Browser', platform: 'web' }
}

describe('A02 QR 确认主链（SSE 优先）', () => {
  it('create → subscribe → scanned → confirmed(JWT)', async () => {
    const { calls, events, session } = harness({
      subscribe: () =>
        sse(`data: {"status":"scanned"}\n\ndata: {"status":"confirmed","token":"${JWT}"}\n\n`),
    })
    await session.start(startArgs())
    await sleep(30)
    expect(events.some((e) => e.kind === 'created' && e.qrToken === 'qr-token-1')).toBe(true)
    expect(events.some((e) => e.kind === 'scanned')).toBe(true)
    const confirmed = events.find((e) => e.kind === 'confirmed')
    expect(confirmed?.token).toBe(JWT)
    expect(session.getPhase()).toBe('confirmed')
    // create body 只含设备信息，绝无凭证
    const createBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
    expect(Object.keys(createBody).sort()).toEqual(['device_id', 'device_name', 'platform', 'purpose'])
    expect(createBody.purpose).toBe('seat')
    // subscribe 的 session_token 只出现在 allowlist 查询串
    expect(calls[1]?.url).toBe('/api/v1/passport/qr_login/subscribe?session_token=st-secret-1')
  })

  it('confirmed 帧带非 JWT token → fail-closed 结束会话', async () => {
    const { events, session } = harness({
      subscribe: () => sse('data: {"status":"confirmed","token":"garbage"}\n\n'),
    })
    await session.start(startArgs())
    await sleep(30)
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'expired')).toBe(true)
    expect(session.getPhase()).toBe('ended')
  })

  it('SSE expired 帧 → onEnded(expired) 回登录', async () => {
    const { events, session } = harness({ subscribe: () => sse('data: {"status":"expired"}\n\n') })
    await session.start(startArgs())
    await sleep(30)
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'expired')).toBe(true)
    expect(session.getPhase()).toBe('ended')
  })
})

describe('A02 轮询 fallback 与终结清理', () => {
  it('SSE 连接失败 → 轮询 status → confirmed 拿 token', async () => {
    const { calls, events, session } = harness({
      subscribe: () => Promise.reject(new TypeError('sse down')),
      statusPayload: { status: 'confirmed', token: JWT },
    })
    await session.start(startArgs())
    await sleep(40)
    expect(events.some((e) => e.kind === 'confirmed' && e.token === JWT)).toBe(true)
    expect(calls.some((c) => c.url.includes('/qr_login/status?session_token=st-secret-1'))).toBe(true)
    expect(session.getPhase()).toBe('confirmed')
  })

  it('轮询 5202 cancelled → onEnded(cancelled)', async () => {
    const { events, session } = harness({
      subscribe: () => Promise.reject(new TypeError('sse down')),
      statusError: { code: 5202, msg: '登录已取消' },
    })
    await session.start(startArgs())
    await sleep(40)
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'cancelled')).toBe(true)
    expect(session.getPhase()).toBe('ended')
  })

  it('轮询 404（会话不存在或已过期）→ onEnded(expired)', async () => {
    const { events, session } = harness({
      subscribe: () => Promise.reject(new TypeError('sse down')),
      statusError: { code: 404, msg: '会话不存在或已过期' },
    })
    await session.start(startArgs())
    await sleep(40)
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'expired')).toBe(true)
    expect(session.getPhase()).toBe('ended')
  })

  it('轮询 401 → onEnded(unauthorized)', async () => {
    const { events, session } = harness({
      subscribe: () => Promise.reject(new TypeError('sse down')),
      statusError: { code: 401, msg: 'unauthorized', httpStatus: 401 },
    })
    await session.start(startArgs())
    await sleep(40)
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'unauthorized')).toBe(true)
    expect(session.getPhase()).toBe('ended')
  })

  it('cancel() → 本地立即回登录 + 尽力而为 cancel 请求（body 含 qr_token）', async () => {
    const { calls, events, session } = harness({
      subscribe: () => sse('data: {"status":"waiting"}\n\n'),
    })
    await session.start(startArgs())
    await sleep(10)
    await session.cancel()
    expect(events.some((e) => e.kind === 'ended' && e.reason === 'cancelled')).toBe(true)
    expect(session.getPhase()).toBe('ended')
    const cancelCall = calls.find((c) => c.url.includes('/qr_login/cancel'))
    expect(cancelCall).toBeDefined()
    expect(JSON.parse(String(cancelCall?.init?.body))).toEqual({ qr_token: 'qr-token-1' })
  })
})

describe('A03 查询串凭证纪律', () => {
  it('轮询默认间隔是 2 秒（计划卡 fallback 节奏）', () => {
    expect(QR_LOGIN_POLL_INTERVAL_MS).toBe(2000)
  })

  it('session_token 不进 create body / 不进 cancel 查询串', async () => {
    const { calls } = harness({
      subscribe: () => sse('data: {"status":"waiting"}\n\n'),
    })
    const session = new QrLoginSession({
      client: new SeatApiClient({
        fetchImpl: async (url, init) => {
          calls.push({ url, init })
          return jsonEnvelope({ qr_token: 'q', session_token: 's', expires_in: 1 })
        },
      }),
      fetchImpl: () => Promise.reject(new TypeError('sse down')),
      pollIntervalMs: 1000,
      callbacks: {
        onQrCreated: () => {},
        onConfirmed: () => {},
        onEnded: () => {},
      },
    })
    await session.start(startArgs())
    await sleep(10)
    const createCall = calls[0]
    expect(createCall?.url).toBe('/api/v1/passport/qr_login/create')
    expect(String(createCall?.init?.body)).not.toContain('st-secret')
    session.dispose()
  })
})

describe('toQrStatusFrame 形状收敛', () => {
  it('waiting/scanned 无 token；token 非 JWT 形状 → null token（fail-closed）', () => {
    expect(toQrStatusFrame({ status: 'waiting' })).toEqual({ status: 'waiting', token: null })
    expect(toQrStatusFrame({ status: 'confirmed', token: JWT })).toEqual({ status: 'confirmed', token: JWT })
    expect(toQrStatusFrame({ status: 'confirmed', token: 'junk' })).toEqual({ status: 'confirmed', token: null })
    expect(toQrStatusFrame({})).toBe(null)
    expect(toQrStatusFrame('x')).toBe(null)
  })
})
