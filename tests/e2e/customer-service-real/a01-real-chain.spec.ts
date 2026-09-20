/**
 * P1-E2E-01 A01：四域跨域真实主链（browser 面）。
 *
 * 宿主页（plain HTML，本测试静态服务承载）→ loader.js 从自身 script.src 推导
 * widget origin → widget iframe（后端 frame HTML GET /api/v1/cs/widget/frame/:id
 * 经透明反代由 9802 真实渲染，CSP frame-ancestors 命中）→ consent 接受 →
 * 访客发文本（页面）→ API 驱动合成坐席 A（queue→claim→回复）→ 坐席回复经
 * SSE message 帧页面渲染 → ACK →
 * 附件（页面经 widget 管线 presign/PUT/confirm/消息）→ transfer A→B →
 * close（B）→ SSE state 帧触发页面评分 UI → 页面星级提交评分 →
 * DB 直证（canonical message 行 + rating=5）。
 *
 * DF-5 修复后（922153f2，9802 已加载）：访客 SSE 的 message/state 帧恢复，
 * 本套件的两处「同通道等效覆盖」回归点已翻回真实页面 oracle：
 * 1) 坐席回复经 SSE message 帧实时渲染进页面（data-role=agent 气泡）；
 * 2) close 经 SSE state 帧触发页面评分 UI（closed-rating 星级入口），
 *    评分由页面星级点击提交（widget 自身 list_sessions CAS + widget_rate）。
 * （DF-4 已由 07195ae1 修复，a02-3 同步收紧为吊销后写 4xx。）
 *
 * mock 禁令：无任何响应伪造；坐席侧按任务规格走 HTTP API 驱动。
 */
import { expect, test } from '@playwright/test'
import { SeatAgent, type QueueSession } from './helpers/agent-api'
import {
  ORG_ID,
  SEAT_A,
  SEAT_B,
} from './helpers/env'
import {
  fetchAssetRows,
  fetchCanonicalMessages,
  fetchSessionRating,
  fetchSessionState,
} from './helpers/db-proof'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('A01 主链：宿主→frame→consent→访客文本→坐席回复(SSE页面渲染)→ACK→附件→转接→关闭→页面评分UI→DB直证', async ({ page }) => {
  // —— 坐席登录（API 驱动的合成坐席；真实 passport/login）——
  const agentA = await SeatAgent.login('A', SEAT_A.account, SEAT_A.identityId)
  const agentB = await SeatAgent.login('B', SEAT_B.account, SEAT_B.identityId)

  // —— 基线与页面活动会话观察（必须在页面可能创建会话之前取样）——
  // widget 在 consent 接受时即 ensureSession（先于访客首条消息）；基线若晚于
  // 该点取样，consent 会话会落入基线、发送后被误判「无新会话」（原 flake 根因）。
  // 页面活动会话以 widget 为其打开的 SSE events 流请求为页面真相，与坐席
  // queue 权威读交叉定位（观察 ≠ 拦截），排除同库其他来源的排队噪声。
  const queueBaseline = new Set((await agentA.queue(ORG_ID)).map((row) => row.id))
  const pageStreamSessionIds: string[] = []
  page.on('request', (req) => {
    const match = /\/api\/v1\/cs\/widget\/sessions\/(\d+)\/events/.exec(req.url())
    if (match !== null) pageStreamSessionIds.push(match[1] ?? '')
  })

  // —— 宿主页 + loader 挂载（origin 推导自 script.src = localhost:8901）——
  await page.goto('/')
  const launcher = page.getByTestId('cs-widget-launcher')
  await expect(launcher).toBeVisible()

  // —— 打开面板 → iframe（后端 frame HTML）→ consent ——
  await launcher.click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  const consentAccept = frame.getByTestId('cs-consent-accept')
  await expect(consentAccept).toBeVisible({ timeout: 30_000 })
  await consentAccept.click()

  // —— chat 阶段；访客发文本 ——
  const visitorInput = frame.getByTestId('cs-input')
  await expect(visitorInput).toBeVisible()
  const visitorText = `csww-e2e 访客咨询 ${RUN_UNIQ}`
  await visitorInput.fill(visitorText)
  await frame.getByTestId('cs-send').click()

  // —— API 驱动坐席 A：页面 SSE 活动会话 × queue 权威读交叉定位 → claim → 回复 ——
  let created: QueueSession | undefined
  await expect
    .poll(
      async () => {
        const pageSession = pageStreamSessionIds[pageStreamSessionIds.length - 1]
        if (pageSession === undefined || pageSession === '') return false
        const rows = await agentA.queue(ORG_ID)
        created = rows.find((row) => row.id === pageSession && !queueBaseline.has(row.id) && row.status === 'queued')
        return created !== undefined
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] }
    )
    .toBe(true)
  if (created === undefined) throw new Error('unreachable: new queued session not found')
  const sessionId = created.id
  const conversationId = created.conversation_id
  await agentA.claimWithCapacityDefense(ORG_ID, sessionId, created.version)

  const agentReplyText = `csww-e2e 坐席回复 ${RUN_UNIQ}`
  await agentA.reply(ORG_ID, conversationId, `e2e-reply-${RUN_UNIQ}`, agentReplyText)

  // —— 回归点 1（DF-5 修复后恢复的页面 oracle）：坐席回复经访客 SSE message
  // 帧实时渲染为 data-role=agent 气泡（后端 SSE 轮询节奏 15s，超时留足）。
  // 同时保留企业真源权威面断言（A03 双证明面：API/DB + 页面）。
  await expect(
    frame
      .locator('[data-testid="cs-message-list"] [data-role="agent"]')
      .filter({ hasText: agentReplyText })
  ).toBeVisible({ timeout: 45_000 })
  const messageList = frame.getByTestId('cs-message-list')
  await expect(messageList).toContainText(visitorText)
  await expect
    .poll(
      async () => {
        const rows = await agentA.listMessages(ORG_ID, conversationId)
        return rows.some((row) => row.sender_type === 'business_identity' && row.client_msg_id === `e2e-reply-${RUN_UNIQ}`)
      },
      { timeout: 20_000 }
    )
    .toBe(true)

  // —— ACK：坐席对访客消息落 delivery 事实（企业真源 ACK 合同）——
  const conversationMessages = await agentA.listMessages(ORG_ID, conversationId)
  const visitorCanonical = conversationMessages.find((row) => row.sender_type === 'contact')
  expect(visitorCanonical, 'visitor canonical message must exist in enterprise_message').toBeTruthy()
  await agentA.ack(ORG_ID, conversationId, visitorCanonical!.id)

  // —— 附件：页面经 widget 管线上传（presign→PUT→confirm→消息 asset_ids）——
  const attachmentName = `csww-e2e-attachment-${RUN_UNIQ}.txt`
  await frame
    .getByTestId('cs-file-input')
    .setInputFiles({ name: attachmentName, mimeType: 'text/plain', buffer: Buffer.from(`csww e2e payload ${RUN_UNIQ}`) })
  const linkedState = frame.locator('[data-testid="cs-att-state"][data-state="linked"]')
  await expect(linkedState).toBeVisible({ timeout: 30_000 })

  // —— transfer A→B（CAS）——
  const afterClaim = await agentA.detail(ORG_ID, sessionId)
  await agentA.transfer(ORG_ID, sessionId, afterClaim.version, SEAT_B.identityId)
  await expect
    .poll(async () => (await agentB.detail(ORG_ID, sessionId)).business_identity_id ?? null)
    .toBe(SEAT_B.identityId)

  // —— close（接管坐席 B 执行；CAS）——
  const afterTransfer = await agentB.detail(ORG_ID, sessionId)
  await agentB.close(ORG_ID, sessionId, afterTransfer.version, 'e2e-close')
  await expect
    .poll(async () => (await agentB.detail(ORG_ID, sessionId)).status)
    .toBe('closed')

  // —— 回归点 2（DF-5 修复后恢复的页面 oracle）：close 后访客 SSE state
  // 帧驱动页面进入 closed-rating 相位，评分 UI（星级入口）出现；评分由页面
  // 星级点击提交（widget 内部 list_sessions 取 version → widget_rate CAS）。
  const star5 = frame.getByTestId('cs-rate-5')
  await expect(star5).toBeVisible({ timeout: 45_000 })
  await star5.click()
  // rating_submitted 即置相位 rated（幂等：重复帧不回退），页面显示致谢屏。
  await expect(frame.getByTestId('cs-overlay')).toContainText('感谢您的评价！', { timeout: 30_000 })

  // —— DB 直证（A03 第二证明面）——
  let canonical: ReturnType<typeof fetchCanonicalMessages> = []
  await expect
    .poll(
      async () => {
        canonical = fetchCanonicalMessages(conversationId)
        const senders = new Set(canonical.map((row) => row.sender_type))
        return senders.has('contact') && senders.has('business_identity') && canonical.some((row) => row.client_msg_id !== null)
      },
      { timeout: 20_000 }
    )
    .toBe(true)
  expect(canonical.some((row) => row.body_present)).toBe(true)
  expect(canonical.some((row) => row.client_msg_id === `e2e-reply-${RUN_UNIQ}`)).toBe(true)

  let rating: number | null = null
  await expect
    .poll(
      async () => {
        rating = fetchSessionRating(sessionId)
        return rating
      },
      { timeout: 20_000 }
    )
    .toBe(5)

  const finalState = fetchSessionState(sessionId)
  expect(finalState).not.toBeNull()
  expect(finalState!.status).toBe('closed')
  expect(finalState!.identity).toBe(SEAT_B.identityId)

  await expect
    .poll(async () => fetchAssetRows(conversationId).filter((row) => row.messageBound).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1)
})
