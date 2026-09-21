/**
 * P2-E2E-01 A04：撤权降级（revoked / disabled / offboarding 后，下一请求与
 * 既有 SSE 流立即降级 —— UI 回登录/禁用态，流关闭）。
 *
 * - 访客面 revoked：治理面吊销 visit token → 页面下一写请求 4xx（401）+
 *   消息失败态；既有 SSE 流降级（重连被拒 → 离线/重连横幅）；
 * - 坐席面 disabled：停用坐席（真实治理动作的落库等价物）→ 既有事件流内
 *   revoked 信封 → 写入口立即收回（aria-live 播报）→ 流关闭后重连被 403 拒
 *   （fail-closed）→ 上下文复核收敛禁用可解释态；
 * - 坐席面 offboarding：坐席行移除（assignment ended 落库等价物）→ 权限
 *   拒绝可解释态（用例结束恢复种子行）。
 */
import { expect, test } from '@playwright/test'
import { SeatAgent } from '../customer-service-real/helpers/agent-api'
import { SEAT_A, SEAT_B } from '../customer-service-real/helpers/env'
import { createCollector, watchPage } from './helpers/browser-gate'
import { fetchSeatState, latestVisitTokenRowSince, removeSeatRow, restoreSeatRow, setSeatEnabled } from './helpers/db-proof'
import { ADMIN_ORIGIN, ORG_ID, SHOP_ORIGIN } from './helpers/env'
import { qrLoginSeat } from './helpers/qr-login'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('A04 撤权降级：访客token吊销写4xx+流降级；坐席停用流内revoked收回写入口+重连403；offboarding权限拒绝态', async ({ browser }) => {
  test.setTimeout(300_000)
  const collector = createCollector([
    /Failed to load resource/,
    /Failed to fetch/,
    /ERR_INTERNET_DISCONNECTED/,
    /net::ERR/,
  ])
  const visitorCtx = await browser.newContext()
  const seatCtx = await browser.newContext()
  try {
    // 幂等夹具：历次失败运行可能把坐席 B 停在 disabled/removed——先恢复种子行，
    // 保证腿 2「B must start enabled」的前置恒成立。
    restoreSeatRow(ORG_ID, SEAT_B.identityId, SEAT_A.identityId)
    // ===== 腿 1：访客面 visit token revoked =====
    const visitorPage = await visitorCtx.newPage()
    watchPage(collector, visitorPage)
    await visitorPage.goto(`${SHOP_ORIGIN}/`)
    await expect(visitorPage.getByTestId('cs-widget-launcher')).toBeVisible()
    await visitorPage.getByTestId('cs-widget-launcher').click()
    const frame = visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
    await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
    await frame.getByTestId('cs-consent-accept').click()
    await expect(frame.getByTestId('cs-input')).toBeVisible({ timeout: 20_000 })

    // 治理面（owner 坐席 A API）吊销页面 app 的 visit token（页面窗口内最新行）。
    const agentA = await SeatAgent.login('A', SEAT_A.account, SEAT_A.identityId)
    const pageOpenedAt = new Date(Date.now() - 3_000).toISOString()
    const visitTokenId = latestVisitTokenRowSince(ORG_ID, pageOpenedAt)
    expect(visitTokenId, 'widget app visit token row must exist').toBeTruthy()
    await agentA.revokeVisitToken(ORG_ID, visitTokenId!)

    // 下一写请求 4xx（页面真实发送）+ 消息失败态；连续多次写均 4xx —— 写通道
    // 持续降级、无恢复。
    const revokedWriteStatuses: number[] = []
    visitorPage.on('response', (res) => {
      if (res.url().includes('/messages') && res.request().method() === 'POST') revokedWriteStatuses.push(res.status())
    })
    await frame.getByTestId('cs-input').fill(`p2-a04 吊销后写一 ${RUN_UNIQ}`)
    await frame.getByTestId('cs-send').click()
    await expect.poll(() => revokedWriteStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0)
    await frame.getByTestId('cs-input').fill(`p2-a04 吊销后写二 ${RUN_UNIQ}`)
    await frame.getByTestId('cs-send').click()
    await expect.poll(() => revokedWriteStatuses.length, { timeout: 30_000 }).toBeGreaterThan(1)
    await frame.getByTestId('cs-input').fill(`p2-a04 吊销后写三 ${RUN_UNIQ}`)
    await frame.getByTestId('cs-send').click()
    await expect.poll(() => revokedWriteStatuses.length, { timeout: 30_000 }).toBeGreaterThan(2)
    expect(revokedWriteStatuses.every((status) => status >= 400 && status < 500), `got ${JSON.stringify(revokedWriteStatuses)}`).toBe(true)
    // 三次写各产一条 failed 气泡（各带重发按钮）——断言任一可见即可。
    await expect(frame.getByTestId('cs-msg-retry').first()).toBeVisible({ timeout: 20_000 })
    // DF-10 已修复（be-s01 374ace79）：后端流内轮询命中吊销族终态即立即 fin
    // 关流（poll 周期 ≤15s）→ 前端重连 4xx fail-closed → banner 停在重连中/
    // 离线 —— 撤权对访客可感知降级（任务书 A04「既有流立即降级」）。
    const banner = frame.getByTestId('cs-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await expect(banner).toContainText(/重连中|离线/)

    // ===== 腿 2：坐席面 disabled（流内 revoked → 写入口收回 → 重连 403）=====
    expect(fetchSeatState(ORG_ID, SEAT_B.identityId)?.enabled ?? false, 'seat B must start enabled').toBe(true)
    const seatPage = await seatCtx.newPage()
    watchPage(collector, seatPage)
    await seatPage.goto(`${ADMIN_ORIGIN}/customer-service/workspace`)
    await qrLoginSeat(seatPage, SEAT_B.account)
    await expect(seatPage.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 45_000 })

    setSeatEnabled(ORG_ID, SEAT_B.identityId, false)
    // 流内 revoked 信封：aria-live 区域播报，写入口立即收回。
    await expect(seatPage.getByTestId('seat-live-region')).toContainText('坐席已暂停或离岗，写入口已收回', { timeout: 90_000 })
    // 流关闭后重连 403（fail-closed）→ 上下文复核 → 禁用可解释态（整页收敛）。
    await expect(seatPage.getByText(/没有可用坐席上下文|没有已启用的坐席上下文/)).toBeVisible({ timeout: 90_000 })

    // ===== 腿 3：offboarding（assignment ended → 权限拒绝态）=====
    // 先恢复启用（夹具对称），再新开页面重新 QR 登录（token 仅内存，不跨刷新），
    // 移除坐席行后复核权限拒绝可解释态。
    setSeatEnabled(ORG_ID, SEAT_B.identityId, true)
    expect(fetchSeatState(ORG_ID, SEAT_B.identityId)?.enabled ?? false).toBe(true)
    const seatPage2 = await seatCtx.newPage()
    watchPage(collector, seatPage2)
    await seatPage2.goto(`${ADMIN_ORIGIN}/customer-service/workspace`)
    await qrLoginSeat(seatPage2, SEAT_B.account)
    await expect(seatPage2.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 45_000 })
    expect(removeSeatRow(ORG_ID, SEAT_B.identityId), 'offboarding fixture must remove seat row').toBe(true)
    await expect(seatPage2.getByText(/没有可用坐席上下文|没有已启用的坐席上下文/)).toBeVisible({ timeout: 90_000 })

    // ===== 浏览器门：5xx 零容忍（预期 4xx 负例已豁免 console error）=====
    expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
  } finally {
    restoreSeatRow(ORG_ID, SEAT_B.identityId, SEAT_A.identityId)
    await visitorCtx.close().catch(() => {})
    await seatCtx.close().catch(() => {})
  }
})
