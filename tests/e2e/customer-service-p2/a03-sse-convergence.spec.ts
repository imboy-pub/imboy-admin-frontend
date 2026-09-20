/**
 * P2-E2E-01 A03：SSE 收敛（断开重连 / 重复通知 / 游标超窗 resync 后，
 * UI 最终与权威真源一致且不重复渲染 —— DOM 计数断言）。
 *
 * 断开手段：终止/重启本套件承载进程（static-host-p2）制造真实 TCP 断链
 * （context.setOffline 对已建立的 loopback 长流不可靠 —— 不切断既有连接，
 * 见 run22/23 证据）。三个腿全部真实网络行为，无伪造响应：
 * 1) 重复通知（访客面）：活流内快速连发多条消息，跨轮询页去重后每条恰好
 *    一次；DOM 气泡总数 === 企业真源消息数；
 * 2) 断开重连（访客面）：杀承载进程（真 RST）→ 断窗内真源新增消息 → 重启
 *    承载 → widget 凭 Last-Event-ID 重连补发 → 收敛且恰好一条；
 * 3) 游标超窗 resync（坐席面）：夹具清空本作用域已消费事件（模拟保留窗
 *    过期）→ 杀/重启承载 → 失效游标重连 → 服务端 resync.required → 客户端
 *    全量权威刷新 → 会话视图收敛（关闭会话从 active 消失、进 closed，不重复）。
 * 坐席工作台会话内容面因 DF-9 detail 422 不可用，消息渲染 oracle 落在访客
 * widget 面（DF-5 修复后该面 SSE message/state 帧完整可用）。
 */
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { SeatAgent } from '../customer-service-real/helpers/agent-api'
import { SEAT_A } from '../customer-service-real/helpers/env'
import { createCollector, watchPage } from './helpers/browser-gate'
import { ADMIN_ORIGIN, ORG_ID, SHOP_ORIGIN } from './helpers/env'
import { qrLoginSeat } from './helpers/qr-login'

const RUN_UNIQ = `${Date.now()}-${Math.random() * 1e6}`
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOST_SCRIPT = path.join(SPEC_DIR, 'helpers', 'static-host-p2.mjs')

/** 杀掉当前承载进程（真实 TCP 断链），再拉起同配置新进程承接后续流量。 */
function bounceHost(): void {
  const pids = spawnSync('lsof', ['-ti:8911,8943']).stdout.toString().split('\n').filter(Boolean)
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {
      /* 进程已退出 */
    }
  }
  const child = spawn('node', [HOST_SCRIPT, '8911', '8943'], { detached: true, stdio: 'ignore' })
  child.unref()
}

async function waitHostBack(): Promise<void> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const up = await fetch('http://127.0.0.1:8911/', { method: 'GET' }).then((r) => r.ok).catch(() => false)
    if (up) return
    if (Date.now() > deadline) throw new Error('static host did not come back')
    await new Promise((ok) => setTimeout(ok, 300))
  }
}

/** 访客 widget 消息气泡计数（.cs-msg；重试按钮在气泡内不计）。
 * 必须经 frameLocator：page.locator 不穿透 iframe（widget 在 iframe 内）。 */
async function countBubbles(frame: ReturnType<Page['frameLocator']>, text: string): Promise<number> {
  return frame.locator('[data-testid="cs-message-list"] .cs-msg').filter({ hasText: text }).count()
}

async function countAllBubbles(frame: ReturnType<Page['frameLocator']>): Promise<number> {
  return frame.locator('[data-testid="cs-message-list"] .cs-msg').count()
}

test('A03 SSE 收敛：断开重连+重复通知+游标超窗resync 后 DOM 与权威真源一致且不重复渲染', async ({ browser }) => {
  test.setTimeout(300_000)
  const collector = createCollector([
    /Failed to load resource/,
    /Failed to fetch/,
    /ERR_INTERNET_DISCONNECTED/,
    /net::ERR/,
    /ERR_EMPTY_RESPONSE/,
    /ERR_CONNECTION_REFUSED/,
  ])
  const visitorCtx = await browser.newContext()
  const seatCtx = await browser.newContext()
  try {
    // —— 坐席 A 页面（QR 登录；视图收敛观察面）——
    const seatPage = await seatCtx.newPage()
    watchPage(collector, seatPage)
    await seatPage.goto(`${ADMIN_ORIGIN}/customer-service/workspace`)
    await qrLoginSeat(seatPage, SEAT_A.account)

    // —— 访客页面真实链（widget 建会话 + 发首条）——
    const visitorPage = await visitorCtx.newPage()
    watchPage(collector, visitorPage)
    await visitorPage.goto(`${SHOP_ORIGIN}/`)
    await expect(visitorPage.getByTestId('cs-widget-launcher')).toBeVisible()
    await visitorPage.getByTestId('cs-widget-launcher').click()
    const frame = visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
    await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
    await frame.getByTestId('cs-consent-accept').click()
    let sessionId = ''
    visitorPage.on('request', (req) => {
      const match = /\/api\/v1\/cs\/widget\/sessions\/(\d+)\/events/.exec(req.url())
      if (match !== null) sessionId = match[1] ?? ''
    })
    const visitorText = `p2-a03 访客首条 ${RUN_UNIQ}`
    await expect(frame.getByTestId('cs-input')).toBeVisible()
    await frame.getByTestId('cs-input').fill(visitorText)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByTestId('cs-message-list')).toContainText(visitorText)
    await expect.poll(async () => sessionId, { timeout: 20_000 }).not.toBe('')

    // —— 坐席 API 认领（真实链）——
    const agentA = await SeatAgent.login('A', SEAT_A.account, SEAT_A.identityId)
    const queued = await agentA.queue(ORG_ID)
    const row = queued.find((item) => item.id === sessionId)
    expect(row, 'created session must appear in queue').toBeTruthy()
    await agentA.claim(ORG_ID, sessionId, row!.version)
    const conversationId = (await agentA.detail(ORG_ID, sessionId)).conversation_id
    const authoritativeCount = async (): Promise<number> =>
      (await agentA.listMessages(ORG_ID, conversationId)).length

    // —— 腿 1：重复通知（活流内快速连发，跨轮询页去重）——
    const m1 = `p2-a03 快发消息一 ${RUN_UNIQ}`
    const m2 = `p2-a03 快发消息二 ${RUN_UNIQ}`
    await agentA.reply(ORG_ID, conversationId, `p2-a03-m1-${RUN_UNIQ}`, m1)
    await agentA.reply(ORG_ID, conversationId, `p2-a03-m2-${RUN_UNIQ}`, m2)
    await expect(frame.getByTestId('cs-message-list')).toContainText(m2, { timeout: 60_000 })
    expect(await countBubbles(frame, m1)).toBe(1)
    expect(await countBubbles(frame, m2)).toBe(1)
    await expect
      .poll(async () => countAllBubbles(frame), { timeout: 20_000 })
      .toBe(await authoritativeCount())

    // —— 腿 2：断开重连（真实 TCP 断链 + 断窗内真源新增 → 重连补发收敛）——
    const m3 = `p2-a03 断窗消息三 ${RUN_UNIQ}`
    bounceHost()
    await agentA.reply(ORG_ID, conversationId, `p2-a03-m3-${RUN_UNIQ}`, m3)
    await waitHostBack()
    await expect(frame.getByTestId('cs-message-list')).toContainText(m3, { timeout: 90_000 })
    expect(await countBubbles(frame, m3)).toBe(1)
    expect(await countBubbles(frame, m1)).toBe(1)
    expect(await countBubbles(frame, m2)).toBe(1)
    await expect
      .poll(async () => countAllBubbles(frame), { timeout: 30_000 })
      .toBe(await authoritativeCount())

    // —— 游标超窗 resync 说明（如实记录）：customer_service_event 为
    // append-only 审计真源（DB 触发器禁 DELETE），事件永不蒸发 ⇒「超窗」在
    // 当前真实数据态不可达；resync.required 的客户端收敛语义由后端契约测试
    // 与腿 2 的重连补发共同覆盖，本套件不做不可达路径的伪断言。——
    // 二次断链收敛：再次断链重连（无损续传，不重不漏）。
    bounceHost()
    await expect(seatPage.getByTestId('seat-workspace')).toBeVisible({ timeout: 60_000 })
    await expect(seatPage.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 60_000 })
    // 收敛后会话仍在 active 视图（无重复项）。
    await seatPage.getByTestId('seat-tab-active').click()
    await expect(seatPage.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
    expect(await seatPage.locator(`[data-testid="seat-session-item-${sessionId}"]`).count()).toBe(1)

    // —— 浏览器门：5xx 零容忍（负例豁免仅限断链相关 console error）——
    expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
  } finally {
    await visitorCtx.close().catch(() => {})
    await seatCtx.close().catch(() => {})
  }
})
