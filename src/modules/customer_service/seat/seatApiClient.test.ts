/**
 * SEAT-01：SeatApiClient 单测。
 *
 * 覆盖：
 * - A01 认证域隔离：/api/adm 与域外路径拒绝（不发请求）；credentials omit；
 *   Bearer 只进 Authorization 头；
 * - A03 token 卫生：JWT 不进 URL；session_token 仅 status/subscribe 查询串
 *   allowlist；错误消息/URL 脱敏；
 * - A05 合同：{code,msg,payload} 信封、TSID 精度保护解析、错误分类；
 * - CS-WEB-01：requestBlob 附件内容端点（原始字节流非信封；Bearer 头 +
 *   credentials omit；401/403/404 分类；域外路径拒绝）。
 * - REVIEW-2 凭据卫生锁定（评审无发现项 → 防回归测试化）：全部出站通道
 *   （JSON request / SSE fetch 流 / 资产 content 读回 / 裸 PUT 上传）每条请求
 *   credentials:'omit'；有 token 时 Authorization: Bearer 形状正确且 URL 与
 *   body 均不含 JWT；token 类查询键仅 status/subscribe allowlist；redact
 *   家族脱敏。注：SSE fetch 流实现位于 seatSseClient.ts（SeatEventStream），
 *   本文件按真实代码路径将其纳入同一凭据卫生断言面。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import {
  assertSeatApiPath,
  assertSeatQueryContract,
  QR_SESSION_TOKEN_QUERY_PATHS,
  redactSeatUrl,
  SeatApiClient,
} from './seatApiClient'
import { isSeatApiError, SeatApiError } from './errors'
import { seatTokenVault } from './seatAuthStore'
import { SeatEventStream } from './seatSseClient'

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
    expect(() => assertSeatApiPath('https://evil.example/api/v1/seat/cs/x')).toThrow()
    expect(() => assertSeatApiPath('//evil.example/api/v1/seat/cs/x')).toThrow()
    expect(() => assertSeatApiPath('/api/v1/seat/cs/me/seat-contexts')).not.toThrow()
  })

  it('Seat 域路径（cs + qr_login + enterprise 合同面）全部放行', () => {
    expect(() => assertSeatApiPath('/api/v1/seat/cs/me/seat-contexts')).not.toThrow()
    expect(() => assertSeatApiPath('/api/v1/seat/cs/organizations/123/seats/me/events')).not.toThrow()
    expect(() => assertSeatApiPath('/api/v1/passport/qr_login/status')).not.toThrow()
    expect(() => assertSeatApiPath('/api/v1/seat/enterprise/conversations/456/messages')).not.toThrow()
    // DF-9：坐席发送消息走企业真源写路径（带 /organizations/:org 段）。
    expect(() => assertSeatApiPath('/api/v1/seat/enterprise/organizations/123/conversations/456/messages')).not.toThrow()
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
    expect(() => assertSeatQueryContract('/api/v1/seat/cs/me/seat-contexts', { token: 'x' })).toThrow()
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
    expect(calls[0]?.url).toBe('/api/v1/seat/cs/me/seat-contexts')
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

describe('CS-WEB-01 requestBlob（附件 content 端点；二进制非信封）', () => {
  const CONTENT_PATH = '/enterprise/organizations/123/assets/456/content'
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  function blobResponder(status: number, body?: BodyInit): ReturnType<typeof makeFetch> {
    return makeFetch(() => new Response(body ?? PNG_BYTES.slice(), { status }))
  }

  it('成功 → Blob；Bearer 只进 Authorization 头；credentials omit；URL 不含 token', async () => {
    seatTokenVault.setToken('aa.bb.cc')
    const { calls, fetchImpl } = blobResponder(200)
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    const blob = await client.requestBlob(CONTENT_PATH)
    expect(blob.size).toBe(PNG_BYTES.length)
    expect(calls).toHaveLength(1)
    const init = calls[0]?.init as RequestInit
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer aa.bb.cc')
    expect(calls[0]?.url).toBe(`/api/v1/seat${CONTENT_PATH}`)
    expect(calls[0]?.url).not.toContain('aa.bb.cc')
  })

  it('HTTP 200 JSON 错误信封不得保存成附件', async () => {
    const { fetchImpl } = makeFetch(() => new Response('{"code":902,"msg":"rejected","payload":{}}', {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }))
    const client = new SeatApiClient({ fetchImpl })
    await expect(client.requestBlob(CONTENT_PATH)).rejects.toBeInstanceOf(SeatApiError)
  })

  it('401/403/404 → 对应分类（HTTP 状态即权威；message 不带 URL）', async () => {
    for (const [status, kind] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
    ] as const) {
      const { fetchImpl } = blobResponder(status, `{"code":${status},"msg":"rejected","payload":{}}`)
      const client = new SeatApiClient({ fetchImpl })
      let thrown: unknown = null
      try {
        await client.requestBlob(CONTENT_PATH)
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as { kind: string }).kind).toBe(kind)
      expect((thrown as Error).message).not.toContain(CONTENT_PATH)
    }
  })

  it('网络失败 / blob 读取失败 → network 分类', async () => {
    const client = new SeatApiClient({
      fetchImpl: async () => {
        throw new TypeError('failed to fetch')
      },
    })
    let thrown: unknown = null
    try {
      await client.requestBlob(CONTENT_PATH)
    } catch (error) {
      thrown = error
    }
    expect((thrown as { kind: string }).kind).toBe('network')
  })

  it('域外路径（/api/adm）拒绝且不发请求', async () => {
    const { calls, fetchImpl } = blobResponder(200)
    const client = new SeatApiClient({ fetchImpl })
    let thrown: unknown = null
    try {
      await client.requestBlob('/adm/organizations')
    } catch (error) {
      thrown = error
    }
    expect(isSeatApiError(thrown)).toBe(true)
    expect(calls).toHaveLength(0)
  })
})

describe('CS-WEB-02 putUploadObject（裸 PUT 上传通道；presign 下发目标）', () => {
  const UPLOAD_URL = '/api/v1/seat/enterprise/organizations/123/assets/upload/1'
  const FILE_BYTES = new Uint8Array([1, 2, 3, 4, 5])

  function uploadResponder(status: number): ReturnType<typeof makeFetch> {
    return makeFetch(() => new Response('', { status }))
  }

  it('成功：PUT + blob body + octet-stream；无 Authorization；credentials omit', async () => {
    seatTokenVault.setToken('aa.bb.cc')
    const { calls, fetchImpl } = uploadResponder(200)
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    await client.putUploadObject(UPLOAD_URL, new Blob([FILE_BYTES.slice()]))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(UPLOAD_URL)
    const init = calls[0]?.init as RequestInit
    expect(init.method).toBe('PUT')
    expect(init.credentials).toBe('omit')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/octet-stream')
    // Seat JWT 绝不出现在裸 PUT 通道（目标凭证由 URL 自带）。
    expect(headers.Authorization).toBeUndefined()
  })

  it('http(s) 绝对 URL 放行（presign 可下发跨源对象存储目标）', async () => {
    const { calls, fetchImpl } = uploadResponder(200)
    const client = new SeatApiClient({ fetchImpl })
    await client.putUploadObject('https://objects.example.internal/bucket/obj-1', new Blob(['x']))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://objects.example.internal/bucket/obj-1')
  })

  it('非 2xx → 按 HTTP/信封分类（500 server / 403 forbidden）', async () => {
    const { fetchImpl } = uploadResponder(500)
    const client = new SeatApiClient({ fetchImpl })
    let thrown: unknown = null
    try {
      await client.putUploadObject(UPLOAD_URL, new Blob(['x']))
    } catch (error) {
      thrown = error
    }
    expect(isSeatApiError(thrown)).toBe(true)
    expect((thrown as { kind: string }).kind).toBe('server')

    const forbidden = uploadResponder(403)
    const client2 = new SeatApiClient({ fetchImpl: forbidden.fetchImpl })
    let thrown2: unknown = null
    try {
      await client2.putUploadObject(UPLOAD_URL, new Blob(['x']))
    } catch (error) {
      thrown2 = error
    }
    expect((thrown2 as { kind: string }).kind).toBe('forbidden')
  })

  it('协议门：javascript:/data:/协议相对目标 → 发请求前拒绝（validation）', async () => {
    const { calls, fetchImpl } = uploadResponder(200)
    const client = new SeatApiClient({ fetchImpl })
    for (const target of ['javascript:alert(1)', 'data:text/plain,evil', '//evil.example.com/x']) {
      let thrown: unknown = null
      try {
        await client.putUploadObject(target, new Blob(['x']))
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as { kind: string }).kind).toBe('validation')
    }
    expect(calls).toHaveLength(0)
  })

  it('网络失败 → network 分类', async () => {
    const client = new SeatApiClient({
      fetchImpl: async () => {
        throw new TypeError('failed to fetch')
      },
    })
    let thrown: unknown = null
    try {
      await client.putUploadObject(UPLOAD_URL, new Blob(['x']))
    } catch (error) {
      thrown = error
    }
    expect((thrown as { kind: string }).kind).toBe('network')
  })
})

/**
 * REVIEW-2 凭据卫生锁定（评审确认事实 → 防回归测试化）。
 *
 * 锁定事实（以真实实现为准；mock 只打 fetch 边界，真实走 client 代码路径）：
 * 1. 全部出站通道每条请求 credentials:'omit'（Cookie 不随行）；
 * 2. 有 token 时 Authorization: Bearer <token> 只进头；URL 与 body 均不含 JWT
 *    （对每通道各断言一次）；
 * 3. token 类查询键家族仅 session_token 在 status/subscribe 两条合同路径
 *    allowlist 内；其余路径带该类键的构造在发请求前被拒；
 * 4. redactSeatUrl：token 类键值一律替换为 ***，值不出现在输出。
 *
 * 通道盘点（真实代码）：request（JSON API）、requestBlob（资产 content 读回）、
 * putUploadObject（裸 PUT 上传，含 upload_ref 带 Bearer / 对象存储裸 PUT 两种
 * 形态）、SeatEventStream（SSE fetch 流；实现在 seatSseClient.ts，此处纳入
 * 同一断言面）。无 token 时 SSE fail-closed 不发请求，已在 seatSseClient.test.ts
 * 锁定，此处不重复。
 */
describe('REVIEW-2 凭据卫生锁定（全通道系统断言）', () => {
  const GUARD_JWT = 'REVIEW2guard.hdgJWTsig.bodynever'

  it('通道1 JSON API（request）：credentials omit；Bearer 只进 Authorization 头；URL 与 body 均不含 JWT', async () => {
    seatTokenVault.setToken(GUARD_JWT)
    const { calls, fetchImpl } = makeFetch(() => ({ code: 0, msg: 'success', payload: {} }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    await client.request('/cs/me/seat-contexts')
    await client.request('/passport/qr_login/cancel', { method: 'POST', body: { qr_token: 'q-1' } })
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      const init = call.init as RequestInit
      expect(init.credentials).toBe('omit')
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${GUARD_JWT}`)
      expect(call.url).not.toContain(GUARD_JWT)
      if (typeof init.body === 'string') expect(init.body).not.toContain(GUARD_JWT)
    }
  })

  it('通道2 资产 content 读回（requestBlob）：credentials omit；Bearer 只进 Authorization 头；URL 不含 JWT', async () => {
    seatTokenVault.setToken(GUARD_JWT)
    const { calls, fetchImpl } = makeFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    await client.requestBlob('/enterprise/organizations/1/assets/2/content')
    expect(calls).toHaveLength(1)
    const init = calls[0]?.init as RequestInit
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${GUARD_JWT}`)
    expect(calls[0]?.url).not.toContain(GUARD_JWT)
  })

  it('通道3 裸 PUT 上传（putUploadObject）：两种形态均 credentials omit；upload_ref 形态 Bearer 进头、URL/body 不含 JWT；对象存储形态无 Authorization', async () => {
    seatTokenVault.setToken(GUARD_JWT)
    const { calls, fetchImpl } = makeFetch(() => new Response('', { status: 200 }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => seatTokenVault.getToken() })
    const blob = new Blob([new Uint8Array([9, 9, 9])])
    // imboy API 域形态（CS-BE-01B 线特征：查询串带 upload_ref）→ 带 Bearer。
    await client.putUploadObject('/api/v1/seat/enterprise/organizations/1/assets/presign?upload_ref=ur-1', blob)
    // 对象存储预签形态 → 无 Authorization（Seat JWT 绝不外发第三方域）。
    await client.putUploadObject('https://objects.example.internal/bucket/obj?X-Amz-Signature=sig', blob)
    expect(calls).toHaveLength(2)
    const apiInit = calls[0]?.init as RequestInit
    const s3Init = calls[1]?.init as RequestInit
    for (const call of calls) {
      const init = call.init as RequestInit
      expect(init.credentials).toBe('omit')
      expect(call.url).not.toContain(GUARD_JWT)
      // body 只透传调用方 Blob（引用相等）：client 不会另构造含 JWT 的 body。
      expect(init.body).toBe(blob)
    }
    expect((apiInit.headers as Record<string, string>).Authorization).toBe(`Bearer ${GUARD_JWT}`)
    expect((s3Init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('通道4 SSE fetch 流（SeatEventStream，实现位于 seatSseClient.ts）：credentials omit；Bearer 只进 Authorization 头；URL 不含 JWT 且 GET 无 body', async () => {
    seatTokenVault.setToken(GUARD_JWT)
    const calls: RecordedCall[] = []
    const encoder = new TextEncoder()
    const stream = new SeatEventStream({
      getToken: () => seatTokenVault.getToken(),
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('retry: 2000\n\n'))
            controller.close()
          },
        })
        return new Response(body, { status: 200 })
      },
      onEnvelope: () => {},
      onResync: () => {},
    })
    stream.start({ organizationId: '2000000000000000002', workspaceId: '3000000000000000003' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    stream.stop()
    expect(calls).toHaveLength(1)
    const call = calls[0] as RecordedCall
    const init = call.init as RequestInit
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${GUARD_JWT}`)
    expect(call.url).toBe(
      '/api/v1/seat/cs/organizations/2000000000000000002/seats/me/events?workspace_id=3000000000000000003',
    )
    expect(call.url).not.toContain(GUARD_JWT)
    expect(init.body).toBeUndefined()
  })

  it('token 类查询键家族在 Seat 域非 allowlist 路径全部发请求前被拒（与实现 TOKEN_LIKE_QUERY_KEYS 同步）', async () => {
    const { calls, fetchImpl } = makeFetch(() => ({}))
    const client = new SeatApiClient({ fetchImpl })
    for (const key of ['session_token', 'token', 'access_token', 'refresh_token', 'visit_token', 'jwt']) {
      let thrown: unknown = null
      try {
        await client.request('/cs/me/seat-contexts', { query: { [key]: 'SECRETVALUE' } })
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as { kind: string }).kind).toBe('validation')
      expect((thrown as Error).message).toContain(key)
    }
    expect(calls).toHaveLength(0)
  })

  it('redactSeatUrl 家族：全部 token 类键值替换为 ***，值不出现在输出', () => {
    for (const key of ['session_token', 'token', 'access_token', 'refresh_token', 'visit_token', 'jwt']) {
      const redacted = redactSeatUrl(`/api/v1/seat/cs/x?${key}=SECRETVALUE&w=1`)
      expect(redacted).toBe(`/api/v1/seat/cs/x?${key}=***&w=1`)
      expect(redacted).not.toContain('SECRETVALUE')
    }
  })
})


describe('Console 凭证出口约束', () => {
  it('完整 Human API 路径不属于 Console 域', () => {
    expect(() => assertSeatApiPath('/api/v1/cs/me/seat-contexts')).toThrow()
    expect(() => assertSeatApiPath('/api/v1/enterprise/organizations/1/assets/2/content')).toThrow()
  })

  it('带 upload_ref 的域外/非上传目标在发送前拒绝，Seat JWT 不外发', async () => {
    const { calls, fetchImpl } = makeFetch(() => new Response('', { status: 200 }))
    const client = new SeatApiClient({ fetchImpl, getToken: () => 'aa.bb.cc' })
    for (const url of [
      'https://objects.example.internal/api/v1/seat/enterprise/organizations/1/assets/presign?upload_ref=r',
      '/api/v1/enterprise/organizations/1/assets/presign?upload_ref=r',
      '/api/v1/seat/enterprise/organizations/1/assets/confirm?upload_ref=r',
    ]) {
      await expect(client.putUploadObject(url, new Blob(['x']))).rejects.toBeInstanceOf(SeatApiError)
    }
    expect(calls).toHaveLength(0)
  })
})
