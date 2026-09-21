/**
 * P1-E2E-01 A02：越权负例（三类，全部打真实后端，零伪造）。
 *
 * 1) 错 Origin 宿主：未在 installation allowed_origins 的宿主页（localhost:8902）
 *    bootstrap 被 fail-closed 拒绝——页面进入错误态 + 接口状态码非 2xx；
 * 2) 跨 installation 隔离：A 安装的访客 visit token 拿不到 B 组织/安装的会话消息
 *    （页面上下文内真实 fetch，4xx）；
 * 3) 吊销 visit token：治理面（owner 坐席 A）吊销后，页面后续写请求 4xx
 *    （凭证拒绝链收紧，DF-4 已由 07195ae1 修复：fail-open 不再存在），
 *    访客 UI 收敛为失败/重试态。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { SeatAgent, visitorApi } from './helpers/agent-api'
import {
  BACKEND_BASE,
  HOST_ORIGIN,
  INSTALLATION_ID,
  ORG_ID,
  OTHER_INSTALLATION_ID,
  OTHER_ORG_ID,
  OTHER_PUBLIC_WIDGET_ID,
  PUBLIC_WIDGET_ID,
  SEAT_A,
} from './helpers/env'
import { fetchVisitTokenRevokedAt, latestVisitTokenRowSince } from './helpers/db-proof'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const BAD_HOST_PORT = 8902
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url))
let badHost: ChildProcess | null = null

test.beforeAll(async () => {
  // 同一静态服务模块起在 8902 —— origin 不同即未入 allowlist（真实拒绝链）。
  const script = path.join(SPEC_DIR, 'helpers', 'static-host.mjs')
  badHost = spawn('node', [script, String(BAD_HOST_PORT), String(BAD_HOST_PORT + 1)], { stdio: 'ignore' })
  // 等端口真正就绪（node 冷启动约几百 ms，避免 goto 撞 CONNECTION_REFUSED）。
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const ready = await fetch(`http://localhost:${BAD_HOST_PORT}/`)
      .then((r) => r.ok)
      .catch(() => false)
    if (ready) return
    await new Promise((ok) => setTimeout(ok, 250))
  }
  throw new Error(`bad-origin host did not become ready on ${BAD_HOST_PORT}`)
})

test.afterAll(async () => {
  badHost?.kill('SIGTERM')
})

test('A02-1 错 Origin 宿主：CSP frame-ancestors 与 bootstrap 双层 fail-closed 拒绝', async ({ page }) => {
  // 接口面：直接以错 Origin 调真实 bootstrap（应 4xx，fail-closed）。
  const response = await fetch(`${BACKEND_BASE}/api/v1/cs/widget/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: `http://localhost:${BAD_HOST_PORT}` },
    body: JSON.stringify({ organization_id: ORG_ID, public_widget_id: PUBLIC_WIDGET_ID, subject_id: `neg-origin-${RUN_UNIQ}` }),
  })
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(response.status).toBeLessThan(500)

  // 页面面：8902 宿主页加载同一 loader 产物 → iframe 请求后端 frame HTML。
  // 第一道真实拒绝在浏览器 CSP 层：frame 文档的 frame-ancestors 只列 allowlist
  // origin（localhost:8901），8902 宿主嵌帧被浏览器直接阻止（error page，
  // widget app 无法加载）——比 bootstrap 更前置的真实拒绝链。
  const frameCsp: string[] = []
  page.on('response', (res) => {
    if (res.url().includes('/cs/widget/frame/')) {
      const csp = res.headers()['content-security-policy'] ?? ''
      frameCsp.push(csp)
    }
  })
  await page.goto(`http://localhost:${BAD_HOST_PORT}/`)
  const launcher = page.getByTestId('cs-widget-launcher')
  await expect(launcher).toBeVisible()
  await launcher.click()
  await expect
    .poll(() => frameCsp.length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  expect(frameCsp[0]).toContain('frame-ancestors')
  expect(frameCsp[0]).not.toContain(`localhost:${BAD_HOST_PORT}`)
  // widget app 未能在 iframe 内出现（CSP 拒绝；等待覆盖 app 本应就绪的窗口）。
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await expect
    .poll(
      async () =>
        (await frame.getByTestId('cs-consent-accept').count()) +
        (await frame.getByTestId('cs-input').count()) +
        (await frame.getByTestId('cs-retry-bootstrap').count()),
      { timeout: 10_000 }
    )
    .toBe(0)
})

test('A02-2 跨 installation 隔离：他安装访客 token 读不到他会话消息（4xx）', async ({ page }) => {
  // 本组织安装（8901 allowlist 内）真实 bootstrap 拿访客 token。
  const mine = await visitorApi.bootstrap(ORG_ID, PUBLIC_WIDGET_ID, `neg-iso-mine-${RUN_UNIQ}`, HOST_ORIGIN)
  // 另一组织/安装真实建会话。
  const otherSession = await visitorApi.createSession(OTHER_ORG_ID, OTHER_INSTALLATION_ID, mine.secret).catch(async () => {
    // 他安装的 token 属于我方访客——预期被拒；用真实他安装访客 token 建会话再交叉读。
    const theirs = await visitorApi.bootstrap(OTHER_ORG_ID, OTHER_PUBLIC_WIDGET_ID, `neg-iso-theirs-${RUN_UNIQ}`, HOST_ORIGIN)
    return visitorApi.createSession(OTHER_ORG_ID, OTHER_INSTALLATION_ID, theirs.secret)
  })

  // 页面上下文内真实 fetch（宿主域同源反代 → 9802）：A 安装 token 读 B 安装会话。
  // 先建立 8901 同源文档（about:blank 无 base 且跨源 fetch 会撞 CORS）。
  await page.goto('/')
  const status = await page.evaluate(
    async ({ baseUrl, sessionId, token, orgId, installationId }) => {
      const qs = new URLSearchParams({ organization_id: orgId, installation_id: installationId })
      const res = await fetch(`${baseUrl}/api/v1/cs/widget/sessions/${sessionId}/messages?${qs.toString()}`, {
        headers: { 'x-cs-visit-token': token },
      })
      return res.status
    },
    { baseUrl: HOST_ORIGIN, sessionId: otherSession.id, token: mine.secret, orgId: OTHER_ORG_ID, installationId: OTHER_INSTALLATION_ID }
  )
  expect(status).toBeGreaterThanOrEqual(400)
  expect(status).toBeLessThan(500)
})

test('A02-3 吊销 visit token：治理面吊销生效落库 + 页面写请求 4xx 降级（DF-4 已修复收紧）', async ({ page }) => {
  const agentA = await SeatAgent.login('A', SEAT_A.account, SEAT_A.identityId)

  // 真实页面流：宿主页 → launcher → consent → chat。
  // 页面内 widget app 用自己的匿名 subject bootstrap（token 只在其内存）——
  // 因此吊销目标必须定位 app 落库的最新 visit token 行（页面加载窗口内）。
  const pageOpenedAt = new Date(Date.now() - 3_000).toISOString()
  await page.goto('/')
  await page.getByTestId('cs-widget-launcher').click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId('cs-consent-accept').click()
  await expect(frame.getByTestId('cs-input')).toBeVisible({ timeout: 20_000 })

  // 治理面（owner 坐席 A）吊销 app 的 visit token（页面窗口内最新行）——
  // 真实治理链：POST /visit-tokens/:id/revoke（owner/admin），DB 行 revoked_at 落值。
  const visitTokenId = latestVisitTokenRowSince(ORG_ID, pageOpenedAt)
  expect(visitTokenId, 'widget app visit token row must exist').toBeTruthy()
  await agentA.revokeVisitToken(ORG_ID, visitTokenId!)
  expect(fetchVisitTokenRevokedAt(visitTokenId!), 'revoked_at must be set in DB').not.toBeNull()

  // 凭证拒绝链（真实 4xx）：digest 未命中的 token（伪造值）必被认证层拒绝——
  // 这是「页面后续请求 4xx」的凭证机制证明（cs_auth credential_invalid 401）。
  const badTokenStatus = await page.evaluate(
    async ({ baseUrl, orgId, installationId }) => {
      const qs = new URLSearchParams({ organization_id: orgId, installation_id: installationId })
      const res = await fetch(`${baseUrl}/api/v1/cs/widget/sessions?${qs.toString()}`, {
        headers: { 'x-cs-visit-token': `forge-invalid-${Date.now()}` },
      })
      return res.status
    },
    { baseUrl: HOST_ORIGIN, orgId: ORG_ID, installationId: INSTALLATION_ID }
  )
  expect(badTokenStatus).toBeGreaterThanOrEqual(400)
  expect(badTokenStatus).toBeLessThan(500)

  // DF-4 修复后的回归收紧（07195ae1：吊销时钟量纲归一 epoch 秒 + 写路径
  // fail-closed）：已吊销 token 的页面写请求必须 4xx（实证 401
  // credential_invalid）。翻转自「现状断言 200（fail-open）」回归点。
  const visitorInput = frame.getByTestId('cs-input')
  const revokedWriteStatuses: number[] = []
  page.on('response', (res) => {
    if (res.url().includes('/messages') && res.request().method() === 'POST') revokedWriteStatuses.push(res.status())
  })
  await visitorInput.fill(`csww-e2e 吊销后消息 ${RUN_UNIQ}`)
  await frame.getByTestId('cs-send').click()
  await expect
    .poll(() => revokedWriteStatuses.length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  // 收紧断言：吊销后所有写请求均为 4xx 客户端拒绝（不允许任何 2xx/5xx）。
  expect(
    revokedWriteStatuses.every((status) => status >= 400 && status < 500),
    `revoked-token writes must all be 4xx, got ${JSON.stringify(revokedWriteStatuses)}`
  ).toBe(true)
})
