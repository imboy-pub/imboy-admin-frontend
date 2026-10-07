/**
 * SC-E2E — Q07/AC18 浏览器面缺口收敛：SSE 断线/超窗重同步
 * （negatives-resync.spec.ts，R1/R2）。
 *
 * 缺口出处：Q07 测试设计 §4——「SSE 断线/超窗重同步：backend
 * seat_sse_checks reconnect（`last-event-id` 重放精确相等 + 初始
 * `resync.required` 事件）已有，**浏览器面未覆盖**（spec 无 setOffline/
 * 断线重连用例）」。本文件补浏览器面：
 *
 *   R1 坐席侧断线重同步（真实网关故障注入）：A 在线收 M1 → 停 harness
 *      nginx 网关（SSE 存量流真实断开——Chromium setOffline 不终止已建立
 *      的 fetch 流，实测坐席保持 online，故故障注入走网关进程级停/起）→
 *      坐席「连接断开」→ 重启网关 → 访客发 M2（坐席尚在重连退避窗口）→
 *      SSE 按 Last-Event-ID 补偿重连 → M2 补齐（不丢）、M1 不重复（不重）。
 *   R2 访客侧断线重同步：访客在线收 R2a → 访客 context setOffline →
 *      坐席发 R2b → 访客恢复 → widget eventStream 重连（Last-Event-ID
 *      补偿）→ R2b 到达、R2a 恰一次。
 *
 * 与 backend 合同的对齐点（cs seat SSE reconnect 冻结合同）：
 *   - 重连请求携带 `Last-Event-ID`（事件 id 去重器保证不重复消费）；
 *   - 超窗（服务端游标已清空）时下发 `resync.required` → 客户端全量权威
 *     刷新（游标清空 + 去重器重置，workbenchHooks §3.6 收敛）。
 *   浏览器面以「UI 消息序不丢不重」为 oracle（HTTP/帧级精确相等由
 *   customer_service_seat_sse_checks.erl 承担；两端口径互补不重复）。
 *
 * ⛔ EXECUTE-GATED：与 journey.spec.ts 同款，SC153_E2E_EXECUTE=1 才执行。
 * 真实栈纪律不变：零 page.route、零 mock backend；网关停/起是对本 run
 * harness 自建隔离拓扑的真实故障注入（README 口径：套件独占串行）。
 */
import { execFileSync } from 'node:child_process'

import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import {
  closeStaleActiveSessions,
  EXECUTE_ENABLED,
  GW_PORT,
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

/** 定位本 run harness 的 nginx.conf（WORKDIR 是 mktemp 随机目录；取最新实例）。 */
function harnessNginxConf(): string {
  const conf = execFileSync('bash', [
    '-c',
    'ls -t /tmp/sc153-seat-embed-harness.*/nginx.conf 2>/dev/null | head -1',
  ]).toString().trim()
  if (conf.length === 0) {
    throw new Error('未找到 harness nginx.conf（/tmp/sc153-seat-embed-harness.*）——请先运行 fixtures/harness-seat-embed.sh')
  }
  return conf
}

/**
 * 网关故障注入（R1）：停 harness 专属 nginx（按 GW_PORT 找 listener，master =
 * ppid=1 的 daemon 进程；系统常驻 nginx 不受影响）→ SSE 存量流真实断开。
 */
function gatewayStop(): void {
  const listeners = execFileSync('bash', [
    '-c',
    `lsof -nP -tiTCP:${GW_PORT} -sTCP:LISTEN`,
  ])
    .toString()
    .trim()
    .split('\n')
    .filter((p) => p.length > 0)
  const masters = listeners.filter((pid) => {
    const ppid = execFileSync('bash', ['-c', `ps -o ppid= -p ${pid}`]).toString().trim()
    return ppid === '1'
  })
  if (masters.length === 0) {
    throw new Error(`GW_PORT ${GW_PORT} 上无 daemonized nginx master（网关未按 harness 拓扑运行）`)
  }
  for (const master of masters) {
    process.kill(Number(master), 'SIGTERM')
  }
}

/** 网关恢复（R1）：按 harness conf 重启 nginx（与 harness g 段同款命令）。 */
function gatewayStart(): void {
  execFileSync('nginx', ['-c', harnessNginxConf()])
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

      // —— 真实断线：停 harness 网关（SSE 存量流被服务端终止，触发客户端
      //     重连失败计数 → offline；Chromium setOffline 不断已建立流，
      //     实测坐席保持 online，故用网关进程级故障注入）。——
      gatewayStop()
      // 坐席 UI 呈现离线（连接失败计数达阈值后状态条切「连接断开」）。
      await expect(frameA.getByTestId('seat-connection-status')).toContainText('连接断开', { timeout: 60_000 })

      // —— 网关恢复；坐席尚在重连退避窗口时访客发 M2（真实落库）。
      gatewayStart()
      const m2 = `sc153 R1 离线期消息 ${RUN_UNIQ}`
      await widget().getByTestId('cs-input').fill(m2)
      await widget().getByTestId('cs-send').click()
      await expect
        .poll(() => messageCount(sessionId), { timeout: 20_000, message: '离线期消息必须已落库（DB 真源）' })
        .toBeGreaterThanOrEqual(2)
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
