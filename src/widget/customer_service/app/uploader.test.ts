/**
 * FE-W01：附件上传流水线单元测试（Web Crypto SHA-256 / presign / 裸 PUT / confirm /
 * asset_ids 消息 / 重试复用幂等键 / 无 URL fail-closed / 409 不伪成功）。
 */
import { describe, expect, it } from 'bun:test'
import { isBareHttpsUploadUrl, toPresignResult } from './contract'
import { WidgetApiClient } from './widgetApi'
import { blobSha256Hex, runAttachmentPipeline, sha256Hex } from './uploader'

type Recorded = { url: string; init: RequestInit }

const SCOPE = { organizationId: '1234567890123456789', installationId: '72057594037928001' }
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
      organization_id: SCOPE.organizationId,
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
      organization_id: SCOPE.organizationId,
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
