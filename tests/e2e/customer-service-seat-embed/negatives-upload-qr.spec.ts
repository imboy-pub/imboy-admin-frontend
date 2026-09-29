/**
 * SC-E2E — 紧凑负例 spec B：presign 声明值绕过 + QR 登录 token 重放
 * （REVIEW-2 + round-1 车道⑥研究结论落位；R2-7，主线程补位）。
 *
 * ⛔ EXECUTE-GATED：`SC153_E2E_EXECUTE=1` 才执行（journey 同款文件级门；
 * A0 串行执行，套件间禁止并行）。
 *
 * 断言依据（BE 源码 + 2026-09-29 执行期实证，非猜测）：
 *   - 附件声明值复核：eb_asset_app put 路径 hash/size 双复核 → **400**（声明
 *     值不符是客户端请求错误；此前按 classify 兜底推断 500 的假设被执行期
 *     证伪——这正是 EXECUTE 门存在的意义）；核心断言是「绕过不落库」
 *     （DB oracle：enterprise_asset 零新增行）。
 *   - QR 单次读：confirm 只置 confirmed（响应不含 token）；**首次 status**
 *     返回 payload.token 并 delete_session（qr_login_handler:141 取走即删）；
 *     重放（已删）→ HTTP 200 + envelope code=404 msg=会话不存在或已过期；
 *     未知 token → 同款 200/404（防枚举：HTTP 面不区分未知与已消费，
 *    elib_response:error 只落 envelope code，HTTP 恒 200）。
 *   - scan/confirm 请求形状与 helpers/qr-embed.ts scanAndConfirm 同构
 *     （Bearer 坐席护照 JWT + {qr_token}）；create 需非空 device_id，
 *     载荷 {qr_token, session_token, expires_in:60}（60s TTL 内完成全链）。
 *
 * API 面直连 BE_MAIN（request 夹具覆写同 spec A）；网关拓扑负例归 spec C。
 */
import { createHash } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { BE_MAIN, EXECUTE_ENABLED, ORG_ID, SEAT, psql } from './helpers/env'

/** API 面夹具：覆写内置 request 直连后端（config baseURL 是 admin dev server）。 */
const test = base.extend<{ request: APIRequestContext }>({
  request: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: BE_MAIN })
    // Playwright fixture callback parameter, not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(ctx)
    await ctx.dispose()
  },
})

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

interface Envelope {
  code: number
  msg?: string
  payload?: Record<string, unknown>
}

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
/** 每轮唯一字节样本（DB oracle 按 hash 查询零歧义）。 */
const SAMPLE = Buffer.from(`sc153-specB-${RUN_UNIQ}`, 'utf8')
const sha256hex = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

/** 真实访客凭证三件套（同 spec A）。 */
async function newVisitorIdentity(
  request: APIRequestContext,
  marker: string,
): Promise<{ installationId: string; token: string; sessionId: string }> {
  const boot = await request.post('/api/v1/cs/widget/bootstrap', {
    headers: { origin: 'https://shop.test:18443' },
    data: { public_widget_id: '702000000000000101', subject_id: `sc153-specB-${marker}` },
  })
  expect(boot.status()).toBe(200)
  const bootBody = (await boot.json()) as Envelope
  const installationId = String(bootBody.payload?.installation_id ?? '')
  const token = String(bootBody.payload?.secret ?? '')
  const sess = await request.post('/api/v1/cs/widget/sessions', {
    headers: { 'x-cs-visit-token': token },
    data: { installation_id: installationId },
  })
  expect(sess.status()).toBe(200)
  const sessBody = (await sess.json()) as Envelope
  return { installationId, token, sessionId: String(sessBody.payload?.session_id ?? '') }
}

async function presign(
  request: APIRequestContext,
  identity: { installationId: string; token: string; sessionId: string },
  declared: { mime: string; sizeBytes: number; objectHash: string },
): Promise<string> {
  const resp = await request.post(
    `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/presign`,
    {
      headers: { 'x-cs-visit-token': identity.token },
      data: {
        installation_id: identity.installationId,
        mime: declared.mime,
        size_bytes: declared.sizeBytes,
        object_hash: declared.objectHash,
      },
    },
  )
  expect(resp.status(), 'presign 必须 200（声明值在此刻只是申报）').toBe(200)
  const body = (await resp.json()) as Envelope
  return String(body.payload?.upload_ref ?? '')
}

/** DB oracle：该 hash 的资产行必须仍为零（绕过不落库）。 */
function expectNoAssetRow(objectHash: string): void {
  const count = psql(
    `select count(*) from enterprise_asset where organization_id = ${ORG_ID} and object_hash = '${objectHash}'`,
  )
  expect(Number(count.trim()), '绕过尝试不得产生资产行').toBe(0)
}

// ---------------------------------------------------------------------------
// 矩阵 1：presign 声明值绕过（服务端 PUT 复核 fail-closed + 零落库）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例B：presign 声明值绕过', () => {
  test('M1 size 谎报：PUT 字节数 ≠ 声明 size_bytes → 复核 fail-closed + 零落库', async ({
    request,
  }) => {
    const identity = await newVisitorIdentity(request, `m1-${RUN_UNIQ}`)
    const uploadRef = await presign(request, identity, {
      mime: 'text/plain',
      sizeBytes: SAMPLE.length + 5, // 谎报
      objectHash: sha256hex(SAMPLE), // hash 如实
    })
    const put = await request.put(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/upload` +
        `?installation_id=${identity.installationId}&upload_ref=${encodeURIComponent(uploadRef)}`,
      { data: SAMPLE },
    )
    // 声明值不符 = 客户端请求错误 → 400（执行期实证合同）
    expect(put.status(), 'size 复核失败必须 400（声明值不符）').toBe(400)
    expectNoAssetRow(sha256hex(SAMPLE))
  })

  test('M2 hash 谎报：PUT 字节 hash ≠ 声明 object_hash → 复核 fail-closed + 零落库', async ({
    request,
  }) => {
    const identity = await newVisitorIdentity(request, `m2-${RUN_UNIQ}`)
    const uploadRef = await presign(request, identity, {
      mime: 'text/plain',
      sizeBytes: SAMPLE.length, // size 如实
      objectHash: sha256hex('never-uploaded-bytes'), // hash 谎报
    })
    const put = await request.put(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/upload` +
        `?installation_id=${identity.installationId}&upload_ref=${encodeURIComponent(uploadRef)}`,
      { data: SAMPLE },
    )
    expect(put.status(), 'hash 复核失败必须 400（声明值不符）').toBe(400)
    expectNoAssetRow(sha256hex('never-uploaded-bytes'))
  })
})

// ---------------------------------------------------------------------------
// 矩阵 2：QR 登录 token 单次读合同（取走即删 → 重放 404）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例B：QR 登录 token 重放', () => {
  test('M3 未知 session_token 的 status → HTTP 200 + envelope 404（防枚举，不区分未知与已消费）', async ({
    request,
  }) => {
    const resp = await request.get(
      `/api/v1/passport/qr_login/status?session_token=sc153-nonexistent-${RUN_UNIQ}`,
    )
    // elib_response:error 只把 404 落 envelope code，HTTP 恒 200——防枚举
    expect(resp.status(), 'HTTP 面恒 200（防枚举）').toBe(200)
    const body = (await resp.json()) as Envelope
    expect(body.code).toBe(404)
    expect(body.msg).toContain('会话不存在或已过期')
  })

  test('M4 确认后首次 status 取走 login_token；同 token 重放 → 404（单次读）', async ({
    request,
  }) => {
    // 1) create（无认证面；device_id 必填）
    const create = await request.post('/api/v1/passport/qr_login/create', {
      data: { device_id: `sc153-specB-${RUN_UNIQ}`, device_name: 'specB', platform: 'web' },
    })
    expect(create.status()).toBe(200)
    const createBody = (await create.json()) as Envelope
    expect(createBody.code).toBe(0)
    const qrToken = String(createBody.payload?.qr_token ?? '')
    const sessionToken = String(createBody.payload?.session_token ?? '')
    expect(qrToken).not.toBe('')
    expect(sessionToken).not.toBe('')

    // 2) 坐席护照登录 → scan → confirm（真实合同面，同 qr-embed helper）
    const seatJwt = await seatJwtFor(request)
    for (const action of ['scan', 'confirm']) {
      const resp = await request.post(`/api/v1/passport/qr_login/${action}`, {
        headers: { authorization: `Bearer ${seatJwt}` },
        data: { qr_token: qrToken },
      })
      const body = (await resp.json()) as Envelope
      expect(body.code, `${action} 必须 code=0`).toBe(0)
    }

    // 3) 首次 status：单次读分支 → 200 + payload.token（取走即删，
    // qr_login_handler:141；confirm 响应只含 status=confirmed 不含 token）
    const first = await request.get(`/api/v1/passport/qr_login/status?session_token=${encodeURIComponent(sessionToken)}`)
    expect(first.status(), '确认后首次 status 必须 200').toBe(200)
    const firstBody = (await first.json()) as Envelope
    expect(firstBody.code, '首次 status 必须成功签发').toBe(0)
    expect(String(firstBody.payload?.token ?? ''), 'token 只此一次').not.toBe('')

    // 4) 重放同一 session_token → HTTP 200 + envelope 404 会话不存在或已过期
    const replay = await request.get(`/api/v1/passport/qr_login/status?session_token=${encodeURIComponent(sessionToken)}`)
    expect(replay.status(), '取走即删：重放 HTTP 面仍 200（防枚举）').toBe(200)
    const replayBody = (await replay.json()) as Envelope
    expect(replayBody.code, '重放 envelope 404').toBe(404)
    expect(replayBody.msg).toContain('会话不存在或已过期')
  })
})

/** 坐席护照登录（helpers/env.seatPassportLogin 是顶层 fetch；此处走 request context 等价实现）。 */
async function seatJwtFor(request: APIRequestContext): Promise<string> {
  const resp = await request.post('/api/v1/passport/login', {
    data: {
      type: 'mobile',
      account: SEAT.account,
      pwd: SEAT.password,
      rsa_encrypt: '0',
      sys_version: 'sc153-embed',
    },
  })
  expect(resp.status()).toBe(200)
  const body = (await resp.json()) as Envelope
  const token = String(body.payload?.token ?? '')
  expect(token, '坐席护照 JWT').not.toBe('')
  return token
}
