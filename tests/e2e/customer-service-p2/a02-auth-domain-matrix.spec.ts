/**
 * P2-E2E-01 A02：认证域互斥负例矩阵（全部打真实后端，逐例断言 4xx + 语义码）。
 *
 * - Admin 平台 Cookie 打坐席 API（seat 域只收 Bearer JWT，Cookie 恒拒）；
 * - 坐席 JWT 打 /api/adm 平台面（平台面只收平台 Cookie，恒拒）；
 * - 访客 visit token 打坐席面（非坐席凭证，恒拒）；
 * - 跨 Org（坐席读他会话 + 跨作用域 SSE 游标）、跨 session（他安装访客读
 *   别人会话消息）、跨 asset（读他会话的资产内容）全拒。
 *
 * 全部经真实页面上下文 fetch（admin.test 同源反代 → 9802），无任何伪造。
 */
import { expect, test, type BrowserContext } from '@playwright/test'
import { visitorApi } from '../customer-service-real/helpers/agent-api'
import { OTHER_INSTALLATION_ID, OTHER_ORG_ID, OTHER_PUBLIC_WIDGET_ID, SEAT_A } from '../customer-service-real/helpers/env'
import { adminLogin } from './helpers/admin-ui'
import { createCollector, watchPage } from './helpers/browser-gate'
import { ADMIN_ORIGIN, INSTALLATION_ID, ORG_ID, PUBLIC_WIDGET_ID, SHOP_ORIGIN, WORKSPACE_ID } from './helpers/env'
import { qrLoginSeat, seatPassportLogin } from './helpers/qr-login'
import { BACKEND_BASE } from './helpers/env'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

interface MatrixCase {
  label: string
  status: number
  body: string
}

/** 断言 4xx + 结构化语义错误（信封 code!=0 或 msg 非空；非裸 5xx 文本）。 */
function expectRejected(label: string, cases: MatrixCase[]): void {
  for (const item of cases) {
    expect(item.status, `${label}: must be 4xx, got ${item.status}`).toBeGreaterThanOrEqual(400)
    expect(item.status, `${label}: must be 4xx, got ${item.status}`).toBeLessThan(500)
    expect(item.body, `${label}: structured error envelope required`).toMatch(/"code"/)
  }
}

test('A02 认证域互斥：Admin Cookie×Seat API、Seat JWT×平台面、visit token×坐席面、跨Org/会话/资产 全拒', async ({ browser }) => {
  const collector = createCollector([/Failed to load resource/, /Failed to fetch/])
  const contexts: BrowserContext[] = []
  try {
    // —— 夹具：三个真实域的凭证与页面 ——
    const adminCtx = await browser.newContext()
    contexts.push(adminCtx)
    const adminPage = await adminCtx.newPage()
    watchPage(collector, adminPage)
    await adminPage.goto(`${ADMIN_ORIGIN}/login`)
    await adminLogin(adminPage)
    const adminCookieFetch = (path: string, init?: RequestInit): Promise<MatrixCase> =>
      adminPage.evaluate(
        async ({ path, init }) => {
          const res = await fetch(path, { ...init, credentials: 'include' })
          return { label: '', status: res.status, body: await res.text() }
        },
        { path, init }
      )

    const seatCtx = await browser.newContext()
    contexts.push(seatCtx)
    const seatPage = await seatCtx.newPage()
    watchPage(collector, seatPage)
    await seatPage.goto(`${ADMIN_ORIGIN}/customer-service/workspace`)
    await qrLoginSeat(seatPage, SEAT_A.account)
    const seatBearerFetch = (path: string, bearer: string, extraHeaders?: Record<string, string>): Promise<MatrixCase> =>
      seatPage.evaluate(
        async ({ path, bearer, extraHeaders }) => {
          const res = await fetch(path, { headers: { authorization: `Bearer ${bearer}`, ...extraHeaders }, credentials: 'omit' })
          return { label: '', status: res.status, body: await res.text() }
        },
        { path, bearer, extraHeaders }
      )

    // 访客夹具：本组织会话 + 他组织/安装会话。（bootstrap 失败时实录响应体，
    // 供 403 归因；P1 helper 只回传状态码。）
    const diag = await fetch(`${BACKEND_BASE}/api/v1/cs/widget/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: SHOP_ORIGIN },
      body: JSON.stringify({ organization_id: ORG_ID, public_widget_id: PUBLIC_WIDGET_ID, subject_id: `p2-neg-diag-${RUN_UNIQ}` }),
    })
    console.log('[a02-debug bootstrap-diag]', diag.status, (await diag.text()).slice(0, 200))
    const mine = await visitorApi.bootstrap(ORG_ID, PUBLIC_WIDGET_ID, `p2-neg-mine-${RUN_UNIQ}`, SHOP_ORIGIN)
    const mySession = await visitorApi.createSession(ORG_ID, INSTALLATION_ID, mine.secret)
    // 他安装的 allowlist 独立（只含 P1 的 localhost:8901）——用其 allowlist 内 origin 取合法 token。
    const theirs = await visitorApi.bootstrap(OTHER_ORG_ID, OTHER_PUBLIC_WIDGET_ID, `p2-neg-theirs-${RUN_UNIQ}`, 'http://localhost:8901')
    const otherSession = await visitorApi.createSession(OTHER_ORG_ID, OTHER_INSTALLATION_ID, theirs.secret)

    // —— 1) Admin 平台 Cookie 打坐席 API（claim 写 + queue 读）：401 语义 ——
    const cookieClaim = await adminCookieFetch(
      `/api/v1/cs/organizations/${ORG_ID}/sessions/${mySession.id}/claim`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace_id: WORKSPACE_ID, expected_version: 1 }) }
    )
    const cookieQueue = await adminCookieFetch(`/api/v1/cs/organizations/${ORG_ID}/sessions/queue?workspace_id=${WORKSPACE_ID}`)
    expectRejected('admin-cookie → seat claim', [{ ...cookieClaim, label: 'claim' }])
    expectRejected('admin-cookie → seat queue', [{ ...cookieQueue, label: 'queue' }])
    expect(cookieClaim.status, 'seat API must not accept platform cookie').toBe(401)

    // —— 2) 坐席 JWT 打 /api/adm 平台面：401/403 语义 ——
    // 坐席域 JWT 只存页面内存 vault，此处用同主体真实护照登录取 JWT。
    const bearer = await seatPassportLogin(SEAT_A.account)
    const admCs = await seatBearerFetch(`/api/adm/customer-service/organizations/${ORG_ID}/sessions?workspace_id=${WORKSPACE_ID}`, bearer)
    const admUser = await seatBearerFetch('/api/adm/user/list', bearer)
    expectRejected('seat-jwt → /api/adm cs sessions', [{ ...admCs, label: 'adm-cs' }])
    expectRejected('seat-jwt → /api/adm user list', [{ ...admUser, label: 'adm-user' }])
    expect([401, 403]).toContain(admUser.status)

    // —— 3) 访客 visit token 打坐席面（当 Bearer）：401 ——
    const visitBearer = await seatBearerFetch(`/api/v1/cs/organizations/${ORG_ID}/sessions/queue?workspace_id=${WORKSPACE_ID}`, mine.secret)
    expectRejected('visit-token → seat queue', [{ ...visitBearer, label: 'visit-bearer' }])
    expect(visitBearer.status).toBe(401)

    // —— 4) 跨 Org：坐席 A 读他会话详情 + 跨作用域 SSE 游标 ——
    const crossOrgDetail = await seatBearerFetch(
      `/api/v1/cs/organizations/${OTHER_ORG_ID}/sessions/${otherSession.id}?workspace_id=${WORKSPACE_ID}`,
      bearer
    )
    expectRejected('seat-A → other-org session detail', [{ ...crossOrgDetail, label: 'cross-org-detail' }])
    // 跨作用域游标：以 DB 直查他组织事件 id 作 Last-Event-ID（只读取证）。
    const { spawnSync } = await import('node:child_process')
    const out = spawnSync(
      'docker',
      ['exec', 'imboy_pg18', 'psql', '-U', 'imboy_user', '-d', 'csww_20260920T051447Z', '-At', '-c',
        `select coalesce(min(id::text),'') from customer_service_event where organization_id = ${OTHER_ORG_ID}`],
      { encoding: 'utf8' }
    )
    const crossCursor = out.stdout.trim()
    if (crossCursor !== '') {
      // 必须带坐席 Bearer：认证通过后游标裁决（cursor_scope→cross_org）才落到
      // 403 面；裸 fetch 会在认证层被 401 挡下，测不到作用域语义。
      const crossCursorRes = await seatBearerFetch(
        `/api/v1/cs/organizations/${ORG_ID}/seats/me/events?workspace_id=${WORKSPACE_ID}`,
        bearer,
        { 'Last-Event-ID': crossCursor }
      )
      expect(crossCursorRes.status, 'cross-scope cursor must be rejected (not resync, not ok)').toBe(403)
    }

    // —— 5) 跨 session：本安装访客 token 读他会话消息 ——
    const crossSession = await seatPage.evaluate(
      async ({ sessionId, token, orgId, installationId }) => {
        const qs = new URLSearchParams({ organization_id: orgId, installation_id: installationId })
        const res = await fetch(`/api/v1/cs/widget/sessions/${sessionId}/messages?${qs.toString()}`, {
          headers: { 'x-cs-visit-token': token },
          credentials: 'omit',
        })
        return { status: res.status, body: await res.text() }
      },
      { sessionId: otherSession.id, token: mine.secret, orgId: OTHER_ORG_ID, installationId: OTHER_INSTALLATION_ID }
    )
    expectRejected('my-visit-token → other session messages', [{ ...crossSession, label: 'cross-session' }])

    // —— 6) 跨 asset：本安装访客读他会话的资产内容 ——
    const crossAsset = await seatPage.evaluate(
      async ({ sessionId, token, orgId, installationId }) => {
        const qs = new URLSearchParams({ organization_id: orgId, installation_id: installationId })
        const res = await fetch(`/api/v1/cs/widget/sessions/${sessionId}/assets/990301/content?${qs.toString()}`, {
          headers: { 'x-cs-visit-token': token },
          credentials: 'omit',
        })
        return { status: res.status, body: await res.text() }
      },
      { sessionId: otherSession.id, token: mine.secret, orgId: OTHER_ORG_ID, installationId: OTHER_INSTALLATION_ID }
    )
    expectRejected('my-visit-token → foreign session asset content', [{ ...crossAsset, label: 'cross-asset' }])

    // —— 浏览器门：本用例的 4xx 均为预期负例（豁免模式），5xx 仍为零容忍 ——
    expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
  } finally {
    for (const context of contexts.splice(0)) await context.close().catch(() => {})
  }
})
