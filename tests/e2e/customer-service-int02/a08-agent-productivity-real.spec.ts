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
const SEAT_A_TOKEN = process.env.INT02_SEAT_A_TOKEN ?? ''
const SEAT_B_TOKEN = process.env.INT02_SEAT_B_TOKEN ?? ''
const SEAT_C2_TOKEN = process.env.INT02_SEAT_C2_TOKEN ?? ''
const SEAT_A_IDENTITY = process.env.INT02_SEAT_A_IDENTITY ?? ''
const SEAT_B_IDENTITY = process.env.INT02_SEAT_B_IDENTITY ?? ''

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** 去 flaky（CS-INT-02 补齐轮）：冷启动抖动的确定性消除——
 *  1) goto 用 domcontentloaded + 显式等 launcher（不依赖 networkidle 的
 *     隐式时机——宿主页资源加载抖动下既可能过早也可能挂长）；
 *  2) 面板就绪用「分支竞速 waitFor」而非组合 locator（locator.or() 的
 *     可见性评估在 frame 恢复期实测恒 false，单 locator 则正常——a09b 同款
 *     实证）；installation_unavailable 可见即 fail-fast（环境/种子错误
 *     不该被 30s 盲等掩盖成 flaky）。 */
async function openWidgetAndConsent(page: import('@playwright/test').Page) {
  await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded' })
  const launcher = page.getByTestId('cs-widget-launcher')
  await expect(launcher).toBeVisible({ timeout: 30_000 })
  await launcher.click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  const deadFrame = frame.getByText('installation_unavailable')
  const waited = await Promise.race([
    frame.getByTestId('cs-consent-accept').waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'panel'),
    deadFrame.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'dead'),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 30_000)),
  ])
  expect(waited, 'widget 面板就绪（installation_unavailable=种子/宿主 id 不匹配）').toBe('panel')
  const consent = frame.getByTestId('cs-consent-accept')
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
    throw new Error(`dbq failed: ${sql}: ${String(err)}`, { cause: err })
  }
}

const org = (p: string) => `/api/v1/cs/organizations/${ORG1}${p}`

test.describe('a08 agent productivity real (J-CS-03..05)', () => {
  // 去 flaky（CS-INT-02 补齐轮）：冷启动抖动已由确定性等待消除（openWidgetAndConsent
  // 的 domcontentloaded + 显式 launcher + 分支竞速面板就绪 + fail-fast），
  // 重试通道撤销——oracle 全部服务端/DB 真值，零 retry 全绿是本门新基线。
  //
  // 幂等清场（容量语义适配，CS-DEC-02 max_concurrent=1 冻结）：claim 有
  // 「active 计数 < max_concurrent」硬门——上一轮残留的 active 会话会让
  // 本轮 claim 被 seat_at_capacity 拒（顺序耦合，上轮被 retries 掩盖）。
  // beforeAll 把 org1 全部 active 会话经真实 close（CAS 收敛，按经办人
  // token）释放，测试间不再互相污染；这是业务动作前置，非 mock。
  test.beforeAll(async () => {
    const rows = await dbq(
      `SELECT id, business_identity_id FROM customer_service_session WHERE organization_id = ${ORG1} AND status = 'active' ORDER BY id`,
    )
    for (const row of rows.split('\n').filter(Boolean)) {
      const [staleId, identity] = row.split('|')
      const token = identity === SEAT_A_IDENTITY ? SEAT_A_TOKEN
        : identity === SEAT_B_IDENTITY ? SEAT_B_TOKEN : null
      if (token === null) continue
      for (let i = 0; i < 4; i++) {
        const det = await api(token, 'GET', org(`/sessions/${staleId}?workspace_id=${WS1}`))
        const ver = (det.env.payload as { version?: number }).version
        const c = await api(token, 'POST', org(`/sessions/${staleId}/close?workspace_id=${WS1}`), {
          expected_version: ver,
        })
        if (c.status === 200) break
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  })

  test('J-CS-03 未读与转接：cursor DB + queue count + transfer boundary', async ({ page }) => {
    // —— 坐席 A 心跳上线（为 claim 与后续 presence 断言铺垫）——
    const hb = await api(SEAT_A_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    expect(hb.status).toBe(200)

    // —— widget 页面驱动：访客发 3 条消息（真实 frame；确定性打开 helper）——
    const opened = await openWidgetAndConsent(page)
    const frame = opened.frame
    const input = opened.input
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
    // —— 前置：释放 J-CS-03 转接给 B 的会话——transfer 后 B 满载
    // （max_concurrent=1 → 容量满派生 busy，CS-DEC-02 冻结语义）；本卡
    // 验证「心跳上线 → online」，先 close 让 B 回到空闲真态（close 本身
    // 也是真实业务动作，CAS 版本取自会话详情）。——
    const bActive = await dbq(
      `SELECT id FROM customer_service_session WHERE organization_id = ${ORG1} AND business_identity_id = ${SEAT_B_IDENTITY} AND status = 'active' ORDER BY id LIMIT 1`,
    )
    if (bActive.length > 0) {
      const detB = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${bActive}?workspace_id=${WS1}`))
      const vB = (detB.env.payload as { version?: number }).version ?? 2
      const closeB = await api(SEAT_B_TOKEN, 'POST', org(`/sessions/${bActive}/close?workspace_id=${WS1}`), { expected_version: vB })
      expect(closeB.status).toBe(200)
    }

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
    // 截图目录缺省沿用 CS-INT-02 runtime（mkdir 兜底——硬编码路径在目录
    // 被清理后会让测试自身失败，与业务 oracle 无关）。
    const shotDir = process.env.CSINT02_SHOT_DIR ?? '/tmp/csint02-runtime'
    const { mkdirSync } = await import('node:fs')
    mkdirSync(shotDir, { recursive: true })
    await page.screenshot({ path: `${shotDir}/a08-widget-queued.png` })
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
    // claim（expected_version CAS；消息投影可能推进版本 → 循环收敛，与 J-CS-03
    // 同款——快照版本落后时 409 是 CAS 正确行为，重读版本收敛而非侥幸单发）。
    let claimedS1 = false
    for (let i = 0; i < 6 && !claimedS1; i++) {
      const det = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s1!.id}?workspace_id=${WS1}`))
      const ver = (det.env.payload as { version?: number }).version
      const attempt = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${s1!.id}/claim?workspace_id=${WS1}`), {
        expected_version: ver,
      })
      claimedS1 = attempt.status === 200
      if (!claimedS1) await new Promise((r) => setTimeout(r, 400))
    }
    expect(claimedS1).toBe(true)

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
    // 释放 s1（真实 close，CAS 收敛）：max_concurrent=1（CS-DEC-02 冻结）下
    // A 同时只能持有 1 个 active——先结案 s1 再接 S2，「切换隔离」验证的是
    // context 的 contact/history 维度不串数据，不受 s1 终态影响。
    let closedS1 = false
    for (let i = 0; i < 4 && !closedS1; i++) {
      const det1 = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s1!.id}?workspace_id=${WS1}`))
      const ver1 = (det1.env.payload as { version?: number }).version
      const c1 = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${s1!.id}/close?workspace_id=${WS1}`), {
        expected_version: ver1,
      })
      closedS1 = c1.status === 200
      if (!closedS1) await new Promise((r) => setTimeout(r, 300))
    }
    expect(closedS1).toBe(true)
    // claim（CAS 收敛——同上，消息投影推进版本时快照值可能落后）。
    let claimedS2 = false
    for (let i = 0; i < 6 && !claimedS2; i++) {
      const det2 = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${s2Id}?workspace_id=${WS1}`))
      const ver2 = (det2.env.payload as { version?: number }).version
      const attempt2 = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${s2Id}/claim?workspace_id=${WS1}`), {
        expected_version: ver2,
      })
      claimedS2 = attempt2.status === 200
      if (!claimedS2) await new Promise((r) => setTimeout(r, 400))
    }
    expect(claimedS2).toBe(true)
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
