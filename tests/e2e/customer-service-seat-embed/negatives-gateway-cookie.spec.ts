/**
 * SC-E2E — 紧凑负例 spec C：会话 Cookie 负例走**网关面**（round-1 F11 登记项；
 * R2-8，主线程补位）。
 *
 * ⛔ EXECUTE-GATED：`SC153_E2E_EXECUTE=1` 才执行（journey 同款文件级门；
 * A0 串行执行，套件间禁止并行）。
 *
 * 与 journey A03 的分工（F11 的存在意义）：A03 的 Admin-Cookie 重放负例因
 * ENVIRONMENT（node APIRequestContext 无法过 cs.test:18443 自签 TLS + 系统代理
 * fake-ip，ledger DEF-SC153-11/e657efc）直打了 BE_MAIN 上游；本 spec 把同一
 * oracle 搬到**真实网关拓扑**上——nginx 终结 TLS、按 Host 路由、代理转发，
 * 重放拒绝必须在网关→上游整链上成立才算数。**不设 BE_MAIN 回退**（回退即空洞）。
 *
 * 执行前提（已验证解法，2026-09-29）：cs.test 被系统代理 fake-ip 劫持
 * （dscacheutil → 198.18.0.61），node 侧不可解析——执行时设
 * SC153_E2E_GATEWAY_BASE=https://127.0.0.1:18443 直连同一拓扑（cs.test 块
 * 是 18443 端口声明序首个 vhost = default server，/seat/<id> curl 实证 200；
 * 浏览器侧不受影响，仍走 launch 级 host-resolver-rules）。不改 /etc/hosts
 * （套件纪律）；不可达时按 ENVIRONMENT 如实报，不降级 oracle。
 *
 * 断言依据：journey A03 同款——admin.test 平台 Cookie（adm_*）对 seat/widget
 * API 均非凭证（服务端鉴权 401/403；widget 面凭证只认 x-cs-visit-token 专用头）；
 * Cookie 域作用域事实：admin.test 的 Cookie 不进 cs.test 域。
 */
import { expect, test as base, type Browser } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { ADMIN_ORIGIN, CONSOLE_PUBLIC_ID, CS_ORIGIN, EXECUTE_ENABLED, ORG_ID, WORKSPACE_ID } from './helpers/env'
import { adminLogin } from './helpers/admin-ui'

/**
 * 网关面 API 夹具：request context 直连网关（自签 TLS 经 ignoreHTTPSErrors
 * 放行）。SC153_E2E_GATEWAY_BASE 可把基址切到 https://127.0.0.1:18443——
 * cs.test 块是该端口声明序首个 vhost（= default server，执行期 curl 实证
 * /seat/<id> 200），SNI 缺失时落同一拓扑，Host 头不参与块选择。**不回退
 * BE_MAIN**（回退即空洞）。
 */
const GATEWAY_BASE = process.env.SC153_E2E_GATEWAY_BASE ?? CS_ORIGIN

const test = base.extend<{ gateway: APIRequestContext }>({
  gateway: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: GATEWAY_BASE,
      ignoreHTTPSErrors: true,
    })
    // Playwright fixture callback parameter, not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(ctx)
    await ctx.dispose()
  },
})

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

interface Envelope {
  code: number
  msg?: string
  payload?: Record<string, unknown>
}

/** Admin 登录并取 adm_* Cookie 串（A03 同款前置；browser 解析走 launch 级
 * host-resolver-rules，与 node 侧 request 的 DNS 前提无关）。 */
async function adminCookieHeader(browser: Browser): Promise<{ cookieHeader: string; browser: Browser }> {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await adminLogin(page)
  const admCookies = await ctx.cookies(`${ADMIN_ORIGIN}/`)
  expect(admCookies.some((c) => c.name.startsWith('adm_')), 'admin 登录后应有平台 Cookie（前置自检）').toBe(true)
  return { cookieHeader: admCookies.map((c) => `${c.name}=${c.value}`).join('; '), browser }
}

// ---------------------------------------------------------------------------
// 网关面负例（真实 nginx 拓扑整链）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例C：会话 Cookie 走网关面', () => {
  test('G1 网关面 sanity：seat frame HTML 经网关 200（证明负例跑在真实拓扑上）', async ({
    gateway,
  }) => {
    const resp = await gateway.get(`/seat/${CONSOLE_PUBLIC_ID}`)
    expect(resp.status(), '网关 → seat frame 整链必须 200（console active）').toBe(200)
    const body = await resp.text()
    expect(body, '返回的是 frame HTML 而非 JSON 错误').toContain('<!DOCTYPE html')
  })

  test('G2 Admin Cookie 显式重放 seat API（走网关）→ 401/403；浏览器域作用域零外溢', async ({
    browser,
    gateway,
  }) => {
    const { cookieHeader } = await adminCookieHeader(browser)

    // 域作用域事实：admin.test 的 Cookie 不进 cs.test 域（浏览器不自动带）。
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    await adminLogin(page)
    expect(
      (await ctx.cookies(`${CS_ORIGIN}/`)).filter((c) => c.name.startsWith('adm_')),
      'cs.test 域必须零 adm_* cookie',
    ).toEqual([])
    await ctx.close()

    // 最坏情况重放：显式把 adm Cookie 附到 seat API（网关面整链）→ 服务端拒绝。
    const replay = await gateway.get(
      `/api/v1/cs/organizations/${ORG_ID}/seats/me/heartbeat?workspace_id=${WORKSPACE_ID}`,
      { headers: { cookie: cookieHeader } },
    )
    expect([401, 403], `Admin Cookie 重放 seat API 必须 401/403，got ${replay.status()}`).toContain(
      replay.status(),
    )
  })

  test('G3 Admin Cookie 显式附到 widget 会话面 → 401 credential_missing（Cookie 不顶替 visit token）', async ({
    browser,
    gateway,
  }) => {
    const { cookieHeader } = await adminCookieHeader(browser)

    // bootstrap 是零凭证面（S3 合同）——经网关取真实 installation_id。
    const boot = await gateway.post('/api/v1/cs/widget/bootstrap', {
      headers: { origin: 'https://shop.test:18443' },
      data: { public_widget_id: '702000000000000101', subject_id: `sc153-specC-${Date.now()}` },
    })
    expect(boot.status(), 'bootstrap 经网关必须 200').toBe(200)
    const bootBody = (await boot.json()) as Envelope
    const installationId = String(bootBody.payload?.installation_id ?? '')
    expect(installationId).not.toBe('')

    // 带平台 Cookie、不带 visit token → 凭证缺失 401（Cookie 永不顶替专用头）。
    const resp = await gateway.post('/api/v1/cs/widget/sessions', {
      headers: { cookie: cookieHeader },
      data: { installation_id: installationId },
    })
    expect(resp.status(), 'widget 面 Cookie 重放必须 401').toBe(401)
    const body = (await resp.json()) as Envelope
    expect(body.msg, '拒绝语义必须是凭证缺失（而非参数/服务器错误）').toBe('credential_missing')
  })
})
