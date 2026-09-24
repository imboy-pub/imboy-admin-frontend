/**
 * FE-W01：Widget 控制器单元测试（宿主 IO 注入）。
 *
 * 覆盖验收点：
 * - FE-W01-A03 consent 拒绝链：拒绝 → 不建会话/不发消息/清 visit 恢复存储；
 * - FE-W01-A05 reload 恢复：同一 installation 短期匿名 subject 复用；
 *   吊销(401/403)/关闭 → 存储清理；
 * - postMessage：source 必须是 parent；首个可信消息锁定 origin，其后异源忽略；
 * - §3.6 SSE：信封消费、event_id 去重、resync.required 清游标全量权威刷新；
 *   visit token 不进 URL、不进存储。
 */
import { describe, expect, it } from 'bun:test'
import { createWidgetController, type ControllerIo, type StreamHandle } from './controller'
import { WidgetApiClient } from './widgetApi'
import { subjectStorageKey, type StorageLike } from './visitStorage'
import type { SseEvent } from './eventStream'

type Recorded = { url: string; method: string; body: unknown; headers: Record<string, string> }

const WIDGET_ID = '72057594037928001'
const SCOPE_KEY = subjectStorageKey({ widgetId: WIDGET_ID })

/** CS-WGT-01：历史消息行（含 CSX-01 冻结契约 assets 投影）。 */
const HISTORY_WITH_ASSETS = [
  {
    id: '72057594037927940',
    sender_type: 'business_identity',
    sender_contact_id: null,
    client_msg_id: null,
    body: '请看这张截图',
    created_at: '2026-09-16T00:00:00Z',
    assets: [
      { id: '72057594037928101', mime: 'image/png', size_bytes: 20480, file_name: '截图.png', status: 'active' },
      { id: '72057594037928102', mime: 'application/pdf', size_bytes: 1048576, file_name: '报表.pdf', status: 'active' },
    ],
  },
]

function memoryStorage(): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map.entries()),
  }
}

function makeEnv(
  opts: {
    consentVersion?: string
    messagesStatus?: number
    sessionsStatus?: string
    history?: unknown[]
    assetContentStatus?: number
    assetContentBody?: string
  } = {}
) {
  const requests: Recorded[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    let body: unknown = null
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    requests.push({ url, method, body, headers: (init?.headers ?? {}) as Record<string, string> })
    let payload: unknown = {}
    let ok = true
    let status = 200
    if (method === 'POST' && url.includes('/bootstrap')) {
      payload = {
        installation_id: '72057594037928001',
        public_widget_id: WIDGET_ID,
        display_name: 'E2E 商城客服',
        consent_version: opts.consentVersion ?? '',
        branding: { display_name: 'E2E 商城客服', primary_color: '#2563eb' },
        contact_id: '72057594037928002',
        secret: 'visit-token-stub-DO-NOT-PERSIST',
        expires_at: 1789600000000,
        reused: false,
      }
    } else if (method === 'POST' && url.includes('/sessions') && !url.includes('/messages')) {
      payload = { session_id: '72057594037927936', status: 'queued' }
    } else if (method === 'GET' && url.includes('/assets/') && url.includes('/content')) {
      // 授权内容代理：二进制面（不走 JSON 信封）；字节由 blob() 消费。
      ok = (opts.assetContentStatus ?? 200) < 400
      status = opts.assetContentStatus ?? 200
      const bytes = opts.assetContentBody ?? 'asset-bytes'
      const respond = {
        ok,
        status,
        json: async () => ({ code: 0, msg: 'success', payload: {} }),
        blob: async () => new Blob([bytes], { type: 'application/octet-stream' }),
      }
      return respond as unknown as Response
    } else if (method === 'GET' && url.includes('/sessions') && !url.includes('/messages')) {
      payload = [{ id: '72057594037927936', status: opts.sessionsStatus ?? 'active', version: 3 }]
    } else if (method === 'GET' && url.includes('/messages')) {
      if (opts.messagesStatus === 401) {
        ok = false
        status = 401
      } else {
        payload = opts.history ?? []
      }
    }
    const respond = { ok, status, json: async () => ({ code: 0, msg: 'success', payload }) }
    return respond as unknown as Response
  }) as typeof fetch
  return { requests, fetchImpl }
}

type Harness = ReturnType<typeof makeHarness>

function makeHarness(
  opts: {
    consentVersion?: string
    messagesStatus?: number
    history?: unknown[]
    assetContentStatus?: number
    assetContentBody?: string
  } = {},
  injectedStorage?: StorageLike
) {
  const env = makeEnv(opts)
  const storage = injectedStorage ?? memoryStorage()
  const posted: Record<string, unknown>[] = []
  const rendered: string[] = []
  const downloads: Array<{ blob: Blob; fileName: string }> = []
  const objectUrls: string[] = []
  const revokedUrls: string[] = []
  const streams: Array<{ path: string; token: () => string; onEvent: (_e: SseEvent) => void; onStatus: (_s: string) => void }> = []
  const io: ControllerIo = {
    render: (state) => rendered.push(state.phase),
    downloadFile: (blob, fileName) => void downloads.push({ blob, fileName }),
    postToHost: (message) => void posted.push(message),
  }
  let clock = 1_000_000
  let urlSeq = 0
  const streamFactory = (o: (typeof streams)[number]): StreamHandle => {
    streams.push(o)
    return { start: () => undefined, stop: () => undefined }
  }
  const controller = createWidgetController({
    api: new WidgetApiClient(env.fetchImpl),
    storage,
    nowMs: () => (clock += 1000),
    newId: (() => {
      let n = 0
      return () => `gen-${(n += 1)}`
    })(),
    fetchImpl: env.fetchImpl,
    createObjectUrl: () => {
      const url = `blob:stub-${(urlSeq += 1)}`
      objectUrls.push(url)
      return url
    },
    revokeObjectUrl: (url) => void revokedUrls.push(url),
    io,
    streamFactory,
  })
  const settle = async (rounds = 6): Promise<void> => {
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const hostContext = (origin = 'https://shop.example', sourceIsParent = true): void => {
    controller.handleHostMessage(
      origin,
      sourceIsParent,
      {
        source: 'imboy-cs-widget',
        type: 'host-context',
        widgetId: WIDGET_ID,
        locale: 'zh-CN',
        page: { origin, path: '/products' },
      },
    )
  }
  const envelopeFrame = (eventId: string, type: string, overrides: Record<string, unknown> = {}): SseEvent => ({
    id: eventId,
    event: 'message',
    data: JSON.stringify({
      event_id: eventId,
      type,
      organization_id: '1234567890123456789',
      workspace_id: '1234567890123456788',
      resource_type: 'message',
      resource_id: '72057594037927999',
      resource_version: 1,
      occurred_at: '2026-09-20T08:00:00Z',
      reason: 'created',
      ...overrides,
    }),
  })
  return { controller, env, storage, posted, rendered, streams, downloads, objectUrls, revokedUrls, settle, hostContext, envelopeFrame }
}

async function reachConsent(harness: Harness): Promise<void> {
  harness.hostContext()
  await harness.settle()
}

async function reachChat(harness: Harness): Promise<void> {
  await reachConsent(harness)
  harness.controller.acceptConsent()
  await harness.settle()
}

describe('postMessage 校验（source + origin 锁定）', () => {
  it('source 非 parent 的消息一律忽略（不触发 bootstrap）', async () => {
    const h = makeHarness()
    h.hostContext('https://shop.example', false)
    await h.settle()
    expect(h.controller.currentTrustedOrigin()).toBeNull()
    expect(h.env.requests.some((r) => r.url.includes('/bootstrap'))).toBe(false)
  })

  it('首个可信消息锁定 origin；此后异源消息（含 host-context/panel）一律忽略', async () => {
    const h = makeHarness()
    h.hostContext('https://shop.example')
    await h.settle()
    expect(h.controller.currentTrustedOrigin()).toBe('https://shop.example')
    const callsBefore = h.env.requests.length
    // 异源：不触发新 bootstrap，也不改变面板可见性
    h.controller.handleHostMessage('https://evil.example', true, {
      source: 'imboy-cs-widget',
      type: 'host-context',
      widgetId: WIDGET_ID,
      locale: 'zh-CN',
      page: { origin: 'https://evil.example', path: '/' },
    })
    h.controller.handleHostMessage('https://evil.example', true, { source: 'imboy-cs-widget', type: 'panel', open: false })
    await h.settle()
    expect(h.env.requests.length).toBe(callsBefore)
    // 同源 panel：接受（posted 出现 unread 上报）
    h.controller.handleHostMessage('https://shop.example', true, { source: 'imboy-cs-widget', type: 'panel', open: false })
    expect(h.posted.some((m) => m.type === 'unread')).toBe(true)
  })
})

describe('consent 链（FE-W01-A03）', () => {
  it('拒绝链：不建会话、不发消息、visit 恢复存储被清理；拒绝后 sendMessage 无外呼', async () => {
    const h = makeHarness({ consentVersion: 'v1' })
    await reachConsent(h)
    expect(h.controller.currentState().phase).toBe('consent')
    // bootstrap 已发生（服务端已知 contact），但绝无 session/messages
    expect(h.env.requests.some((r) => r.url.includes('/sessions'))).toBe(false)
    h.controller.declineConsent()
    expect(h.controller.currentState().phase).toBe('notice-rejected')
    expect(h.storage.dump()[SCOPE_KEY]).toBeUndefined()
    const callsBefore = h.env.requests.length
    await h.controller.sendMessage('你好')
    await h.controller.sendAttachment(new Blob(['x'], { type: 'text/plain' }))
    await h.settle()
    expect(h.env.requests.length).toBe(callsBefore)
  })

  it('接受链：建会话 → 历史 → SSE 启动；subject 落盘为安装作用域键（不含 token/JWT）', async () => {
    const h = makeHarness({ consentVersion: 'v1' })
    await reachChat(h)
    expect(h.controller.currentState().phase).toBe('chat')
    expect(h.env.requests.some((r) => r.method === 'POST' && r.url.includes('/sessions'))).toBe(true)
    expect(h.streams).toHaveLength(1)
    expect(h.streams[0]?.path).not.toContain('visit-token-stub')
    expect(h.streams[0]?.token()).toBe('visit-token-stub-DO-NOT-PERSIST')
    const dump = h.storage.dump()
    const keys = Object.keys(dump)
    expect(keys).toEqual([SCOPE_KEY])
    expect(JSON.stringify(dump)).not.toContain('visit-token-stub')
    expect(JSON.stringify(dump)).not.toContain('eyJ')
  })
})

describe('reload 恢复与吊销/退出清理（FE-W01-A05）', () => {
  it('同一 installation 重开复用短期 subject（bootstrap body subject_id 一致；正文逐键无 org）', async () => {
    const h = makeHarness()
    await reachChat(h)
    const firstSubject = h.controller.currentSubjectId()
    expect(firstSubject.length).toBeGreaterThan(0)
    // bootstrap 正文逐键 = {public_widget_id, subject_id}：请求面绝不申报 org（合同 S3）
    const firstBootstrap = h.env.requests.find((r) => r.url.includes('/bootstrap'))?.body as Record<string, unknown>
    expect(Object.keys(firstBootstrap).sort()).toEqual(['public_widget_id', 'subject_id'])
    expect(firstBootstrap.public_widget_id).toBe(WIDGET_ID)
    expect(JSON.stringify(firstBootstrap)).not.toContain('organization')

    // 模拟同源 iframe 的 sessionStorage：第二轮控制器共享第一轮存储
    const h2 = makeHarness({}, h.storage)
    h2.hostContext()
    await h2.settle()
    expect(h2.controller.currentState().phase).toBe('chat')
    const bootstrapBody = h2.env.requests.find((r) => r.url.includes('/bootstrap'))?.body as { subject_id: string }
    expect(bootstrapBody.subject_id).toBe(firstSubject)
  })

  it('吊销（历史读面 401）→ visit 恢复存储清理 + error 状态上报', async () => {
    const h = makeHarness({ messagesStatus: 401 })
    h.hostContext()
    await h.settle()
    h.controller.acceptConsent()
    await h.settle()
    expect(h.storage.dump()[SCOPE_KEY]).toBeUndefined()
    expect(h.posted.some((m) => m.type === 'status' && m.state === 'error')).toBe(true)
  })

  it('退出（关闭聊天）→ 存储清理 + close 上报宿主', async () => {
    const h = makeHarness()
    await reachChat(h)
    expect(h.storage.dump()[SCOPE_KEY]).toBeDefined()
    h.controller.closeAndCleanup()
    expect(h.storage.dump()[SCOPE_KEY]).toBeUndefined()
    expect(h.posted.some((m) => m.type === 'close')).toBe(true)
  })
})

describe('§3.6 SSE 消费（去重 / resync / 权威刷新）', () => {
  it('resync.required → 游标清空全量刷新（无 after_id）+ 会话状态权威刷新', async () => {
    const h = makeHarness()
    await reachChat(h)
    const messageCalls = (): number => h.env.requests.filter((r) => r.url.includes('/messages')).length
    const before = messageCalls()
    await h.controller.handleSseFrame(h.envelopeFrame('e1', 'resync.required', { resource_type: 'session', resource_id: null }))
    await h.settle()
    const resyncCalls = h.env.requests.slice(before).filter((r) => r.url.includes('/messages'))
    expect(resyncCalls.length).toBeGreaterThan(0)
    expect(resyncCalls[0]?.url).not.toContain('after_id=')
    expect(h.env.requests.slice(before).some((r) => /\/sessions\?/.test(r.url))).toBe(true)
  })

  it('message.appended 触发权威刷新；重复 event_id 去重不重复刷新', async () => {
    const h = makeHarness()
    await reachChat(h)
    const messageCalls = (): number => h.env.requests.filter((r) => r.url.includes('/messages')).length
    const before = messageCalls()
    await h.controller.handleSseFrame(h.envelopeFrame('e2', 'message.appended'))
    await h.settle()
    expect(messageCalls()).toBe(before + 1)
    await h.controller.handleSseFrame(h.envelopeFrame('e2', 'message.appended'))
    await h.settle()
    expect(messageCalls()).toBe(before + 1)
  })

  it('同一轮询批次的多帧：读窗口用推进前游标，不得跳过中间消息（A03 实证丢帧回归）', async () => {
    const h = makeHarness()
    await reachChat(h)
    const before = h.env.requests.filter((r) => r.url.includes('/messages')).length
    // 服务端一个 poll 批次的两帧在同一同步循环派发：m2(id=…800)、m3(id=…801)。
    // EventStream 的 onEvent 是 fire-and-forget——不 await 前一帧，模拟真实
    // 同批派发；若先推进 lastCursor 再增量读，第一条帧的读窗口（after=m2）
    // 会永久跳过 m2。
    h.controller.handleSseFrame({ id: '72057594037927999', event: 'message', data: JSON.stringify({ id: '72057594037927999' }) })
    h.controller.handleSseFrame({ id: '72057594037928000', event: 'message', data: JSON.stringify({ id: '72057594037928000' }) })
    await h.settle()
    const batch = h.env.requests.slice(before).filter((r) => r.url.includes('/messages'))
    expect(batch.length).toBeGreaterThanOrEqual(2)
    // 每次增量读的 after 都必须小于第一条帧的消息 id——读窗口覆盖全部新消息
    // （无 after_id 的全量读同样满足覆盖语义，跳过）。
    for (const call of batch) {
      const after = new URL(call.url, 'http://localhost').searchParams.get('after_id')
      if (after !== null) expect(BigInt(after) < BigInt('72057594037927999')).toBe(true)
    }
  })

  it('widget 面兼容帧：state(closed) → 评分相位；message 帧触发历史刷新', async () => {
    const h = makeHarness()
    await reachChat(h)
    await h.controller.handleSseFrame({
      id: '72057594037927999',
      event: 'state',
      data: JSON.stringify({ resource: 'cs.session', session_id: '72057594037927936', status: 'closed' }),
    })
    expect(h.controller.currentState().phase).toBe('closed-rating')
    const before = h.env.requests.filter((r) => r.url.includes('/messages')).length
    await h.controller.handleSseFrame({ id: '72057594037928000', event: 'message', data: JSON.stringify({ id: '72057594037928000' }) })
    await h.settle()
    expect(h.env.requests.filter((r) => r.url.includes('/messages')).length).toBe(before + 1)
  })

  it('session.changed 信封 → 会话状态权威刷新（closed 后进入评分相位）', async () => {
    const h = makeHarness({ sessionsStatus: 'closed' })
    await reachChat(h)
    await h.controller.handleSseFrame(h.envelopeFrame('e3', 'session.changed', { resource_type: 'session', resource_id: '72057594037927936' }))
    await h.settle()
    expect(h.controller.currentState().phase).toBe('closed-rating')
  })
})

/** CS-WGT-01：历史附件与图片体验（断链修复——附件不再只活在乐观态）。 */
describe('历史附件投影与授权内容（CS-WGT-01）', () => {
  it('历史消息 assets 进入消息状态；SSE message.appended 重读后附件仍在（id 去重不重复）', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS })
    await reachChat(h)
    const messages = h.controller.currentState().messages
    expect(messages).toHaveLength(1)
    const assets = messages[0]?.attachments
    expect(assets).toHaveLength(2)
    expect(assets?.[0]).toMatchObject({ assetId: '72057594037928101', name: '截图.png', mime: 'image/png', sizeBytes: 20480, state: 'linked' })
    expect(assets?.[1]).toMatchObject({ assetId: '72057594037928102', name: '报表.pdf', state: 'linked' })
    // SSE 补偿读（message.appended 触发权威刷新）：同 id 去重，附件仍在。
    await h.controller.handleSseFrame(h.envelopeFrame('e9', 'message.appended'))
    await h.settle()
    const after = h.controller.currentState().messages
    expect(after).toHaveLength(1)
    expect(after[0]?.attachments).toHaveLength(2)
  })

  it('纯文本历史消息（assets=[]）attachments 为空数组；状态 JSON 无 token/secret', async () => {
    const h = makeHarness({
      history: [{ id: '72057594037927941', sender_type: 'contact', sender_contact_id: '72057594037928002', client_msg_id: 'cm-9', body: '你好', created_at: '2026-09-16T00:00:00Z', assets: [] }],
    })
    await reachChat(h)
    const messages = h.controller.currentState().messages
    expect(messages[0]?.attachments).toEqual([])
    expect(JSON.stringify(h.controller.currentState())).not.toContain('visit-token-stub')
  })

  it('图片缩略自动水合：授权代理 GET /assets/:id/content（token 只走头；URL 零凭证）→ blob: URL', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS })
    await reachChat(h)
    await h.settle(10)
    const contentCalls = h.env.requests.filter((r) => r.url.includes('/assets/72057594037928101/content'))
    expect(contentCalls.length).toBeGreaterThanOrEqual(1)
    const call = contentCalls[0]
    expect(call?.url).toContain('installation_id=72057594037928001')
    expect(call?.url.startsWith('/api/v1/cs/widget/sessions/72057594037927936/assets/')).toBe(true)
    expect(call?.headers['x-cs-visit-token']).toBe('visit-token-stub-DO-NOT-PERSIST')
    expect(call?.method).toBe('GET')
    const image = h.controller.currentState().messages[0]?.attachments[0]
    expect(image?.thumbnailUrl).toMatch(/^blob:stub-\d+$/)
    expect(image?.content).toBe('ready')
    // 非图片附件不预取（只有图片缩略走自动水合）
    expect(h.env.requests.some((r) => r.url.includes('/assets/72057594037928102/content'))).toBe(false)
    // 任何请求 URL 都不含 token 形状
    for (const request of h.env.requests) expect(/token/i.test(request.url)).toBe(false)
  })

  it('非图片附件下载：openAttachment → 授权 fetch → io.downloadFile 收到 blob+文件名（不经裸 URL）', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS })
    await reachChat(h)
    await h.settle(10)
    const message = h.controller.currentState().messages[0]
    await h.controller.openAttachment(message?.key ?? '', '72057594037928102')
    await h.settle(4)
    expect(h.downloads).toHaveLength(1)
    expect(h.downloads[0]?.fileName).toBe('报表.pdf')
    expect(await h.downloads[0]?.blob.text()).toBe('asset-bytes')
    const pdf = h.controller.currentState().messages[0]?.attachments[1]
    expect(pdf?.content).toBe('ready')
    expect(h.env.requests.some((r) => r.url.includes('/assets/72057594037928102/content'))).toBe(true)
  })

  it('图片大图预览：openAttachment（缩略已就绪）→ preview 持 blob: URL；closePreview 清空', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS })
    await reachChat(h)
    await h.settle(10)
    const message = h.controller.currentState().messages[0]
    await h.controller.openAttachment(message?.key ?? '', '72057594037928101')
    const preview = h.controller.currentState().preview
    expect(preview).not.toBeNull()
    expect(preview?.objectUrl).toMatch(/^blob:stub-\d+$/)
    expect(preview?.fileName).toBe('截图.png')
    expect(preview?.mime).toBe('image/png')
    h.controller.closePreview()
    expect(h.controller.currentState().preview).toBeNull()
  })

  it('附件内容 404 → content=error（fail-closed 不崩溃、不伪成功）', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS, assetContentStatus: 404 })
    await reachChat(h)
    await h.settle(10)
    const image = h.controller.currentState().messages[0]?.attachments[0]
    expect(image?.content).toBe('error')
    expect(image?.thumbnailUrl).toBeNull()
    expect(h.controller.currentState().phase).toBe('chat')
  })

  it('退出清理：closeAndCleanup 释放全部 blob: URL', async () => {
    const h = makeHarness({ history: HISTORY_WITH_ASSETS })
    await reachChat(h)
    await h.settle(10)
    expect(h.objectUrls.length).toBeGreaterThanOrEqual(1)
    h.controller.closeAndCleanup()
    expect(h.revokedUrls).toEqual(h.objectUrls)
  })
})
