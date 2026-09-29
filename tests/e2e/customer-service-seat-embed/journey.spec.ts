/**
 * SC-E2E — seat console embed 真实浏览器旅程（A01..A10）。
 *
 * ⛔ EXECUTE-GATED：本文件全部用例 `SC153_E2E_EXECUTE=1` 才执行。A0 在
 * SC-INT PASS + candidate manifest 冻结后置位；FIXTURE_ONLY 阶段 0 条执行
 * （skipped 分类 = EXECUTE_GATED，不是 Required-skip）。
 *
 * 真实栈纪律（与 hosted/P2 同款）：零 page.route、零 mock backend、零伪造行；
 * PG oracle 只经容器内 psql；负例的「浏览器实际拒绝」用 Chromium 侧事实断言
 * （console enforcement message + frame 未提交），不把响应头字符串当 oracle。
 *
 * 拓扑：shop.test:18443（合法宿主）/ cs.test:18443（= cs.imboy.pub 本地等价
 * seat 网关）/ evil.test:18443（负例宿主）/ shop2.test:18443（A06 轮换目标）/
 * admin.test:18443（Admin SPA）。前置与一键拉起见 README.md。
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  ADMIN_ORIGIN,
  BE_MAIN,
  closeStaleActiveSessions,
  CONSOLE_PUBLIC_ID,
  CS_ORIGIN,
  EVIL,
  EXECUTE_ENABLED,
  ORG_ID,
  psql,
  restoreConsoleOrigins,
  ROTATED_ORIGIN,
  rotateConsoleOrigins,
  SEAT,
  setConsoleStatus,
  SHOP,
  SHOP2,
  WORKSPACE_ID,
} from './helpers/env'
import { probeGatewayTopology } from './helpers/gateway-probe'
import { adminLogin } from './helpers/admin-ui'
import { createVisitorSession, embedFrame, expectedFrameUrl, openSeatEmbed, qrLoginSeatInFrame } from './helpers/qr-embed'
import { createCollector, watchPage, type BrowserGateCollector } from '../customer-service-p2/helpers/browser-gate'

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** JWT 形状（三段 base64url）；运行时拼接防自匹配（同 P2 a05 口径）。 */
function jwtLike(value: string): boolean {
  return new RegExp('\\b[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b').test(value)
}

function seatFrameOf(page: Page) {
  const frame = page.frames().find((f) => f.url().includes(`/seat/${CONSOLE_PUBLIC_ID}`))
  expect(frame, 'seat frame（cs.test/seat/<public id>）必须已提交').toBeTruthy()
  return frame!
}

/** 打开合法宿主嵌入页并完成 QR 登录（收敛到已挂载工作台）。 */
async function openLoggedWorkspace(browser: Browser): Promise<Page> {
  const { page } = await openSeatEmbed(browser, SHOP)
  await qrLoginSeatInFrame(page, SEAT.account)
  return page
}

/** 访客真实建会话（hosted loader 面）并取回 sessionId/conversationId（DB 直证）。 */
async function newVisitorSession(visitorPage: Page): Promise<{ sessionId: string; conversationId: string }> {
  await createVisitorSession(visitorPage, RUN_UNIQ)
  const row = psql(
    `SELECT id, conversation_id FROM customer_service_session` +
      ` WHERE organization_id = ${ORG_ID} AND workspace_id = ${WORKSPACE_ID} ORDER BY id DESC LIMIT 1`,
  )
  const [sessionId, conversationId] = row.split('|')
  expect(sessionId?.length ?? 0).toBeGreaterThan(0)
  return { sessionId, conversationId }
}

/** 浏览器强制的 frame 拒绝断言：console enforcement message + frame 未提交。 */
async function assertFrameBlockedByBrowser(page: Page, consoleErrors: string[]): Promise<void> {
  // Chromium 的实际拒绝证据：console 出现 frame-ancestors enforcement message。
  await expect
    .poll(() => consoleErrors.some((t) => /Refused to display|frame-ancestors/i.test(t)), {
      timeout: 15_000,
      message: `浏览器必须实际拒绝渲染（console enforcement message），console=${JSON.stringify(consoleErrors).slice(0, 400)}`,
    })
    .toBe(true)
  // frame 未提交：没有任何已提交 frame 的 URL 落在 /seat/<public id>。
  await expect
    .poll(() => page.frames().some((f) => f.url().includes(`/seat/${CONSOLE_PUBLIC_ID}`)), { timeout: 15_000 })
    .toBe(false)
  // iframe 元素的可编程侧同样拿不到 seat 文档（contentFrame 为空或非 seat URL）。
  const handle = await page.locator('iframe[title="IMBoy 客服工作台"]').elementHandle()
  expect(handle).toBeTruthy()
  const inner = await handle!.contentFrame()
  if (inner !== null) {
    expect(inner.url()).not.toContain(`/seat/${CONSOLE_PUBLIC_ID}`)
  }
}

test.describe('SC-E2E A01..A10（EXECUTE-GATED）', () => {
  let topology: ReturnType<typeof probeGatewayTopology>

  test.beforeAll(() => {
    // 只读预检探针：失败信息进报告（真实断言在各用例内）。
    topology = probeGatewayTopology()
    console.log('[sc153] gateway preflight:', topology.map((t) => `${t.ok ? 'ok' : 'FAIL'} ${t.detail}`).join(' | '))
  })

  // ---------------------------------------------------------------- A01
  test('A01 合法宿主 iframe 加载：/seat/<public id> 路径 + 200 + QR SVG 可见', async ({ browser }) => {
    test.setTimeout(180_000)
    const { page } = await openSeatEmbed(browser, SHOP)
    try {
      // 请求路径合同：iframe src = <CS_ORIGIN>/seat/<public id>（公开 ID 非凭证）。
      const iframe = page.locator('iframe[title="IMBoy 客服工作台"]')
      await expect(iframe).toHaveAttribute('src', expectedFrameUrl())
      // 网络事实：/seat/<id> 真实发生了且 200（观察，不拦截）。
      // SC-INT DEF-SC153-09：openSeatEmbed 已等 iframe 挂载，/seat/<id> 首个响应
      // 多半已发生——waitForResponse 事后注册必然 30s 超时。改为 reload 前先挂
      // 监听，同一 frame URL 重新发起真实请求，网络事实照旧、无竞态。
      const seatRespPromise = page.waitForResponse(
        (r) => r.url().includes(`/seat/${CONSOLE_PUBLIC_ID}`),
        { timeout: 30_000 },
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      const seatResp = await seatRespPromise
      expect(seatResp.status(), 'seat frame 文档必须 200').toBe(200)
      // 嵌入式工作台到达 QR 登录面板（QR SVG 可扫描形态可见）。
      const qr = embedFrame(page).getByTestId('seat-qr-code')
      await expect(qr.locator('svg')).toBeVisible({ timeout: 30_000 })
      await expect(qr).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, { timeout: 30_000 })
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- A02
  test('A02 evil.test 宿主：浏览器实际 CSP 拒绝渲染（非头字符串 oracle）', async ({ browser }) => {
    test.setTimeout(120_000)
    const page = await browser.newPage()
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    try {
      await page.goto(`${EVIL}/`, { waitUntil: 'domcontentloaded' })
      // /seat/<id> 请求会发生（响应含 backend 下发的 frame-ancestors），
      // 但浏览器必须拒绝把文档提交进 frame。
      await page
        .waitForResponse((r) => r.url().includes(`/seat/${CONSOLE_PUBLIC_ID}`), { timeout: 30_000 })
        .catch(() => null) // 更早被拦时请求都可能不发：拒绝证据由下方断言承担
      await assertFrameBlockedByBrowser(page, consoleErrors)
      // 工作台绝不能在 evil origin 渲染出来。
      expect(await page.frames().some((f) => f.url().includes(CS_ORIGIN))).toBe(false)
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- A03
  test('A03 QR create/subscribe/confirm 真实闭环 + JWT 零落地 + Admin Cookie 不放行', async ({ browser }) => {
    test.setTimeout(240_000)
    // SC-INT DEF-SC153-08：漏解构 { page } —— 拿到的是 {page, frame} 包装对象，
    // page.context() TypeError（A01 同款用法为正确形态）。
    const { page } = await openSeatEmbed(browser, SHOP)
    try {
      await qrLoginSeatInFrame(page, SEAT.account)

      // —— JWT 卫生：URL / storage / cookie 全零（唯一合法位置 = Authorization 头）——
      expect(jwtLike(page.url()), '顶层宿主 URL 不得携带 JWT').toBe(false)
      const seatFrame = seatFrameOf(page)
      expect(jwtLike(seatFrame.url()), 'frame URL 不得携带 JWT').toBe(false)
      const storageDump = await seatFrame.evaluate(() =>
        JSON.stringify({
          local: Object.fromEntries(Object.entries(localStorage)),
          session: Object.fromEntries(Object.entries(sessionStorage)),
        }),
      )
      expect(jwtLike(storageDump), 'seat frame 的 localStorage/sessionStorage 不得含 JWT').toBe(false)
      // SC-INT DEF-SC153-11：Playwright 全异步 API —— cookies() 返回 Promise，
      // 不 await 时 for...of 对 Promise 迭代 TypeError（cookies is not iterable）。
      const cookies = await page.context().cookies()
      for (const c of cookies) {
        expect(jwtLike(c.value), `cookie ${c.name}@${c.domain} 不得携带 JWT`).toBe(false)
      }
      // memory vault 的反向证明：seat frame 域名下零 cookie（含 admin 面）。
      const csCookies = await page.context().cookies(`${CS_ORIGIN}/seat/${CONSOLE_PUBLIC_ID}`)
      expect(csCookies, 'seat 域（cs.test）必须零 cookie（JWT 只在内存 vault）').toEqual([])

      // —— Admin Cookie 负例：admin.test 会话不得授权 seat API ——
      const adminCtx = await browser.newContext()
      const adminPage = await adminCtx.newPage()
      await adminLogin(adminPage)
      const admCookies = await adminCtx.cookies(`${ADMIN_ORIGIN}/`)
      expect(admCookies.some((c) => c.name.startsWith('adm_')), 'admin 登录后应有平台 Cookie（前置自检）').toBe(true)
      // 浏览器作用域事实：admin.test 的 Cookie 不进 cs.test 域。
      expect((await adminCtx.cookies(`${CS_ORIGIN}/`)).filter((c) => c.name.startsWith('adm_'))).toEqual([])
      // 最坏情况重放：把 adm Cookie 显式附到 seat API —— 后端必须 401/403。
      // oracle 是「服务端鉴权拒绝」这一真实行为，直打 BE_MAIN（harness 拓扑里
      // cs.test 的同一上游）与走网关等价；node 侧 APIRequestContext 对
      // cs.test:18443 的自签 TLS/系统代理不可用（SC-E2E ENVIRONMENT，已记录）。
      const cookieHeader = admCookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const replay = await adminCtx.request.get(
        `${BE_MAIN}/api/v1/cs/organizations/${ORG_ID}/seats/me/heartbeat?workspace_id=${WORKSPACE_ID}`,
        { headers: { cookie: cookieHeader } },
      )
      expect([401, 403], `Admin Cookie 重放 seat API 必须 401/403，got ${replay.status()}`).toContain(replay.status())
      await adminCtx.close()
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- A04
  test('A04 嵌入工作台主链：contexts/queue 加载 → claim → 发文本 → SSE 收敛到访客', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions()
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let page: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)
      page = await openLoggedWorkspace(browser)
      const frame = embedFrame(page)
      // contexts/queue：队列 tab（queued）出现该会话。
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      // claim（真实 CAS 写）→ 进行中 tab → 打开会话。
      await frame.getByTestId(`seat-claim-${sessionId}`).click()
      await frame.getByTestId('seat-tab-active').click()
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frame.getByTestId(`seat-session-item-${sessionId}`).click()
      await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
      // 坐席发文本（UI 真实通道）。
      const reply = `sc153 坐席回复 ${RUN_UNIQ}`
      await frame.getByTestId('seat-composer').fill(reply)
      await frame.getByTestId('seat-send').click()
      await expect(frame.getByTestId('seat-send-error')).toHaveCount(0)
      // SSE 收敛：访客 widget 实时收到（无轮询依赖）。
      await expect(
        visitorPage
          .frameLocator('iframe[data-testid="cs-widget-iframe"]')
          .getByTestId('cs-message-list')
          .getByText(reply),
      ).toBeVisible({ timeout: 20_000 })
      // DB 直证：坐席回复落库（eb 真源）。正文列是 body_cipher（E2EE 密文），
      // 明文 LIKE 永不匹配（DEF-SC153-13：测试 SQL 笔误，r9 首次触达即暴露）；
      // 每轮全新会话：business_identity 且密文非空 = 本轮坐席回复。
      const dbCount = Number(
        psql(
          `SELECT count(*) FROM enterprise_message WHERE conversation_id =` +
            ` (SELECT conversation_id FROM customer_service_session WHERE id = ${sessionId})` +
            ` AND sender_type = 'business_identity' AND body_cipher IS NOT NULL`,
        ),
      )
      expect(dbCount).toBeGreaterThanOrEqual(1)
    } finally {
      await visitorCtx.close().catch(() => {})
      await page?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- A05
  test('A05 sandbox iframe 内附件闭环：presign→PUT→confirm→发送→预览→下载', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions()
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let page: Page | null = null
    const PNG_1PX = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const fileName = `sc153-embed-${RUN_UNIQ}.png`
    try {
      const { sessionId, conversationId } = await newVisitorSession(visitorPage)
      page = await openLoggedWorkspace(browser)
      const frame = embedFrame(page)
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frame.getByTestId(`seat-claim-${sessionId}`).click()
      await frame.getByTestId('seat-tab-active').click()
      await frame.getByTestId(`seat-session-item-${sessionId}`).click()
      await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
      // 附件上传全链（presign → 裸 PUT → confirm → 随消息发送）。
      await frame.getByTestId('seat-attach-input').setInputFiles({ name: fileName, mimeType: 'image/png', buffer: PNG_1PX })
      await expect(frame.getByTestId('seat-attach-chip')).toBeVisible({ timeout: 15_000 })
      await expect(frame.getByTestId('seat-attach-chip-name')).toHaveText(fileName)
      const caption = `sc153 附件说明 ${RUN_UNIQ}`
      await frame.getByTestId('seat-composer').fill(caption)
      await frame.getByTestId('seat-send').click()
      await expect(frame.getByTestId('seat-send-error')).toHaveCount(0)
      // 预览：授权读回（非 error 态的图片预览节点）。
      await expect(frame.getByTestId('seat-attachment-image').first()).toBeVisible({ timeout: 30_000 })
      await expect(frame.getByTestId('seat-attachment-image-error')).toHaveCount(0)
      // DB 直证：enterprise_asset 真源绑定本会话（file_name 字节级身份辅助）。
      const assetCount = Number(
        psql(
          `SELECT count(*) FROM enterprise_asset WHERE conversation_id = ${conversationId} AND file_name = '${fileName}'`,
        ),
      )
      expect(assetCount).toBeGreaterThanOrEqual(1)
      // 下载：sandbox 内 allow-downloads 合同 —— 真实 download 事件 + 文件名保真。
      const downloadP = page.waitForEvent('download', { timeout: 30_000 })
      await frame.getByTestId('seat-attachment-download').first().click()
      const download = await downloadP
      expect(download.suggestedFilename()).toBe(fileName)
      // SSE 收敛：访客 widget 收到附件缩略。
      await expect(
        visitorPage
          .frameLocator('iframe[data-testid="cs-widget-iframe"]')
          .getByTestId('cs-asset-thumb')
          .filter({ hasText: fileName }),
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      await visitorCtx.close().catch(() => {})
      await page?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- A06
  test('A06 origin 轮换：snippet 不变 —— 旧 origin 被拒、新 origin 可嵌', async ({ browser }) => {
    test.setTimeout(240_000)
    const before = rotateConsoleOrigins(CONSOLE_PUBLIC_ID, ROTATED_ORIGIN)
    try {
      expect(before).toContain('shop.test')
      // 旧 origin（shop.test）：浏览器实际拒绝（同 A02 口径）。
      const oldPage = await browser.newPage()
      const oldErrors: string[] = []
      oldPage.on('console', (m) => {
        if (m.type() === 'error') oldErrors.push(m.text())
      })
      await oldPage.goto(`${SHOP}/`, { waitUntil: 'domcontentloaded' })
      await oldPage.waitForTimeout(1_000)
      await assertFrameBlockedByBrowser(oldPage, oldErrors)
      await oldPage.context().close()
      // 新 origin（shop2.test）：同一 snippet、同一 public id —— 可嵌、QR 可见。
      const { page } = await openSeatEmbed(browser, SHOP2)
      try {
        await expect(page.locator('iframe[title="IMBoy 客服工作台"]')).toHaveAttribute('src', expectedFrameUrl())
        await expect(embedFrame(page).getByTestId('seat-qr-code').locator('svg')).toBeVisible({ timeout: 30_000 })
      } finally {
        await page.context().close()
      }
    } finally {
      restoreConsoleOrigins(CONSOLE_PUBLIC_ID, before)
    }
  })

  // ---------------------------------------------------------------- A07
  test('A07 revoke：新加载 404（seat_console_unavailable）；已打开 frame 不被强制终止且可续用发消息', async ({ browser }) => {
    test.setTimeout(240_000)
    closeStaleActiveSessions()
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let openPage: Page | null = null
    try {
      // REVIEW-4 F3：先按 A04 模式建真实访客会话并 claim，让「已打开会话」具备
      // 续用发消息的前提（此前仅断言 frame 存活，证明不了已打开会话仍工作）。
      const { sessionId } = await newVisitorSession(visitorPage)
      // 已打开的工作台（revoke 前登录成功）。
      openPage = await openLoggedWorkspace(browser)
      const frame = embedFrame(openPage)
      // claim（A04 同款）：queued 队列可见 → claim → 进行中 tab → 打开会话 → 消息列表就绪。
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frame.getByTestId(`seat-claim-${sessionId}`).click()
      await frame.getByTestId('seat-tab-active').click()
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frame.getByTestId(`seat-session-item-${sessionId}`).click()
      await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
      const before = setConsoleStatus(CONSOLE_PUBLIC_ID, 'revoked')
      try {
        // 新加载：统一 404（不可区分非法/缺失/revoked —— 状态枚举禁令）。
        const probeCtx = await browser.newContext()
        const probePage = await probeCtx.newPage()
        const resp = await probePage.goto(`${CS_ORIGIN}/seat/${CONSOLE_PUBLIC_ID}`, { waitUntil: 'domcontentloaded' })
        expect(resp?.status(), 'revoked 后新加载必须 404').toBe(404)
        const bodyText = (await resp?.text()) ?? ''
        expect(bodyText).toContain('seat_console_unavailable')
        await probeCtx.close()
        // 已打开 frame：仅阻止新加载 —— 不强制终止（页面/文档仍存活；SSE 是否
        // 续传不在断言内，按实际行为记录）。
        expect(openPage.isClosed()).toBe(false)
        const iframe = openPage.locator('iframe[title="IMBoy 客服工作台"]')
        await expect(iframe).toBeAttached()
        const stillFrame = openPage.frames().find((f) => f.url().includes(`/seat/${CONSOLE_PUBLIC_ID}`))
        expect(stillFrame, '已打开的 seat frame 文档必须仍在（不被强制导航/终止）').toBeTruthy()
        await expect(embedFrame(openPage).getByTestId('seat-workspace')).toBeVisible({ timeout: 15_000 })
        // REVIEW-4 F3：正向续用 —— revoke 置位后坐席对已打开会话再发一条消息，
        // 证明「仅阻止新加载，已打开会话续用仍工作」。
        const reply = `sc153 revoke 续用回复 ${RUN_UNIQ}`
        await frame.getByTestId('seat-composer').fill(reply)
        await frame.getByTestId('seat-send').click()
        await expect(frame.getByTestId('seat-send-error')).toHaveCount(0)
        // DB oracle（A04 同款）：business_identity + 密文非空 = 本轮坐席回复落库。
        await expect
          .poll(
            () =>
              Number(
                psql(
                  `SELECT count(*) FROM enterprise_message WHERE conversation_id =` +
                    ` (SELECT conversation_id FROM customer_service_session WHERE id = ${sessionId})` +
                    ` AND sender_type = 'business_identity' AND body_cipher IS NOT NULL`,
                ),
              ),
            { timeout: 20_000, message: 'revoke 后已打开会话的坐席回复必须落库（续用链路真实工作）' },
          )
          .toBeGreaterThanOrEqual(1)
        console.log('[sc153][A07] 已打开 frame 在 revoke 后保持存活且续用发消息落库成功（仅阻止新加载）——实际行为已记录')
      } finally {
        setConsoleStatus(CONSOLE_PUBLIC_ID, before === 'revoked' ? 'active' : before)
      }
    } finally {
      await visitorCtx.close().catch(() => {})
      await openPage?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- A08
  test('A08 Admin SPA：/customer-service/workspace 不再提供工作台；运营页仍正常', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await adminLogin(page)
      // REVIEW-4 F9：具体 fallback 特征替代 innerText 长度（区分 SPA fallback 与白屏报错）。
      // 路由事实（src/App.tsx）：/customer-service/workspace 无对应路由，落 `*` 通配
      // NotFoundPage —— URL 原地保持，渲染「404 / 页面不存在 / 返回首页」。
      const fallbackErrors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') fallbackErrors.push(m.text())
      })
      // 旧公开路由：不再渲染坐席工作台（QR/工作台 UI 均不存在；SPA 走 fallback）。
      await page.goto(`${ADMIN_ORIGIN}/customer-service/workspace`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2_000) // 给 SPA 路由落位时间（下方正断言自带可见性重试兜底）
      expect(await page.getByTestId('seat-workspace').count(), 'workspace UI 必须不存在').toBe(0)
      expect(await page.getByTestId('seat-qr-code').count(), 'QR 登录面板必须不存在').toBe(0)
      // fallback 特征 1：URL 不被重定向（`*` 通配原地渲染，非跳首页）。
      expect(page.url(), '移除路由必须原地落 SPA fallback（不重定向）').toBe(`${ADMIN_ORIGIN}/customer-service/workspace`)
      // fallback 特征 2：NotFoundPage 特征结构可见（非空白、非报错态）。
      await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('link', { name: /返回首页/ })).toBeVisible({ timeout: 15_000 })
      // fallback 特征 3：该页零新增 console error（白屏/资源报错会被此门拦下）。
      expect(fallbackErrors, `fallback 页不得有 console error: ${JSON.stringify(fallbackErrors).slice(0, 300)}`).toEqual([])
      // Admin 运营页（网站接入）不受影响。
      await page.goto(`${ADMIN_ORIGIN}/customer-service/widgets`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('网站接入').first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('租户范围（必填）')).toBeVisible({ timeout: 30_000 })
    } finally {
      await ctx.close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- A09
  test('A09 泄漏门：console/network/URL/页面源码无 JWT、secret、坐席手机号', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions()
    const collector: BrowserGateCollector = createCollector()
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    watchPage(collector, visitorPage)
    let page: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)
      page = await browser.newPage()
      watchPage(collector, page)
      await qrLoginSeatInFrame(await reopenOnShop(page), SEAT.account)
      const frame = embedFrame(page)
      await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frame.getByTestId(`seat-claim-${sessionId}`).click()
      await frame.getByTestId('seat-tab-active').click()
      await frame.getByTestId(`seat-session-item-${sessionId}`).click()
      const reply = `sc153 leakgate 回复 ${RUN_UNIQ}`
      await frame.getByTestId('seat-composer').fill(reply)
      await frame.getByTestId('seat-send').click()

      // —— 泄漏扫描 ——
      const scanTargets: Array<{ source: string; sample: string }> = [
        { source: 'shop DOM', sample: await page.content() },
        { source: 'visitor DOM', sample: await visitorPage.content() },
        // console error / 未捕获异常 / 网络层失败（计划 A09 三通道之一；
        // 采集器补齐后与 DOM/响应体同权扫描——SC-E2E REVIEW-4 F1）。
        ...collector.consoleErrors.map((item) => ({ source: `console@${item.pageUrl}`, sample: item.text })),
        ...collector.pageErrors.map((item) => ({ source: `pageerror@${item.pageUrl}`, sample: item.text })),
        ...collector.requestFailures.map((item) => ({ source: `requestfailed:${item.url}`, sample: item.failure })),
        ...collector.responseBodies
          .filter((item) => !/\/passport\/qr_login\/(status|subscribe)/.test(item.url)) // QR 合同投递通道豁免（同 P2）
          .map((item) => ({ source: item.url, sample: item.sample })),
      ]
      const hits: string[] = []
      for (const { source, sample } of scanTargets) {
        if (jwtLike(sample)) hits.push(`${source}: JWT-form token`)
        if (sample.includes(SEAT.password)) hits.push(`${source}: seat password literal`)
        if (sample.includes(SEAT.account)) hits.push(`${source}: seat phone number`)
      }
      expect(hits, hits.join('; ')).toEqual([])
      const jwtUrls = collector.requestUrls.filter((url) => jwtLike(url))
      expect(jwtUrls, `JWT 不得进 URL: ${JSON.stringify(jwtUrls).slice(0, 200)}`).toEqual([])
      const secretUrls = collector.requestUrls.filter((url) => /[?&](secret|api_key|client_secret|password)=/.test(url))
      expect(secretUrls, 'secret 不得进 URL').toEqual([])
    } finally {
      await visitorCtx.close().catch(() => {})
      await page?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- A10
  test('A10 sandbox 精确三值 + 未授权能力被浏览器实际阻止（top-nav/popup/form）', async ({ browser }) => {
    test.setTimeout(180_000)
    const { page } = await openSeatEmbed(browser, SHOP)
    try {
      // sandbox 属性精确相等（DOM 事实，非源码字符串）。
      const sandboxAttr = await page.locator('iframe[title="IMBoy 客服工作台"]').getAttribute('sandbox')
      expect(sandboxAttr).toBe('allow-scripts allow-same-origin allow-downloads')

      const seatFrame = seatFrameOf(page)
      const topUrlBefore = page.url()

      // 负能力 1：top 导航 —— 无 allow-top-navigation，浏览器必须阻止。
      // REVIEW-4 F8：监听先挂（消 evaluate 与注册间的竞态窗）+ catch 兜底，
      // 3s 内零 framenavigated 事件 = 阻止成立；替代 waitForTimeout 定时脆点。
      const navEventP = page
        .waitForEvent('framenavigated', { timeout: 3_000 })
        .then((f) => `navigated:${f.url()}`)
        .catch(() => null)
      const navProbe = await seatFrame.evaluate(async () => {
        try {
          window.top!.location.href = 'https://evil.test:18443/sc153-top-pwned'
        } catch (err) {
          return `threw:${(err as Error).name}`
        }
        return 'no-throw'
      })
      const navEvent = await navEventP
      expect(
        navEvent,
        `top 导航必须被浏览器阻止（probe=${navProbe}；事件=${navEvent ?? '无'}；top=${page.url()}）`,
      ).toBeNull()
      expect(
        page.url(),
        `top 导航必须被浏览器阻止（probe=${navProbe}；top=${page.url()}）`,
      ).toBe(topUrlBefore)
      expect(page.url()).not.toContain('evil.test')

      // 负能力 2：popup —— 无 allow-popups，window.open 返回 null 且无新页。
      const popupP = page.context().waitForEvent('page', { timeout: 3_000 }).catch(() => null)
      const popupResult = await seatFrame.evaluate(() => {
        const w = window.open('https://evil.test:18443/sc153-popup-pwned')
        return w === null ? 'blocked-null' : 'opened'
      })
      const popup = await popupP
      expect(popupResult, 'window.open 必须返回 null（allow-popups 未授予）').toBe('blocked-null')
      expect(popup, '不得产生任何 popup 页面').toBeNull()

      // 负能力 3：表单 GET 提交到 evil —— 无 allow-forms，浏览器阻止提交。
      // REVIEW-4 F8：同款短窗负事件断言（监听先挂 + catch，3s 内零导航事件）。
      const formNavEventP = page
        .waitForEvent('framenavigated', { timeout: 3_000 })
        .then((f) => `navigated:${f.url()}`)
        .catch(() => null)
      const formProbe = await seatFrame.evaluate(async () => {
        const form = document.createElement('form')
        form.method = 'GET'
        form.action = 'https://evil.test:18443/sc153-form-pwned'
        document.body.appendChild(form)
        try {
          form.submit()
        } catch (err) {
          return `threw:${(err as Error).name}`
        }
        return 'submitted'
      })
      const formNavEvent = await formNavEventP
      expect(
        formNavEvent,
        `表单提交必须被浏览器阻止（probe=${formProbe}；事件=${formNavEvent ?? '无'}）`,
      ).toBeNull()
      expect(
        seatFrame.url(),
        `frame 不得被表单导航走（probe=${formProbe}）`,
      ).toContain(`/seat/${CONSOLE_PUBLIC_ID}`)
      expect(page.url()).toBe(topUrlBefore)
      expect(page.url()).not.toContain('evil.test')
    } finally {
      await page.context().close().catch(() => {})
    }
  })
})

/** A09 复用：确保 page 开在 shop 宿主页（watchPage 已挂，重开不丢采集）。 */
async function reopenOnShop(page: Page): Promise<Page> {
  if (!page.url().startsWith(SHOP)) {
    await page.goto(`${SHOP}/`, { waitUntil: 'domcontentloaded' })
  }
  return page
}
