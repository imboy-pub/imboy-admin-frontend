/**
 * FE-W01：附件上传流水线单元测试（Web Crypto SHA-256 / presign / 裸 PUT / confirm /
 * asset_ids 消息 / 重试复用幂等键 / 无 URL fail-closed / 409 不伪成功）。
 */
import '../../../test/setupDom'
import { beforeEach, describe, expect, it } from 'bun:test'
import { isBareHttpsUploadUrl, toPresignResult } from './contract'
import type { AttachmentItem } from './attachmentMachine'
import { WidgetApiClient } from './widgetApi'
import { blobSha256Hex, runAttachmentPipeline, sha256Hex } from './uploader'

type Recorded = { url: string; init: RequestInit }

const SCOPE = { installationId: '72057594037928001' }
const SESSION_ID = '72057594037927936'
const HASH = 'a'.repeat(64)

/** 按 URL/方法路由的 fetch 替身（bare PUT 与 API 面共用同一注入点）。 */
function makeEnv(opts: {
  apiPutTarget?: string | null
  confirmStatus?: number
  presignFails?: boolean
  putFails?: boolean
} = {}) {
  const requests: Recorded[] = []
  const putRequests: Recorded[] = []
  const file = new File(['hello attachment'], '报表.pdf', { type: 'application/pdf' })
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const recorded: Recorded = { url, init: (init ?? {}) as RequestInit }
    if (url.startsWith('https://store.example/')) {
      putRequests.push(recorded)
      if (opts.putFails) return { ok: false, status: 500 } as Response
      return { ok: true, status: 200 } as Response
    }
    requests.push(recorded)
    const isPost = recorded.init.method === 'POST'
    let payload: unknown = {}
    if (isPost && url.includes('/assets/presign')) {
      if (opts.presignFails) {
        return { ok: false, status: 422 } as Response
      }
      payload = {
        asset_id: '72057594037928100',
        upload_ref: 'ref-opaque-1',
        object_hash: HASH,
        mime: 'application/pdf',
        size_bytes: file.size,
        retain_until: 1790000000,
        expires_at: 1789600000000,
        upload:
          opts.apiPutTarget === null
            ? { method: 'PUT', token: 'ref-opaque-1', expires_at: 1789600000000, adapter: 'local_private_object_store', rule: 'opaque_token_no_url_no_object_key' }
            : { method: 'PUT', url: opts.apiPutTarget, token: 'ref-opaque-1', expires_at: 1789600000000 },
      }
    } else if (isPost && url.includes('/assets/confirm')) {
      if (opts.confirmStatus !== undefined && opts.confirmStatus !== 200) {
        return { ok: false, status: opts.confirmStatus } as Response
      }
      payload = { asset_id: '72057594037928100', status: 'active' }
    } else if (isPost && url.includes('/messages')) {
      payload = { id: '72057594037928200', sender_type: 'contact', client_msg_id: 'cm-att-1', body: '', created_at: '2026-09-20T08:00:00Z' }
    }
    const respond = { ok: true, status: 200, json: async () => ({ code: 0, msg: 'success', payload }) }
    return respond as unknown as Response
  }) as typeof fetch
  const api = new WidgetApiClient(fetchImpl)
  return { api, fetchImpl, requests, putRequests, file }
}

const PUT_TARGET = 'https://store.example/put?sig=x'

async function run(env: ReturnType<typeof makeEnv>, clientMsgId: string, existing?: Parameters<typeof runAttachmentPipeline>[0]['existing']) {
  const states: string[] = []
  const final = await runAttachmentPipeline({
    sessionId: SESSION_ID,
    scope: SCOPE,
    file: env.file,
    clientMsgId,
    deps: { api: env.api, fetchImpl: env.fetchImpl, onItem: (item) => states.push(item.state) },
    existing,
  })
  return { final, states }
}

const EMPTY_BLOB_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

describe('Web Crypto SHA-256', () => {
  it('空输入与已知向量（64 位小写 hex）', async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(EMPTY_BLOB_SHA256)
    expect(await blobSha256Hex(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('合同投影（presign / 裸 PUT 目标）', () => {
  it('toPresignResult：缺 asset_id/upload_ref fail-closed；upload.url 缺省 → null', () => {
    expect(toPresignResult({ asset_id: 'a' })).toBeNull()
    const ok = toPresignResult({ asset_id: 'a', upload_ref: 'r', upload: { rule: 'opaque_token_no_url_no_object_key' } })
    expect(ok).toEqual({ assetId: 'a', uploadRef: 'r', uploadUrl: null })
  })

  it('isBareHttpsUploadUrl：拒绝 http/userinfo/查询串 token 形状', () => {
    expect(isBareHttpsUploadUrl(PUT_TARGET)).not.toBeNull()
    expect(isBareHttpsUploadUrl('http://store.example/put')).toBeNull()
    expect(isBareHttpsUploadUrl('https://user:pass@store.example/put')).toBeNull()
    expect(isBareHttpsUploadUrl('https://store.example/put?token=leak')).toBeNull()
    expect(isBareHttpsUploadUrl('not a url')).toBeNull()
  })
})

describe('runAttachmentPipeline（hash→presign→裸PUT→confirm→asset_ids 消息）', () => {
  it('全链成功：请求形状逐键、裸 PUT 无凭证头、只有 linked 终态、状态推进序列完整', async () => {
    const env = makeEnv({ apiPutTarget: PUT_TARGET })
    const { final, states } = await run(env, 'cm-att-1')
    expect(final.state).toBe('linked')
    expect(final.messageId).toBe('72057594037928200')
    expect(states).toEqual(['pending', 'confirming', 'sending', 'linked'])

    const presign = env.requests.find((r) => r.url.includes('/assets/presign'))
    expect(JSON.parse(String(presign?.init.body))).toEqual({
      installation_id: SCOPE.installationId,
      mime: 'application/pdf',
      size_bytes: env.file.size,
      object_hash: await blobSha256Hex(env.file),
    })
    // 裸 PUT：无 visit token 头、无 Cookie（credentials omit）、只带 Content-Type
    expect(env.putRequests).toHaveLength(1)
    const putHeaders = env.putRequests[0]?.init.headers as Record<string, string>
    expect(env.putRequests[0]?.init.method).toBe('PUT')
    expect(putHeaders['x-cs-visit-token']).toBeUndefined()
    expect(env.putRequests[0]?.init.credentials).toBe('omit')
    const confirm = env.requests.find((r) => r.url.includes('/assets/confirm'))
    expect(JSON.parse(String(confirm?.init.body))).toEqual({
      installation_id: SCOPE.installationId,
      upload_ref: 'ref-opaque-1',
    })
    const append = env.requests.find((r) => r.url.includes('/messages'))
    const appendBody = JSON.parse(String(append?.init.body))
    expect(appendBody.asset_ids).toEqual(['72057594037928100'])
    expect(appendBody.client_msg_id).toBe('cm-att-1')
    // API 请求路径永不携带存储侧引用（上传 ref 只进 confirm 体）
    expect(env.requests.every((r) => !r.url.includes('store.example'))).toBe(true)
  })

  it('presign 无 PUT 目标（合同 opaque_token 形状）→ fail-closed failed，无 PUT/confirm/消息外呼', async () => {
    const env = makeEnv({ apiPutTarget: null })
    const { final } = await run(env, 'cm-att-1')
    expect(final.state).toBe('failed')
    expect(final.failureReason).toContain('上传目标缺失')
    expect(env.putRequests).toHaveLength(0)
    expect(env.requests.some((r) => r.url.includes('/assets/confirm'))).toBe(false)
    expect(env.requests.some((r) => r.url.includes('/messages'))).toBe(false)
  })

  it('confirm 409（重复 confirm）不伪成功 → failed，且不发消息', async () => {
    const env = makeEnv({ apiPutTarget: PUT_TARGET, confirmStatus: 409 })
    const { final } = await run(env, 'cm-att-1')
    expect(final.state).toBe('failed')
    expect(env.requests.some((r) => r.url.includes('/messages'))).toBe(false)
  })

  it('PUT 失败 / presign 422 → failed；重试复用同一 client_msg_id（幂等键）', async () => {
    const failing = makeEnv({ apiPutTarget: PUT_TARGET, putFails: true })
    const { final: first } = await run(failing, 'cm-att-1')
    expect(first.state).toBe('failed')

    const fixed = makeEnv({ apiPutTarget: PUT_TARGET })
    const { final: retried } = await run(fixed, 'cm-att-1', first)
    expect(retried.state).toBe('linked')
    expect(retried.clientMsgId).toBe(first.clientMsgId)
    const append = fixed.requests.find((r) => r.url.includes('/messages'))
    expect(JSON.parse(String(append?.init.body)).client_msg_id).toBe('cm-att-1')

    const presignFail = makeEnv({ presignFails: true })
    const { final: failedAgain } = await run(presignFail, 'cm-x')
    expect(failedAgain.state).toBe('failed')
    expect(failedAgain.failureReason).toContain('422')
  })
})


for (const boundary of ['hash', 'presign', 'put']) {
  it('stale lifecycle after ' + boundary + ' never performs the next upload write', async () => {
    const env = makeEnv({ apiPutTarget: 'https://store.example/owned' })
    let current = true
    const api = new WidgetApiClient(env.fetchImpl)
    let presigns = 0, confirms = 0, sends = 0, puts = 0
    api.presignAttachment = async () => {
      presigns += 1
      if (boundary === 'presign') current = false
      return { assetId: '1', uploadRef: 'ref', uploadUrl: 'https://store.example/owned' }
    }
    api.confirmAttachment = async () => { confirms += 1 }
    api.sendMessage = async () => { sends += 1; return { id: '2', senderType: 'contact', senderContactId: null, clientMsgId: 'stable', body: '', createdAt: null, assets: [] } }
    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' })
    if (boundary === 'hash') file.arrayBuffer = async () => { current = false; return new Uint8Array([1]).buffer }
    const result = await runAttachmentPipeline({ sessionId: SESSION_ID, scope: SCOPE, file, clientMsgId: 'stable',
      deps: { api, isCurrent: () => current, onItem: () => {}, fetchImpl: async () => {
        puts += 1; if (boundary === 'put') current = false; return { ok: true, status: 200 } as Response
      } } })
    expect(result.state).toBe('failed')
    expect(presigns).toBe(boundary === 'hash' ? 0 : 1)
    expect(puts).toBe(boundary === 'put' ? 1 : 0)
    expect(confirms).toBe(0); expect(sends).toBe(0)
  })
}

// ---------------------------------------------------------------------------
// W5-02/status-sync：durable 恢复面场景（timeout / restart / journal 隔离等）。
// 纪律：只 mock 传输层（fetch 注入口）与定时器；journal、状态机、流水线均为
// 真实实现。运行环境：setupDom 提供 jsdom localStorage 与 location 原点；
// navigator.locks 由下方进程内 shim 提供——其互斥/ifAvailable/回调抛错传播/
// finally 释放语义与 Web Locks 一致，属环境脚手架而非被测行为替身。
// ---------------------------------------------------------------------------
type LockManagerShim = {
  request: (
    _name: string,
    _options: { ifAvailable?: boolean },
    _callback: (_lock: { name: string; mode: string } | null) => unknown
  ) => Promise<unknown>
}

if (!(globalThis.navigator as { locks?: LockManagerShim }).locks) {
  const held = new Set<string>()
  const waiters: Array<{ name: string; resolve: () => void }> = []
  const grantNext = () => {
    while (waiters.length > 0) {
      const next = waiters[0]!
      if (held.has(next.name)) return
      waiters.shift()
      held.add(next.name)
      next.resolve()
    }
  }
  const shim: LockManagerShim = {
    request: async (name, options, callback) => {
      if (!held.has(name)) held.add(name)
      else if (options?.ifAvailable) return callback(null)
      else await new Promise<void>((resolve) => { waiters.push({ name, resolve }) })
      try {
        return await callback({ name, mode: 'exclusive' })
      } finally {
        held.delete(name)
        grantNext()
      }
    },
  }
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: shim })
}

type DurableHandlers = {
  register?: (_body: Record<string, unknown>) => unknown
  status?: (_body: Record<string, unknown>) => unknown
  renew?: (_body: Record<string, unknown>) => unknown
  confirm?: (_body: Record<string, unknown>) => unknown
  put?: (_url: string) => Promise<Response> | Response
  sendMessage?: (_body: Record<string, unknown>) => unknown
}

function registeredSession(assetId: string, uploadRef: string, uploadUrl: string) {
  return { asset_id: assetId, session_state: 'registered', upload_ref: uploadRef, upload: { url: uploadUrl } }
}

/** durable 面传输替身：register/status/renew 按 body.operation 路由，
 * 裸 PUT 走 https://store.example/ 前缀；handler 抛错 = 网络故障/响应丢失。 */
function makeDurableEnv(handlers: DurableHandlers = {}) {
  const requests: Array<{ url: string; init: RequestInit; operation?: string }> = []
  const putRequests: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://store.example/')) {
      putRequests.push({ url, init: (init ?? {}) as RequestInit })
      const response = await handlers.put?.(url)
      return (response ?? { ok: true, status: 200 }) as Response
    }
    const recorded: { url: string; init: RequestInit; operation?: string } = { url, init: (init ?? {}) as RequestInit }
    requests.push(recorded)
    const body = JSON.parse(String(recorded.init.body ?? '{}')) as Record<string, unknown>
    let payload: unknown = {}
    if (recorded.init.method === 'POST' && url.includes('/assets/presign')) {
      recorded.operation = String(body.operation ?? '')
      const handler = handlers[recorded.operation as keyof DurableHandlers]
      payload = handler
        ? handler(body)
        : registeredSession('8100000000000000001', 'ref-default', 'https://store.example/put/default')
    } else if (recorded.init.method === 'POST' && url.includes('/assets/confirm')) {
      payload = handlers.confirm ? handlers.confirm(body) : { asset_id: body.asset_id, status: 'active' }
    } else if (url.includes('/messages')) {
      payload = handlers.sendMessage
        ? handlers.sendMessage(body)
        : {
            id: '8200000000000000001',
            sender_type: 'contact',
            sender_contact_id: '72057594037928002',
            client_msg_id: body.client_msg_id,
            body: '',
            created_at: '2026-10-29T00:00:00Z',
          }
    }
    if (payload !== null && typeof payload === 'object' && (payload as { ok?: unknown }).ok === false) {
      return payload as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({ code: 0, msg: 'success', payload }) } as unknown as Response
  }) as typeof fetch
  return { api: new WidgetApiClient(fetchImpl), fetchImpl, requests, putRequests }
}

function presignOps(env: ReturnType<typeof makeDurableEnv>): string[] {
  return env.requests.filter((request) => request.operation !== undefined).map((request) => String(request.operation))
}

async function runDurable(env: ReturnType<typeof makeDurableEnv>, opts: {
  clientMsgId: string
  principalId: string
  sessionId?: string
  installationId?: string
  file: Blob
  isCurrent?: () => boolean
  onCredentialRefused?: () => void
}) {
  const states: string[] = []
  const final = await runAttachmentPipeline({
    sessionId: opts.sessionId ?? SESSION_ID,
    scope: { installationId: opts.installationId ?? SCOPE.installationId },
    file: opts.file,
    clientMsgId: opts.clientMsgId,
    durable: true,
    principalId: opts.principalId,
    deps: {
      api: env.api,
      fetchImpl: env.fetchImpl,
      isCurrent: opts.isCurrent,
      onCredentialRefused: opts.onCredentialRefused,
      onItem: (item) => { states.push(item.state) },
    },
  })
  return { final, states }
}

const JOURNAL_PREFIX = 'imboy:attachment:v5:'

function journalRows(fragment: string): Array<Record<string, unknown>> {
  const storage = globalThis.localStorage
  const rows: Array<Record<string, unknown>> = []
  for (let i = 0; i < storage.length; i += 1) {
    const name = storage.key(i)
    if (name?.startsWith(JOURNAL_PREFIX) && name.includes(fragment)) {
      rows.push(JSON.parse(storage.getItem(name) ?? '{}') as Record<string, unknown>)
    }
  }
  return rows
}

function clearJournalKeys(): void {
  const storage = globalThis.localStorage
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const name = storage.key(i)
    if (name?.startsWith(JOURNAL_PREFIX)) doomed.push(name)
  }
  for (const name of doomed) storage.removeItem(name)
}

const UUID_SHAPE = /^[0-9a-f-]{36}$/i

describe('W5-02 status-sync（durable 恢复面；仅 mock 传输层/定时器）', () => {
  beforeEach(clearJournalKeys)

  it('widget_timeout: hung presign times out and stops without retry storm', async () => {
    let presignAttempts = 0
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/assets/presign')) {
        presignAttempts += 1
        // 传输层挂起，由定时器触发超时中止（AbortSignal.timeout 语义）
        await new Promise((resolve) => setTimeout(resolve, 10))
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      throw new Error(`unexpected request during timeout scenario: ${url}`)
    }) as typeof fetch
    const api = new WidgetApiClient(fetchImpl)
    const file = new File(['timeout bytes'], 'timeout.pdf', { type: 'application/pdf' })
    const states: string[] = []
    const final = await runAttachmentPipeline({
      sessionId: SESSION_ID, scope: SCOPE, file, clientMsgId: 'cm-timeout',
      deps: { api, fetchImpl, onItem: (item) => { states.push(item.state) } },
    })
    expect(final.state).toBe('failed')
    expect(final.failureReason).toContain('aborted due to timeout')
    expect(presignAttempts).toBe(1) // 不产生重试风暴：presign 只发出一次
    expect(states).toEqual(['pending', 'failed']) // 上传中止，无 PUT/confirm/消息外呼
  })

  it('widget_presign_response_lost: persisted intent resumes with status/renew only, never re-presigns', async () => {
    const file = new File(['lost response bytes'], 'lost.pdf', { type: 'application/pdf' })
    const ASSET = '8100000000000000011'

    const droppedEnv = makeDurableEnv({
      register: () => { throw new Error('network dropped before the presign response was delivered') },
    })
    const dropped = await runDurable(droppedEnv, { clientMsgId: 'cm-lost', principalId: 'contact-lost', file })
    expect(dropped.final.state).toBe('failed')
    expect(presignOps(droppedEnv)).toEqual(['register'])

    // 意图已持久化（响应丢失前 checkpoint 落盘，clientUploadId 稳定）
    const intentRows = journalRows('cm-lost')
    expect(intentRows).toHaveLength(1)
    expect(intentRows[0]?.phase).toBe('intent')
    expect(intentRows[0]?.assetId).toBeNull()
    const uploadId = String(intentRows[0]?.clientUploadId)
    expect(UUID_SHAPE.test(uploadId)).toBe(true)

    const resumedEnv = makeDurableEnv({
      register: () => { throw new Error('resume must not re-issue the presign/register') },
      status: () => registeredSession(ASSET, 'ref-lost', 'https://store.example/put/lost-status'),
      renew: () => registeredSession(ASSET, 'ref-lost', 'https://store.example/put/lost-renew'),
    })
    const resumed = await runDurable(resumedEnv, { clientMsgId: 'cm-lost', principalId: 'contact-lost', file })
    expect(resumed.final.state).toBe('linked')
    expect(resumed.final.assetId).toBe(ASSET) // 对象身份不变
    expect(presignOps(resumedEnv)).toEqual(['status', 'renew']) // 只查原任务，不二次 presign
    for (const request of resumedEnv.requests) {
      if (request.operation !== undefined) {
        expect(JSON.parse(String(request.init.body)).client_upload_id).toBe(uploadId)
      }
    }
    expect(resumedEnv.putRequests.map((request) => request.url)).toEqual(['https://store.example/put/lost-renew'])
    expect(journalRows('cm-lost')).toHaveLength(0) // linked 后流水账清账
  })

  it('widget_restart_before_put: page killed mid-PUT resumes the persisted capability without re-presign', async () => {
    const file = new File(['restart bytes'], 'restart.pdf', { type: 'application/pdf' })
    const ASSET = '8100000000000000021'

    const killedEnv = makeDurableEnv({
      register: () => registeredSession(ASSET, 'ref-restart', 'https://store.example/put/restart-first'),
      put: async () => {
        // 页面在 PUT 在途时被杀：在途请求随页面卸载中止
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
    })
    const first = await runDurable(killedEnv, { clientMsgId: 'cm-restart', principalId: 'contact-restart', file })
    expect(first.final.state).toBe('failed')
    expect(killedEnv.putRequests).toHaveLength(1)
    const rows = journalRows('cm-restart')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phase).toBe('registered') // 字节未确认，能力已持久化
    expect(rows[0]?.assetId).toBe(ASSET)
    const uploadId = String(rows[0]?.clientUploadId)
    expect(UUID_SHAPE.test(uploadId)).toBe(true)

    const resumedEnv = makeDurableEnv({
      register: () => { throw new Error('restart resume must not re-register') },
      status: () => registeredSession(ASSET, 'ref-restart', 'https://store.example/put/restart-status'),
      renew: () => registeredSession(ASSET, 'ref-restart', 'https://store.example/put/restart-resume'),
    })
    const second = await runDurable(resumedEnv, { clientMsgId: 'cm-restart', principalId: 'contact-restart', file })
    expect(second.final.state).toBe('linked')
    expect(second.final.assetId).toBe(ASSET) // 复用持久化能力，对象不换
    expect(presignOps(resumedEnv)).toEqual(['status', 'renew']) // 不二次 presign
    expect(resumedEnv.putRequests.map((request) => request.url)).toEqual(['https://store.example/put/restart-resume'])
    const confirm = resumedEnv.requests.find((request) => request.url.includes('/assets/confirm'))
    expect(JSON.parse(String(confirm?.init.body)).asset_id).toBe(ASSET)
  })

  it('widget_expired_capability_resume: expired PUT capability renews with fresh URL, same object identity', async () => {
    const file = new File(['expired cap bytes'], 'cap.pdf', { type: 'application/pdf' })
    const ASSET = '8100000000000000031'

    const expiredEnv = makeDurableEnv({
      register: () => registeredSession(ASSET, 'ref-cap', 'https://store.example/put/cap-v1?sig=expired'),
      put: () => ({ ok: false, status: 403 }) as Response, // 能力过期：存储侧拒绝旧签名
    })
    const first = await runDurable(expiredEnv, { clientMsgId: 'cm-cap', principalId: 'contact-cap', file })
    expect(first.final.state).toBe('failed')
    expect(first.final.failureReason).toContain('403')
    expect(expiredEnv.putRequests.map((request) => request.url)).toEqual(['https://store.example/put/cap-v1?sig=expired'])

    const resumedEnv = makeDurableEnv({
      register: () => { throw new Error('expired resume must not re-register the object') },
      status: () => registeredSession(ASSET, 'ref-cap', 'https://store.example/put/cap-status'),
      renew: () => registeredSession(ASSET, 'ref-cap', 'https://store.example/put/cap-v2?sig=fresh'),
    })
    const second = await runDurable(resumedEnv, { clientMsgId: 'cm-cap', principalId: 'contact-cap', file })
    expect(second.final.state).toBe('linked')
    expect(second.final.assetId).toBe(ASSET) // 以新 presign 恢复，对象身份不变
    expect(presignOps(resumedEnv)).toEqual(['status', 'renew'])
    expect(resumedEnv.putRequests.map((request) => request.url)).toEqual(['https://store.example/put/cap-v2?sig=fresh'])
    const append = resumedEnv.requests.find((request) => request.url.includes('/messages'))
    expect(JSON.parse(String(append?.init.body)).asset_ids).toEqual([ASSET])
  })

  it('widget_account_switch_late_callback: late PUT callback after account switch is refused by journal principal isolation', async () => {
    const file = new File(['late account bytes'], 'acct.pdf', { type: 'application/pdf' })
    const ASSET_A = '8100000000000000041'
    const SESSION_A5 = '72057594037928051'
    let current = true
    let putStarted = false
    let releaseLateCallback: (() => void) | null = null
    const lateCallback = new Promise<void>((resolve) => { releaseLateCallback = resolve })

    const envA = makeDurableEnv({
      register: () => registeredSession(ASSET_A, 'ref-a5', 'https://store.example/put/a5'),
      put: async () => {
        putStarted = true
        await lateCallback // 迟到回调：PUT 响应在账号切换后才到达
        return { ok: true, status: 200 } as Response
      },
    })
    const attemptA = runDurable(envA, {
      clientMsgId: 'cm-a5', principalId: 'contact-a5-old', sessionId: SESSION_A5, file,
      isCurrent: () => current,
    })
    for (let i = 0; i < 500 && !putStarted; i += 1) await new Promise((resolve) => setTimeout(resolve, 2))
    expect(putStarted).toBe(true)

    current = false // 账号已切换到主体 B；旧主体 A 的会话作废
    releaseLateCallback!()
    const finishedA = await attemptA
    expect(finishedA.final.state).toBe('failed')
    expect(finishedA.final.failureReason).toContain('会话已变化')

    const rowsA = journalRows('contact-a5-old')
    expect(rowsA).toHaveLength(1)
    expect(rowsA[0]?.phase).toBe('registered') // 迟到回调未推进任何 checkpoint
    const staleUploadId = String(rowsA[0]?.clientUploadId)

    // 主体 B：journal 主体作用域完全独立，全新注册自己的上传
    const ASSET_B = '8100000000000000042'
    const envB = makeDurableEnv({
      register: () => registeredSession(ASSET_B, 'ref-a5-b', 'https://store.example/put/a5-b'),
    })
    const finishedB = await runDurable(envB, {
      clientMsgId: 'cm-a5', principalId: 'contact-a5-new', sessionId: SESSION_A5, file,
    })
    expect(finishedB.final.state).toBe('linked')
    expect(finishedB.final.assetId).toBe(ASSET_B)
    expect(presignOps(envB)).toEqual(['register'])
    const registerBody = JSON.parse(String(envB.requests.find((request) => request.operation === 'register')?.init.body))
    expect(registerBody.client_upload_id).not.toBe(staleUploadId) // 不复用旧主体能力
    // journal 主体隔离：B 的作用域从未出现 A 的任务；A 的草稿仍留在 A 的作用域
    expect(journalRows('contact-a5-new')).toHaveLength(0)
    expect(journalRows('contact-a5-old')).toHaveLength(1)
  })

  it('widget_workspace_switch_late_callback: late PUT callback after workspace switch is refused by journal scope isolation', async () => {
    const file = new File(['late workspace bytes'], 'ws.pdf', { type: 'application/pdf' })
    const ASSET_W1 = '8100000000000000051'
    const WORKSPACE_OLD = '72057594037928061'
    const WORKSPACE_NEW = '72057594037928062'
    let current = true
    let putStarted = false
    let releaseLateCallback: (() => void) | null = null
    const lateCallback = new Promise<void>((resolve) => { releaseLateCallback = resolve })

    const envOld = makeDurableEnv({
      register: () => registeredSession(ASSET_W1, 'ref-w1', 'https://store.example/put/w1'),
      put: async () => {
        putStarted = true
        await lateCallback // 迟到回调：PUT 响应在工作区切换后才到达
        return { ok: true, status: 200 } as Response
      },
    })
    const attemptOld = runDurable(envOld, {
      clientMsgId: 'cm-ws', principalId: 'contact-ws', installationId: WORKSPACE_OLD, file,
      isCurrent: () => current,
    })
    for (let i = 0; i < 500 && !putStarted; i += 1) await new Promise((resolve) => setTimeout(resolve, 2))
    expect(putStarted).toBe(true)

    current = false // 工作区已切换；旧工作区会话作废
    releaseLateCallback!()
    const finishedOld = await attemptOld
    expect(finishedOld.final.state).toBe('failed')
    expect(finishedOld.final.failureReason).toContain('会话已变化')

    const rowsOld = journalRows(WORKSPACE_OLD)
    expect(rowsOld).toHaveLength(1)
    expect(rowsOld[0]?.phase).toBe('registered') // 迟到回调未推进旧工作区流水账
    const staleUploadId = String(rowsOld[0]?.clientUploadId)

    // 新工作区：journal 作用域隔离，全新注册自己的上传
    const ASSET_W2 = '8100000000000000052'
    const envNew = makeDurableEnv({
      register: () => registeredSession(ASSET_W2, 'ref-w2', 'https://store.example/put/w2'),
    })
    const finishedNew = await runDurable(envNew, {
      clientMsgId: 'cm-ws', principalId: 'contact-ws', installationId: WORKSPACE_NEW, file,
    })
    expect(finishedNew.final.state).toBe('linked')
    expect(finishedNew.final.assetId).toBe(ASSET_W2)
    expect(presignOps(envNew)).toEqual(['register'])
    const registerBody = JSON.parse(String(envNew.requests.find((request) => request.operation === 'register')?.init.body))
    expect(registerBody.client_upload_id).not.toBe(staleUploadId) // 新工作区不接管旧任务
    expect(registerBody.installation_id).toBe(WORKSPACE_NEW)
    // journal 作用域隔离：新工作区流水账无旧任务残留；旧工作区草稿保留
    expect(journalRows(WORKSPACE_NEW)).toHaveLength(0)
    expect(journalRows(WORKSPACE_OLD)).toHaveLength(1)
  })

  it('widget_authorization_revoked: 403 keeps the draft and refuses upload replay', async () => {
    const file = new File(['revoked bytes'], 'revoked.pdf', { type: 'application/pdf' })
    const ASSET = '8100000000000000061'
    let refusals = 0

    const firstEnv = makeDurableEnv({
      register: () => registeredSession(ASSET, 'ref-revoked', 'https://store.example/put/revoked'),
      confirm: () => ({ ok: false, status: 403 }) as Response, // 授权在 confirm 阶段被撤销
    })
    const first = await runDurable(firstEnv, {
      clientMsgId: 'cm-revoked', principalId: 'contact-revoked', file,
      onCredentialRefused: () => { refusals += 1 },
    })
    expect(first.final.state).toBe('failed')
    expect(refusals).toBe(1)
    const draft = journalRows('cm-revoked')
    expect(draft).toHaveLength(1) // 草稿保留
    expect(draft[0]?.phase).toBe('uploaded')
    expect(draft[0]?.assetId).toBe(ASSET)
    const uploadId = String(draft[0]?.clientUploadId)

    // 重放：撤销持续生效（仍 403）——只允许查状态，不得重放任何上传写
    const replayEnv = makeDurableEnv({
      status: () => ({ ok: false, status: 403 }) as Response,
      register: () => { throw new Error('revoked replay must not register') },
      renew: () => { throw new Error('revoked replay must not renew') },
      put: () => { throw new Error('revoked replay must not PUT') },
      confirm: () => { throw new Error('revoked replay must not confirm') },
    })
    const replay = await runDurable(replayEnv, {
      clientMsgId: 'cm-revoked', principalId: 'contact-revoked', file,
      onCredentialRefused: () => { refusals += 1 },
    })
    expect(replay.final.state).toBe('failed')
    expect(refusals).toBe(2)
    expect(presignOps(replayEnv)).toEqual(['status']) // 只查原任务状态
    expect(JSON.parse(String(replayEnv.requests[0]?.init.body)).client_upload_id).toBe(uploadId)
    expect(replayEnv.putRequests).toHaveLength(0)
    const draftAfter = journalRows('cm-revoked')
    expect(draftAfter).toHaveLength(1)
    expect(draftAfter[0]?.clientUploadId).toBe(uploadId) // 草稿未被重放破坏
  })

  it('widget_durable_checkpoint_failure: checkpoint write failure stops before PUT and keeps the intent', async () => {
    const file = new File(['checkpoint bytes'], 'ckpt.pdf', { type: 'application/pdf' })
    const SESSION_CK = '72057594037928081'
    const realStorage = globalThis.localStorage
    let durableWrites = 0
    // 存储写入失败（配额耗尽语义）：本场景 journal 键的第二次 checkpoint 写入抛错，
    // 其余键原样透传。journal/流水线逻辑不受替身影响。
    const quotaStorage = {
      getItem: (key: string) => realStorage.getItem(key),
      setItem: (key: string, value: string) => {
        if (key.includes(SESSION_CK)) {
          durableWrites += 1
          if (durableWrites > 1) throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
        realStorage.setItem(key, value)
      },
      removeItem: (key: string) => realStorage.removeItem(key),
      key: (index: number) => realStorage.key(index),
      clear: () => realStorage.clear(),
      get length() { return realStorage.length },
    }
    ;(globalThis as { localStorage: unknown }).localStorage = quotaStorage
    let final: AttachmentItem
    const env = makeDurableEnv({
      register: () => registeredSession('8100000000000000081', 'ref-ckpt', 'https://store.example/put/ckpt'),
    })
    try {
      const run = await runDurable(env, { clientMsgId: 'cm-ckpt', principalId: 'contact-ckpt', sessionId: SESSION_CK, file })
      final = run.final
    } finally {
      ;(globalThis as { localStorage: unknown }).localStorage = realStorage
    }
    expect(final.state).toBe('failed')
    expect(presignOps(env)).toEqual(['register']) // 意图登记后才发起注册
    expect(env.putRequests).toHaveLength(0) // PUT 前停止
    // 意图保留（第一次 checkpoint 写成功，失败写未落盘也未删除已有记录）
    const rows = journalRows('cm-ckpt')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phase).toBe('intent')
    expect(rows[0]?.assetId).toBeNull()
    expect(UUID_SHAPE.test(String(rows[0]?.clientUploadId))).toBe(true)
  })

  it('widget_reselected_different_bytes_rejected: different bytes cannot replace the registered task', async () => {
    const original = new File(['original bytes for a9'], 'a9.pdf', { type: 'application/pdf' })
    const reselected = new File(['DIFFERENT bytes for a9!'], 'a9-renamed.pdf', { type: 'image/png' })
    const ASSET = '8100000000000000091'

    const firstEnv = makeDurableEnv({
      register: () => registeredSession(ASSET, 'ref-a9', 'https://store.example/put/a9'),
      put: () => { throw new Error('network lost before PUT completed') },
    })
    const first = await runDurable(firstEnv, { clientMsgId: 'cm-a9', principalId: 'contact-a9', file: original })
    expect(first.final.state).toBe('failed')
    const rows = journalRows('cm-a9')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.objectHash).toBe(await blobSha256Hex(original))
    expect(rows[0]?.sizeBytes).toBe(original.size)
    expect(rows[0]?.mime).toBe('application/pdf')
    const uploadId = String(rows[0]?.clientUploadId)

    // 重选不同字节：不得打开任何新上传能力，也不得替换已注册任务
    const blockedEnv = makeDurableEnv({
      register: () => { throw new Error('reselection must not open a new upload capability') },
      status: () => { throw new Error('reselection must not query the original task') },
    })
    const second = await runDurable(blockedEnv, { clientMsgId: 'cm-a9', principalId: 'contact-a9', file: reselected })
    expect(second.final.state).toBe('failed')
    expect(blockedEnv.requests).toHaveLength(0) // 零外呼：替换被拒绝
    expect(blockedEnv.putRequests).toHaveLength(0)
    const after = journalRows('cm-a9')
    expect(after).toHaveLength(1)
    expect(after[0]?.objectHash).toBe(await blobSha256Hex(original)) // 原任务身份原样保留
    expect(after[0]?.clientUploadId).toBe(uploadId)
  })
})
