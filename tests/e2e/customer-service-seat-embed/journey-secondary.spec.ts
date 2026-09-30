/**
 * SC-E2E — REVIEW-4 F12「次要旅程缺步」补齐（B01..B03）。
 *
 * ⛔ EXECUTE-GATED：同 journey.spec.ts（`SC153_E2E_EXECUTE=1` 才执行）。A0 在
 * SC-INT PASS + candidate manifest 冻结后置位；FIXTURE_ONLY 阶段 0 条执行
 * （skipped 分类 = EXECUTE_GATED）。
 *
 * 真实栈纪律（与 journey.spec 同款）：零 page.route、零 mock backend、零伪造行；
 * PG oracle 只经容器内 psql（只读 SELECT + 测试夹具显式 UPDATE 做前置清理与
 * finally 复原，均为文档化 oracle）。每个用例的断言口径以组件/API 的真实
 * 实现为准（取证见各用例注释），产品里不存在的入口不造测试。
 *
 * 与 journey.spec.ts 的关系：其 helper（newVisitorSession / claimAndOpenSession /
 * countBusinessIdentityMessages / openLoggedWorkspace）均为文件内私有函数且
 * 本铁律禁止改动 journey.spec.ts 的非 A07 区域 —— 本文件自带同款副本
 * （语义逐字对齐，注释标注来源）。
 *
 * 三个次要旅程（取证链摘要，详见用例内注释）：
 *   B01 访客重入见历史 —— 前端 sessionStorage 短期 subject 恢复
 *       （visitStorage.ts，FE-W01）+ 后端 create_session 幂等接续
 *       （cs_widget_session_app.erl ensure_single_open）；
 *   B02 坐席 org/ws 切换器 —— SeatWorkspacePage header 真实 select；
 *       种子单 ws（psql 实证）→ 降级为存在性 + 与 seat-contexts 服务端
 *       事实一致性断言，不造第二个 ws 假数据；
 *   B03 presence away→resume —— 顶栏真实手动入口（presenceBar.tsx 的
 *       「设为离开/恢复自动」按钮；产品无客户端 idle 自动 away，无需等
 *       超时），PUT 往返 + DB 落库直证 + 派生复原。
 */
import { expect, test, type Browser, type FrameLocator, type Page } from '@playwright/test'
import {
  closeStaleActiveSessions,
  EXECUTE_ENABLED,
  IDENTITY_ID,
  ORG_ID,
  psql,
  SEAT,
  SHOP,
  WORKSPACE_ID,
} from './helpers/env'
import { createVisitorSession, embedFrame, openSeatEmbed, qrLoginSeatInFrame } from './helpers/qr-embed'

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
/** 本 run 时间窗——closeStaleActiveSessions 只清窗内会话（同 journey.spec 口径）。 */
const RUN_SINCE = new Date()

/** 访客真实建会话并取回 sessionId/conversationId（DB 直证）。
 *  journey.spec.ts 同款副本（水位线定位，REVIEW-4 F5）：`ORDER BY id DESC
 *  LIMIT 1` 在并发 run 下会取到对方更晚建的会话；水位线把错拿窗口收窄到
 *  「恰好同刻插入」（README 已禁并行 + 已登记为 F7 盲区）。 */
async function newVisitorSession(visitorPage: Page): Promise<{ sessionId: string; conversationId: string }> {
  const beforeMax = psql(
    `SELECT coalesce(max(id), 0) FROM customer_service_session` +
      ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID}`,
  )
  await createVisitorSession(visitorPage, RUN_UNIQ)
  const row = psql(
    `SELECT id, conversation_id FROM customer_service_session` +
      ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID}` +
      ` AND id > ${beforeMax.trim()} ORDER BY id ASC LIMIT 1`,
  )
  const [sessionId, conversationId] = row.split('|')
  expect(sessionId?.length ?? 0).toBeGreaterThan(0)
  return { sessionId, conversationId }
}

/** claim 链（journey.spec.ts 同款副本，REVIEW-4 F10 抽取形态）：队列可见 →
 *  claim → 进行中 tab → 打开会话 → 消息列表就绪。 */
async function claimAndOpenSession(frame: FrameLocator, sessionId: string): Promise<void> {
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-claim-${sessionId}`).click()
  await frame.getByTestId('seat-tab-active').click()
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-session-item-${sessionId}`).click()
  await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
}

/** DB 直证 oracle（journey.spec.ts 同款副本）：本会话 business_identity 且密文
 *  非空的落库计数——正文列是 body_cipher（E2EE 密文），明文 LIKE 永不匹配
 *  （DEF-SC153-13）。 */
function countBusinessIdentityMessages(sessionId: string): number {
  return Number(
    psql(
      `SELECT count(*) FROM enterprise_message WHERE conversation_id =` +
        ` (SELECT conversation_id FROM customer_service_session WHERE id = ${sessionId})` +
        ` AND sender_type = 'business_identity' AND body_cipher IS NOT NULL`,
    ),
  )
}

/** 打开合法宿主嵌入页并完成 QR 登录（journey.spec.ts 同款副本）。 */
async function openLoggedWorkspace(browser: Browser): Promise<Page> {
  const { page } = await openSeatEmbed(browser, SHOP)
  await qrLoginSeatInFrame(page, SEAT.account)
  return page
}

/** presence manual_status 的 DB 直读（null = 自动派生；psql -tAc 无法区分
 *  空串与 NULL，用 coalesce 显式标记）。 */
function seatManualStatus(): string {
  return psql(
    `SELECT coalesce(manual_status, '(null)') FROM customer_service_seat_presence` +
      ` WHERE organization_id = ${ORG_ID} AND business_identity_id = ${IDENTITY_ID}`,
  )
}

test.describe('SC-E2E 次要旅程 B01..B03（EXECUTE-GATED）', () => {
  // ---------------------------------------------------------------- B01
  test('B01 访客重入：宿主页重开后同会话历史可见（幂等接续，不开新会话）', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let page: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)
      const firstMarker = `sc153 访客消息 ${RUN_UNIQ}` // createVisitorSession 内发送的首条文本（marker=RUN_UNIQ）
      page = await openLoggedWorkspace(browser)
      const frame = embedFrame(page)
      await claimAndOpenSession(frame, sessionId)
      const reply = `sc153 重入坐席回复 ${RUN_UNIQ}`
      await frame.getByTestId('seat-composer').fill(reply)
      await frame.getByTestId('seat-send').click()
      await expect(frame.getByTestId('seat-send-error')).toHaveCount(0)
      // 访客侧实时收到（A04 同款 SSE 链）——确认回复真实落入本会话。
      const widget = () => visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
      await expect(widget().getByTestId('cs-message-list').getByText(reply)).toBeVisible({ timeout: 20_000 })
      expect(countBusinessIdentityMessages(sessionId)).toBeGreaterThanOrEqual(1)

      // —— 重入：宿主页 reload（同 tab）。驱动口径取证：访客恢复是 iframe origin
      // （cs.test，loader sandbox 含 allow-same-origin）的 sessionStorage 短期
      // subject（visitStorage.ts FE-W01，TTL 30 分钟）——同 tab 导航保留；产品
      // 里 widget 内「关闭聊天」（cs-close）是显式退出语义，会清理恢复存储
      // （controller.ts closeAndCleanup → clearVisitSubject），不是重入入口。
      // 新 context 的 sessionStorage 为空（subject 丢失 → 新会话），同样不是
      // 「重入见历史」的产品语义。
      await visitorPage.reload({ waitUntil: 'domcontentloaded' })
      const launcher = visitorPage.locator('#imboy-cs-widget-root').locator('button').first()
      await expect(launcher).toBeAttached({ timeout: 15_000 })
      await launcher.click()
      // 种子 installation consent_version='v1'（seed-seat-console.sql）→ 每次
      // bootstrap 都出 consent 面板（真实产品行为，非缺陷）。
      await expect(widget().getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
      await widget().getByTestId('cs-consent-accept').click()
      await expect(widget().getByTestId('cs-input')).toBeVisible({ timeout: 20_000 })

      // 历史拉回：自己发出的首条 + 坐席回复都可见。取证链：controller.ts
      // runBootstrap（loadVisitSubject 恢复 subject）→ ensureSession →
      // createSession 后端幂等接续（cs_widget_session_app.erl ensure_single_open：
      // 同 contact 已有开放会话 status≠closed 时原样返回该会话，不 409 不新建）
      // → refreshHistory（GET /sessions/:id/messages）拉回全部历史。若接续
      // 失败而新建会话，新会话历史为空，下方断言必挂。
      await expect(widget().getByTestId('cs-message-list')).toContainText(firstMarker, { timeout: 20_000 })
      await expect(widget().getByTestId('cs-message-list')).toContainText(reply, { timeout: 20_000 })
      // DB 直证：重入未开第二个会话（幂等接续；会话 id 为 TSID 时间有序，
      // 新建行的 id 必然更大——同 journey.spec 水位线口径）。
      const maxId = psql(
        `SELECT coalesce(max(id), 0) FROM customer_service_session` +
          ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID}`,
      )
      expect(maxId, '重入必须接续原会话（幂等接续不开新会话行）').toBe(sessionId)
    } finally {
      await visitorCtx.close().catch(() => {})
      await page?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- B02
  test('B02 坐席 org/ws 切换器：存在、当前值正确、options 与 seat-contexts 服务端事实一致（种子单 ws，切换流降级）', async ({ browser }) => {
    test.setTimeout(240_000)
    const { page } = await openSeatEmbed(browser, SHOP)
    try {
      // contexts 首次加载发生在 QR confirmed → 认证态翻转之后（workbenchHooks
      // useSeatContexts 的 enabled 门）——监听先挂再登录，捕获真实响应体做
      // options 一致性比对（服务端事实，非硬编码期望）。
      const contextsRespPromise = page.waitForResponse(
        (r) => r.url().includes('/cs/me/seat-contexts') && r.status() === 200,
        { timeout: 60_000 },
      )
      await qrLoginSeatInFrame(page, SEAT.account)
      const frame = embedFrame(page)
      await expect(frame.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })

      // 切换器存在（SeatWorkspacePage header 的真实 select，L384-421：
      // seat-org-select / seat-ws-select；options 来自 contexts 查询数据）。
      const orgSelect = frame.getByTestId('seat-org-select')
      const wsSelect = frame.getByTestId('seat-ws-select')
      await expect(orgSelect).toBeVisible({ timeout: 15_000 })
      await expect(wsSelect).toBeVisible({ timeout: 15_000 })
      // 当前值正确（useSeatScopeSelection：默认第一个上下文 + 第一个工作区；
      // 种子只种一个 org/一个 ws → 默认即种子租户）。
      await expect(orgSelect).toHaveValue(ORG_ID)
      await expect(wsSelect).toHaveValue(WORKSPACE_ID)

      // options 与 seat-contexts 真实响应逐项一致（id + 名称；响应信封
      // payload.contexts[].workspaces[{id,name}]，形状镜像
      // scopeSwitcher.test.tsx MULTI_CONTEXTS_TEXT 的线缆合同）。
      const contextsBody = (await (await contextsRespPromise).json()) as {
        code?: number
        payload?: {
          contexts?: Array<{
            organization_id: string
            organization_name: string
            workspaces?: Array<{ id: string; name: string }>
          }>
        }
      }
      expect(contextsBody.code, 'seat-contexts 响应必须是成功信封').toBe(0)
      const contexts = contextsBody.payload?.contexts ?? []
      expect(contexts.length, '种子坐席必须至少有一个坐席上下文').toBeGreaterThanOrEqual(1)
      const orgFacts = await orgSelect.locator('option').evaluateAll((els) =>
        els.map((el) => ({ value: (el as HTMLOptionElement).value, label: (el as HTMLOptionElement).textContent ?? '' })),
      )
      expect(orgFacts).toEqual(
        contexts.map((ctx) => ({ value: ctx.organization_id, label: ctx.organization_name })),
      )
      const currentCtx = contexts.find((ctx) => ctx.organization_id === ORG_ID)
      const wsFacts = await wsSelect.locator('option').evaluateAll((els) =>
        els.map((el) => ({ value: (el as HTMLOptionElement).value, label: (el as HTMLOptionElement).textContent ?? '' })),
      )
      expect(wsFacts).toEqual(
        (currentCtx?.workspaces ?? []).map((ws) => ({ value: ws.id, label: ws.name })),
      )

      // F12 降级口径（如实注明，不造假数据）：种子（seed-seat-console.sql
      // L34-36）在 org 1603940848519155 下只种一个 workspace；psql 实证
      // （select id, organization_id from workspace where organization_id=…）
      // 本 org 仅有 1603940848519156 一行 —— 本地无第二个 ws 可切，「切到
      // 另一 ws」的数据流在 E2E 层不可真实驱动。多 org/ws 切换数据流
      // （selectOrganization 重置 ws 回落、切换清选中会话、sessions/SSE 按新
      // scope 重载）已由组件级 scopeSwitcher.test.tsx（MultiScopeBackend
      // 替身）覆盖；本用例降级为「切换器存在 + 当前值正确 + options 与服务端
      // 事实一致」的存在性断言，并钉住单 ws 事实防止种子静默漂移。
      expect(wsFacts.length, '当前种子应为单 ws（若见多 ws 请升级本用例为真实切换断言）').toBe(1)
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- B03
  test('B03 presence away→resume：顶栏手动切换（PUT 往返 + DB 落库 + 派生复原 online）', async ({ browser }) => {
    test.setTimeout(240_000)
    // 前置夹具清理（文档化 oracle，同 closeStaleActiveSessions 口径）：
    // 1) 清残留 active 会话——active_count 是 presence 快照的实时子查询
    //    （cs_pg_seat.erl SQL_PRESENCE_FETCH 对 customer_service_session
    //    status='active' 现算 COUNT），坐席 max_concurrent=1，残留 active 会
    //    让派生态变 busy（cs_presence.erl：active>=max → busy）压住 online 断言；
    // 2) 清残留 manual away（上一 run 异常中断可能残留）——手动 away 覆盖一切
    //    自动派生，同样压住初始 online 断言。
    closeStaleActiveSessions(RUN_SINCE)
    psql(
      `UPDATE customer_service_seat_presence SET manual_status = null` +
        ` WHERE organization_id = ${ORG_ID} AND business_identity_id = ${IDENTITY_ID}`,
    )
    const { page } = await openSeatEmbed(browser, SHOP)
    try {
      await qrLoginSeatInFrame(page, SEAT.account)
      const frame = embedFrame(page)
      await expect(frame.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })

      // 初始派生：online。取证：presenceBar.tsx（状态条只显示服务端派生事实）；
      // useSeatPresenceHeartbeat（页面可见 + navigator.onLine 才发心跳，30s
      // 间隔）→ heartbeat POST 派生 online（心跳新鲜 + active_count=0 <
      // max_concurrent=1）。产品无客户端 idle 自动 away——away 只有顶栏手动
      // 入口（presenceBar.tsx「设为离开」按钮），e2e 无需等任何超时。
      await expect(frame.getByTestId('seat-presence-bar')).toBeVisible({ timeout: 30_000 })
      await expect(frame.getByTestId('seat-presence-status-online')).toBeVisible({ timeout: 30_000 })

      // 手动 away（真实按钮 seat-presence-away；workbenchApi.setManualStatus：
      // PUT /cs/organizations/<org>/seats/me/presence body {manual_status:'away'}）。
      await frame.getByTestId('seat-presence-away').click()
      // PUT 成功 → useSeatManualStatus onSuccess 回填心跳缓存 → 状态条即时
      // 切换（presencePage.test.tsx 组件级同款闭环的浏览器实证）。
      await expect(frame.getByTestId('seat-presence-status-away')).toBeVisible({ timeout: 15_000 })
      // DB 直证：manual away 落库（写路径先落库再回包，UI 可见即已持久化）。
      expect(seatManualStatus(), '手动 away 必须落 customer_service_seat_presence.manual_status').toBe('away')

      // 恢复自动（真实按钮 seat-presence-resume；manualStatus==='away' 时
      // presenceBar 渲染「恢复自动」入口；PUT body {} = clear 回自动派生）。
      await frame.getByTestId('seat-presence-resume').click()
      // clear 后回到心跳派生：心跳新鲜（本轮已发）+ active_count=0 → online
      // （cs_presence.erl 派生优先级：manual away > offline > busy > online）。
      await expect(frame.getByTestId('seat-presence-status-online')).toBeVisible({ timeout: 15_000 })
      expect(seatManualStatus(), '恢复自动必须清除 manual_status（null=自动派生）').toBe('(null)')
    } finally {
      // 夹具复原（文档化 oracle）：manual_status 清回自动——真实 UI resume 已在
      // 用例内驱动成功，此 UPDATE 只兜底用例中途失败的 away 残留（残留会压住
      // 同 run 后续用例对派生 online 的任何断言）。
      psql(
        `UPDATE customer_service_seat_presence SET manual_status = null` +
          ` WHERE organization_id = ${ORG_ID} AND business_identity_id = ${IDENTITY_ID}`,
      )
      await page.context().close()
    }
  })
})
