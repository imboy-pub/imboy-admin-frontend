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

type Recorded = { url: string; method: string; body: unknown }

const WIDGET_ID = '72057594037928001'
const SCOPE_KEY = subjectStorageKey({ widgetId: WIDGET_ID })

function memoryStorage(): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map.entries()),
  }
}

function makeEnv(opts: { consentVersion?: string; messagesStatus?: number; sessionsStatus?: string } = {}) {
  const requests: Recorded[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    let body: unknown = null
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    requests.push({ url, method, body })
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
    } else if (method === 'GET' && url.includes('/sessions') && !url.includes('/messages')) {
      payload = [{ id: '72057594037927936', status: opts.sessionsStatus ?? 'active', version: 3 }]
    } else if (method === 'GET' && url.includes('/messages')) {
      if (opts.messagesStatus === 401) {
        ok = false
        status = 401
      } else {
        payload = []
      }
    }
    const respond = { ok, status, json: async () => ({ code: 0, msg: 'success', payload }) }
    return respond as unknown as Response
  }) as typeof fetch
  return { requests, fetchImpl }
}

type Harness = ReturnType<typeof makeHarness>

function makeHarness(opts: { consentVersion?: string; messagesStatus?: number } = {}, injectedStorage?: StorageLike) {
  const env = makeEnv(opts)
  const storage = injectedStorage ?? memoryStorage()
  const posted: Record<string, unknown>[] = []
  const rendered: string[] = []
  const streams: Array<{ path: string; token: () => string; onEvent: (_e: SseEvent) => void; onStatus: (_s: string) => void }> = []
  const io: ControllerIo = {
    render: (state) => rendered.push(state.phase),
    postToHost: (message) => void posted.push(message),
  }
  let clock = 1_000_000
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
  return { controller, env, storage, posted, rendered, streams, settle, hostContext, envelopeFrame }
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
