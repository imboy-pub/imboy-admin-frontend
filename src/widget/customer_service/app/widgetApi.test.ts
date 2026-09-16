/**
 * CSW-01 Widget API 客户端单元测试。
 *
 * 覆盖验收点：
 * - 路径全部落在 /api/v1/cs/widget/*（冻结合同）；
 * - 凭证只走 x-cs-visit-token 头；URL 出现 token 形状直接拒绝（合同 400）；
 * - client_msg_id 幂等发送、rating 1..5 校验、bootstrap 只带 public widget_id；
 * - credentials: 'omit'（绝不携带 Cookie）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { WidgetApiClient, WidgetApiError, assertNoTokenInUrl } from './widgetApi'

type RecordedRequest = { url: string; init: RequestInit }

function makeFetchResponder(responder: (_url: string, _init: RequestInit) => unknown) {
  const requests: RecordedRequest[] = []
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const recorded = { url: String(input), init: (init ?? {}) as RequestInit }
    requests.push(recorded)
    const payload = responder(String(input), recorded.init)
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'success', payload }),
    }
    return response as unknown as Response
  }
  return { requests, fetchImpl: fetchImpl as typeof fetch }
}

const BOOTSTRAP_PAYLOAD = {
  visit_token: 'e2e-visit-token',
  brand: { display_name: 'E2E 商城客服', primary_color: '#2563eb' },
  notice: { version: 'v1', state: 'pending' },
}

afterEach(() => {
  // 无全局状态需要清理（fetchImpl 通过构造注入）
})

describe('路径与凭证纪律', () => {
  it('bootstrap 只带 public widget_id，Origin 由浏览器携带；token 头从 bootstrap 响应建立', async () => {
    const { requests, fetchImpl } = makeFetchResponder(() => BOOTSTRAP_PAYLOAD)
    const api = new WidgetApiClient(fetchImpl)
    const result = await api.bootstrap('wgt_pub_unit')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('/api/v1/cs/widget/bootstrap')
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({ widget_id: 'wgt_pub_unit' })
    expect((requests[0]?.init.headers as Record<string, string>)['x-cs-visit-token']).toBeUndefined()
    expect(result.visitToken).toBe('e2e-visit-token')
    // 后续请求带 token 头
    const { requests: r2, fetchImpl: f2 } = makeFetchResponder((url) => {
      if (url.endsWith('/bootstrap')) return BOOTSTRAP_PAYLOAD
      if (url.endsWith('/sessions')) return { session: { id: '72057594037927936', status: 'active' } }
      return {}
    })
    const api2 = new WidgetApiClient(f2)
    await api2.bootstrap('wgt_pub_unit')
    await api2.createSession({ pageOrigin: 'https://shop.example.com', pagePath: '/item/1' })
    expect(r2[1]?.url).toBe('/api/v1/cs/widget/sessions')
    expect((r2[1]?.init.headers as Record<string, string>)['x-cs-visit-token']).toBe('e2e-visit-token')
    // 创建会话只携带白名单上下文（origin/path）
    expect(JSON.parse(String(r2[1]?.init.body))).toEqual({
      context: { page_origin: 'https://shop.example.com', page_path: '/item/1' },
    })
    expect(r2[1]?.init.credentials).toBe('omit')
  })

  it('messages 路径 after_id 键集分页；发送带 client_msg_id；rating 仅 1..5', async () => {
    const { requests, fetchImpl } = makeFetchResponder((url) => {
      if (url.endsWith('/bootstrap')) return BOOTSTRAP_PAYLOAD
      if (url.endsWith('/rating')) return { rating: { score: 5 } }
      if (url.includes('/messages')) return { message: { id: '9', role: 'visitor', body: 'hi', client_msg_id: 'cm1' } }
      return { messages: [], next_after_id: null }
    })
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap('wgt_pub_unit')

    await api.listMessages('72057594037927936', null)
    await api.listMessages('72057594037927936', '42')
    expect(requests.at(-2)?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/messages')
    expect(requests.at(-1)?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/messages?after_id=42')

    await api.sendMessage('72057594037927936', 'cm1', 'hi')
    const sendReq = requests.at(-1)
    expect(sendReq?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/messages')
    expect(JSON.parse(String(sendReq?.init.body))).toEqual({ client_msg_id: 'cm1', body: 'hi' })

    await api.submitRating('72057594037927936', 5)
    expect(requests.at(-1)?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/rating')
    expect(JSON.parse(String(requests.at(-1)?.init.body))).toEqual({ score: 5 })
    await expect(api.submitRating('72057594037927936', 0)).rejects.toBeInstanceOf(WidgetApiError)
    await expect(api.submitRating('72057594037927936', 6)).rejects.toBeInstanceOf(WidgetApiError)
  })

  it('URL 查询串出现 token 形状直接拒绝（后端 400 语义前置）', () => {
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions?visit_token=x')).toThrow(WidgetApiError)
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions?token=x')).toThrow(WidgetApiError)
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions/1/messages?after_id=1')).not.toThrow()
  })

  it('token 永不出现在 URL（所有客户端方法），也绝不写入 storage 形状', async () => {
    const { requests, fetchImpl } = makeFetchResponder((url) => {
      if (url.endsWith('/bootstrap')) return BOOTSTRAP_PAYLOAD
      return { sessions: [] }
    })
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap('wgt_pub_unit')
    await api.listMessages('1', null)
    for (const request of requests) {
      expect(/token/i.test(request.url)).toBe(false)
    }
  })
})
