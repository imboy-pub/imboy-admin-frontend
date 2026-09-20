/**
 * P2-E2E-01 A01：四域真链主链（四个独立 browser context）。
 *
 * 1) 访客 = shop.test widget 宿主页（独立 context）；
 * 2) Admin 治理 = admin.test 管理面登录（平台 Cookie，独立 context）；
 * 3) 坐席 A / 4) 坐席 B = admin.test/customer-service/workspace（各自独立
 *    context），经真实 QR create →（预认证 API context scan/confirm）→
 *    QR subscribe SSE 收 JWT → 工作台挂载。
 *
 * 链路：访客发文本（页面）→ 坐席 A queue 渲染（页面）→ 页面接单【UI 写动作
 * 命中 DF-9：422 missing_workspace_id 实录】→ 等价通道 API claim → active 视
 * 图经 SSE 失效刷新渲染（页面）→ 会话详情请求同样 422（DF-9 实录，会话内容
 * 面不可用）→ 坐席回复经企业真源 API → 访客页面经 SSE message 帧实时渲染 →
 * ACK（企业真源 API）→ 附件（访客页面 widget 管线 presign/PUT/confirm）→
 * transfer A→B（API 等价）→ close（API 等价）→ 访客 SSE state 帧触发评分 UI
 * → 页面星级提交 → 治理面平台会话列表 + DB 双面证实 rating。
 *
 * DF-9（本 run 发现，证据=测试内实录的 422/405 响应；修复建议见报告）：
 * 工作台 API 层合同缺键 —— fetchDetail 缺 workspace_id query、claim/transfer/
 * close 缺 workspace_id body（后端 422 missing_workspace_id）、sendMessage 路
 * 径缺 /organizations/:org 段（后端 405）。生产源码对本任务 read-only，按等价
 * 通道覆盖并如实记录，不掩盖不伪绿。
 * DF-8（环境夹具绕开）：队列视图 total_by_status 在 active=0 时缺 active 键 →
 * toCounts fail-closed → 队列视图「请求失败」。预置 active 会话（真实 claim）
 * 使三键齐全。
 *
 * mock 禁令：无任何响应伪造；所有认证/写路径打真实后端。
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { SeatAgent, visitorApi as visitorApiFixture } from '../customer-service-real/helpers/agent-api'
import { SEAT_A, SEAT_B } from '../customer-service-real/helpers/env'
import { adminLogin, openPlatformSessions } from './helpers/admin-ui'
import { createCollector, watchPage, type BrowserGateCollector } from './helpers/browser-gate'
import {
  fetchAssetRows,
  fetchCanonicalMessages,
  fetchSessionRating,
  fetchSessionState,
} from './helpers/db-proof'
import { ADMIN_ORIGIN, INSTALLATION_ID, ORG_ID, PUBLIC_WIDGET_ID, SHOP_ORIGIN } from './helpers/env'
import { qrLoginSeat } from './helpers/qr-login'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** 失败/结束路径统一回收 context。 */
const openContexts: BrowserContext[] = []
test.afterAll(async () => {
  for (const context of openContexts.splice(0)) await context.close().catch(() => {})
})

/** 独立 context + 首页，并纳入浏览器门采集。 */
async function openContext(browser: Browser, collector: BrowserGateCollector, url: string): Promise<Page> {
  const context = await browser.newContext()
  openContexts.push(context)
  const page = await context.newPage()
  watchPage(collector, page)
  await page.goto(url)
  return page
}

test('A01 主链：四独立context（访客/Admin/坐席A/坐席B）QR登录→queue→claim→text/ACK→asset→transfer→close→页面评分→治理面与DB双证', async ({ browser }) => {
  const collector = createCollector()
  const df9WriteStatuses: Array<{ op: string; status: number }> = []
  const trackUiWrite = (page: Page, op: RegExp): void => {
    page.on('response', (res) => {
      if (op.test(res.url()) && res.request().method() === 'POST') {
        df9WriteStatuses.push({ op: res.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 80), status: res.status() })
      }
    })
  }

  // —— Admin 治理面（平台 Cookie；真实 SPA 登录表单）——
  const adminPage = await openContext(browser, collector, `${ADMIN_ORIGIN}/login`)
  await adminLogin(adminPage)

  // —— 容量防御 + 环境夹具（真实 API 动作，非 mock；DF-8 绕开见文件头）——
  const fixtureAgentA = await SeatAgent.login('A', SEAT_A.account, SEAT_A.identityId)
  const fixtureAgentB = await SeatAgent.login('B', SEAT_B.account, SEAT_B.identityId)
  for (const agent of [fixtureAgentA, fixtureAgentB]) {
    for (const stale of await agent.seatSessions(ORG_ID, 'active')) {
      const staleDetail = await agent.detail(ORG_ID, stale.id)
      await agent.close(ORG_ID, stale.id, staleDetail.version, 'p2-stale-cleanup')
    }
  }
  const fixtureBoot = await visitorApiFixture.bootstrap(ORG_ID, PUBLIC_WIDGET_ID, `p2-fixture-${RUN_UNIQ}`, SHOP_ORIGIN)
  const fixtureSession = await visitorApiFixture.createSession(ORG_ID, INSTALLATION_ID, fixtureBoot.secret)
  const fixtureQueued = await fixtureAgentB.queue(ORG_ID)
  const fixtureRow = fixtureQueued.find((item) => item.id === fixtureSession.id)
  expect(fixtureRow, 'fixture session must appear in queue').toBeTruthy()
  await fixtureAgentB.claim(ORG_ID, fixtureSession.id, fixtureRow!.version)

  // —— 坐席 A：QR create（页面）→ 预认证 API scan/confirm → subscribe SSE 收 JWT ——
  const seatA = await openContext(browser, collector, `${ADMIN_ORIGIN}/customer-service/workspace`)
  trackUiWrite(seatA, /\/claim/)
  await qrLoginSeat(seatA, SEAT_A.account)
  await expect(seatA.getByTestId('seat-org-select')).toHaveValue(ORG_ID)

  // —— 坐席 B：同链路独立 context ——
  const seatB = await openContext(browser, collector, `${ADMIN_ORIGIN}/customer-service/workspace`)
  await qrLoginSeat(seatB, SEAT_B.account)

  // —— 访客：shop.test widget 页 ——
  const page = await openContext(browser, collector, `${SHOP_ORIGIN}/`)
  if (process.env.CSWW_P2_DEBUG === '1') {
    page.on('response', (res) => {
      if (/presign|upload|confirm|assets/.test(res.url())) {
        void res
          .text()
          .then((b) => console.log('[a01-debug att]', res.status(), res.request().method(), res.url().slice(0, 110), b.slice(0, 140)))
          .catch(() => console.log('[a01-debug att]', res.status(), res.request().method(), res.url().slice(0, 110), '(no body)'))
      }
    })
    page.on('requestfailed', (req) => {
      if (/presign|upload|confirm|assets/.test(req.url())) console.log('[a01-debug att-fail]', req.method(), req.url().slice(0, 110), req.failure()?.errorText)
    })
  }
  // 页面活动会话真相：widget 为其会话打开的 SSE events 流（观察 ≠ 拦截）。
  let visitorSessionId = ''
  page.on('request', (req) => {
    const match = /\/api\/v1\/cs\/widget\/sessions\/(\d+)\/events/.exec(req.url())
    if (match !== null) visitorSessionId = match[1] ?? ''
  })
  await expect(page.getByTestId('cs-widget-launcher')).toBeVisible()
  await page.getByTestId('cs-widget-launcher').click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId('cs-consent-accept').click()
  const visitorText = `p2 访客咨询 ${RUN_UNIQ}`
  await expect(frame.getByTestId('cs-input')).toBeVisible()
  await frame.getByTestId('cs-input').fill(visitorText)
  await frame.getByTestId('cs-send').click()
  await expect(frame.getByTestId('cs-message-list')).toContainText(visitorText)
  await expect.poll(async () => visitorSessionId, { timeout: 20_000 }).not.toBe('')

  // —— 坐席 A 页面：queue 渲染会话（DF-8 夹具后视图可解析）——
  const aItem = seatA.getByTestId(`seat-session-item-${visitorSessionId}`)
  await expect
    .poll(async () => aItem.count(), { timeout: 30_000, intervals: [500, 1_000, 2_000] })
    .toBeGreaterThan(0)

  // —— 页面接单：UI claim 实发 422（DF-9 证据 #1）——
  const claimButton = seatA.getByTestId(`seat-claim-${visitorSessionId}`)
  await expect(claimButton).toBeEnabled()
  await claimButton.click()
  await expect
    .poll(() => df9WriteStatuses.filter((item) => item.op.includes('/claim')).length, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const claimWrite = df9WriteStatuses.find((item) => item.op.includes('/claim'))
  expect(claimWrite!.status, `DF-9: UI claim must fail 422, got ${JSON.stringify(df9WriteStatuses)}`).toBe(422)

  // —— 等价通道：API claim → active 视图经 SSE 失效刷新渲染（页面收敛）——
  await fixtureAgentA.claim(ORG_ID, visitorSessionId, 1)
  await seatA.getByTestId('seat-tab-active').click()
  await expect(seatA.getByTestId(`seat-session-item-${visitorSessionId}`)).toBeVisible({ timeout: 30_000 })

  // —— 会话详情：UI 选择会话 → detail GET 422（DF-9 证据 #2，会话内容面不可用）
  // —— 页面如实呈现「未选择」空态（detail=null 分支），不掩盖缺陷 ——
  const detail422: Array<number> = []
  seatA.on('response', (res) => {
    if (/\/sessions\/\d+\?*$/.test(res.url()) || (res.url().includes(visitorSessionId) && res.request().method() === 'GET' && res.url().includes('/sessions/'))) {
      detail422.push(res.status())
    }
  })
  await aItem.click()
  await expect
    .poll(() => detail422.filter((status) => status === 422).length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  await expect(seatA.getByTestId('seat-conversation-empty')).toBeVisible()

  // —— 坐席回复：等价通道企业真源 API → 访客页面经 SSE message 帧实时渲染 ——
  const agentReplyText = `p2 坐席回复 ${RUN_UNIQ}`
  const conversationId = (await fixtureAgentA.detail(ORG_ID, visitorSessionId)).conversation_id
  await fixtureAgentA.reply(ORG_ID, conversationId, `p2-reply-${RUN_UNIQ}`, agentReplyText)
  await expect(
    frame.locator('[data-testid="cs-message-list"] [data-role="agent"]').filter({ hasText: agentReplyText })
  ).toBeVisible({ timeout: 45_000 })

  // —— ACK（企业真源 API；DB 侧 read 事实由 canonical 行佐证）——
  const conversationMessages = await fixtureAgentA.listMessages(ORG_ID, conversationId)
  const visitorCanonical = conversationMessages.find((row) => row.sender_type === 'contact')
  expect(visitorCanonical, 'visitor canonical message must exist').toBeTruthy()
  await fixtureAgentA.ack(ORG_ID, conversationId, visitorCanonical!.id)

  // —— 附件：访客页面 widget 管线（presign→PUT→confirm→消息）——
  const attachmentName = `p2-attachment-${RUN_UNIQ}.txt`
  await frame
    .getByTestId('cs-file-input')
    .setInputFiles({ name: attachmentName, mimeType: 'text/plain', buffer: Buffer.from(`p2 payload ${RUN_UNIQ}`) })
  await expect(frame.locator('[data-testid="cs-att-state"][data-state="linked"]')).toBeVisible({ timeout: 45_000 })

  // —— transfer A→B：API 等价 → B 的 active 视图经 SSE 收敛渲染 ——
  const beforeTransfer = await fixtureAgentA.detail(ORG_ID, visitorSessionId)
  await fixtureAgentA.transfer(ORG_ID, visitorSessionId, beforeTransfer.version, SEAT_B.identityId)
  await expect
    .poll(async () => (await fixtureAgentA.detail(ORG_ID, visitorSessionId)).business_identity_id ?? '', { timeout: 20_000 })
    .toBe(SEAT_B.identityId)

  // —— 夹具收尾：关闭 B 的 fixture 会话（释放 B 容量；本会话 active 仍 ≥1）——
  const fixtureDetail = await fixtureAgentB.detail(ORG_ID, fixtureSession.id)
  await fixtureAgentB.close(ORG_ID, fixtureSession.id, fixtureDetail.version, 'p2-fixture-release')

  // —— close：API 等价 → B 的 active 视图渲染该会话（页面收敛）——
  await seatB.getByTestId('seat-tab-active').click()
  const bItem = seatB.getByTestId(`seat-session-item-${visitorSessionId}`)
  await expect(bItem).toBeVisible({ timeout: 30_000 })
  const beforeClose = await fixtureAgentB.detail(ORG_ID, visitorSessionId)
  await fixtureAgentB.close(ORG_ID, visitorSessionId, beforeClose.version, 'p2-e2e-close')

  // —— 评分：访客 SSE state(closed) 帧触发评分 UI → 页面星级提交 ——
  const star5 = frame.getByTestId('cs-rate-5')
  await expect(star5).toBeVisible({ timeout: 45_000 })
  await star5.click()
  await expect(frame.getByTestId('cs-overlay')).toContainText('感谢您的评价！', { timeout: 30_000 })

  // —— 权威双面证实 rating：治理面平台会话列表 + DB 直证 ——
  await expect
    .poll(async () => fetchSessionRating(visitorSessionId), { timeout: 30_000 })
    .toBe(5)
  const finalState = fetchSessionState(visitorSessionId)
  expect(finalState).not.toBeNull()
  expect(finalState!.status).toBe('closed')
  expect(finalState!.identity).toBe(SEAT_B.identityId)
  // 治理面：平台会话列表（Admin context，平台 Cookie）出现该会话且评级 5。
  await openPlatformSessions(adminPage)
  const sessionRow = adminPage.getByRole('row').filter({ hasText: visitorSessionId })
  await expect
    .poll(async () => sessionRow.count(), { timeout: 30_000, intervals: [500, 1_000, 2_000] })
    .toBeGreaterThan(0)
  await expect(sessionRow).toContainText('5', { timeout: 20_000 })

  // DB 直证：canonical message 行 + 附件绑定。
  const canonical = fetchCanonicalMessages(conversationId)
  expect(new Set(canonical.map((row2) => row2.sender_type))).toEqual(new Set(['contact', 'business_identity']))
  expect(canonical.some((row2) => row2.client_msg_id !== null)).toBe(true)
  await expect
    .poll(async () => fetchAssetRows(conversationId).filter((row2) => row2.messageBound).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1)

  // —— A05 浏览器门（本用例 4xx 仅 DF-9 写动作实录；零 5xx；console 零其他 error）——
  expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
  expect(
    collector.consoleErrors.filter((item) => !/Failed to load resource/.test(item.text)),
    JSON.stringify(collector.consoleErrors)
  ).toEqual([])
})
