/**
 * SC-E2E — Q07/AC17 浏览器面缺口收敛：转接(transfer)/关闭(close)/评分(rating)
 * 三旅程（journey-transfer-close.spec.ts，F8-1/F8-2/F8-3）。
 *
 * 缺口出处：Q07 测试设计 §3.2——「转接/关闭＝浏览器面 0 用例（后端 cs_actions
 * 有 claim/transfer/close/rating 路由，customer_service_seat_http_checks.erl 有
 * transfer→ack→close→closed 后发消息 409 的 HTTP 合同——缺浏览器 UI 旅程）」。
 *
 * ⛔ EXECUTE-GATED：与 journey.spec.ts 同款，SC153_E2E_EXECUTE=1 才执行。
 * 真实栈纪律不变：零 page.route、零 mock backend、零伪造行；PG oracle 只经
 * 容器内 psql（helpers/env.ts）。helper 为 journey/dual-seat-claim 的文件内
 * 私有副本（语义逐字对齐）。
 *
 * 用例与后端合同的映射（HTTP 合同真源 customer_service_seat_http_checks.erl）：
 *   F8-1 双坐席 transfer：POST .../transfer {workspace_id, expected_version,
 *       to_identity_id} → 200；转接后旧坐席 close/send 403（UI 断言：A 的写
 *       入口收回「该会话由其他坐席处理中」）；新坐席列表实时出现（SSE
 *       assignment.changed → sessions 失效重拉）。
 *   F8-2 close：POST .../close {workspace_id, expected_version} → 200；closed
 *       后坐席发消息 409（后端 http checks 已钉；浏览器面断言 composer 收回
 *       「会话已结束」+ 访客 widget 进入 closed-rating 评分面板）。
 *   F8-3 rating：访客面动作（widget ui.ts closed-rating phase，cs-rate-1..5，
 *       POST /api/v1/cs/widget/sessions/:id/rating {installation_id, rating,
 *       expected_version}）；1..5 仅 closed 后一次——UI 单次提交 + DB rating
 *       落库 + 评分面板退出（重复不可达）；API 重放拒绝由后端 CAS 合同承担。
 */
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import {
  BE_MAIN,
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
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: 同 journey.spec.ts（SC153_E2E_EXECUTE=1 才跑真实旅程）')

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
/** 本 run 时间窗（F5 口径）：closeStaleActiveSessions 只清窗内残留。 */
const RUN_SINCE = new Date()

/** 第二坐席（与 dual-seat-claim.spec.ts 同款：seed identity_B 1603940848519162）。 */
const SEAT2 = {
  account: process.env.SC153_E2E_SEAT2_ACCOUNT ?? '19900000003',
  password: process.env.SC153_E2E_SEAT2_PASSWORD ?? '',
  identityId: '1603940848519162',
}

/** DB oracle：会话当前 (status, business_identity_id[, rating])。 */
function sessionState(sessionId: string): { status: string; businessIdentityId: string } {
  const row = psql(`SELECT status, coalesce(business_identity_id::text,'') FROM customer_service_session WHERE id = ${sessionId}`)
  const [status, businessIdentityId] = row.split('|')
  return { status: status ?? '', businessIdentityId: businessIdentityId ?? '' }
}

function sessionRating(sessionId: string): string {
  return psql(`SELECT coalesce(rating::text, '(null)') FROM customer_service_session WHERE id = ${sessionId}`)
}

/** 访客真实建会话（水位线定位，journey.spec.ts 同款副本）。 */
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
  return { sessionId: sessionId!, conversationId: conversationId ?? '' }
}

/** claim 链（journey.spec.ts 同款副本）：队列可见 → claim → 进行中 → 打开会话。 */
async function claimAndOpenSession(frame: FrameLocator, sessionId: string): Promise<void> {
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-claim-${sessionId}`).click()
  await frame.getByTestId('seat-tab-active').click()
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-session-item-${sessionId}`).click()
  await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
}

/** 坐席A 登录工作台（journey.spec.ts openLoggedWorkspace 同款副本）。 */
async function openSeatAWorkspace(browser: import('@playwright/test').Browser): Promise<Page> {
  const { page } = await openSeatEmbed(browser, SHOP)
  await qrLoginSeatInFrame(page, SEAT.account)
  return page
}

/**
 * 坐席B 护照登录（dual-seat-claim.spec.ts seat2PassportLogin 同款副本：
 * helpers 未导出第二坐席变体，env.ts seatPassportLogin 硬绑定 SEAT.password）。
 */
async function seat2PassportLogin(): Promise<string> {
  const res = await fetch(`${BE_MAIN}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'mobile',
      account: SEAT2.account,
      pwd: SEAT2.password,
      rsa_encrypt: '0',
      sys_version: 'sc153-embed',
    }),
  })
  if (res.status !== 200) throw new Error(`seat2 login failed: HTTP ${res.status}`)
  const body = (await res.json()) as { code: number; payload?: { token?: string } }
  if (body.code !== 0 || typeof body.payload?.token !== 'string' || body.payload.token === '') {
    throw new Error('seat2 login envelope invalid')
  }
  return body.payload.token
}

/** 坐席B 扫码+确认（dual-seat-claim.spec.ts seat2ScanAndConfirm 同款副本）。 */
async function seat2ScanAndConfirm(seatJwt: string, qrToken: string): Promise<void> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${seatJwt}` }
  const scan = await fetch(`${BE_MAIN}/api/v1/passport/qr_login/scan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const scanBody = (await scan.json()) as { code: number; msg?: string }
  if (scanBody.code !== 0) throw new Error(`seat2 qr scan failed: ${JSON.stringify(scanBody)}`)
  const confirm = await fetch(`${BE_MAIN}/api/v1/passport/qr_login/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const confirmBody = (await confirm.json()) as { code: number; msg?: string }
  if (confirmBody.code !== 0) throw new Error(`seat2 qr confirm failed: ${JSON.stringify(confirmBody)}`)
}

/** 坐席B 浏览器 QR 登录（dual-seat-claim.spec.ts qrLoginSeat2InFrame 同款副本）。 */
async function qrLoginSeat2InFrame(page: Page): Promise<void> {
  const seatJwt = await seat2PassportLogin()
  const frame = embedFrame(page)
  const qrCode = frame.getByTestId('seat-qr-code')
  await expect(qrCode.locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(qrCode).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, { timeout: 30_000 })

  let lastCreateAt = Date.now()
  const createListener = (req: { url(): string }): void => {
    if (req.url().includes('/passport/qr_login/create')) lastCreateAt = Date.now()
  }
  page.on('request', createListener)
  const waitQuiet = async (): Promise<void> => {
    const deadline = Date.now() + 30_000
    while (Date.now() - lastCreateAt < 2_000) {
      if (Date.now() > deadline) throw new Error('seat2 qr create churn never settled')
      await page.waitForTimeout(300)
    }
  }

  let lastError: Error | null = null
  let confirmed = false
  for (let attempt = 0; attempt < 4 && !confirmed; attempt += 1) {
    try {
      await waitQuiet()
      const content = (await qrCode.getAttribute('data-qr-content')) ?? ''
      const encoded = /imboy:\/\/qr_login\?qr_token=([^&\s]+)/.exec(content)?.[1]
      if (encoded === undefined || encoded === '') break
      await seat2ScanAndConfirm(seatJwt, decodeURIComponent(encoded))
      lastError = null
      const reacted = await frame
        .getByText('已扫码，请在手机上确认')
        .or(frame.getByTestId('seat-workspace'))
        .or(frame.getByTestId('seat-contexts-error-retry'))
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
      if (reacted) confirmed = true
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      await page.waitForTimeout(1_500)
    }
  }
  page.off('request', createListener)
  if (!confirmed && lastError !== null) throw lastError

  const workspace = frame.getByTestId('seat-workspace')
  const contextsRetry = frame.getByTestId('seat-contexts-error-retry')
  await expect(workspace.or(contextsRetry).first()).toBeVisible({ timeout: 30_000 })
  if ((await contextsRetry.count()) > 0) {
    await contextsRetry.click()
  }
  await expect(workspace).toBeVisible({ timeout: 30_000 })
}

/** 坐席B 登录工作台。 */
async function openSeat2Workspace(browser: import('@playwright/test').Browser): Promise<Page> {
  const { page } = await openSeatEmbed(browser, SHOP)
  await qrLoginSeat2InFrame(page)
  return page
}

test.describe('SC-E2E F8 转接/关闭/评分三旅程（EXECUTE-GATED）', () => {
  test.beforeAll(() => {
    if (SEAT2.password === '') {
      throw new Error(
        '缺少必需环境变量 SC153_E2E_SEAT2_PASSWORD（第二坐席合成密码；须与 harness-seat-embed.sh 运行值同源，见 README.md）',
      )
    }
  })

  // ---------------------------------------------------------------- F8-1
  test('F8-1 双坐席转接：A UI 转接给 B → DB 归属切到 B；B 列表实时出现；A 写入口收回', async ({ browser }) => {
    test.setTimeout(360_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatAPage: Page | null = null
    let seatBPage: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)

      // A 就位 + claim + 打开会话（消息区就绪；Desktop Chrome 视口 1280 = xl，
      // 详情第三栏常驻——seat-detail-panel 直接可见）。
      seatAPage = await openSeatAWorkspace(browser)
      const frameA = embedFrame(seatAPage)
      await claimAndOpenSession(frameA, sessionId)
      const claimed = sessionState(sessionId)
      expect(claimed.status).toBe('active')
      expect(claimed.businessIdentityId).toBe(IDENTITY_ID)

      // B 就位（真实第二坐席浏览器；登录后 presence 心跳使 B 可被列为转接目标）。
      seatBPage = await openSeat2Workspace(browser)
      const frameB = embedFrame(seatBPage)
      await expect(frameB.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })

      // A 的详情面板：转接目标选择 B（transfer-targets 投影：available 才可选）。
      const detail = frameA.getByTestId('seat-detail-panel')
      await expect(detail).toBeVisible({ timeout: 15_000 })
      const targetSelect = frameA.getByTestId('seat-transfer-target-select')
      await expect(targetSelect).toBeVisible({ timeout: 30_000 })
      // B 出现在可选项且 available（disabled=false；忙碌时 disabled）。
      const optionB = targetSelect.locator(`option[value="${SEAT2.identityId}"]`)
      await expect(optionB, '第二坐席必须是可用的转接目标（available）').toBeVisible({ timeout: 30_000 })
      await expect(optionB).not.toBeDisabled()
      await targetSelect.selectOption(SEAT2.identityId)
      await frameA.getByTestId('seat-transfer-submit').click()

      // DB 直证：归属切到 B 的 identity，状态仍 active（转接不关闭会话）。
      await expect
        .poll(() => sessionState(sessionId), { timeout: 20_000, message: '转接后 DB 归属必须切到坐席B' })
        .toEqual({ status: 'active', businessIdentityId: SEAT2.identityId })

      // B 的列表实时收敛：SSE assignment.changed → sessions 失效重拉 →
      // 进行中 tab 出现该会话（B 打开后消息区可用）。
      await frameB.getByTestId('seat-tab-active').click()
      await expect(frameB.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await frameB.getByTestId(`seat-session-item-${sessionId}`).click()
      await expect(frameB.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })

      // A 侧：已打开会话的详情呈现「由其他坐席处理中」（后端 transfer 后 A 对该
      // 会话 send/close 403 的 UI 等价物——写入口收回，可解释文案）。
      await expect(frameA.getByText(/该会话由其他坐席处理中/).first()).toBeVisible({ timeout: 20_000 })
      // A 的进行中列表不再含该会话（队列语义：A 的 active 视图按归属过滤）。
      await expect(frameA.getByTestId(`seat-session-item-${sessionId}`)).toHaveCount(0, { timeout: 20_000 })
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
      await seatBPage?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- F8-2 + F8-3
  test('F8-2/F8-3 关闭与评分：坐席关闭 → 访客评分面板（仅 closed 后一次）→ rating 落库 → 面板退出', async ({ browser }) => {
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

      // 坐席侧回复一条（确保会话有坐席消息，评分面板前置为真实服务过程）。
      const reply = `sc153 F8 坐席回复 ${RUN_UNIQ}`
      await frameA.getByTestId('seat-composer').fill(reply)
      await frameA.getByTestId('seat-send').click()
      await expect(frameA.getByTestId('seat-send-error')).toHaveCount(0)
      const widget = () => visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
      await expect(widget().getByTestId('cs-message-list').getByText(reply)).toBeVisible({ timeout: 20_000 })

      // 关闭（详情面板 seat-close-submit，真实 CAS 写）。
      await frameA.getByTestId('seat-close-submit').click()
      // DB 直证：status=closed + closed_at 落库。
      await expect
        .poll(() => sessionState(sessionId).status, { timeout: 20_000, message: '关闭后 DB status 必须 closed' })
        .toBe('closed')
      const closedAt = psql(`SELECT coalesce(closed_at::text, '(null)') FROM customer_service_session WHERE id = ${sessionId}`)
      expect(closedAt).not.toBe('(null)')

      // 坐席面：closed 后写入口收回（后端 closed 后发消息 409 的 UI 等价物——
      // composer 禁用 + 「会话已结束」可解释文案；HTTP 409 合同由
      // customer_service_seat_http_checks.erl:72 承担，浏览器面钉 UI 收回）。
      await expect(frameA.getByText(/会话已结束/).first()).toBeVisible({ timeout: 20_000 })
      await expect(frameA.getByTestId('seat-detail-status')).toHaveText('已结束')

      // 访客面：widget 进入 closed-rating phase——评分面板（1..5 星）出现。
      await expect(widget().getByTestId('cs-rate-5')).toBeVisible({ timeout: 30_000 })
      await expect(widget().getByTestId('cs-rate-1')).toBeVisible()

      // F8-3 评分：点 5 星（真实 POST /rating {installation_id, rating, expected_version}）。
      await widget().getByTestId('cs-rate-5').click()
      // DB 直证：rating=5 落库。
      await expect
        .poll(() => sessionRating(sessionId), { timeout: 20_000, message: '评分必须落库 rating=5' })
        .toBe('5')
      // 评分面板退出（仅一次：closed 会话的评分入口在提交后消失，UI 不可重复提交；
      // API 重放拒绝由后端 rating CAS 合同承担）。
      await expect(widget().getByTestId('cs-rate-5')).toHaveCount(0, { timeout: 20_000 })
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })
})
