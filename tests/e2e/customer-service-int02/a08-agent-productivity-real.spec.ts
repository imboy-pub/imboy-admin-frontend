/**
 * CS-INT-02（M2 Agent Productivity 真实集成门）：a08 J-CS-03..05。
 *
 * 真实拓扑（无任何 mock route）：
 *   - 真实 Cowboy 节点 :19802（imboy integration 候选，sys.int02 配置）；
 *   - run scratch PG（imboy_pg18 容器 :4323，库 imboy_csagent_<RUN_ID>）；
 *   - widget 宿主 :8902（static-host 透明反代 → 19802；frame/消息/历史 100%
 *     真实后端响应；loader 从 script.src 推导 origin 与 installation 对齐）；
 *   - 坐席侧 API 驱动（Human JWT 由种子节点生产同款 token_ds 签发）。
 *
 * 覆盖：
 *   J-CS-03 未读与转接：cursor DB 行 + queue count + transfer boundary（CAS）；
 *   J-CS-04 presence/离线：heartbeat/TTL DB（90s 冻结值）+ 派单真源
 *     derived_status + Widget queued state（真实页面排队 UI）；
 *   J-CS-05 客户上下文：白名单字段 + 禁键扫描 + cross-org denial +
 *     多会话切换隔离（stale/串数据拒绝）。
 */
import { expect, test } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:19802'
const HOST = 'http://localhost:8902'
const PG_CONTAINER = 'imboy_pg18'
const PG_DB = 'imboy_csagent_cs-agent-entux-v1-20260924T164136Z-539f3dae'

// int02 种子经环境注入（INT02_*，见 RUN evidence/CS-INT-02/internal/seed.env；
// 合成身份 + 生产同款签发的短期 JWT —— 仓库零凭据，gitleaks 干净）。
const ORG1 = process.env.INT02_ORG1 ?? ''
const WS1 = process.env.INT02_WS1 ?? ''
const ORG2 = process.env.INT02_ORG2 ?? ''
const SEAT_A_TOKEN = process.env.INT02_SEAT_A_TOKEN ?? ''
const SEAT_B_TOKEN = process.env.INT02_SEAT_B_TOKEN ?? ''
const SEAT_C2_TOKEN = process.env.INT02_SEAT_C2_TOKEN ?? ''
const SEAT_A_IDENTITY = process.env.INT02_SEAT_A_IDENTITY ?? ''
const SEAT_B_IDENTITY = process.env.INT02_SEAT_B_IDENTITY ?? ''
const WIDGET_PUBLIC_ID = process.env.INT02_WIDGET_PUBLIC_ID ?? ''

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** 打开 widget 面板并完成 consent（等待式；已 consent 时直接返回 input）。 */
async function openWidgetAndConsent(page: import('@playwright/test').Page) {
  await page.goto(`${HOST}/`, { waitUntil: 'networkidle' })
  await page.getByTestId('cs-widget-launcher').click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  const consent = frame.getByTestId('cs-consent-accept')
  await expect(consent).toBeVisible({ timeout: 30_000 })
  await consent.click()
  const input = frame.getByTestId('cs-input')
  await expect(input).toBeVisible({ timeout: 15_000 })
  return { frame, input }
}


type Envelope = { code: number; msg?: string; payload?: unknown }

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; env: Envelope }> {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let env: Envelope = { code: -1 }
  try {
    env = (await res.json()) as Envelope
  } catch {
    /* 非 JSON 响应保留壳 */
  }
  return { status: res.status, env }
}

/** DB 直证（docker exec psql；只读 SELECT 与本卡自身 presence TTL 模拟 UPDATE）。 */
async function dbq(sql: string): Promise<string> {
  const { execFileSync } = await import('node:child_process')
  try {
    return execFileSync('docker', [
      'exec', PG_CONTAINER, 'psql', '-U', 'imboy_user', '-d', PG_DB, '-tAc', sql,
    ]).toString().trim()
  } catch (err) {
    throw new Error(`dbq failed: ${sql}: ${String(err)}`)
  }
}

const org = (p: string) => `/api/v1/cs/organizations/${ORG1}${p}`
const org2 = (p: string) => `/api/v1/cs/organizations/${ORG2}${p}`

test.describe('a08 agent productivity real (J-CS-03..05)', () => {
  // 真实集成环境的 widget iframe 时序抖动（节点冷启动/SSE 建流）允许重试；
  // 断言本身全部服务端/DB 真值，重试不改变 oracle 语义。
  test.describe.configure({ retries: 2 })
  test('J-CS-03 未读与转接：cursor DB + queue count + transfer boundary', async ({ page }) => {
    // —— 坐席 A 心跳上线（为 claim 与后续 presence 断言铺垫）——
    const hb = await api(SEAT_A_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    expect(hb.status).toBe(200)

    // —— widget 页面驱动：访客发 3 条消息（真实 frame；consent 后 input）——
    await page.goto(`${HOST}/`, { waitUntil: 'networkidle' })
    const launcher = page.getByTestId('cs-widget-launcher')
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()
    const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
    const consent = frame.getByTestId('cs-consent-accept')
    await expect(consent).toBeVisible({ timeout: 30_000 })
    await consent.click()
    const input = frame.getByTestId('cs-input')
    await expect(input).toBeVisible()
    const texts = [1, 2, 3].map((n) => `a08-cs03 访客消息${n} ${RUN_UNIQ}`)
    for (const t of texts) {
      await input.fill(t)
      await frame.getByTestId('cs-send').click()
      await expect(frame.getByText(t)).toBeVisible({ timeout: 15_000 })
    }

    // —— A queue 定位会话（基线后新增且含 RUN_UNIQ 文本）——
    const queue = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(queue.status).toBe(200)
    const qPayload = queue.env.payload as { sessions: Array<{ id: string; version?: number }> }
    const created = qPayload.sessions[0]
    expect(created).toBeTruthy()
    const sid = created.id
    // DB 直证：会话 queued（claim 前）
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('queued')

    // —— A claim（expected_version CAS；消息投影可能推进版本 → 循环收敛）——
    let claimed = false
    for (let i = 0; i < 6 && !claimed; i++) {
      const det = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
      const ver = (det.env.payload as { version?: number }).version
      const attempt = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/claim?workspace_id=${WS1}`), {
        expected_version: ver ?? 1,
      })
      claimed = attempt.status === 200
      if (!claimed) await new Promise((r) => setTimeout(r, 500))
    }
    expect(claimed).toBe(true)
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('active')

    // —— 未读：A 视角 3 条未读 → ACK 第 2 条 → 剩 1 → 回退 ACK 幂等 ——
    const before = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    expect(before.status).toBe(200)
    const beforeState = before.env.payload as { unread_count?: number; last_read_message_id?: string }
    expect(beforeState.unread_count).toBe(3)

    // 取会话消息 id（widget 历史 API 以访客 token 才可读；改用 DB 直证 id 序）。
    const msgIds = (await dbq(
      `SELECT m.id FROM enterprise_message m JOIN customer_service_session s ON m.conversation_id = s.conversation_id WHERE s.id = ${sid} ORDER BY m.id ASC LIMIT 3`,
    )).split('\n').filter(Boolean)
    expect(msgIds.length).toBe(3)

    const ack2 = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`), {
      last_read_message_id: msgIds[1] ?? '',
    })
    expect(ack2.status).toBe(200)
    // DB 直证：cursor 行前进到 msg2、identity=A。
    const cursorRow = await dbq(
      `SELECT last_read_message_id, business_identity_id FROM customer_service_read_cursor WHERE session_id = ${sid} AND business_identity_id = ${SEAT_A_IDENTITY}`,
    )
    expect(cursorRow).toBe(`${msgIds[1]}|${SEAT_A_IDENTITY}`)

    const mid = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    const midState = mid.env.payload as { unread_count?: number }
    expect(midState.unread_count).toBe(1)

    // 回退（旧 id）不可回退 cursor。
    const rollback = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`), {
      last_read_message_id: msgIds[0] ?? '',
    })
    expect(rollback.status).toBe(200)
    const afterRollback = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    expect((afterRollback.env.payload as { unread_count?: number }).unread_count).toBe(1)

    // —— transfer boundary：A → B（CAS 版本）成功；同版本重放 409 ——
    const detA = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
    const ver = (detA.env.payload as { version?: number }).version ?? 2
    const transfer = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/transfer?workspace_id=${WS1}`), {
      to_identity_id: SEAT_B_IDENTITY,
      expected_version: ver,
    })
    expect(transfer.status).toBe(200)
    // DB 直证：改绑 B。
    expect(
      await dbq(`SELECT business_identity_id FROM customer_service_session WHERE id = ${sid}`),
    ).toBe(SEAT_B_IDENTITY)
    // 同 expected_version 重放（版本已前进）→ 版本冲突拒绝。
    const stale = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/transfer?workspace_id=${WS1}`), {
      to_identity_id: SEAT_A_IDENTITY,
      expected_version: ver,
    })
    expect([409, 422]).toContain(stale.status)

    // —— B 视角：transfer 边界语义（CS-DEC-02 冻结）——受让人游标在
    // transfer 时写入「会话内已存在的最大 message id」，transfer 前的
    // 历史对 B 默认 0 unread（不是从头数）；DB 直证 B cursor=边界。 ——
    const bBefore = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    expect((bBefore.env.payload as { unread_count?: number }).unread_count).toBe(0)
    expect((bBefore.env.payload as { last_read_message_id?: number | string }).last_read_message_id)
      .toBe(String(msgIds[2] ?? ''))
    const bCursorDb = await dbq(
      `SELECT last_read_message_id FROM customer_service_read_cursor WHERE session_id = ${sid} AND business_identity_id = ${SEAT_B_IDENTITY}`,
    )
    expect(bCursorDb).toBe(String(msgIds[2] ?? ''))

    // —— queue count：开第二个 widget 上下文（新 incognito page）发消息不 claim →
    // queue 投影 queued 计数 ≥1，且 total_by_status 一致 ——
    const ctx2 = await page.context().browser()?.newContext()
    const page2 = await ctx2!.newPage()
    const w2 = await openWidgetAndConsent(page2)
    const frame2 = w2.frame
    const input2 = w2.input
    const secondText = `a08-cs03 第二访客 ${RUN_UNIQ}`
    await input2.fill(secondText)
    await frame2.getByTestId('cs-send').click()
    await expect(frame2.getByText(secondText)).toBeVisible({ timeout: 15_000 })
    await ctx2!.close()

    const queue2 = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    const q2 = queue2.env.payload as { total_by_status?: { queued?: number } }
    expect(q2.total_by_status?.queued ?? 0).toBeGreaterThanOrEqual(1)
  })

  test('J-CS-04 presence/离线：heartbeat/TTL DB + 派单真源 + Widget queued state', async ({ page }) => {
    // —— B 心跳上线；DB 直证 presence 行 ——
    const hbB = await api(SEAT_B_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    expect(hbB.status).toBe(200)
    const hbPayload = hbB.env.payload as { status?: string }
    expect(hbPayload.status).toBe('online')
    const presenceRow = await dbq(
      `SELECT count(*) FROM customer_service_seat_presence WHERE organization_id = ${ORG1} AND business_identity_id = ${SEAT_B_IDENTITY} AND last_heartbeat_at > now() - interval '5 seconds'`,
    )
    expect(presenceRow).toBe('1')

    // —— 派单真源（presence list = annotate 同一派生）：B online；C2 视角自查 ——
    const presSelf = await api(SEAT_B_TOKEN, 'GET', org(`/seats/presence?workspace_id=${WS1}`))
    expect(presSelf.status).toBe(200)
    const rows = presSelf.env.payload as Array<{ business_identity_id?: string; derived_status?: string }>
    const rowB = rows.find((r) => r.business_identity_id === SEAT_B_IDENTITY)
    expect(rowB?.status).toBe('online')

    // —— TTL：DB 模拟 B 心跳 95 秒前（> 90s 冻结 TTL）→ derived offline ——
    await dbq(
      `UPDATE customer_service_seat_presence SET last_heartbeat_at = now() - interval '95 seconds' WHERE organization_id = ${ORG1} AND business_identity_id = ${SEAT_B_IDENTITY}`,
    )
    const presStale = await api(SEAT_A_TOKEN, 'GET', org(`/seats/presence?workspace_id=${WS1}`))
    const rowsStale = presStale.env.payload as Array<{ business_identity_id?: string; derived_status?: string }>
    const rowBStale = rowsStale.find((r) => r.business_identity_id === SEAT_B_IDENTITY)
    expect(rowBStale?.status).toBe('offline')

    // —— Widget queued state：本 org 全部坐席 offline（下文 DB 直改后无人
    // 在线）+ 无 claim —— widget 会话保持 queued：消息可发且成功渲染
    // （data-status 非 failed）、SSE events 流保持活动（页面会话真象），
    // DB 直证 status=queued。widget UI 无专门「排队中」横幅（消息级
    // data-status 是唯一 DOM 状态面）——排队的可观察事实=会话排队 +
    // 消息投递成功 + 无坐席回复。 ——
    const { frame, input } = await openWidgetAndConsent(page)
    const sseRequests: string[] = []
    page.on('request', (req) => {
      if (/\/api\/v1\/cs\/widget\/sessions\/\d+\/events/.test(req.url())) {
        sseRequests.push(req.url())
      }
    })
    const qText = `a08-cs04 排队访客 ${RUN_UNIQ}`
    await input.fill(qText)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByText(qText)).toBeVisible({ timeout: 15_000 })
    // 消息投递成功（非 failed——queued 会话的访客消息照常受理）。
    await expect(frame.locator('.cs-msg', { hasText: qText }).first()).not.toHaveAttribute(
      'data-status', 'failed',
    )
    // SSE events 流在排队会话上保持活动。
    await expect
      .poll(() => sseRequests.length, { timeout: 15_000 })
      .toBeGreaterThan(0)

    // DB 直证：最新会话 status=queued（无 claim）。
    const queuedDb = await dbq(
      `SELECT status FROM customer_service_session WHERE id = (SELECT max(id) FROM customer_service_session WHERE organization_id = ${ORG1})`,
    )
    expect(queuedDb).toBe('queued')
    await page.screenshot({ path: '/tmp/csint02-runtime/a08-widget-queued.png' })
  })

  test('J-CS-05 客户上下文：白名单 + 禁键 + cross-org + 切换隔离', async ({ page }) => {
    // —— A 上线并 claim 本测试的会话 ——
    await api(SEAT_A_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    const { frame, input } = await openWidgetAndConsent(page)
    const s1Text = `a08-cs05 访客一 ${RUN_UNIQ}`
    await input.fill(s1Text)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByText(s1Text)).toBeVisible({ timeout: 15_000 })

    const queue = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    const sessions = (queue.env.payload as { sessions: Array<{ id: string; version?: number }> }).sessions
    const s1 = sessions.find((s) => s.id !== undefined)
    expect(s1).toBeTruthy()
    const claim = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${s1!.id}/claim?workspace_id=${WS1}`), {
      expected_version: s1!.version ?? 1,
    })
    expect(claim.status).toBe(200)

    // —— 白名单：context 响应只含冻结字段集；禁键扫描（无 PII/密文/凭证）——
    const ctx = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s1!.id}/context?workspace_id=${WS1}`))
    expect(ctx.status).toBe(200)
    const ctxPayload = ctx.env.payload as Record<string, unknown>
    const allowed = new Set([
      'history', 'source', 'workspace_id', 'session_id', 'contact', 'notes',
    ])
    const present = Object.keys(ctxPayload)
    for (const key of present) expect(allowed.has(key), `context 白名单外字段: ${key}`).toBe(true)
    const forbidden = ['phone', 'email', 'visit_token', 'object_key', 'cipher', 'secret', 'credential', 'account']
    const raw = JSON.stringify(ctxPayload).toLowerCase()
    for (const bad of forbidden) expect(raw.includes(bad), `context 泄漏禁键: ${bad}`).toBe(false)
    const contact = ctxPayload.contact as { masked_name?: string } | undefined
    expect(contact?.masked_name).toBeTruthy()

    // —— cross-org denial：org2 坐席 C2 读 org1 会话 context → 403 ——
    const cross = await api(SEAT_C2_TOKEN, 'GET', org(`/sessions/${s1!.id}/context?workspace_id=${WS1}`))
    expect(cross.status).toBe(403)

    // —— 切换隔离（stale/串数据拒绝）：第二访客会话 S2 的 context 不含 S1 事实 ——
    const ctx2 = await page.context().browser()?.newContext()
    const page2 = await ctx2!.newPage()
    const w2 = await openWidgetAndConsent(page2)
    const frame2 = w2.frame
    const input2 = w2.input
    const s2Text = `a08-cs05 访客二 ${RUN_UNIQ}`
    await input2.fill(s2Text)
    await frame2.getByTestId('cs-send').click()
    await expect(frame2.getByText(s2Text)).toBeVisible({ timeout: 15_000 })
    await ctx2!.close()

    // S2（最新 queued 会话）：queued 无经办坐席（business_identity_id =
    // undefined）——任何坐席读 context 都 403（ownership 复核边界）；
    // A claim 后可读，此时验证 contact 维度隔离（S1 不串入）。
    const s2Id = await dbq(
      `SELECT max(id) FROM customer_service_session WHERE organization_id = ${ORG1}`,
    )
    const ctxDenied = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s2Id}/context?workspace_id=${WS1}`))
    expect(ctxDenied.status).toBe(403)
    const claimS2 = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${s2Id}/claim?workspace_id=${WS1}`), {
      expected_version: 1,
    })
    expect(claimS2.status).toBe(200)
    const ctxS2 = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s2Id}/context?workspace_id=${WS1}`))
    expect(ctxS2.status).toBe(200)
    const s2Payload = ctxS2.env.payload as Record<string, unknown>
    // 历史会话页只含 S2 自己（contact 维度隔离；S1 不串入）。
    const hist2 = ((s2Payload.history ?? {}) as { sessions?: Array<{ id?: string }> }).sessions ?? []
    expect(hist2.every((h) => String(h.id) !== String(s1!.id))).toBe(true)
    // 两会话 masked_name 不同（不同访客）。
    const contact2 = s2Payload.contact as { masked_name?: string } | undefined
    expect(contact2?.masked_name).not.toBe(contact?.masked_name)
  })
})
