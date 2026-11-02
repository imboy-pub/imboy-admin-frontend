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
import { fetchSeatState, latestVisitTokenRowSince, removeSeatRow, restoreSeatRow } from './helpers/db-proof'
import { ADMIN_ORIGIN, seatConsoleUrl, ORG_ID, SHOP_ORIGIN } from './helpers/env'
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
    restoreSeatRow(ORG_ID, SEAT_B.identityId, SEAT_A.userId)
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
      const url = res.url()
      if (url.includes('/messages') && res.request().method() === 'POST') revokedWriteStatuses.push(res.status())
    })
    // DF-10（be-s01 374ace79）+ W12 根因⑨修复（S6 撤销立即生效：derive_org_by_token
    // 统一 token_usable 裁决）后的语义链：吊销 → 既有流内 poll 命中 token_revoked
    // → fin 关流（后端行为，curl 端到端实证）→ 写通道对该 visit token 持续 4xx
    // （吊销不可恢复；前端可能走 subject 复用 re-bootstrap 拿新 token 恢复 UI，
    // 旧凭证的写拒绝不受影响——网络层判据独立于前端呈现）。
    await frame.getByTestId('cs-input').fill(`p2-a04 吊销后写一 ${RUN_UNIQ}`)
    await frame.getByTestId('cs-send').click()
    await expect.poll(() => revokedWriteStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(revokedWriteStatuses.every((status) => status >= 400 && status < 500), `got ${JSON.stringify(revokedWriteStatuses)}`).toBe(true)
    // 前端最终呈现（截图实证）：流 fin 后 fail-closed 错误态页（「客服暂时
    // 不可用 / 接入凭证已失效」+ 重试入口 cs-retry-bootstrap）瞬时出现；其后
    // 前端按 subject 复用 re-bootstrap 自动恢复 UI（匿名访客产品语义，恢复
    // 后输入框回归）——故只断言错误态入口出现过，不断言写入口收回的终态。
    await expect(frame.getByTestId('cs-retry-bootstrap').or(frame.getByTestId('cs-banner').filter({ hasText: /重连|离线/ }))).toBeVisible({ timeout: 30_000 })

    // ===== 腿 2：坐席面 disabled（流内 revoked → 写入口收回 → 重连 403）=====
    expect(fetchSeatState(ORG_ID, SEAT_B.identityId)?.enabled ?? false, 'seat B must start enabled').toBe(true)
    const seatPage = await seatCtx.newPage()
    watchPage(collector, seatPage)
    await seatPage.goto(seatConsoleUrl(ADMIN_ORIGIN))
    await qrLoginSeat(seatPage, SEAT_B.account)
    // 坐席是多 org member（历史 run 残留 membership）：org-select 默认值可能是
    // 其他 org —— 事件流按选中 org 作用域建立，必须显式切到目标 org 再验证
    // 撤权降级（W12 根因⑭：默认选错 org → 主 org 的 suspend 事件不可见）。
    const orgSelect = seatPage.getByTestId('seat-org-select')
    if ((await orgSelect.inputValue()) !== ORG_ID) await orgSelect.selectOption(ORG_ID)
    await expect(seatPage.getByTestId('seat-org-select')).toHaveValue(ORG_ID, { timeout: 15_000 })
    await expect(seatPage.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 45_000 })

    // 生产动作停用（suspend_seat 落 seat.suspended 事件——流内 revoked 信封的
    // 事实来源；psql 直改 enabled 列不落事件，流永不知情——W12 根因⑪）。
    await agentA.setSeatEnabled(ORG_ID, SEAT_B.identityId, false)
    // 流内 revoked 信封的**可观测终态**（二选一）：(a) aria-live 播报「写入口
    // 已收回」；(b) 前端 failover——多 org 坐席在主 org 被停用后自动切到其他
    // 可用 org（org-select 不再是主 org）。文案随 scope 切换为瞬态，终态断言
    // 才是撤权可感知的稳定证据（W12 根因⑭调试结论：帧已达前端——contexts 403
    // 与 org failover 均为其后果）。
    // evaluate 直读主文档 DOM：live-region 文案与 org failover 均可能为瞬态
    // （W12 调试结论：locator 断言与实际 DOM 解析不一致时，evaluate 是可对照
    // 视角）；稳定终态断言在下方整页收敛检查。
    await expect
      .poll(
        async () => {
          return seatPage.evaluate(() => {
            const live = document.querySelector('[data-testid="seat-live-region"]')?.textContent ?? ''
            if (live.includes('写入口已收回')) return 'live-region'
            const orgValue = (document.querySelector('[data-testid="seat-org-select"]') as HTMLSelectElement | null)?.value ?? ''
            if (orgValue !== '' && orgValue !== '1603940848519155') return 'failover:' + orgValue
            if (document.body?.textContent?.includes('没有可用坐席上下文') || document.body?.textContent?.includes('没有已启用的坐席上下文')) {
              return 'forbidden-page'
            }
            return ''
          })
        },
        { timeout: 90_000, intervals: [1_000, 2_000, 5_000] },
      )
      .not.toBe('')
    // 流关闭后重连 403（fail-closed）→ 上下文复核 → 禁用可解释态（整页收敛）。
    await expect(seatPage.getByText(/没有可用坐席上下文|没有已启用的坐席上下文/)).toBeVisible({ timeout: 90_000 })

    // ===== 腿 3：offboarding（assignment ended → 权限拒绝态）=====
    // 先恢复启用（夹具对称；生产 resume 动作落 seat.resumed 事件），再新开页面
    // 重新 QR 登录（token 仅内存，不跨刷新），移除坐席行后复核权限拒绝可解释态。
    await agentA.setSeatEnabled(ORG_ID, SEAT_B.identityId, true)
    expect(fetchSeatState(ORG_ID, SEAT_B.identityId)?.enabled ?? false).toBe(true)
    const seatPage2 = await seatCtx.newPage()
    watchPage(collector, seatPage2)
    await seatPage2.goto(seatConsoleUrl(ADMIN_ORIGIN))
    await qrLoginSeat(seatPage2, SEAT_B.account)
    const orgSelect2 = seatPage2.getByTestId('seat-org-select')
    if ((await orgSelect2.inputValue()) !== ORG_ID) await orgSelect2.selectOption(ORG_ID)
    await expect(orgSelect2).toHaveValue(ORG_ID, { timeout: 15_000 })
    await expect(seatPage2.getByTestId('seat-connection-status')).toContainText('实时连接正常', { timeout: 45_000 })
    expect(removeSeatRow(ORG_ID, SEAT_B.identityId), 'offboarding fixture must remove seat row').toBe(true)
    await expect(seatPage2.getByText(/没有可用坐席上下文|没有已启用的坐席上下文/)).toBeVisible({ timeout: 90_000 })

    // ===== 浏览器门：5xx 零容忍（预期 4xx 负例已豁免 console error）=====
    expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
  } finally {
    restoreSeatRow(ORG_ID, SEAT_B.identityId, SEAT_A.userId)
    await visitorCtx.close().catch(() => {})
    await seatCtx.close().catch(() => {})
  }
})
