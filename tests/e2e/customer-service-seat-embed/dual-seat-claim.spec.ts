/**
 * SC-E2E — REVIEW-4 F7：双坐席 claim 竞争（dual-seat-claim.spec.ts）。
 *
 * F7 出处：README.md「已知边界 / 未测区（REVIEW-4 F5/F7）」并发盲区清单第 1 条
 * （原文）：「双坐席 claim 竞争：A04 只走单坐席 claim 成功路径；两个坐席对同一
 * queued 会话并发 CAS claim 恰一成功、失败方收到 409 后列表自动收敛的端到端
 * 竞争未在真实浏览器 + 真实后端上验证（组件级 409 收敛已有单测）」。
 *
 * 串行双 context 口径：本套件单 worker 串行（README 明禁并行），「双坐席并发」
 * 用两个 browser context 顺序表达 —— contextA 坐席A（SC153_E2E_SEAT_* 凭据），
 * contextB 坐席B（SC153_E2E_SEAT2_* 凭据；seed-seat-console.sql 第二坐席行 +
 * harness-seat-embed.sh d2 绑定段的 identity 1603940848519162）。并发裁决点在
 * 后端 DB CAS（cs_pg_session claim_tx：`UPDATE customer_service_session
 * SET status='active' ... WHERE status='queued' AND version=$6`，0 行更新即
 * conflict），串行表达不损失裁决语义：A 先 claim 成功后，B 携带 A claim 前
 * 的 expected_version 重放同一 CAS 写，必然命中 0 行 —— 与真并发中「后到者」
 * 走的是同一条 DB 裁决路径（domain 侧 cs_session:assert_cas_expectation 同款
 * cas_mismatch）。
 *
 * 用例一 B 端 409 走 node 侧 API 信封断言（Bearer = 坐席B 护照 JWT，与 B 的
 * 浏览器 QR 登录同一凭据身份）——理由：浏览器 UI 的「后点 claim 撞 409」依赖
 * SSE 收敛与点击的时序竞赛（SSE assignment.changed 先到则 claim 按钮已被队列
 * 重拉移除，按钮消失与 409 播报都是产品合法收敛），零 mock/零 route 的真实栈
 * 纪律下不可稳定复现；组件级该路径已有单测（SeatWorkspacePage.test.tsx A01
 * 「claim 撞 409 → 冲突播报 + 列表自动权威刷新收敛」，live-region 文案
 * 「该会话已被其他坐席接单，列表已刷新」）。失败方列表收敛的浏览器层事实由
 * 用例二覆盖（SSE 推送 → sessions 失效重拉 → queued 列表移除）。
 *
 * ⛔ EXECUTE-GATED：与 journey.spec.ts 同款，SC153_E2E_EXECUTE=1 才执行。
 * 真实栈纪律不变：零 page.route、零 mock backend、零伪造行；PG oracle 只经
 * 容器内 psql（helpers/env.ts）。
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
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: 同 journey.spec.ts（A0 置 SC153_E2E_EXECUTE=1 后才跑真实旅程）')

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
/** 本 run 时间窗（F5 口径）：closeStaleActiveSessions 只清窗内残留。 */
const RUN_SINCE = new Date()

/**
 * 第二坐席凭据（F7）：SC153_E2E_SEAT2_ACCOUNT / SC153_E2E_SEAT2_PASSWORD 环境
 * 注入（B-5① 同款口径：密码无跟踪文件默认回退，缺失即 beforeAll fail-fast；
 * 账号给默认合成值 19900000003，与 harness-seat-embed.sh d2 段同源同值 ——
 * helpers/env.ts 不动，spec 内自行读取）。identity/assignment id 与
 * seed-seat-console.sql 第二坐席追加行一一对应（identity_B + assignment + seat）。
 */
const SEAT2 = {
  account: process.env.SC153_E2E_SEAT2_ACCOUNT ?? '19900000003',
  password: process.env.SC153_E2E_SEAT2_PASSWORD ?? '',
  identityId: '1603940848519162',
  assignmentId: '1603940848519163',
}

/**
 * 第二坐席夹具就绪门（防漂移）：seed 的 identity_B/seat_B 行 + harness d2 段的
 * 真实绑定（assignment 行 user_id 已从种子占位 uid 换成 signup 产出的真实 uid，
 * 且该 uid 有 active member 行 —— cs_seat principal 的 member 门）缺一即挂，
 * 错误信息直接给出拉起方法。
 */
function assertSeat2FixtureReady(): void {
  const seatEnabled = psql(
    `SELECT count(*) FROM customer_service_seat` +
      ` WHERE organization_id = ${ORG_ID} AND business_identity_id = ${SEAT2.identityId} AND enabled = true`,
  )
  const bound = psql(
    `SELECT count(*) FROM organization_business_identity_assignment a` +
      ` JOIN organization_member m ON m.organization_id = a.organization_id AND m.user_id = a.user_id` +
      `   AND m.status = 'active'` +
      ` WHERE a.id = ${SEAT2.assignmentId} AND a.status = 'active'` +
      `   AND a.user_id IS NOT NULL AND a.user_id <> ${SEAT2.identityId}`,
  )
  if (seatEnabled !== '1' || bound !== '1') {
    throw new Error(
      `第二坐席夹具未就绪（seat_enabled=${seatEnabled} bound=${bound}）——` +
        '请先运行最新 fixtures/harness-seat-embed.sh（需注入 SC153_E2E_SEAT2_PASSWORD，' +
        'd2 段完成第二坐席 signup/绑定）后再跑本 spec',
    )
  }
}

/** 坐席B 护照登录（helpers/env.ts seatPassportLogin 的第二坐席变体：既有实现
 *  硬编码 SEAT.password（B-5 单坐席假设）；env.ts 本任务禁改，spec 内以同款
 *  信封断言复刻，仅凭据源换 SEAT2）。rsa_encrypt=0 明文本地沙盒口径。 */
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

/** 预认证 API 扫码+确认（helpers/qr-embed.ts scanAndConfirm 的复刻：该函数
 *  未导出且闭包绑定 SEAT 凭据；公共 passport 端点 + Bearer=B 护照 JWT，
 *  与手机端同款合同面）。 */
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

/**
 * 坐席B 在宿主 iframe 内完成 QR 登录（helpers/qr-embed.ts qrLoginSeatInFrame
 * 的复刻，仅护照登录换 seat2PassportLogin —— 既有 helper 内部经
 * seatPassportLogin 硬绑定 SEAT.password，无法承载第二身份）。换码风暴等待 /
 * confirm 重试 / 预认证期 contexts 401 重试口径与原实现逐款一致。
 */
async function qrLoginSeat2InFrame(page: Page): Promise<void> {
  const seatJwt = await seat2PassportLogin()
  const frame = embedFrame(page)
  const qrCode = frame.getByTestId('seat-qr-code')
  await expect(qrCode.locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(qrCode).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, { timeout: 30_000 })

  // 换码风暴等待：2 秒窗口内无新 qr_login/create 请求为静默判据（原实现同款）。
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
      if (encoded === undefined || encoded === '') break // 面板已不在（可能已确认成功）
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
  if (!confirmed) {
    const stillThere = (await qrCode.count()) > 0
    if (stillThere) throw new Error('seat2 qr confirm did not reach the page current session')
  }

  // JWT 到达后：工作台直接挂载，或命中预认证期缓存的 contexts 401 —— 点真实
  // 重试入口复核（原实现同款）。
  const workspace = frame.getByTestId('seat-workspace')
  const contextsRetry = frame.getByTestId('seat-contexts-error-retry')
  await expect(workspace.or(contextsRetry).first()).toBeVisible({ timeout: 30_000 })
  if ((await contextsRetry.count()) > 0) {
    await contextsRetry.click()
  }
  await expect(workspace).toBeVisible({ timeout: 30_000 })
}

/** 访客真实建会话 + id 水位线定位（journey.spec.ts newVisitorSession 同款复刻，
 *  F5 口径：`ORDER BY id DESC LIMIT 1` 会错拿并行 run 的会话，水位线把错拿窗口
 *  收窄到「恰好同刻插入」；套件单 worker 串行下完全隔离）。 */
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

/** claim 链（journey.spec.ts claimAndOpenSession 同款复刻，F10 抽取版）：
 *  队列可见 → claim（真实 CAS 写）→ 进行中 tab → 打开会话 → 消息列表就绪。 */
async function claimAndOpenSession(frame: FrameLocator, sessionId: string): Promise<void> {
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-claim-${sessionId}`).click()
  await frame.getByTestId('seat-tab-active').click()
  await expect(frame.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
  await frame.getByTestId(`seat-session-item-${sessionId}`).click()
  await expect(frame.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
}

/**
 * 坐席B 的 CAS claim（node 侧直连 backend；Bearer=B 护照 JWT —— 与 B 的浏览器
 * QR 登录同一凭据身份）。请求体与 workbenchApi.claim 逐键一致：
 * {workspace_id: TSID string, expected_version: int}（cs_actions 冻结参数表：
 * expected_version int required + workspace 门 tsid 语义）。
 */
async function seat2Claim(sessionId: string, expectedVersion: number): Promise<Response> {
  const jwt = await seat2PassportLogin()
  return fetch(`${BE_MAIN}/api/v1/cs/organizations/${ORG_ID}/sessions/${sessionId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ workspace_id: WORKSPACE_ID, expected_version: expectedVersion }),
  })
}

/**
 * DB oracle：会话当前 (status, business_identity_id)。customer_service_session
 * **无 claimed_by 列** —— 归属维度按后端冻结不变量是 business_identity_id
 * （cs_session.erl 头注「session 绑定 business_identity_id（不是 user_id）」；
 * cs_pg_session ?SQL_CLAIM_UPDATE `SET business_identity_id = $4`），claim 后
 * 归属坐席个人 identity，A=IDENTITY_ID（helpers/env.ts）、B=SEAT2.identityId。
 */
function sessionClaimState(sessionId: string): { status: string; businessIdentityId: string } {
  const row = psql(`SELECT status, business_identity_id FROM customer_service_session WHERE id = ${sessionId}`)
  const [status, businessIdentityId] = row.split('|')
  return { status, businessIdentityId }
}

test.describe('SC-E2E F7 双坐席 claim 竞争（EXECUTE-GATED）', () => {
  test.beforeAll(() => {
    // B-5① 口径：第二坐席密码无默认回退，缺失即 fail-fast 并给出注入方法。
    if (SEAT2.password === '') {
      throw new Error(
        '缺少必需环境变量 SC153_E2E_SEAT2_PASSWORD（第二坐席合成密码，B-5① 口径无默认回退）。' +
          '注入方法：export SC153_E2E_SEAT2_PASSWORD=<与运行 fixtures/harness-seat-embed.sh 时相同的值>' +
          '（harness d2 段 require_env 与本 spec 读同一变量，二者必须同源同值；README.md 前置清单）',
      )
    }
    assertSeat2FixtureReady()
  })

  // ---------------------------------------------------------------- F7-1
  test('F7-1 双坐席竞争恰一成功：A UI claim 成功入 active；B 对同会话 claim 必 409 cas_mismatch', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatBPage: Page | null = null
    let seatAPage: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)

      // 坐席B（contextB）先就位：真实 QR 登录 + 队列里看到同一会话 —— 两个
      // 坐席同时盯着同一条排队会话的竞争现场。
      const { page: pageB } = await openSeatEmbed(browser, SHOP)
      seatBPage = pageB
      await qrLoginSeat2InFrame(pageB)
      const frameB = embedFrame(pageB)
      await expect(frameB.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })

      // 坐席A（contextA）就位。
      const { page: pageA } = await openSeatEmbed(browser, SHOP)
      seatAPage = pageA
      await qrLoginSeatInFrame(pageA, SEAT.account)
      const frameA = embedFrame(pageA)

      // B 队列快照里的 CAS 版本（A claim 前的 version）—— 真实竞争中失败方
      // 携带的正是自己队列快照里的旧版本（A04 单测同源事实：queue 行投影含
      // version，claim 按行 version 发起）。
      const versionBefore = Number(
        psql(`SELECT version FROM customer_service_session WHERE id = ${sessionId}`),
      )

      // A 的 UI claim（真实 CAS 写）：queued 可见 → claim → 进行中 → 打开会话。
      await claimAndOpenSession(frameA, sessionId)

      // DB 直证：会话 active 且归属坐席A 的 identity（归属维度说明见
      // sessionClaimState 注释 —— 表无 claimed_by 列，business_identity_id 即
      // 后端冻结的坐席归属维度）。
      const claimed = sessionClaimState(sessionId)
      expect(claimed.status, 'A claim 后会话必须 active').toBe('active')
      expect(claimed.businessIdentityId, '会话必须归属坐席A 的 identity').toBe(IDENTITY_ID)

      // B 的 claim 重放（同凭据身份，携 A claim 前的 expected_version）：当前
      // DB 事实 status='active' ≠ 'queued'，domain cas 判定 + DB CAS 双层都拒。
      const res = await seat2Claim(sessionId, versionBefore)
      expect(res.status, '坐席B 对 A 已接单会话的 claim 必须 HTTP 409（DB CAS 0 行更新）').toBe(409)
      const body = (await res.json()) as {
        code: number
        msg: string
        payload?: { expected_version?: number; actual_version?: number }
      }
      // F-6 冻结契约（cs_http reply_error cas_mismatch 子句）：409 + msg
      // 'cas_mismatch' + payload 携带期望/当前 version（纯整数）。
      expect(body.code, '信封 code 必须 409').toBe(409)
      expect(body.msg, '信封标签必须 cas_mismatch（F-6 冻结契约）').toBe('cas_mismatch')
      expect(body.payload?.actual_version, 'actual_version 必须 = A claim 后推进的版本').toBe(
        versionBefore + 1,
      )
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatBPage?.context().close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- F7-2
  test('F7-2 A claim 后 B 的队列视图收敛：会话不再显示为可 claim（queued 服务端语义）', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatBPage: Page | null = null
    let seatAPage: Page | null = null
    try {
      // B 先就位（队列首载为空）。
      const { page: pageB } = await openSeatEmbed(browser, SHOP)
      seatBPage = pageB
      await qrLoginSeat2InFrame(pageB)
      const frameB = embedFrame(pageB)

      // 访客建会话：session.opened → queue.changed 推给同 org 全部坐席 SSE 流
      // → B 的 sessions 查询失效重拉 → 队列实时出现（非 claim 方坐席也看到
      // 新排队 —— 竞争的起点事实）。
      const { sessionId } = await newVisitorSession(visitorPage)
      await expect(frameB.getByTestId(`seat-session-item-${sessionId}`)).toBeVisible({ timeout: 30_000 })
      await expect(frameB.getByTestId(`seat-claim-${sessionId}`), 'claim 前必须可 claim').toBeVisible({
        timeout: 30_000,
      })

      // A 就位并 UI claim。
      const { page: pageA } = await openSeatEmbed(browser, SHOP)
      seatAPage = pageA
      await qrLoginSeatInFrame(pageA, SEAT.account)
      const frameA = embedFrame(pageA)
      await claimAndOpenSession(frameA, sessionId)

      // B 的队列收敛（UI 主断言）：session.claimed → assignment.changed 推给 B
      // → sessions 失效重拉。queued tab 数据源（GET sessions/queue）服务端按
      // status='queued' 过滤（cs_pg_session SQL_LIST_SESSIONS_PAGE），A claim 后
      // status='active' —— 会话必须从 B 的队列消失（claim 入口随之消失）。
      await expect(
        frameB.getByTestId(`seat-session-item-${sessionId}`),
        'A claim 后 B 的队列不得再显示该会话',
      ).toHaveCount(0, { timeout: 20_000 })
      await expect(frameB.getByTestId(`seat-claim-${sessionId}`), 'claim 入口必须随之消失').toHaveCount(0)

      // DB oracle（归属锚定，非主断言 —— UI 已有 queued 语义区分）：会话
      // active 且归属 A 的 identity、绝非 B 的（business_identity_id 维度，
      // 见 sessionClaimState 注释）。
      const claimed = sessionClaimState(sessionId)
      expect(claimed.status).toBe('active')
      expect(claimed.businessIdentityId).toBe(IDENTITY_ID)
      expect(claimed.businessIdentityId).not.toBe(SEAT2.identityId)
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatBPage?.context().close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })

  // ---------------------------------------------------------------- F7-3
  test('F7-3 消息不串台：A 接单后访客追发 —— A 的消息区实时出现，B 的工作台全程不出现该文本', async ({ browser }) => {
    test.setTimeout(300_000)
    closeStaleActiveSessions(RUN_SINCE)
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    let seatBPage: Page | null = null
    let seatAPage: Page | null = null
    try {
      const { sessionId } = await newVisitorSession(visitorPage)

      // A 就位 + claim + 打开会话（消息区就绪）。
      const { page: pageA } = await openSeatEmbed(browser, SHOP)
      seatAPage = pageA
      await qrLoginSeatInFrame(pageA, SEAT.account)
      const frameA = embedFrame(pageA)
      await claimAndOpenSession(frameA, sessionId)

      // B 后就位（真实第二坐席浏览器；A 已接单，B 的任何列表都不含该会话
      // —— B 全程保持列表态，不打开任何会话）。
      const { page: pageB } = await openSeatEmbed(browser, SHOP)
      seatBPage = pageB
      await qrLoginSeat2InFrame(pageB)
      const frameB = embedFrame(pageB)
      await expect(frameB.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })
      await expect(frameB.getByTestId(`seat-session-item-${sessionId}`), 'A 接单后 B 首载队列不含该会话').toHaveCount(0)

      // 访客 widget 追发一条（claim 之后的新消息）。
      const followup = `sc153 F7 访客追发 ${RUN_UNIQ}`
      const visitorWidget = visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
      await visitorWidget.getByTestId('cs-input').fill(followup)
      await visitorWidget.getByTestId('cs-send').click()

      // A 侧：message.appended → A 的 messages 查询失效重拉 → 20s 内实时出现
      // （SSE 收敛；与 A04 F6 反向链路同款断言口径）。
      await expect(frameA.getByTestId('seat-message-list').getByText(followup)).toBeVisible({
        timeout: 20_000,
      })

      // B 侧（A 已出现 = 同 org 的 SSE message.appended 事件流已投递）：B 未
      // 打开该会话，无激活的 messages 查询可失效重拉 —— 消息区节点不存在，
      // 整个 frame DOM 不出现追发文本（队列 preview 也不泄漏：该会话已不在
      // B 的任何列表行内）。
      await expect(frameB.getByTestId('seat-message-list'), 'B 未打开会话，消息区不得存在').toHaveCount(0)
      await expect(frameB.getByText(followup), 'B 的工作台不得出现该文本（不串台）').toHaveCount(0)
    } finally {
      await visitorCtx.close().catch(() => {})
      await seatBPage?.context().close().catch(() => {})
      await seatAPage?.context().close().catch(() => {})
    }
  })
})
