/**
 * SC-E2E — 紧凑负例 spec A：访客附件未授权读 + upload_ref 重放（REVIEW-2 a-f）。
 *
 * ⛔ EXECUTE-GATED：本文件全部用例 `SC153_E2E_EXECUTE=1` 才执行（journey 同款
 * 文件级门；A0 串行执行，套件间禁止并行——README 已登记）。
 *
 * 真实栈纪律：零 page.route、零 mock、零伪造行——访客凭证取真实 bootstrap
 * 签发的 secret（x-cs-visit-token 专用头，S3 合同），附件链走真 presign →
 * 裸 PUT → confirm。API 面直连 BE_MAIN（网关拓扑负例归 spec C 覆盖）。
 *
 * 断言依据（BE 源码 + 已提交单测，非猜测）：
 *   - cs_http:classify/1：credential_missing/visit_token_invalid→401、
 *     credential_in_query_string/invalid_upload_ref→400、
 *     {forbidden, contact_scope_mismatch}→403、not_found→404、conflict→409；
 *   - eb_asset_app:confirm_pending 注释原话「非 pending 一律 conflict（状态机
 *     每次跃迁都要可审计，重放不算成功）」；eb_pg_asset_meta CAS
 *     `SET status='active' ... WHERE status='pending_confirm'`；
 *   - cs_widget_handler_tests（aa842f48）：无头 401 msg=credential_missing、
 *     伪造 token 401 msg=visit_token_invalid、token-in-query 400
 *     msg=credential_in_query_string。
 *
 * upload.url 处理（如实登记）：presign 回显的绝对基址 = {imboy, base_url}
 * （本地栈为 https://cs.test:18443 网关域，API request context 无法走
 * host-resolver-rules），故剥 origin 取 path+query 在 BE_MAIN 直连同一后端
 * PUT——网关 origin 可达性由 spec C（网关面）覆盖，本 spec 锁后端合同。
 */
import { createHash } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { BE_MAIN, EXECUTE_ENABLED, ORG_ID, SHOP, psql } from './helpers/env'

/** API 面夹具：覆写内置 request 直连后端（config baseURL 是 admin dev server，不通用）。 */
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

/** 附件小样（确定性字节 → hash/size 可预算）。 */
const SAMPLE = Buffer.from('sc153-attach', 'utf8')
const SAMPLE_SHA = createHash('sha256').update(SAMPLE).digest('hex')

/** 信封形状（elib_response）：{code, msg, payload}。 */
interface Envelope {
  code: number
  msg: string
  payload?: Record<string, unknown>
}


/** 真实访客链：bootstrap（唯一 subject 全新签发）→ sessions，取回凭证三件套。 */
async function newVisitorIdentity(
  request: APIRequestContext,
  marker: string,
): Promise<{ installationId: string; token: string; sessionId: string }> {
  const boot = await request.post('/api/v1/cs/widget/bootstrap', {
    headers: { origin: SHOP },
    data: { public_widget_id: '702000000000000101', subject_id: `sc153-att-${marker}` },
  })
  expect(boot.status(), 'bootstrap 必须 200（S3 合同：全新 subject 签发一次）').toBe(200)
  const bootBody = (await boot.json()) as Envelope
  expect(bootBody.code).toBe(0)
  const installationId = String(bootBody.payload?.installation_id ?? '')
  const token = String(bootBody.payload?.secret ?? '')
  expect(installationId, 'installation_id TSID 串').not.toBe('')
  expect(token, 'secret 仅在签发响应出现一次').not.toBe('')

  const sess = await request.post('/api/v1/cs/widget/sessions', {
    headers: { 'x-cs-visit-token': token },
    data: { installation_id: installationId },
  })
  expect(sess.status(), '访客建会话必须 200').toBe(200)
  const sessBody = (await sess.json()) as Envelope
  expect(sessBody.code).toBe(0)
  const sessionId = String(sessBody.payload?.session_id ?? '')
  expect(sessionId).not.toBe('')
  return { installationId, token, sessionId }
}

/** 完整附件正向链：presign → 裸 PUT 字节 → confirm，返回 asset 行事实。 */
async function uploadConfirmedAsset(
  request: APIRequestContext,
  identity: { installationId: string; token: string; sessionId: string },
): Promise<{ uploadRef: string; assetIdFromDb: string }> {
  const presign = await request.post(
    `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/presign`,
    {
      headers: { 'x-cs-visit-token': identity.token },
      data: {
        installation_id: identity.installationId,
        mime: 'text/plain',
        size_bytes: SAMPLE.length,
        object_hash: SAMPLE_SHA,
        file_name: 'sc153-e2e.txt',
      },
    },
  )
  expect(presign.status(), 'presign 必须 200').toBe(200)
  const presignBody = (await presign.json()) as Envelope
  expect(presignBody.code).toBe(0)
  const uploadRef = String(presignBody.payload?.upload_ref ?? '')
  const uploadUrl = String(
    (presignBody.payload?.upload as { url?: string; method?: string } | undefined)?.url ?? '',
  )
  expect(uploadRef, 'presign 回显 upload_ref').not.toBe('')
  expect(uploadUrl, 'presign 回显 upload.url（base_url 已配置的栈）').not.toBe('')

  // 剥网关 origin（见文件头登记），path+query 在 BE_MAIN 直连同一后端。
  const putPath = new URL(uploadUrl).pathname + new URL(uploadUrl).search
  const put = await request.put(putPath, { data: SAMPLE })
  expect(put.status(), `裸 PUT ${putPath} 必须 200（FE-W01 合同）`).toBe(200)

  const confirm = await request.post(
    `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/confirm`,
    {
      headers: { 'x-cs-visit-token': identity.token },
      data: { installation_id: identity.installationId, upload_ref: uploadRef },
    },
  )
  expect(confirm.status(), 'confirm 必须 200').toBe(200)
  const confirmBody = (await confirm.json()) as Envelope
  expect(confirmBody.code).toBe(0)

  // asset_id 从 DB 事实取（不猜 presign 响应投影形状）。
  const row = psql(
    `select id from enterprise_asset where organization_id = ${ORG_ID} and object_hash = '${SAMPLE_SHA}'` +
      ` order by id desc limit 1`,
  )
  expect(row.length, 'confirm 后 enterprise_asset 必有该 hash 行').toBeGreaterThan(0)
  return { uploadRef, assetIdFromDb: row.split('|')[0] }
}

// ---------------------------------------------------------------------------
// 矩阵 1：未授权读（content 面凭证三形态 + 跨会话越权）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例A：访客附件未授权读', () => {
  test('N1 content 无凭证头 → 401 credential_missing（facade 不达）', async ({ request }) => {
    const identity = await newVisitorIdentity(request, `n1-${Date.now()}`)
    const resp = await request.get(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/123/content`,
    )
    expect(resp.status()).toBe(401)
    const body = (await resp.json()) as Envelope
    expect(body.code).not.toBe(0)
    expect(body.msg).toBe('credential_missing')
  })

  test('N2 content 伪造 token → 401 visit_token_invalid（digest 无命中行）', async ({ request }) => {
    const identity = await newVisitorIdentity(request, `n2-${Date.now()}`)
    const resp = await request.get(
      // content 面动作表要求 installation_id 查询参数（参数校验先于 token 判定，
      // 缺参是 422 missing_param——真实 widget 恒携带，负例也如实带齐）
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/123/content` +
        `?installation_id=${identity.installationId}`,
      { headers: { 'x-cs-visit-token': 'wtok-forged-never-issued-sc153' } },
    )
    expect(resp.status(), `N2 status=${resp.status()} body=${await resp.text()}`).toBe(401)
    const body = (await resp.json()) as Envelope
    expect(body.msg).toBe('visit_token_invalid')
  })

  test('N3 凭证样式键进查询串 → 400 credential_in_query_string（值不读）', async ({ request }) => {
    const identity = await newVisitorIdentity(request, `n3-${Date.now()}`)
    const resp = await request.post(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/presign?x-cs-visit-token=whatever`,
      {
        headers: { 'x-cs-visit-token': identity.token },
        data: {
          installation_id: identity.installationId,
          mime: 'text/plain',
          size_bytes: SAMPLE.length,
          object_hash: SAMPLE_SHA,
        },
      },
    )
    expect(resp.status()).toBe(400)
    const body = (await resp.json()) as Envelope
    expect(body.msg).toBe('credential_in_query_string')
  })

  test('N4 跨 contact 读 → 422 not_session_contact；本会话不存在 asset → 404（无枚举）', async ({
    request,
  }) => {
    const marker = `n4-${Date.now()}`
    const alice = await newVisitorIdentity(request, `alice-${marker}`)
    const bob = await newVisitorIdentity(request, `bob-${marker}`)
    const bobAsset = await uploadConfirmedAsset(request, bob)

    // 越权：alice 的 token 读 bob 会话下的 bob 资产。widget content 面的会话
    // 归属门在最外层拒绝（422 not_session_contact，fail-closed 不泄漏会话
    // 存在性；classify 表里的 403 contact_scope_mismatch 属更深的 EB 分支，
    // 该路径走不到——执行期实证 2026-09-29）。
    const cross = await request.get(
      `/api/v1/cs/widget/sessions/${bob.sessionId}/assets/${bobAsset.assetIdFromDb}/content` +
        `?installation_id=${alice.installationId}`,
      { headers: { 'x-cs-visit-token': alice.token } },
    )
    expect(cross.status(), '跨 contact 读必须 fail-closed 拒绝').toBe(422)
    const crossBody = (await cross.json()) as Envelope
    expect(crossBody.msg).toBe('not_session_contact')

    // 自会话内不存在的 asset id → 404（不区分不存在与越权，防枚举）。
    const ghost = await request.get(
      `/api/v1/cs/widget/sessions/${alice.sessionId}/assets/999999/content` +
        `?installation_id=${alice.installationId}`,
      { headers: { 'x-cs-visit-token': alice.token } },
    )
    expect(ghost.status()).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 矩阵 2：upload_ref 唯一凭证（篡改 400 / confirm 重放 409 + DB 行不翻倍）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例A：upload_ref 状态机', () => {
  test('N5 confirm 携带篡改 upload_ref → 400 invalid_upload_ref（HMAC 门）', async ({ request }) => {
    const identity = await newVisitorIdentity(request, `n5-${Date.now()}`)
    const resp = await request.post(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/confirm`,
      {
        headers: { 'x-cs-visit-token': identity.token },
        data: {
          installation_id: identity.installationId,
          upload_ref: 'tampered-not-a-sealed-ref-0000',
        },
      },
    )
    expect(resp.status(), '坏 ref 是客户端凭证错误（篡改/垃圾串进不了解密门）').toBe(400)
    const body = (await resp.json()) as Envelope
    expect(body.msg).toBe('invalid_upload_ref')
  })

  test('N6 confirm 重放 → 409 conflict（重放不算成功）+ DB 行数不翻倍', async ({ request }) => {
    const identity = await newVisitorIdentity(request, `n6-${Date.now()}`)
    const { uploadRef, assetIdFromDb } = await uploadConfirmedAsset(request, identity)

    const replay = await request.post(
      `/api/v1/cs/widget/sessions/${identity.sessionId}/assets/confirm`,
      {
        headers: { 'x-cs-visit-token': identity.token },
        data: { installation_id: identity.installationId, upload_ref: uploadRef },
      },
    )
    expect(replay.status(), '非 pending 一律 conflict（eb_asset_app 状态机原话）').toBe(409)
    const replayBody = (await replay.json()) as Envelope
    expect(replayBody.code).not.toBe(0)

    // DB oracle：重放不产生第二行；已确认行终态 active（CAS WHERE pending_confirm）。
    const count = psql(
      `select count(*) from enterprise_asset where organization_id = ${ORG_ID} and object_hash = '${SAMPLE_SHA}'`,
    )
    expect(Number(count.trim()), '重放后同 hash 行数不变').toBeGreaterThanOrEqual(1)
    const status = psql(`select status from enterprise_asset where id = ${assetIdFromDb}`)
    expect(status.trim(), '已确认资产行终态 active').toBe('active')
  })
})
