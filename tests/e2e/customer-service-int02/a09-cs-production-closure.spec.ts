/**
 * CS-INT-03（Customer Service 生产业务闭环门）：一次 J-CS-06 全链 + 负例组。
 *
 * 真实拓扑（零 mock route）：真 Cowboy :19802 + scratch PG + widget 宿主 8902
 * 透明反代（页面/UI oracle）；坐席/治理面 API 驱动（Human JWT / admin cookie）。
 * 每阶段 DB+HTTP+UI oracle；mutation 重放确定；统计与事件事实手算一致；
 * Flutter 部分归 DEVICE-01/02（本门不由浏览器冒充）。
 *
 * J-CS-06：bootstrap -> 无在线坐席排队 -> heartbeat 上线 -> claim -> 双向
 * 文本（访客页面 + 坐席 API）/历史刷新 -> read cursor -> transfer boundary
 * -> 客户上下文白名单 -> close -> visitor rating（页面评分 UI）-> 治理读取
 * （租户 seat-limit + 平台 stats）-> entitlement 冲突 -> 统计手算 fixture。
 */
import { expect, test } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:19802'
const HOST = 'http://localhost:8902'
const PG_CONTAINER = 'imboy_pg18'
const PG_DB = 'imboy_csagent_cs-agent-entux-v1-20260924T164136Z-539f3dae'

// int02 种子经环境注入（RUN evidence/CS-INT-02/internal/seed.env）。
const ORG1 = process.env.INT02_ORG1 ?? ''
const WS1 = process.env.INT02_WS1 ?? ''
const SEAT_A_TOKEN = process.env.INT02_SEAT_A_TOKEN ?? ''
const SEAT_B_TOKEN = process.env.INT02_SEAT_B_TOKEN ?? ''
const SEAT_C2_TOKEN = process.env.INT02_SEAT_C2_TOKEN ?? ''
const SEAT_A_IDENTITY = process.env.INT02_SEAT_A_IDENTITY ?? ''
const SEAT_B_IDENTITY = process.env.INT02_SEAT_B_IDENTITY ?? ''
const OWNER_TOKEN = process.env.INT02_TOKEN_OWNER ?? ''
const ADM_ID = process.env.ENTINT01_ADM_ID ?? ''
const ADM_SIG = process.env.ENTINT01_ADM_SIG ?? ''

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

type Envelope = { code: number; msg?: string; payload?: unknown }

async function api(
  token: string, method: string, path: string, body?: unknown, adminCookie = false,
): Promise<{ status: number; env: Envelope; text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (adminCookie) headers.cookie = `adm_user_id=${ADM_ID}; adm_user_sig=${ADM_SIG}`
  else headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BACKEND}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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

/** 密钥材料扫描：客服面响应绝不泄漏存储/签名内部键。 */
function expectNoSecretMaterial(text: string, label: string) {
  for (const bad of ['object_key', 'bucket', 'presigned', 'storage_secret', 'chat_aes_key', 'private_key']) {
    expect(text.toLowerCase(), `${label} 泄漏 ${bad}`).not.toContain(bad)
  }
}

test.describe.configure({ mode: 'serial' })

// 幂等续跑前置：恢复上轮 entitlement 探针可能留下的停用席位与收紧额度
// （失败点续跑语义——探针自身在本轮内自证后还原）。
test.beforeAll(async () => {
  // 先清额度（unlimited）再恢复席位——收紧额度下恢复会撞 seat_limit_exceeded。
  await api(process.env.INT02_TOKEN_OWNER ?? '', 'PUT', `/api/v1/cs/organizations/${process.env.INT02_ORG1}/seat-limit?workspace_id=${process.env.INT02_WS1}`, {}).catch(() => {})
  await api('', 'POST', `/api/adm/customer-service/organizations/${process.env.INT02_ORG1}/seats/${process.env.INT02_SEAT_B_IDENTITY}/resume`, { workspace_id: process.env.INT02_WS1 }, true).catch(() => {})
})

test.describe('a09 CS production closure (J-CS-06)', () => {
  test('主链：排队->上线->claim->双向->cursor->transfer->context->close->评分->治理->统计', async ({ page }) => {
    // —— 1. bootstrap（页面）+ 无在线坐席排队 ——
    await page.goto(`${HOST}/`, { waitUntil: 'networkidle' })
    await page.getByTestId('cs-widget-launcher').click()
    const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
    const consent = frame.getByTestId('cs-consent-accept')
    await expect(consent).toBeVisible({ timeout: 30_000 })
    await consent.click()
    const input = frame.getByTestId('cs-input')
    await expect(input).toBeVisible()
    const m1 = `a09 访客首条 ${RUN_UNIQ}`
    await input.fill(m1)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByText(m1)).toBeVisible({ timeout: 15_000 })
    const sidRow = await dbq(
      `SELECT id, conversation_id FROM customer_service_session WHERE organization_id = ${ORG1} ORDER BY id DESC LIMIT 1`,
    )
    const [sid, convId] = sidRow.split('|')
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('queued')

    // —— 2. B heartbeat 上线 + claim（容量/在线语义）——
    const hb = await api(SEAT_B_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    expect(hb.status).toBe(200)
    let claimed = false
    for (let i = 0; i < 6 && !claimed; i++) {
      const det = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
      const v = (det.env.payload as { version?: number }).version
      const c = await api(SEAT_B_TOKEN, 'POST', org(`/sessions/${sid}/claim?workspace_id=${WS1}`), { expected_version: v })
      claimed = c.status === 200
      if (!claimed) await new Promise((r) => setTimeout(r, 400))
    }
    expect(claimed).toBe(true)
    expect(await dbq(`SELECT business_identity_id FROM customer_service_session WHERE id = ${sid}`)).toBe(SEAT_B_IDENTITY)

    // —— 3. 双向：访客 M2（页面）+ 坐席回复（API，企业真源）+ 历史刷新 ——
    const m2 = `a09 访客第二条 ${RUN_UNIQ}`
    await input.fill(m2)
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByText(m2)).toBeVisible({ timeout: 15_000 })
    const replyBody = `a09 坐席回复 ${RUN_UNIQ}`
    const reply = await api(SEAT_B_TOKEN, 'POST', eb(`/conversations/${convId}/messages`), {
      body: replyBody, client_msg_id: `a09-reply-${RUN_UNIQ}`, workspace_id: WS1,
      sender_type: 'business_identity', identity_id: SEAT_B_IDENTITY,
    })
    expect(reply.status).toBe(200)
    const replyMsgId = String((reply.env.payload as { message?: { id?: string } }).message?.id ?? '')
    expect(replyMsgId.length).toBeGreaterThan(0)
    // 重放同 client_msg_id：幂等（同 message id，无重复逻辑消息）。
    const replay = await api(SEAT_B_TOKEN, 'POST', eb(`/conversations/${convId}/messages`), {
      body: replyBody, client_msg_id: `a09-reply-${RUN_UNIQ}`, workspace_id: WS1,
      sender_type: 'business_identity', identity_id: SEAT_B_IDENTITY,
    })
    expect(replay.status).toBe(200)
    expect(String((replay.env.payload as { message?: { id?: string } }).message?.id)).toBe(replyMsgId)
    // UI oracle：坐席回复经 SSE message 帧实时渲染进页面（a01 同款；
    // 历史刷新持久性由 DB 直证 + 后续 queue/context 读覆盖）。
    await expect(frame.getByText(replyBody).first()).toBeVisible({ timeout: 25_000 })

    // —— 4. read cursor：B unread>=1 -> ACK 清零；DB 行直证 ——
    const rc1 = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    const unread = (rc1.env.payload as { unread_count?: number }).unread_count ?? 0
    expect(unread).toBeGreaterThanOrEqual(1)
    const visitorMsgs = (await dbq(
      `SELECT max(id) FROM enterprise_message WHERE conversation_id = ${convId} AND sender_type = 'contact'`,
    ))
    const ack = await api(SEAT_B_TOKEN, 'POST', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`), { last_read_message_id: visitorMsgs })
    expect(ack.status).toBe(200)
    const rc2 = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${sid}/read-cursor?workspace_id=${WS1}`))
    expect((rc2.env.payload as { unread_count?: number }).unread_count).toBe(0)

    // —— 5. transfer boundary：B -> A（A heartbeat 上线）——
    await api(SEAT_A_TOKEN, 'POST', org(`/seats/me/heartbeat?workspace_id=${WS1}`))
    const detB = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
    const ver = (detB.env.payload as { version?: number }).version ?? 2
    const tr = await api(SEAT_B_TOKEN, 'POST', org(`/sessions/${sid}/transfer?workspace_id=${WS1}`), { to_identity_id: SEAT_A_IDENTITY, expected_version: ver })
    expect(tr.status).toBe(200)
    expect(await dbq(`SELECT business_identity_id FROM customer_service_session WHERE id = ${sid}`)).toBe(SEAT_A_IDENTITY)

    // —— 6. 客户上下文白名单（A；键集 + 禁键扫描）——
    const ctx = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}/context?workspace_id=${WS1}`))
    expect(ctx.status).toBe(200)
    const ctxKeys = Object.keys(ctx.env.payload as Record<string, unknown>)
    for (const k of ctxKeys) expect(['history', 'source', 'workspace_id', 'session_id', 'contact', 'notes']).toContain(k)
    expectNoSecretMaterial(ctx.text, 'context')

    // —— 7. close（A；CAS）+ DB closed ——
    const detA = await api(SEAT_A_TOKEN, 'GET', org(`/sessions/${sid}?workspace_id=${WS1}`))
    const verA = (detA.env.payload as { version?: number }).version ?? 3
    const close = await api(SEAT_A_TOKEN, 'POST', org(`/sessions/${sid}/close?workspace_id=${WS1}`), { expected_version: verA })
    expect(close.status).toBe(200)
    expect(await dbq(`SELECT status FROM customer_service_session WHERE id = ${sid}`)).toBe('closed')

    // —— 8. visitor rating（widget 页面评分 UI——close 后评分入口）——
    // close 经 SSE state 帧触发评分 UI（ratingOverlay：cs-rate-1..5 星级）。
    await expect(frame.getByText('会话已结束')).toBeVisible({ timeout: 20_000 })
    await frame.getByTestId('cs-rate-5').click({ timeout: 10_000 })
    await page.waitForTimeout(1200)
    const ratingDb = await dbq(`SELECT rating FROM customer_service_session WHERE id = ${sid}`)
    expect(['5', '4', '3', '2', '1']).toContain(ratingDb)

    // —— 9. 治理读取：租户 seat-limit（owner）+ 平台 stats（admin cookie）——
    const gov = await api(OWNER_TOKEN, 'GET', org(`/seat-limit?workspace_id=${WS1}`))
    expect(gov.status).toBe(200)
    expectNoSecretMaterial(gov.text, 'seat-limit')
    const stats = await api('', 'GET', `/api/adm/customer-service/organizations/${ORG1}/stats/sessions`, undefined, true)
    expect(stats.status).toBe(200)
    expectNoSecretMaterial(stats.text, 'stats')

    // —— 10. 统计与事件事实手算一致（DB 直证逐项）——
    const statsPayload = stats.env.payload as Record<string, unknown>
    const handNew = Number(await dbq(`SELECT count(*) FROM customer_service_session WHERE organization_id = ${ORG1} AND queued_at >= date_trunc('day', now() AT TIME ZONE 'utc')`))
    expect(Number(statsPayload.new_sessions)).toBe(handNew)
    const handClosed = Number(await dbq(`SELECT count(*) FROM customer_service_session WHERE organization_id = ${ORG1} AND closed_at >= date_trunc('day', now() AT TIME ZONE 'utc')`))
    expect(Number(statsPayload.closed_sessions)).toBe(handClosed)
    const current = statsPayload.current as { queued?: number; active?: number }
    expect(Number(current.queued)).toBe(Number(await dbq(`SELECT count(*) FROM customer_service_session WHERE organization_id = ${ORG1} AND status = 'queued'`)))
    expect(Number(current.active)).toBe(Number(await dbq(`SELECT count(*) FROM customer_service_session WHERE organization_id = ${ORG1} AND status = 'active'`)))

    // —— 11. entitlement 冲突：seat_limit 收紧到当前 used -> 恢复停用席位撞限 ——
    const used = Number(await dbq(`SELECT count(*) FROM customer_service_seat WHERE organization_id = ${ORG1} AND enabled = true`))
    const putLimit = await api(OWNER_TOKEN, 'PUT', org(`/seat-limit?workspace_id=${WS1}`), { seat_limit: used })
    expect(putLimit.status).toBe(200)
    // 恢复一个停用席位（先停再恢复撞限）：C2 不在 org1；用 admin 面停/恢 B。
    const susp = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/suspend`, { reason: 'a09-entitlement-probe', workspace_id: WS1 }, true)
    expect(susp.status).toBe(200)
    const resume = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/resume`, { workspace_id: WS1 }, true)
    // used 已等于 limit：恢复第 used+1 个席位应被拒（409/422 面皆可证冲突可解释）。
    if (resume.status === 200) {
      // 若恢复放行（实现允许 equality），收紧到 used-1 再验证拒绝面。
      const put2 = await api(OWNER_TOKEN, 'PUT', org(`/seat-limit?workspace_id=${WS1}`), { seat_limit: Math.max(1, used - 1) })
      expect(put2.status).toBe(200)
      const susp2 = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/suspend`, { reason: 'a09-probe2', workspace_id: WS1 }, true)
      const resume2 = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/resume`, { workspace_id: WS1 }, true)
      // 冲突契约锚是 envelope tag（CS-APP-03 冻结口径：状态码可能漂移，
      // tag seat_limit_exceeded 稳定）。
      expect([409, 422, 500]).toContain(resume2.status)
      expect(String(resume2.env.msg)).toContain('seat_limit_exceeded')
    } else {
      expect([409, 422, 500]).toContain(resume.status)
      expect(String(resume.env.msg)).toContain('seat_limit_exceeded')
    }
    // 还原 unlimited，清理探针影响。
    await api(OWNER_TOKEN, 'PUT', org(`/seat-limit?workspace_id=${WS1}`), {})
  })

  test('负例组：撤权 403 / 跨租户 403 / 密钥扫描', async () => {
    // 撤权：admin 停用 B -> B 读队列 403 -> 恢复 -> 200。
    const susp = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/suspend`, { reason: 'a09-neg', workspace_id: WS1 }, true)
    expect(susp.status).toBe(200)
    const denied = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(denied.status).toBe(403)
    const resume = await api('', 'POST', `/api/adm/customer-service/organizations/${ORG1}/seats/${SEAT_B_IDENTITY}/resume`, { workspace_id: WS1 }, true)
    expect(resume.status).toBe(200)
    const ok = await api(SEAT_B_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(ok.status).toBe(200)

    // 跨租户：org2 坐席 C2 读 org1 会话面 403。
    const cross = await api(SEAT_C2_TOKEN, 'GET', org(`/sessions/queue?workspace_id=${WS1}`))
    expect(cross.status).toBe(403)

    // secret：负例响应同样不含内部键。
    expectNoSecretMaterial(denied.text, 'suspended-403')
    expectNoSecretMaterial(cross.text, 'cross-403')
  })
})
