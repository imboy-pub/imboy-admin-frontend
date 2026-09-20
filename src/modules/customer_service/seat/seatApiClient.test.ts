/**
 * SEAT-01：SeatApiClient 单测。
 *
 * 覆盖：
 * - A01 认证域隔离：/api/adm 与域外路径拒绝（不发请求）；credentials omit；
 *   Bearer 只进 Authorization 头；
 * - A03 token 卫生：JWT 不进 URL；session_token 仅 status/subscribe 查询串
 *   allowlist；错误消息/URL 脱敏；
 * - A05 合同：{code,msg,payload} 信封、TSID 精度保护解析、错误分类。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import {
  assertSeatApiPath,
  assertSeatQueryContract,
  QR_SESSION_TOKEN_QUERY_PATHS,
  redactSeatUrl,
  SeatApiClient,
} from './seatApiClient'
import { isSeatApiError } from './errors'
import { seatTokenVault } from './seatAuthStore'

type RecordedCall = { url: string; init: RequestInit | undefined }

function makeFetch(responder: (_url: string, _init: RequestInit | undefined) => unknown): {
  calls: RecordedCall[]
  fetchImpl: (_input: string, _init?: RequestInit) => Promise<Response>
} {
  const calls: RecordedCall[] = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      const out = responder(url, init)
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out ?? {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  }
}

afterEach(() => {
  seatTokenVault.clear()
})

describe('A01 域隔离（路径门）', () => {
  it('拒绝 /api/adm 与任意域外路径，且不发请求', async () => {
    const { calls, fetchImpl } = makeFetch(() => ({}))
    const client = new SeatApiClient({ fetchImpl })
    for (const path of ['/adm/organizations', '/api/adm/organizations', '/api/v1/user/show']) {
      let thrown: unknown = null
      try {
        await client.request(path)
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as Error).message).toContain('outside seat domain')
    }
    expect(calls).toHaveLength(0)
  })

  it('拒绝绝对 URL / 协议相对路径', () => {
    expect(() => assertSeatApiPath('https://evil.example/api/v1/cs/x')).toThrow()
    expect(() => assertSeatApiPath('//evil.example/api/v1/cs/x')).toThrow()
    expect(() => assertSeatApiPath('/api/v1/cs/me/seat-contexts')).not.toThrow()
  })

  it('Seat 域路径（cs + qr_login 合同面）全部放行', () => {
    expect(() => assertSeatApiPath('/api/v1/cs/me/seat-contexts')).not.toThrow()
    expect(() => assertSeatApiPath('/api/v1/cs/organizations/123/seats/me/events')).not.toThrow()
    expect(() => assertSeatApiPath('/api/v1/passport/qr_login/status')).not.toThrow()
  })

  it('请求不带 Cookie（credentials: omit）且 Bearer 只进 Authorization 头', async () => {
    seatTokenVault.setToken('aa.bb.cc')
    const { calls, fetchImpl } = makeFetch(() => ({ code: 0, msg: 'success', payload: {} }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    await client.request('/cs/me/seat-contexts')
    expect(calls).toHaveLength(1)
    const init = calls[0]?.init as RequestInit
    expect(init.credentials).toBe('omit')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer aa.bb.cc')
  })
})

describe('A03 token 卫生（查询串 allowlist 与脱敏）', () => {
  it('session_token 仅允许 status/subscribe 合同路径', () => {
    expect(QR_SESSION_TOKEN_QUERY_PATHS).toEqual([
      '/api/v1/passport/qr_login/status',
      '/api/v1/passport/qr_login/subscribe',
    ])
    expect(() =>
      assertSeatQueryContract('/api/v1/passport/qr_login/status', { session_token: 'st-1' }),
    ).not.toThrow()
    expect(() =>
      assertSeatQueryContract('/api/v1/passport/qr_login/subscribe', { session_token: 'st-1' }),
    ).not.toThrow()
  })

  it('其他路径携带 token 类查询键 → 抛错不发请求', async () => {
    const { calls, fetchImpl } = makeFetch(() => ({}))
    const client = new SeatApiClient({ fetchImpl })
    expect(() => assertSeatQueryContract('/api/v1/cs/me/seat-contexts', { token: 'x' })).toThrow()
    let thrown: unknown = null
    try {
      await client.request('/passport/qr_login/create', { method: 'POST', query: { session_token: 'x' } })
    } catch (error) {
      thrown = error
    }
    expect(isSeatApiError(thrown)).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('redactSeatUrl 脱敏 token 值但保留键名', () => {
    const redacted = redactSeatUrl('/api/v1/passport/qr_login/status?session_token=SECRET123&x=1')
    expect(redacted).toBe('/api/v1/passport/qr_login/status?session_token=***&x=1')
    expect(redacted).not.toContain('SECRET123')
  })

  it('JWT 永不进 URL：request 的 URL 不含 Bearer token', async () => {
    seatTokenVault.setToken('eyJa.eyJa.sig')
    const { calls, fetchImpl } = makeFetch(() => ({ code: 0, msg: 'success', payload: {} }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    await client.request('/cs/me/seat-contexts')
    expect(calls[0]?.url).not.toContain('eyJa')
    expect(calls[0]?.url).toBe('/api/v1/cs/me/seat-contexts')
  })
})

describe('A05 信封与 TSID 解析', () => {
  it('code=0 返回 payload；结构区大整数转 string 不丢精度', async () => {
    // 直接返回原始 JSON 文本：TSID 字面量在 parse 前必须仍是文本，
    // 否则 mock 层的 JS number 已先丢精度（那正是本防护要挡的场景）。
    const { fetchImpl } = makeFetch(
      () =>
        new Response(
          '{"code":0,"msg":"success","payload":{"user_id":9223372036854775807,"contexts":[]}}',
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const client = new SeatApiClient({ fetchImpl })
    const payload = await client.request('/cs/me/seat-contexts')
    expect(payload).toEqual({ user_id: '9223372036854775807', contexts: [] })
  })

  it('业务码非 0 → 分类错误（HTTP 200 + code 403 → forbidden）', async () => {
    const { fetchImpl } = makeFetch(() => ({ code: 403, msg: 'not a member', payload: {} }))
    const client = new SeatApiClient({ fetchImpl })
    let thrown: unknown = null
    try {
      await client.request('/cs/me/seat-contexts')
    } catch (error) {
      thrown = error
    }
    expect(isSeatApiError(thrown)).toBe(true)
    expect((thrown as { kind: string }).kind).toBe('forbidden')
  })

  it('HTTP 非 200 且 body 非对象 → 按 HTTP 状态分类', async () => {
    const { fetchImpl } = makeFetch(
      () => new Response('gateway timeout', { status: 504 }),
    )
    const client = new SeatApiClient({ fetchImpl })
    let thrown: unknown = null
    try {
      await client.request('/cs/me/seat-contexts')
    } catch (error) {
      thrown = error
    }
    expect((thrown as { kind: string }).kind).toBe('server')
    expect((thrown as { status: number | null }).status).toBe(504)
  })

  it('fetch 抛错 → network 分类', async () => {
    const client = new SeatApiClient({
      fetchImpl: async () => {
        throw new TypeError('failed to fetch')
      },
    })
    let thrown: unknown = null
    try {
      await client.request('/cs/me/seat-contexts')
    } catch (error) {
      thrown = error
    }
    expect((thrown as { kind: string }).kind).toBe('network')
  })

  it('payload 缺失 / 非 JSON 信封 → invalid_response（fail-closed）', async () => {
    const noPayload = makeFetch(() => ({ code: 0, msg: 'success' }))
    const clientA = new SeatApiClient({ fetchImpl: noPayload.fetchImpl })
    let thrownA: unknown = null
    try {
      await clientA.request('/cs/me/seat-contexts')
    } catch (error) {
      thrownA = error
    }
    expect((thrownA as { kind: string }).kind).toBe('invalid_response')

    const badJson = makeFetch(() => new Response('<html>ok</html>', { status: 200 }))
    const clientB = new SeatApiClient({ fetchImpl: badJson.fetchImpl })
    let thrownB: unknown = null
    try {
      await clientB.request('/cs/me/seat-contexts')
    } catch (error) {
      thrownB = error
    }
    expect((thrownB as { kind: string }).kind).toBe('invalid_response')
  })

  it('POST 请求体经 JSON 序列化且 Content-Type 正确', async () => {
    const { calls, fetchImpl } = makeFetch(() => ({ code: 0, msg: 'success', payload: {} }))
    const client = new SeatApiClient({ fetchImpl })
    await client.request('/passport/qr_login/cancel', { method: 'POST', body: { qr_token: 'q1' } })
    const init = calls[0]?.init as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ qr_token: 'q1' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})
