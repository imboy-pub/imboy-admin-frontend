/**
 * SC-E2E — Q07/AC18 浏览器面缺口收敛：SSE 断线/超窗重同步
 * （negatives-resync.spec.ts，R1/R2）。
 *
 * 缺口出处：Q07 测试设计 §4——「SSE 断线/超窗重同步：backend
 * seat_sse_checks reconnect（`last-event-id` 重放精确相等 + 初始
 * `resync.required` 事件）已有，**浏览器面未覆盖**（spec 无 setOffline/
 * 断线重连用例）」。本文件补浏览器面：
 *
 *   R1 坐席侧断线重同步：A 在线收 M1 → context.setOffline() → 连接状态
 *      「连接断开」→ 访客发 M2（A 离线期间落库）→ setOnline() → SSE 按
 *      Last-Event-ID 补偿重连 → M2 补齐（不丢）、M1 不重复出现（不重）。
 *   R2 访客侧断线重同步：访客在线收 R2a → 访客 offline → 坐席发 R2b →
 *      访客恢复 → widget eventStream 重连（Last-Event-ID 补偿）→ R2b 到达、
 *      R2a 恰一次。
 *
 * 与 backend 合同的对齐点（cs seat SSE reconnect 冻结合同）：
 *   - 重连请求携带 `Last-Event-ID`（事件 id 去重器保证不重复消费）；
 *   - 超窗（服务端游标已清空）时下发 `resync.required` → 客户端全量权威
 *     刷新（游标清空 + 去重器重置，workbenchHooks §3.6 收敛）。
 *   浏览器面以「UI 消息序不丢不重」为 oracle（HTTP/帧级精确相等由
 *   customer_service_seat_sse_checks.erl 承担；两端口径互补不重复）。
 *
 * ⛔ EXECUTE-GATED：与 journey.spec.ts 同款，SC153_E2E_EXECUTE=1 才执行。
 * 真实栈纪律不变：零 page.route、零 mock backend；setOffline 是 Chromium
 * 网络栈的真实离线（非 API mock）。
 */
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import {
  closeStaleActiveSessions,
  EXECUTE_ENABLED,
  ORG_ID,
  psql,
  SEAT,
  SHOP,
  WORKSPACE_ID,
} from './helpers/env'
import { createVisitorSession, embedFrame, openSeatEmbed, qrLoginSeatInFrame } from './helpers/qr-embed'

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: 同 journey.spec.ts（SC153_E2E_EXECUTE=1 才跑真实旅程）')

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
/** 本 run 时间窗（F5 口径）。 */
const RUN_SINCE = new Date()

/** 访客真实建会话（水位线定位，journey.spec.ts 同款副本）。 */
async function newVisitorSession(visitorPage: Page): Promise<{ sessionId: string }> {
  const beforeMax = psql(
    `SELECT coalesce(max(id), 0) FROM customer_service_session` +
      ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID}`,
  )
  await createVisitorSession(visitorPage, RUN_UNIQ)
  const row = psql(
    `SELECT id FROM customer_service_session` +
      ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID}` +
      ` AND id > ${beforeMax.trim()} ORDER BY id ASC LIMIT 1`,
  )
  const [sessionId] = row.split('|')
  expect(sessionId?.length ?? 0).toBeGreaterThan(0)
  return { sessionId }
}

/** claim 链（journey.spec.ts 同款副本）。 */
async function claimAndOpenSession(frame: FrameLocator, sessionId: string): Promise<void> {
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-claim-${sessionId}`).click()
  await frame.getByTestId('seat-tab-active').click()
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-session-item-${sessionId}`).click()
  await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
}

/** 坐席A 登录工作台（journey.spec.ts 同款副本）。 */
async function openSeatAWorkspace(browser: import('@playwright/test').Browser): Promise<Page> {
  const { page } = await openSeatEmbed(browser, SHOP)
  await qrLoginSeatInFrame(page, SEAT.account)
  return page
}

/** 本会话 enterprise_message 行数（DB 真源；断线期间落库的离线消息由它直证）。 */
function messageCount(sessionId: string): number {
  return Number(
    psql(
      `SELECT count(*) FROM enterprise_message WHERE conversation_id =` +
        ` (SELECT conversation_id FROM customer_service_session WHERE id = ${sessionId})`,
    ),
  )
}

test.describe('SC-E2E SSE 断线重同步 R1/R2（EXECUTE-GATED）', () => {
  // ---------------------------------------------------------------- R1
  test('R1 坐席侧断线重同步：离线期访客消息落库 → 恢复后补齐且不重复', async ({ browser }) => {
    test.setTimeout(360_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatAPage: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)
      seatAPage = await openSeatAWorkspace(browser)
      const frameA = embedFrame(seatAPage)
      await claimAndOpenSession(frameA, sessionId)

      // 在线基线：访客发 M1，坐席 SSE 实时收到。
      const m1 = `sc153 R1 在线消息 ${RUN_UNIQ}`
      const widget = () => visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
      await widget().getByTestId('cs-input').fill(m1)
      await widget().getByTestId('cs-send').click()
      await expect(frameA.getByTestId('seat-message-list').getByText(m1)).toBeVisible({ timeout: 20_000 })

      // —— 真实断线：坐席 context（宿主页 + seat iframe 同一 context）offline；
      //     访客是独立 context 保持在线，可继续发消息。 ——
      const seatContext = seatAPage.context()
      await seatContext.setOffline(true)
      // 坐席 UI 呈现离线（connection status「连接断开」+ offline banner 重试入口）。
      await expect(frameA.getByTestId('seat-connection-status')).toContainText('连接断开', { timeout: 30_000 })

      // 访客（另一 context，仍在线）发 M2：真实落库（坐席离线不阻断访客链路）。
      const m2 = `sc153 R1 离线期消息 ${RUN_UNIQ}`
      await widget().getByTestId('cs-input').fill(m2)
      await widget().getByTestId('cs-send').click()
      await expect
        .poll(() => messageCount(sessionId), { timeout: 20_000, message: '离线期消息必须已落库（DB 真源）' })
        .toBeGreaterThanOrEqual(2)

      // —— 恢复：SSE 重连（Last-Event-ID 补偿 / 超窗 resync.required 全量刷新）。——
      await seatContext.setOffline(false)
      // 恢复在线状态。
      await expect(frameA.getByTestId('seat-connection-status')).toContainText(/实时连接正常|重连中/, { timeout: 60_000 })
      // M2 补齐（不丢）。
      await expect(frameA.getByTestId('seat-message-list').getByText(m2)).toBeVisible({ timeout: 60_000 })
      // M1 不重复（不重：消息区恰出现一次）。
      await expect(frameA.getByTestId('seat-message-list').getByText(m1)).toHaveCount(1)
      // 稳态：连接恢复后状态回归在线。
      await expect(frameA.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 60_000 })
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- R2
  test('R2 访客侧断线重同步：坐席离线期回复 → 访客恢复后收到且不重复', async ({ browser }) => {
    test.setTimeout(360_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatAPage: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)
      seatAPage = await openSeatAWorkspace(browser)
      const frameA = embedFrame(seatAPage)
      await claimAndOpenSession(frameA, sessionId)

      // 在线基线：坐席回复 R2a，访客 widget 实时收到。
      const r2a = `sc153 R2 在线回复 ${RUN_UNIQ}`
      await frameA.getByTestId('seat-composer').fill(r2a)
      await frameA.getByTestId('seat-send').click()
      await expect(frameA.getByTestId('seat-send-error')).toHaveCount(0)
      const widget = () => visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
      await expect(widget().getByTestId('cs-message-list').getByText(r2a)).toBeVisible({ timeout: 20_000 })

      // 访客真实断线（宿主页 + widget iframe 同 context）。
      await visitorCtx.setOffline(true)

      // 坐席（仍在线）发 R2b：真实落库。
      const r2b = `sc153 R2 离线期回复 ${RUN_UNIQ}`
      await frameA.getByTestId('seat-composer').fill(r2b)
      await frameA.getByTestId('seat-send').click()
      await expect(frameA.getByTestId('seat-send-error')).toHaveCount(0)
      await expect
        .poll(() => messageCount(sessionId), { timeout: 20_000, message: '离线期坐席回复必须已落库' })
        .toBeGreaterThanOrEqual(2)

      // 访客恢复：widget eventStream 重连（Last-Event-ID 补偿）→ R2b 到达（不丢）。
      await visitorCtx.setOffline(false)
      await expect(widget().getByTestId('cs-message-list').getByText(r2b)).toBeVisible({ timeout: 60_000 })
      // R2a 恰一次（不重）。
      await expect(widget().getByTestId('cs-message-list').getByText(r2a)).toHaveCount(1)
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })
})
