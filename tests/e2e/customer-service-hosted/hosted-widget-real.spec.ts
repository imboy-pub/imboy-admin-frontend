/**
 * CP-ASSET-02 — hosted Widget 真实四域浏览器 E2E（入仓版）。
 *
 * 从历史 run cs-hosted-widget-20260920T150315Z 的 CSD-E2E-03（round3，6 passed）
 * 提取，脱敏并适配当前合同：
 *   * frame 资产 = /widget-assets/cs-widget.v2.js（S4 字面路径；v2 稳定别名，
 *     no-cache 重验证；内容 hash chunk 走 /assets/* immutable）；
 *   * bootstrap / sessions / messages / rating 全部零 org 申报（S3 服务端派生）；
 *   * Origin 放行 = installation allowlist ∪ 同源 Host（S3 v1.1）。
 *
 * 拓扑：shop.test:18443（宿主）/ cs.test:18443（Widget 网关）/
 * shop2.test:18443（evil 宿主）；真实 backend + 真实 PG scratch + 真实 nginx +
 * 真实 dist-widget 静态产物。禁止 page.route / mock backend —— 全部走真实栈。
 * 环境前置见同目录 README.md。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import {
  agentHttpClose,
  agentHttpMessage,
  CS,
  CS_BROWSER,
  INST_A,
  ORG,
  ORIGIN,
  psql,
  seatLogin,
  SHOP,
  WID_A,
  WID_B,
} from './helpers/env'

// ---- 采集器 -------------------------------------------------------------
function wire(page: Page) {
  const consoleErrors: string[] = []
  const failed: { url: string; err: string }[] = []
  const responses: { url: string; status: number }[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText ?? '?' }))
  page.on('response', (r: Response) => responses.push({ url: r.url(), status: r.status() }))
  return { consoleErrors, failed, responses }
}

async function jsonOf(r: Response): Promise<unknown> {
  try {
    const t = await r.text()
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

// ---- 1/6 A02 浏览器内主链 -------------------------------------------------
test.describe('A02 浏览器内主链（snippet→iframe→bootstrap→consent→session→消息→坐席回复 SSE→close→rating→PG 对账）', () => {
  test('全链 200 + 载荷零 org + SSE 到达 + DB 直证', async ({ page }) => {
    test.setTimeout(120_000)
    const w = wire(page)
    const uniqueTs = Date.now()
    const agentClientMsgId = `cm-h-agent-${uniqueTs}`
    const agentBody = `hosted 坐席回复 ${uniqueTs}`
    const visitorBody = `hosted 访客消息 ${uniqueTs}`

    type Capt = { url: string; method: string; postData: string | null; headers: Record<string, string> }
    const reqs: Capt[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/cs/widget/')) {
        reqs.push({ url: r.url(), method: r.method(), postData: r.postData() ?? null, headers: r.headers() })
      }
    })
    const bootRespP = page.waitForResponse((r) => r.url().includes('/api/v1/cs/widget/bootstrap'), { timeout: 20_000 })

    // 1) snippet → launcher → iframe
    await page.goto(SHOP + '/', { waitUntil: 'domcontentloaded' })
    const launcher = page.locator('#imboy-cs-widget-root').locator('button').first()
    await expect(launcher).toBeAttached({ timeout: 10_000 })
    await launcher.click()
    const iframe = page.locator('iframe[data-testid="cs-widget-iframe"]')
    await expect(iframe).toBeAttached({ timeout: 10_000 })
    await expect(iframe).toHaveAttribute('src', `${CS_BROWSER}/w/${WID_A}`)

    // 2) frame 资产 200（widget-assets v2 稳定别名）+ 同源 bootstrap 200
    const frameAsset = w.responses.find((r) => r.url.includes('/widget-assets/cs-widget.v2.js'))
    expect(frameAsset?.status, 'frame 入口资产 200').toBe(200)
    const bootResp = await bootRespP
    const bootBody = await jsonOf(bootResp)
    const bootReq = reqs.find((r) => r.url.includes('/bootstrap'))
    expect(bootResp.status(), '同源 bootstrap 200').toBe(200)
    expect(String(bootBody?.payload?.installation_id)).toBe(INST_A)
    const sentBoot = JSON.parse(bootReq?.postData ?? '{}')
    expect(Object.keys(sentBoot).sort(), 'bootstrap 载荷恰两键零 org').toEqual(['public_widget_id', 'subject_id'])

    const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')

    // 3) consent → POST /sessions 零 org 申报 → 200 queued
    const accept = frame.locator('[data-testid="cs-consent-accept"]')
    await expect(accept).toBeVisible({ timeout: 15_000 })
    const sessRespP = page.waitForResponse(
      (r) => r.url().includes('/api/v1/cs/widget/sessions') && r.request().method() === 'POST' && !r.url().includes('/messages'),
      { timeout: 20_000 },
    )
    await accept.click()
    const sessResp = await sessRespP
    const sessBody = await jsonOf(sessResp)
    const sessReq = reqs.filter((r) => r.url.includes('/sessions') && r.method === 'POST').at(-1)
    expect(sessResp.status(), 'POST /sessions 零 org 申报 200').toBe(200)
    const sentSess = JSON.parse(sessReq?.postData ?? '{}')
    expect(Object.keys(sentSess), '建会话载荷恰 installation_id 一键').toEqual(['installation_id'])
    expect(sentSess.installation_id).toBe(INST_A)
    expect(sessBody?.payload?.status).toBe('queued')
    const sessionId = String(sessBody.payload.session_id)
    const conversationId = String(sessBody.payload.conversation_id)

    // 4) 访客消息 → POST messages 200 → 列表渲染
    const msgRespP = page.waitForResponse((r) => r.url().includes('/messages') && r.request().method() === 'POST', { timeout: 20_000 })
    const input = frame.locator('input[data-testid="cs-input"]')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill(visitorBody)
    await frame.locator('[data-testid="cs-send"]').click()
    const msgResp = await msgRespP
    const msgReq = reqs.filter((r) => r.url.includes('/messages') && r.method === 'POST').at(-1)
    expect(msgResp.status(), 'messages 零 org 申报 200').toBe(200)
    const sentMsg = JSON.parse(msgReq?.postData ?? '{}')
    expect(Object.keys(sentMsg).sort(), '消息载荷恰三键零 org').toEqual(['body', 'client_msg_id', 'installation_id'])
    await expect(frame.locator('[data-testid="cs-message-list"]')).toContainText(visitorBody, { timeout: 8_000 })

    // 5) SSE 面证据：/events 查询串零 org 且 200
    const eventsReq = reqs.find((r) => r.url.includes('/events'))
    expect(eventsReq?.url, 'events 查询串零 org').not.toContain('organization')
    const eventsResp = w.responses.find((r) => r.url.includes('/events'))
    expect(eventsResp?.status).toBe(200)

    // 6) 坐席经真实 HTTP 通道回复 → SSE message 帧 → 浏览器渲染
    const token = await seatLogin()
    const agent = await agentHttpMessage(token, conversationId, agentClientMsgId, agentBody)
    expect(agent.status, '坐席真实 HTTP 通道 200').toBe(200)
    expect(String(agent.json?.payload?.message?.sender_type)).toBe('business_identity')
    await expect(
      frame.locator('[data-testid="cs-message-list"]'),
      '坐席回复经 SSE message 帧到达并渲染',
    ).toContainText(agentBody, { timeout: 45_000 })

    // 7) 坐席关会话（真实 HTTP 通道）→ UI 评分态 → rating 零 org 200
    const versionBefore = Number(psql(`SELECT version FROM customer_service_session WHERE id=${sessionId}`))
    const close = await agentHttpClose(token, sessionId, versionBefore)
    expect(close.status, '坐席真实 HTTP 通道关会话 200').toBe(200)

    const rateRespP = page.waitForResponse((r) => r.url().includes('/rating'), { timeout: 30_000 })
    const rateBtn = frame.locator('[data-testid="cs-rate-5"]')
    await expect(rateBtn, 'SSE state 帧 closed 后 UI 进入评分态').toBeVisible({ timeout: 25_000 })
    await rateBtn.click()
    const rateResp = await rateRespP
    const rateReq = reqs.filter((r) => r.url.includes('/rating') && r.method === 'POST').at(-1)
    expect(rateResp.status(), 'rating 零 org 申报 200').toBe(200)
    const sentRate = JSON.parse(rateReq?.postData ?? '{}')
    expect(Object.keys(sentRate).sort(), '评分载荷恰三键零 org').toEqual(['expected_version', 'installation_id', 'rating'])
    expect(sentRate.rating).toBe(5)

    // 8) console / 失败请求卫生
    expect(w.failed, '零失败请求').toEqual([])
    expect(w.consoleErrors, '浏览器主链 console 零 error').toEqual([])

    // 9) PG 对账（≥3 处）
    const sessRow = psql(`SELECT status || '|' || coalesce(rating::text,'null') || '|' || version FROM customer_service_session WHERE id=${sessionId}`)
    expect(sessRow.split('|')[0]).toBe('closed')
    expect(sessRow.split('|')[1]).toBe('5')
    expect(Number(psql(`SELECT version FROM customer_service_session WHERE id=${sessionId}`)), 'close/rating CAS 推进 version').toBeGreaterThanOrEqual(versionBefore + 1)

    const msgRows = psql(`SELECT client_msg_id || ':' || sender_type FROM enterprise_message WHERE conversation_id=${conversationId} ORDER BY id`)
    expect(msgRows).toContain(agentClientMsgId + ':business_identity')

    const tok = psql(`SELECT count(*) FROM customer_service_visit_token WHERE widget_installation_id=${INST_A} AND revoked_at IS NULL`)
    expect(Number(tok), 'visit token 绑定 installation A 且在案').toBeGreaterThanOrEqual(1)
  })
})

// ---- 2/6 GAP-5 协议面钉死（独立会话，真实 HTTP 坐席回复）--------------------
test.describe('协议面钉死（SSE message 帧 + DB 行一致）', () => {
  test('坐席消息 DB 在案后 1 个轮询周期内经 SSE message 帧到达', async ({ request }) => {
    test.setTimeout(60_000)
    const { spawn } = await import('node:child_process')
    const fs = await import('node:fs')
    const boot = await request.post(`${CS}/api/v1/cs/widget/bootstrap`, {
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      data: { public_widget_id: WID_A, subject_id: `h-gap5-${Date.now()}` },
    })
    expect(boot.status()).toBe(200)
    const token = (await boot.json()).payload.secret
    const sess = await request.post(`${CS}/api/v1/cs/widget/sessions`, {
      headers: { Origin: ORIGIN, 'x-cs-visit-token': token, 'Content-Type': 'application/json' },
      data: { installation_id: INST_A },
    })
    expect(sess.status()).toBe(200)
    const sessBody = await sess.json()
    const sessionId = String(sessBody.payload.session_id)
    const conversationId = String(sessBody.payload.conversation_id)
    const clientMsgId = `cm-h-gap5-${Date.now()}`

    const cap = `/tmp/cp12-hosted-gap5-${Date.now()}.txt`
    fs.writeFileSync(cap, '')
    const curl = spawn('curl', [
      '-skN', '--max-time', '20', '-o', cap,
      `${CS}/api/v1/cs/widget/sessions/${sessionId}/events?installation_id=${INST_A}`,
      '-H', `x-cs-visit-token: ${token}`,
    ])
    const exited = new Promise<void>((resolve) => curl.on('exit', () => resolve()))
    await new Promise((r) => setTimeout(r, 2_000))
    const seat = await seatLogin()
    const agent = await agentHttpMessage(seat, conversationId, clientMsgId, `hosted GAP5 pin ${Date.now()}`)
    expect(agent.status).toBe(200)
    await exited
    const sseText = fs.readFileSync(cap, 'utf8')
    expect(/event:\s*state/.test(sseText), 'state 首帧到达').toBeTruthy()
    expect(/event:\s*message/.test(sseText), 'SSE message 事件帧出现').toBeTruthy()
    const frameIdMatch = sseText.match(/"id":"(\d+)"/g)
    const dbRowId = psql(`SELECT id FROM enterprise_message WHERE conversation_id=${conversationId} AND client_msg_id='${clientMsgId}'`)
    expect(dbRowId).toBeTruthy()
    expect(sseText).toContain(`"id":"${dbRowId}"`)
    expect(frameIdMatch?.some((s) => s === `"id":"${dbRowId}"`), '帧内 message id 与 DB 行一致').toBeTruthy()
  })
})

// ---- 3/6 revoked installation ---------------------------------------------
test.describe('A03 负例：revoked', () => {
  test('revoked B：/w/ 404 installation_unavailable', async ({ request }) => {
    const r = await request.get(`${CS}/w/${WID_B}`)
    expect(r.status()).toBe(404)
    expect(((await r.json()) as { msg: string }).msg).toBe('installation_unavailable')
  })
})

// ---- 4/6 A03 负例组合 ------------------------------------------------------
test.describe('A03 负例组合（evil origin / 伪造 token / URL token / org 申报）', () => {
  test('全部拒绝且语义符合合同 S3', async ({ request }) => {
    const evil = await request.post(`${CS}/api/v1/cs/widget/bootstrap`, {
      headers: { Origin: 'https://shop2.test:18443', 'Content-Type': 'application/json' },
      data: { public_widget_id: WID_A, subject_id: 'h-subj-evil' },
    })
    expect(evil.status()).toBe(403)
    expect(((await evil.json()) as { msg: string }).msg).toBe('origin_not_allowed')

    const boot = await request.post(`${CS}/api/v1/cs/widget/bootstrap`, {
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      data: { public_widget_id: WID_A, subject_id: `h-forged-${Date.now()}` },
    })
    const token = (await boot.json()).payload.secret
    const forged = await request.post(`${CS}/api/v1/cs/widget/sessions`, {
      headers: { Origin: ORIGIN, 'x-cs-visit-token': 'forged-token-deadbeef', 'Content-Type': 'application/json' },
      data: { installation_id: INST_A },
    })
    const fbody = (await forged.json()) as { msg: string }
    // 合同 v1.1：digest 未命中 404 not_found 与 401 visit_token_invalid 均合规（fail-closed）
    expect([401, 404]).toContain(forged.status())
    if (forged.status() === 404) expect(fbody.msg).toBe('not_found')
    if (forged.status() === 401) expect(fbody.msg).toBe('visit_token_invalid')

    const qsToken = await request.get(`${CS}/api/v1/cs/widget/sessions?installation_id=${INST_A}&token=zzz`, {
      headers: { 'x-cs-visit-token': token },
    })
    expect(qsToken.status()).toBe(400)
    expect(((await qsToken.json()) as { msg: string }).msg).toBe('credential_in_query_string')

    const withOrg = await request.post(`${CS}/api/v1/cs/widget/sessions`, {
      headers: { Origin: ORIGIN, 'x-cs-visit-token': token, 'Content-Type': 'application/json' },
      data: { installation_id: INST_A, organization_id: ORG },
    })
    expect(withOrg.status()).toBe(400)
    expect(((await withOrg.json()) as { msg: string }).msg).toBe('server_derived_key_rejected')
  })
})

// ---- 5/6 A04 合同头断言 ----------------------------------------------------
test.describe('A04 合同头断言（/w/ no-store + frame-ancestors；loader no-cache；assets immutable）', () => {
  test('缓存/CSP 头逐项符合 S6 冻结表', async ({ request }) => {
    const f = await request.get(`${CS}/w/${WID_A}`)
    expect(f.status()).toBe(200)
    expect(f.headers()['cache-control']).toBe('no-store')
    const csp = f.headers()['content-security-policy'] ?? ''
    expect(csp).toBe('frame-ancestors https://shop.test:18443')
    expect(csp).not.toContain('*')
    expect(f.headers()['x-frame-options']).toBeUndefined()
    const html = await f.text()
    expect(html).toContain('src="/widget-assets/cs-widget.v2.js"')
    expect(html).not.toMatch(/installation|secret|token/i)

    const loader = await request.get(`${CS}/v1/loader.js`)
    expect(loader.status()).toBe(200)
    expect(loader.headers()['cache-control']).toContain('no-cache')

    const v2 = await request.get(`${CS}/widget-assets/cs-widget.v2.js`)
    expect(v2.status()).toBe(200)
    expect(v2.headers()['cache-control']).toContain('no-cache')

    const missing = await request.get(`${CS}/assets/not-exist.js`)
    expect(missing.status()).toBe(404)
  })
})

// ---- 6/6 SSE 首帧时延 ------------------------------------------------------
test.describe('A04 SSE 首帧时延（3 次采样，须远小于 15s 轮询周期）', () => {
  test('time_starttransfer x3 均 < 1s', async ({ request }) => {
    test.setTimeout(60_000)
    const { execFileSync } = await import('node:child_process')
    const boot = await request.post(`${CS}/api/v1/cs/widget/bootstrap`, {
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      data: { public_widget_id: WID_A, subject_id: `h-sse-lat-${Date.now()}` },
    })
    const token = (await boot.json()).payload.secret
    const sess = await request.post(`${CS}/api/v1/cs/widget/sessions`, {
      headers: { Origin: ORIGIN, 'x-cs-visit-token': token, 'Content-Type': 'application/json' },
      data: { installation_id: INST_A },
    })
    const sessionId = String((await sess.json()).payload.session_id)
    const times: number[] = []
    for (let i = 0; i < 3; i++) {
      try {
        const out = execFileSync(
          'curl',
          ['-skN', '--max-time', '2', '-o', '/dev/null', '-w', '%{time_starttransfer}',
            `${CS}/api/v1/cs/widget/sessions/${sessionId}/events?installation_id=${INST_A}`,
            '-H', `x-cs-visit-token: ${token}`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        )
        times.push(Number(out.trim()))
      } catch (e) {
        times.push(Number(String((e as { stdout?: string }).stdout ?? '999').trim()))
      }
    }
    for (const t of times) expect(t, 'SSE 首帧 < 1s').toBeLessThan(1)
  })
})
