/**
 * CSW-01R / CSD-FE-01：Widget API 客户端单元测试（逐键对齐合同 v1 S3/S5）。
 *
 * 覆盖验收点：
 * - 路径全部落在相对同源 /api/v1/cs/widget/*（CSD-FE-01-A04）；
 * - 请求面绝不申报 organization/workspace（合同 S3：服务端派生键提供即 400）；
 * - bootstrap 逐键：public_widget_id + subject_id（无 org）；
 * - installation_id 只来自 bootstrap 成功响应体；
 * - 建会话逐键：installation_id（绝无 context/org 等自造键）；
 * - 消息：POST installation_id/body/client_msg_id；GET 查询 after_id/limit；
 * - rating 逐键：rating 1..5 + expected_version（CAS）；
 * - 凭证只走 x-cs-visit-token 头；URL 出现 token 形状直接拒绝；
 * - credentials: 'omit'（绝不携带 Cookie）。
 */
import { describe, expect, it } from 'bun:test'
import { WidgetApiClient, WidgetApiError, assertNoTokenInUrl } from './widgetApi'
import { toWidgetMessage } from './contract'

type RecordedRequest = { url: string; init: RequestInit }

/** CSX-01 冻结契约：assets:[{id,mime,size_bytes,file_name,status}]（后端
 * CS-BE-01 f342ac5b 实证形状；size_bytes 非 _id 整数，保持 number）。 */
const HISTORY_ASSETS = [
  { id: '72057594037928101', mime: 'image/png', size_bytes: 20480, file_name: '截图.png', status: 'active' },
  { id: '72057594037928102', mime: 'application/pdf', size_bytes: 1048576, file_name: '报表.pdf', status: 'active' },
]

/** 与后端投影一致的最小合同响应（bootstrap_view / create_session / message row）。 */
const BOOTSTRAP_PAYLOAD = {
  installation_id: '72057594037928001',
  public_widget_id: '72057594037928001',
  display_name: 'E2E 商城客服',
  consent_version: 'v1',
  branding: { display_name: 'E2E 商城客服', primary_color: '#2563eb', welcome_text: '您好' },
  contact_id: '72057594037928002',
  secret: 'e2e-visit-token-stub',
  expires_at: 1789600000000,
  reused: false,
}

const SESSION_PAYLOAD = {
  session_id: '72057594037927936',
  conversation_id: '72057594037927937',
  contact_id: '72057594037928002',
  workspace_id: '72057594037927938',
  installation_id: '72057594037928001',
  status: 'queued',
}

function makeFetchResponder(responder: (_url: string, _init: RequestInit) => unknown) {
  const requests: RecordedRequest[] = []
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const recorded = { url: String(input), init: (init ?? {}) as RequestInit }
    requests.push(recorded)
    const payload = responder(String(input), recorded.init)
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
      json: async () => ({ code: 0, msg: 'success', payload }),
    }
    return response as unknown as Response
  }
  return { requests, fetchImpl: fetchImpl as typeof fetch }
}

const INSTALLATION_ID = '72057594037928001'
const SCOPE = { installationId: INSTALLATION_ID }

function withBootstrap(responder: (_url: string, _init: RequestInit) => unknown) {
  return (url: string, init: RequestInit): unknown =>
    url.endsWith('/bootstrap') ? BOOTSTRAP_PAYLOAD : responder(url, init)
}

describe('bootstrap 逐键（合同 v1 S3）', () => {
  it('正文逐键 public_widget_id/subject_id（无 organization_id）；无 token 头；secret 成为准入凭证', async () => {
    const { requests, fetchImpl } = makeFetchResponder((url) =>
      url.endsWith('/bootstrap') ? BOOTSTRAP_PAYLOAD : {}
    )
    const api = new WidgetApiClient(fetchImpl)
    const result = await api.bootstrap({
      publicWidgetId: '72057594037928001',
      subjectId: 'subject-abc',
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('/api/v1/cs/widget/bootstrap')
    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>
    // 逐键断言：多一键/少一键都算合同回归（org/workspace 申报直接 400）
    expect(Object.keys(body).sort()).toEqual(['public_widget_id', 'subject_id'])
    expect(body.public_widget_id).toBe('72057594037928001')
    expect(body.subject_id).toBe('subject-abc')
    expect(JSON.stringify(body)).not.toContain('organization')
    expect((requests[0]?.init.headers as Record<string, string>)['x-cs-visit-token']).toBeUndefined()
    expect(result.visitToken).toBe('e2e-visit-token-stub')
    // installation_id 只来自 bootstrap 成功响应体（合同 S3）
    expect(result.installationId).toBe('72057594037928001')
    expect(result.contactId).toBe('72057594037928002')
    expect(result.branding.displayName).toBe('E2E 商城客服')
    // secret 绝不出现在渲染层（无 aria/文案面），也绝不入 URL
    expect(Object.keys(result)).not.toContain('secret')
  })
})

describe('会话/消息/评分逐键', () => {
  it('建会话正文逐键 installation_id（无 organization_id）；token 走头 + credentials omit', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) => (url === '/api/v1/cs/widget/sessions' ? SESSION_PAYLOAD : {}))
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    const session = await api.createSession(SCOPE)
    const request = requests.at(-1)
    expect(request?.url).toBe('/api/v1/cs/widget/sessions')
    expect((request?.init.headers as Record<string, string>)['x-cs-visit-token']).toBe('e2e-visit-token-stub')
    expect(request?.init.credentials).toBe('omit')
    const body = JSON.parse(String(request?.init.body)) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['installation_id'])
    expect(body.installation_id).toBe(INSTALLATION_ID)
    expect(JSON.stringify(body)).not.toContain('organization')
    expect(session.id).toBe('72057594037927936')
    expect(session.status).toBe('queued')
  })

  it('GET sessions 列表查询带 installation_id（version 供评分 CAS）', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) =>
        url === `/api/v1/cs/widget/sessions?installation_id=${INSTALLATION_ID}`
          ? [{ id: '72057594037927936', status: 'closed', version: 3 }]
          : {}
      )
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    const sessions = await api.listSessions(SCOPE)
    expect(requests.at(-1)?.url).toBe(`/api/v1/cs/widget/sessions?installation_id=${INSTALLATION_ID}`)
    expect(requests.at(-1)?.init.credentials).toBe('omit')
    expect(sessions[0]?.version).toBe(3)
  })

  it('历史 GET：查询 installation_id/after_id 键集；载荷=裸数组', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) => {
        // 列表 URL 带 installation_id/after_id 查询串，先剥查询再匹配路径
        if (url.split('?')[0]?.endsWith('/messages')) {
          return [
            {
              id: '72057594037927940',
              sender_type: 'contact',
              sender_contact_id: '72057594037928002',
              client_msg_id: 'cm1',
              body_cipher: 'AAEq..',
              version: 1,
              created_at: '2026-09-16T00:00:00Z',
            },
          ]
        }
        return {}
      })
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    const messages = await api.listMessages('72057594037927936', SCOPE, '72057594037927939')
    const request = requests.at(-1)
    expect(request?.url).toBe(
      `/api/v1/cs/widget/sessions/72057594037927936/messages?installation_id=${INSTALLATION_ID}&after_id=72057594037927939`
    )
    expect(request?.init.credentials).toBe('omit')
    expect(Array.isArray(messages)).toBe(true)
    expect(messages[0]?.senderType).toBe('contact')
    expect(messages[0]?.body).toBeNull()
  })

  it('发消息 POST 正文逐键 installation_id+client_msg_id+body（无 organization_id）', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) =>
        url.endsWith('/messages')
          ? {
              id: '72057594037927940',
              sender_type: 'contact',
              sender_contact_id: '72057594037928002',
              client_msg_id: 'cm1',
              body_cipher: 'AAEq..',
              version: 1,
              created_at: '2026-09-16T00:00:00Z',
            }
          : {}
      )
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    await api.sendMessage('72057594037927936', SCOPE, 'cm1', 'hi')
    const request = requests.at(-1)
    expect(request?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/messages')
    const body = JSON.parse(String(request?.init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['body', 'client_msg_id', 'installation_id'])
    expect(JSON.stringify(body)).not.toContain('organization')
    expect(body.client_msg_id).toBe('cm1')
  })

  it('评分 POST 正文逐键 installation_id+rating+expected_version；rating 限 1..5', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) => (url.endsWith('/rating') ? { id: '72057594037927936', status: 'closed', rating: 5, version: 4 } : {}))
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    await api.submitRating('72057594037927936', SCOPE, 5, 3)
    const request = requests.at(-1)
    expect(request?.url).toBe('/api/v1/cs/widget/sessions/72057594037927936/rating')
    const body = JSON.parse(String(request?.init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['expected_version', 'installation_id', 'rating'])
    expect(body.rating).toBe(5)
    expect(body.expected_version).toBe(3)
    await expect(api.submitRating('72057594037927936', SCOPE, 0, 3)).rejects.toBeInstanceOf(WidgetApiError)
    await expect(api.submitRating('72057594037927936', SCOPE, 6, 3)).rejects.toBeInstanceOf(WidgetApiError)
    // 缺有效 expected_version（CAS）直接拒绝——D1 第三项的回归锁
    await expect(api.submitRating('72057594037927936', SCOPE, 5, 0)).rejects.toBeInstanceOf(WidgetApiError)
  })
})

describe('凭证传输纪律（CSD-FE-01-A04 / 合同 S5）', () => {
  it('URL 查询串出现 token 形状直接拒绝（后端 400 语义前置）', () => {
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions?visit_token=x')).toThrow(WidgetApiError)
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions?token=x')).toThrow(WidgetApiError)
    expect(() => assertNoTokenInUrl('/api/v1/cs/widget/sessions/1/messages?after_id=1')).not.toThrow()
  })

  it('token 永不出现在 URL（所有客户端方法）；查询串只有 installation_id 等白名单键', async () => {
    const { requests, fetchImpl } = makeFetchResponder(
      withBootstrap((url) => (url.includes('/sessions?') ? [] : {}))
    )
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    await api.listSessions(SCOPE)
    for (const request of requests) {
      expect(/token/i.test(request.url)).toBe(false)
      expect(request.url.startsWith('/api/v1/cs/widget')).toBe(true)
      expect(request.init.credentials).toBe('omit')
    }
  })
})

/** P1-E2E-01 实证缺陷修复回归：单发响应 {message:{...}} 嵌套与裸消息两形兼容。 */
describe('toWidgetMessage 载荷形状', () => {
  const NAKED = {
    id: '72057594037928010',
    sender_type: 'contact',
    sender_contact_id: '72057594037928002',
    client_msg_id: 'cm-1',
    body: '你好',
    created_at: '1789600000',
  }

  it('裸消息形状（历史行）解析成功', () => {
    expect(toWidgetMessage(NAKED)).not.toBeNull()
    expect(toWidgetMessage(NAKED)?.id).toBe(NAKED.id)
  })

  it('嵌套形状（POST 单发响应 payload={message:{...}}）解析成功', () => {
    const nested = { message: NAKED }
    expect(toWidgetMessage(nested)).not.toBeNull()
    expect(toWidgetMessage(nested)?.body).toBe('你好')
    expect(toWidgetMessage(nested)?.clientMsgId).toBe('cm-1')
  })

  it('两形之外（缺 id / 非对象）一律 null（fail-closed）', () => {
    expect(toWidgetMessage({ message: { sender_type: 'contact' } })).toBeNull()
    expect(toWidgetMessage(null)).toBeNull()
  })
})

/** CS-WGT-01：历史附件投影（CSX-01 冻结契约）——刷新/SSE 补偿读回的附件
 * 真源，此前 toWidgetMessage 无 assets 键导致附件只活在乐观态（断链）。 */
describe('toWidgetMessage 历史附件投影（CS-WGT-01）', () => {
  const IMAGE_ASSET = HISTORY_ASSETS[0] as { id: string; mime: string; size_bytes: number; file_name: string; status: string }

  function rowWith(assets: unknown): unknown {
    return {
      id: '72057594037928010',
      sender_type: 'business_identity',
      sender_contact_id: null,
      client_msg_id: null,
      body: null,
      created_at: '1789600000',
      assets,
    }
  }

  it('assets 五键白名单逐键解析（id/mime/size_bytes/file_name/status）', () => {
    const message = toWidgetMessage(rowWith(HISTORY_ASSETS))
    expect(message).not.toBeNull()
    expect(message?.assets).toHaveLength(2)
    const image = message?.assets[0]
    expect(image?.id).toBe('72057594037928101')
    expect(image?.mime).toBe('image/png')
    expect(image?.sizeBytes).toBe(20480)
    expect(image?.fileName).toBe('截图.png')
    expect(image?.status).toBe('active')
  })

  it('纯文本消息：缺 assets 键与 assets=[] 都投影为 assets=[]（键语义=空列表）', () => {
    const missing = toWidgetMessage(rowWith(undefined))
    expect(missing?.assets).toEqual([])
    const empty = toWidgetMessage(rowWith([]))
    expect(empty?.assets).toEqual([])
  })

  it('非法元素 fail-closed 丢弃（缺 id/非对象）；非数组视为 []', () => {
    const mixed = toWidgetMessage(rowWith([IMAGE_ASSET, { mime: 'image/png' }, 'junk', null]))
    expect(mixed?.assets).toHaveLength(1)
    expect(mixed?.assets[0]?.id).toBe(IMAGE_ASSET.id)
    expect(toWidgetMessage(rowWith('not-array'))?.assets).toEqual([])
  })

  it('嵌套 {message:{assets}} 形（POST 回显绑定资产）同样解析', () => {
    const nested = toWidgetMessage({ message: rowWith([IMAGE_ASSET]) })
    expect(nested?.assets).toHaveLength(1)
    expect(nested?.assets[0]?.fileName).toBe('截图.png')
  })

  it('投影输出绝不含 object_key/upload_url/token 形状（安全白名单）', () => {
    const poisoned = toWidgetMessage(
      rowWith([
        {
          ...IMAGE_ASSET,
          object_key: 's3/tenant/secret-key.bin',
          upload_url: 'https://storage.example/signed?token=abc',
          token: 'must-not-project',
        },
      ])
    )
    const serialized = JSON.stringify(poisoned?.assets)
    expect(serialized).not.toContain('object_key')
    expect(serialized).not.toContain('upload_url')
    expect(serialized).not.toContain('token')
  })
})

/** CS-WGT-01：附件内容授权代理（visit token 只走 header；URL 零凭证）。 */
describe('fetchAssetContent 授权内容代理（CS-WGT-01）', () => {
  it('GET /sessions/:id/assets/:asset/content：token 走 x-cs-visit-token 头、URL 零凭证、credentials omit、返回原始 Response', async () => {
    const { requests, fetchImpl } = makeFetchResponder(withBootstrap(() => ({})))
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' })
    const response = await api.fetchAssetContent('72057594037927936', '72057594037928101', SCOPE)
    const request = requests.at(-1)
    expect(request?.url).toBe(
      `/api/v1/cs/widget/sessions/72057594037927936/assets/72057594037928101/content?installation_id=${INSTALLATION_ID}`
    )
    expect(request?.init.method).toBe('GET')
    expect((request?.init.headers as Record<string, string>)['x-cs-visit-token']).toBe('e2e-visit-token-stub')
    expect(request?.init.credentials).toBe('omit')
    expect(/token/i.test(String(request?.url))).toBe(false)
    // 原始 Response 透传（二进制流由调用方消费；不经 JSON 信封面）
    expect(response.ok).toBe(true)
  })

  it('HTTP 200 JSON 错误信封不得作为文件返回', async () => {
    const api = new WidgetApiClient(async () => new Response('{"code":902,"payload":{}}', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(api.fetchAssetContent('72057594037927936', '72057594037928101', SCOPE))
      .rejects.toBeInstanceOf(WidgetApiError)
  })

  it('非 2xx → WidgetApiError 且携带 HTTP status（fail-closed，不伪成功）', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
    const api = new WidgetApiClient(fetchImpl)
    await api.bootstrap({ publicWidgetId: '72057594037928001', subjectId: 's1' }).catch(() => undefined)
    try {
      await api.fetchAssetContent('72057594037927936', '72057594037928101', SCOPE)
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetApiError)
      expect((error as WidgetApiError).status).toBe(404)
    }
  })
})
