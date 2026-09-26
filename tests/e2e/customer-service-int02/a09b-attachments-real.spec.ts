/**
 * CS-INT-03 补齐（a09b）：附件完整链 + reload/reconnect 恢复（J-CS-06 附件面）。
 *
 * 真实拓扑（零 mock route；专用 playwright.customer-service-int03.config.ts）：
 *   - 真实 Cowboy :19802（imboy integration d91f96ac）+ scratch PG；
 *   - widget 宿主 :8902 透明反代（loader/iframe/消息/历史 100% 真实后端）；
 *   - Web Seat = vite dev :8904（VITE_PROXY_TARGET=19802；坐席工作台真实渲染，
 *     登录态经页面内 establishSeatSession 建立——CS-INT-01 先例，非 mock）；
 *   - 附件裸 PUT 落点 = 后端 presign 下发的 upload.url（base_url
 *     https://dev.imboy.pub:8443 → static-host https 反代回 19802；自签证书，
 *     config 层 host-resolver-rules + ignoreHTTPSErrors，无任何 route 拦截）。
 *
 * 覆盖（上轮 a09 文本主链的附件缺口）：
 *   1. Widget 上传附件（选文件→presign→PUT→confirm→发送）→ cs-att-state
 *      linked；DB enterprise_asset 绑定（message_id/status/file_name/mime/size）；
 *   2. Web Seat 授权读取：坐席工作台真实渲染附件（授权预览），API content
 *      与上传字节 byte-identical；坐席消息投影含 assets 五键；
 *   3. 反向：Web Seat 发附件（attach-input→chip→send）→ widget SSE 实时
 *      收到并渲染缩略（授权代理拉取）；
 *   4. reload/reconnect 恢复：widget 页面 reload → 历史文本+附件投影恢复；
 *      断网重连（offline/online）→ SSE 恢复 online 且增量消息达；
 *      Web Seat reload → 会话/消息/附件恢复渲染；
 *   5. 负例：跨租户附件 content 403 + 撤权后 content 403 + 密钥材料扫描。
 *
 * Oracle 三重：HTTP（api()）+ DB（dbq()）+ DOM（真实 frame/工作台断言）。
 * 幂等续跑：与 a09 同款 beforeAll 恢复 entitlement；每轮 RUN_UNIQ 隔离文本。
 */
import { expect, test, type Page } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:19802'
const HOST = 'http://localhost:8902'
const ADMIN = 'http://127.0.0.1:8904'
const PG_CONTAINER = 'imboy_pg18'
const PG_DB = 'imboy_csagent_cs-agent-entux-v1-20260924T164136Z-539f3dae'

// int03 种子经环境注入（RUN evidence/CS-INT-03/internal/seed.env；变量名族
// 与 a08/a09 一致——前次未完成尝试误写 INT02_TOKEN_A（seed 从无此名），本轮修正）。
const ORG1 = process.env.INT02_ORG1 ?? ''
const WS1 = process.env.INT02_WS1 ?? ''
const SEAT_A_TOKEN = process.env.INT02_SEAT_A_TOKEN ?? ''
const SEAT_B_TOKEN = process.env.INT02_SEAT_B_TOKEN ?? ''
const SEAT_C2_TOKEN = process.env.INT02_SEAT_C2_TOKEN ?? ''
const SEAT_A_IDENTITY = process.env.INT02_SEAT_A_IDENTITY ?? ''
const SEAT_B_IDENTITY = process.env.INT02_SEAT_B_IDENTITY ?? ''
// establishSeatSession 的 uid（int03 固定族 A/B 用户）——种子输出注入，不再硬编码。
const UID_A = process.env.INT02_UID_A ?? ''
const UID_B = process.env.INT02_UID_B ?? ''

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** widget 面 presign 契约（冻结）只传 mime+size_bytes+object_hash——file_name
 * 仅 CS/eb 面扩展；visitor 附件在 DB 以 object_hash 定位（spec 内手算）。 */
async function sha256Hex(buf: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(buf).digest('hex')
}

/** 1x1 PNG（70B，真实魔数——服务端 PUT 后重算 hash/size/魔数复核）。 */
const PNG_VISITOR = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
/** 2x1 PNG（与访客侧字节不同，避免同 hash 复用混淆）。 */
const PNG_SEAT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0InJWAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const VISITOR_PNG_NAME = `a09b-visitor-${RUN_UNIQ}.png`
const SEAT_PNG_NAME = `a09b-seat-${RUN_UNIQ}.png`

type Envelope = { code: number; msg?: string; payload?: unknown }

async function api(
  token: string, method: string, path: string, body?: unknown,
): Promise<{ status: number; env: Envelope; text: string }> {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let env: Envelope = { code: -1 }
  try { env = JSON.parse(text) as Envelope } catch { /* non-json */ }
  return { status: res.status, env, text }
}

async function dbq(sql: string): Promise<string> {
  const { execFileSync } = await import('node:child_process')
  return execFileSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'imboy_user', '-d', PG_DB, '-tAc', sql]).toString().trim()
}

const org = (p: string) => `/api/v1/cs/organizations/${ORG1}${p}`
const eb = (p: string) => `/api/v1/enterprise/organizations/${ORG1}${p}`

function expectNoSecretMaterial(text: string, label: string) {
  for (const bad of ['object_key', 'bucket', 'presigned', 'storage_secret', 'chat_aes_key', 'private_key']) {
    expect(text.toLowerCase(), `${label} 泄漏 ${bad}`).not.toContain(bad)
  }
}

/** 面板就绪竞速等待（确定性，不用 locator.or()——组合 locator 的可见性
 * 评估在 frame 恢复期实测恒 false，而单 locator 的 isVisible 为 true）；
 * deadFrame 可见即 fail-fast（installation 不可用=种子/宿主 id 不匹配的
 * 环境错误，不该被 30s 盲等掩盖）。 */
async function racePanelReady(
  frame: import('@playwright/test').FrameLocator,
  candidates: import('@playwright/test').Locator[],
  timeoutMs = 30_000,
) {
  const deadFrame = frame.getByText('installation_unavailable')
  const waited = await Promise.race([
    ...candidates.map((c) => c.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'panel')),
    deadFrame.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'dead'),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
  ])
  expect(waited, 'widget 面板就绪（installation_unavailable=种子/宿主 id 不匹配）').toBe('panel')
}

/** 确定性 widget 打开（去 flaky 纪律，与 a08 修复同款）：
 *  domcontentloaded + 显式 launcher + 分支竞速等待面板就绪。 */
async function openWidgetAndConsent(page: Page) {
  await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded' })
  const launcher = page.getByTestId('cs-widget-launcher')
  await expect(launcher).toBeVisible({ timeout: 30_000 })
  await launcher.click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await racePanelReady(frame, [frame.getByTestId('cs-consent-accept')])
  const consent = frame.getByTestId('cs-consent-accept')
  await consent.click()
  const input = frame.getByTestId('cs-input')
  await expect(input).toBeVisible({ timeout: 15_000 })
  return { frame, input }
}

/** reload 后 widget 恢复（subject 在 sessionStorage TTL 内 → 会话恢复；
 * 后端不记忆 consent 接受——consent 每次重现，input 兜底竞速）。 */
async function reopenWidgetAfterReload(page: Page) {
  await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded' })
  const launcher = page.getByTestId('cs-widget-launcher')
  await expect(launcher).toBeVisible({ timeout: 30_000 })
  await launcher.click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await racePanelReady(frame, [frame.getByTestId('cs-consent-accept'), frame.getByTestId('cs-input')])
  const consent = frame.getByTestId('cs-consent-accept')
  if (await consent.isVisible().catch(() => false)) {
    await consent.click()
  }
  const input = frame.getByTestId('cs-input')
  await expect(input).toBeVisible({ timeout: 15_000 })
  return { frame, input }
}

/** Web Seat 登录（CS-INT-01 先例：页面内 establishSeatSession——真实 token
 * 进内存 vault；非 mock，业务响应 100% 真实后端）。等「坐席登录」门渲染
 * （SPA 挂载信号）再 evaluate，杜绝导航竞态毁掉执行上下文。 */
async function openSeatWorkbench(browser: import('@playwright/test').Browser, token: string) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.goto(`${ADMIN}/customer-service/workspace`, { waitUntil: 'load' })
  await expect(page.getByText('坐席登录').first()).toBeVisible({ timeout: 30_000 })
  const ok = await page.evaluate(async ([t, uid]) => {
    const m = await import('/src/modules/customer_service/seat/seatAuthStore.ts')
    return m.establishSeatSession(t, uid)
  }, [token, UID_B] as [string, string])
  expect(ok).toBe(true)
  await expect(page.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })
  return { ctx, page }
}

test.describe.configure({ mode: 'serial' })

test.describe('a09b attachments real (J-CS-06 附件面补齐)', () => {
  // 跨 test 状态（serial；负例复用主链 conv 与 claim 决策）
  let convId = ''
  let sid = ''
  // 主链 claim 决策（test 内从 DB intake 经办实读后赋值；负例复用——
  // serial 模式下负例永远晚于主链执行，读到的必是本轮已赋值）。
  let claimToken = ''
  let claimIdentity = ''
  let otherToken = ''
  let otherIdentity = ''

  test('附件全链：widget 上传->DB 绑定->Web Seat 授权读->seat 发->widget 收->reload/reconnect 恢复', async ({ page, browser }) => {
    // —— 1. widget 打开 + 首条文本（会话 queued）——
    const { frame, input } = await openWidgetAndConsent(page)
    const m1 = `a09b 访客首条 ${RUN_UNIQ}`
    await input.fill(m1)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByText(m1)).toBeVisible({ timeout: 15_000 })
    const sidRow = await dbq(
      `SELECT id, conversation_id FROM customer_service_session WHERE organization_id = ${ORG1} ORDER BY id DESC LIMIT 1`,
    )
    ;[sid, convId] = sidRow.split('|')
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('queued')

    // —— 2. claim（真实当前经办链）：主链 claim 者 = **eb 会话 intake 经办**
    // （从 DB 读运行时事实，不硬假设 A/B——provision TSID 单调使 lists:min
    // 派单通常落在先 provision 的 A，但以 DB 为准）。原因：DEFECT-CSINT03-1
    // （claim/transfer 只改 CS 会话经办、不回写 enterprise_conversation 经办
    // ——负例实证）。intake 经办本人 claim 是业务上完全合法的接单路径，且
    // 此时「CS 经办 == eb 经办」，附件授权门对真实当前经办放行——主链在该
    // 真实路径上覆盖附件闭环；claim 换人后附件不可读的缺陷影响由负例如实
    // 披露（不掩盖、不绕过）。——
    const ebAssignee = await dbq(
      `SELECT business_identity_id FROM enterprise_conversation WHERE id = ${convId}`,
    )
    const claimIsA = ebAssignee === SEAT_A_IDENTITY
    claimToken = claimIsA ? SEAT_A_TOKEN : SEAT_B_TOKEN
    claimIdentity = claimIsA ? SEAT_A_IDENTITY : SEAT_B_IDENTITY
    const claimUid = claimIsA ? UID_A : UID_B
    otherToken = claimIsA ? SEAT_B_TOKEN : SEAT_A_TOKEN
    otherIdentity = claimIsA ? SEAT_B_IDENTITY : SEAT_A_IDENTITY
    await api(claimToken, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    let claimed = false
    for (let i = 0; i < 6 && !claimed; i++) {
      const det = await api(claimToken, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
      const v = (det.env.payload as { version?: number }).version
      const c = await api(claimToken, 'POST', org(`/sessions/${sid}/claim?workspace_id=${WS1}`), { expected_version: v })
      claimed = c.status === 200
      if (!claimed) await new Promise((r) => setTimeout(r, 400))
    }
    expect(claimed).toBe(true)

    // —— 3. Widget 上传附件（选文件→presign→裸 PUT→confirm→发送，全真实链）——
    await frame.getByTestId('cs-file-input').setInputFiles({
      name: VISITOR_PNG_NAME, mimeType: 'image/png', buffer: PNG_VISITOR,
    })
    // linked 是唯一成功态（发送流水线 confirm 后同事务绑定消息）。
    await expect(frame.getByTestId('cs-att-state').first())
      .toHaveAttribute('data-state', 'linked', { timeout: 45_000 })

    // —— 4. DB 附件绑定断言（enterprise_asset 真源；object_hash 定位——
    //    widget 面契约不带 file_name，hash 是字节级身份）。——
    const visitorHash = await sha256Hex(PNG_VISITOR)
    const assetRow = await dbq(
      `SELECT id, status, mime, size_bytes FROM enterprise_asset WHERE conversation_id = ${convId} AND object_hash = '${visitorHash}'`,
    )
    expect(assetRow.length).toBeGreaterThan(0)
    const [assetId, aStatus, aMime, aSize] = assetRow.split('|')
    expect(aStatus).toBe('active')
    expect(aMime).toBe('image/png')
    expect(Number(aSize)).toBe(PNG_VISITOR.length)
    // 消息绑定：asset.message_id 非空且指向本会话一条 contact 消息。
    const bindRow = await dbq(
      `SELECT a.message_id, m.sender_type FROM enterprise_asset a JOIN enterprise_message m ON m.id = a.message_id WHERE a.id = ${assetId}`,
    )
    const [msgIdOfAsset, senderType] = bindRow.split('|')
    expect(senderType).toBe('contact')
    expect(msgIdOfAsset.length).toBeGreaterThan(0)

    // —— 5. Web Seat：工作台真实渲染 + 会话打开 + 附件授权预览 ——
    const seat = await openSeatWorkbench(browser, claimToken)
    const seatPage = seat.page
    // claim 后会话在「进行中」tab。
    await seatPage.getByTestId('seat-tab-active').click()
    await expect(seatPage.getByTestId(`seat-session-item-${sid}`)).toBeVisible({ timeout: 30_000 })
    await seatPage.getByTestId(`seat-session-item-${sid}`).click()
    // 会话消息列表渲染：首条文本 + 访客附件（图片=授权预览，非 error 态）。
    await expect(seatPage.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByText(m1).first()).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByTestId('seat-attachment-image').first()).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByTestId('seat-attachment-image-error')).toHaveCount(0)

    // —— 6. 坐席面消息投影（API）：assets 五键白名单 + 密钥扫描 ——
    const msgs = await api(claimToken, 'GET', eb(`/conversations/${convId}/messages?workspace_id=${WS1}&limit=50`))
    expect(msgs.status).toBe(200)
    expectNoSecretMaterial(msgs.text, 'seat-messages')
    // 载荷 = 裸数组（eb list_messages_after → {ok, [map()]}；兼容 {messages} 旧形）。
    type MsgRow = { id?: string; assets?: Array<{ id?: string; file_name?: string | null; status?: string; mime?: string; size_bytes?: number }> }
    const payload = msgs.env.payload as MsgRow[] | { messages?: MsgRow[] }
    const rows = Array.isArray(payload) ? payload : (payload.messages ?? [])
    const attMsg = rows.find((r) => (r.assets ?? []).some((a) => a.id === assetId))
    expect(attMsg).toBeTruthy()
    const proj = attMsg!.assets![0]!
    expect(Object.keys(proj).sort()).toEqual(['file_name', 'id', 'mime', 'size_bytes', 'status'])
    expect(proj.status).toBe('active')
    expect(proj.mime).toBe('image/png')
    expect(proj.size_bytes).toBe(PNG_VISITOR.length)

    // —— 7. 授权读取 byte-identical（HTTP 真值）——
    const contentRes = await fetch(`${BACKEND}/api/v1/enterprise/organizations/${ORG1}/assets/${assetId}/content?workspace_id=${WS1}`, {
      headers: { authorization: `Bearer ${claimToken}` },
    })
    expect(contentRes.status).toBe(200)
    const contentBytes = Buffer.from(await contentRes.arrayBuffer())
    expect(contentBytes.equals(PNG_VISITOR)).toBe(true)

    // —— 8. 反向：Web Seat 发附件（attach-input→chip→composer→send）——
    await seatPage.getByTestId('seat-attach-input').setInputFiles({
      name: SEAT_PNG_NAME, mimeType: 'image/png', buffer: PNG_SEAT,
    })
    await expect(seatPage.getByTestId('seat-attach-chip')).toBeVisible({ timeout: 15_000 })
    await expect(seatPage.getByTestId('seat-attach-chip-name')).toHaveText(SEAT_PNG_NAME)
    const seatText = `a09b 坐席附件说明 ${RUN_UNIQ}`
    await seatPage.getByTestId('seat-composer').fill(seatText)
    await seatPage.getByTestId('seat-send').click()
    // 坐席侧：新消息 + 附件渲染（图片预览）。
    await expect(seatPage.getByText(seatText).first()).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByTestId('seat-attachment-image').nth(1)).toBeVisible({ timeout: 30_000 })

    // —— 9. widget 实时收到（SSE）并渲染缩略（授权代理拉取 → img blob）——
    await expect(frame.getByTestId('cs-asset-thumb').filter({ hasText: SEAT_PNG_NAME }))
      .toBeVisible({ timeout: 30_000 })
    await expect(frame.locator('img.cs-asset-thumb-img').first()).toBeVisible({ timeout: 30_000 })

    // —— 10. DB：坐席附件绑定（sender=business_identity=B）——
    const seatAssetRow = await dbq(
      `SELECT a.id, a.business_identity_id FROM enterprise_asset a WHERE a.conversation_id = ${convId} AND a.file_name = '${SEAT_PNG_NAME}'`,
    )
    expect(seatAssetRow.length).toBeGreaterThan(0)
    const [, seatAssetOwner] = seatAssetRow.split('|')
    expect(seatAssetOwner).toBe(claimIdentity)

    // —— 11. widget reload：历史（文本+双向附件投影）真实恢复 ——
    await page.reload({ waitUntil: 'domcontentloaded' })
    const w2 = await reopenWidgetAfterReload(page)
    await expect(w2.frame.getByText(m1)).toBeVisible({ timeout: 30_000 })
    await expect(w2.frame.getByText(seatText).first()).toBeVisible({ timeout: 30_000 })
    // 双向附件投影恢复：坐席附件（file_name 可精确匹配）+ 图片缩略（授权拉取）；
    // 访客附件无 file_name（widget 契约）——以图片节点计数覆盖（≥2：visitor+seat）。
    await expect(w2.frame.getByTestId('cs-asset-thumb').filter({ hasText: SEAT_PNG_NAME }))
      .toBeVisible({ timeout: 30_000 })
    await expect(w2.frame.getByTestId('cs-asset-thumb')).toHaveCount(2, { timeout: 30_000 })
    await expect(w2.frame.locator('img.cs-asset-thumb-img').first()).toBeVisible({ timeout: 30_000 })
    // DB 直证：DOM 消息数 == DB 业务消息数（contact+business_identity）。
    // 此时点消息 3 条：m1 文本 + 访客附件 + 坐席附件（m4 在断网重连步才发）。
    const dbCount = Number(await dbq(
      `SELECT count(*) FROM enterprise_message WHERE conversation_id = ${convId} AND sender_type IN ('contact','business_identity')`,
    ))
    expect(dbCount).toBe(3)
    const domCount = await w2.frame.locator('.cs-msg').count()
    expect(domCount).toBeGreaterThanOrEqual(dbCount)

    // —— 12. 断网重连（offline→online）：SSE 恢复 online 且增量消息达 ——
    await page.context().setOffline(true)
    await page.waitForTimeout(1200)
    await page.context().setOffline(false)
    await expect(w2.frame.getByTestId('cs-conn-state'))
      .toHaveAttribute('data-state', 'online', { timeout: 30_000 })
    const m4 = `a09b 重连后坐席消息 ${RUN_UNIQ}`
    const reply4 = await api(claimToken, 'POST', eb(`/conversations/${convId}/messages`), {
      body: m4, client_msg_id: `a09b-m4-${RUN_UNIQ}`, workspace_id: WS1,
      sender_type: 'business_identity', identity_id: claimIdentity,
    })
    expect(reply4.status).toBe(200)
    await expect(w2.frame.getByText(m4).first()).toBeVisible({ timeout: 30_000 })

    // —— 13. Web Seat reload：会话/消息/附件恢复（内存 vault 语义=重新登录）——
    await seatPage.reload({ waitUntil: 'load' })
    await expect(seatPage.getByText('坐席登录').first()).toBeVisible({ timeout: 30_000 })
    const ok2 = await seatPage.evaluate(async ([t, uid]) => {
      const m = await import('/src/modules/customer_service/seat/seatAuthStore.ts')
      return m.establishSeatSession(t, uid)
    }, [claimToken, claimUid] as [string, string])
    expect(ok2).toBe(true)
    await expect(seatPage.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })
    await seatPage.getByTestId('seat-tab-active').click()
    await expect(seatPage.getByTestId(`seat-session-item-${sid}`)).toBeVisible({ timeout: 30_000 })
    await seatPage.getByTestId(`seat-session-item-${sid}`).click()
    await expect(seatPage.getByTestId('seat-message-list')).toBeVisible({ timeout: 30_000 })
    // 消息 + 双向附件 + 重连后消息全部恢复渲染（toHaveCount 自带重试——
    // 授权预览是逐附件异步 blob 拉取，即时 count 会撞上 loading 态）。
    await expect(seatPage.getByText(m1).first()).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByText(m4).first()).toBeVisible({ timeout: 30_000 })
    await expect(seatPage.getByTestId('seat-attachment-image')).toHaveCount(2, { timeout: 30_000 })
    await expect(seatPage.getByTestId('seat-attachment-image-error')).toHaveCount(0)
    // 会话业务消息 4 条：m1 文本 + 访客附件 + 坐席附件（含说明文本）+ m4。
    const dbFinal = Number(await dbq(
      `SELECT count(*) FROM enterprise_message WHERE conversation_id = ${convId} AND sender_type IN ('contact','business_identity')`,
    ))
    expect(dbFinal).toBe(4)
    // 会话保持 active（close 由负例 test 在 DEFECT 实证后执行——释放容量）。
    await seat.ctx.close()
  })

  test('负例：跨租户 content 403 / 无凭证 401 / DEFECT 实证（claim 后 eb 经办未回写）/ 撤权 403 / close', async () => {
    expect(convId.length).toBeGreaterThan(0)
    const assets = await dbq(`SELECT id FROM enterprise_asset WHERE conversation_id = ${convId} ORDER BY id`)
    const [a1] = assets.split('\n')
    expect(a1.length).toBeGreaterThan(0)

    // 跨租户：org2 坐席 C2 读 org1 附件 content → 403（fail-closed）。
    const cross = await fetch(`${BACKEND}/api/v1/enterprise/organizations/${ORG1}/assets/${a1}/content?workspace_id=${WS1}`, {
      headers: { authorization: `Bearer ${SEAT_C2_TOKEN}` },
    })
    expect(cross.status).toBe(403)
    expectNoSecretMaterial(await cross.text(), 'cross-403')

    // 无凭证：401。
    const anon = await fetch(`${BACKEND}/api/v1/enterprise/organizations/${ORG1}/assets/${a1}/content?workspace_id=${WS1}`)
    expect(anon.status).toBe(401)

    // —— DEFECT-CSINT03-1 实证（后端仓缺陷，本门不修，如实断言当前行为）：
    // CS claim/transfer 只改 customer_service_session.business_identity_id，
    // 不回写 enterprise_conversation.business_identity_id（widget 开会话时的
    // intake identity = lists:min 派单坐席）。eb_asset_scope 的会话经办门读
    // eb conversation 的过时经办 → 真实当前经办（transfer 受让人）读本会话
    // 访客附件 403 not_assignee。上轮 CS-INT-01 单坐席恰为 intake 才侥幸 200。
    await api(claimToken, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    const detB = await api(claimToken, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
    const verB = (detB.env.payload as { version?: number }).version ?? 2
    const tr = await api(claimToken, 'POST', org(`/sessions/${sid}/transfer?workspace_id=${WS1}`), { to_identity_id: otherIdentity, expected_version: verB })
    expect(tr.status).toBe(200)
    // DB 直证：CS 会话当前经办 = 受让人（transfer 生效）。
    expect(await dbq(`SELECT business_identity_id FROM customer_service_session WHERE id = ${sid}`)).toBe(otherIdentity)
    // 受让人（真实当前经办）读访客附件 → 403 not_assignee。
    // DEFECT-CSINT03-1 实证（后端仓缺陷，本门不修，如实断言当前行为）：
    // claim/transfer 只改 customer_service_session.business_identity_id，
    // 不回写 enterprise_conversation.business_identity_id；eb_asset_scope
    // 的会话经办门读 eb 会话的过时经办（intake 派单者）→ 真实当前经办
    // 反而 403。业务影响：接单/转接换人后附件不可读（大缺陷，记 BLOCKED，
    // 跨 feature 域真源/同步策略属设计决策，非显然修复）。
    const asAssignee = await fetch(`${BACKEND}/api/v1/enterprise/organizations/${ORG1}/assets/${a1}/content?workspace_id=${WS1}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    })
    expect(asAssignee.status).toBe(403)
    expect(String((JSON.parse(await asAssignee.text()) as Envelope).msg)).toContain('not_assignee')

    // 撤权（CS 面，a09 冻结口径）：suspend 原 claim 坐席 → queue 403 → resume → 200。
    const admId = process.env.ENTINT01_ADM_ID ?? ''
    const admSig = process.env.ENTINT01_ADM_SIG ?? ''
    const susp = await fetch(`${BACKEND}/api/adm/customer-service/organizations/${ORG1}/seats/${claimIdentity}/suspend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `adm_user_id=${admId}; adm_user_sig=${admSig}` },
      body: JSON.stringify({ reason: 'a09b-neg', workspace_id: WS1 }),
    })
    expect(susp.status).toBe(200)
    const denied = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(denied.status).toBe(403)
    expectNoSecretMaterial(denied.text, 'suspended-403')
    const resume = await fetch(`${BACKEND}/api/adm/customer-service/organizations/${ORG1}/seats/${claimIdentity}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `adm_user_id=${admId}; adm_user_sig=${admSig}` },
      body: JSON.stringify({ workspace_id: WS1 }),
    })
    expect(resume.status).toBe(200)
    const okAgain = await api(claimToken, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(okAgain.status).toBe(200)

    // close（受让人=当前经办，CAS）：业务闭环收尾 + 释放并发容量。
    const detA = await api(otherToken, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
    const verA = (detA.env.payload as { version?: number }).version ?? 3
    const close = await api(otherToken, 'POST', org(`/sessions/${sid}/close?workspace_id=${WS1}`), { expected_version: verA })
    expect(close.status).toBe(200)
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('closed')
  })
})
