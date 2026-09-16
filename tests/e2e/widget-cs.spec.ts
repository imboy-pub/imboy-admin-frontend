import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * CSW-01 E2E：客服 Widget（宿主独立 HTML fixture → loader → iframe 聊天 UI）。
 *
 * ⚠️ 桩=E2E 替身声明：本 spec 的所有 `/api/v1/cs/widget/*` 响应由 page.route 按
 * 冻结合同形状（POST-V4.1 §12.4 表 1 / source-to-contract-matrix.md）桩出；
 * 真实后端联调归 CSX-01。
 *
 * 覆盖验收点：
 * - CSW-01-A01：独立 HTML 只贴一段 script → 按钮出现 → 打开 iframe；
 * - CSW-01-A02：重复 loader（两份 script）仍单实例；
 * - CSW-01-A03：iframe sandbox 最小权限 + postMessage 伪造来源被逐字校验拒绝
 *   + 键盘可达（Tab 聚焦 + Enter 打开）；
 * - CSW-01-A04：网络请求与页面无 shop secret；data-shop-key 反例被 loader 忽略并 warn；
 * - CSW-01-A05：Widget API 故障（bootstrap 500）不影响宿主页面（无 pageerror、
 *   宿主按钮可用）；
 * - CSW-01-A06：Admin installation 页直链门（需后端凭据，缺失时 skip；
 *   门/secret 语义的单元证据见 src/modules/customer_service/api/widgetInstallations.test.ts）。
 * - 聊天闭环：consent → 会话 → 发送（client_msg_id）→ SSE 补偿（Last-Event-ID）
 *   → closed 评分（1..5 幂等）。
 */

// tests/e2e/widget-cs.spec.ts → 仓库根在两级之上
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST_WIDGET = path.join(REPO_ROOT, 'dist-widget')
const LOADER_JS = path.join(DIST_WIDGET, 'loader.js')
const APP_HTML = path.join(DIST_WIDGET, 'widget', 'index.html')
const APP_JS = path.join(DIST_WIDGET, 'assets', 'cs-widget.js')

function requireArtifacts(): { loaderJs: string; appHtml: string; appJs: string } {
  const ready = existsSync(LOADER_JS) && existsSync(APP_HTML) && existsSync(APP_JS)
  test.skip(!ready, '缺少 dist-widget 产物：请先运行 bun run build:widget')
  return {
    loaderJs: existsSync(LOADER_JS) ? readFileSync(LOADER_JS, 'utf8') : '',
    appHtml: existsSync(APP_HTML) ? readFileSync(APP_HTML, 'utf8') : '',
    appJs: existsSync(APP_JS) ? readFileSync(APP_JS, 'utf8') : '',
  }
}

const SESSION_ID = '72057594037927936'

/** 冻结合同形状的 bootstrap 响应（pending → 由访客在 Widget 内完成同意）。 */
const BOOTSTRAP_PAYLOAD = {
  visit_token: 'e2e-visit-token-stub',
  brand: { display_name: 'E2E 商城客服', primary_color: '#2563eb' },
  notice: { version: 'v1', state: 'pending' },
}

function envelope(payload: unknown): string {
  return JSON.stringify({ code: 0, msg: 'success', payload })
}

type HostFixtureOptions = {
  scriptCount?: number
  extraAttrs?: string
}

type StubOptions = {
  bootstrapStatus?: number
  /** SSE 响应体；传数组时按连接次序逐个提供（末个复用），用于模拟 active → closed */
  sseBody?: string | string[]
  hostFixture?: HostFixtureOptions
}

function hostFixtureHtml(origin: string, options: HostFixtureOptions = {}): string {
  const { scriptCount = 1, extraAttrs = '' } = options
  const scripts = Array.from({ length: scriptCount }, () =>
    `  <script async src="/loader.js" data-widget-id="wgt_pub_e2e" data-widget-origin="${origin}"${extraAttrs}></script>`
  ).join('\n')
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>E2E 商城宿主页</title></head>',
    '<body>',
    '  <h1>商城商品页（宿主内容）</h1>',
    '  <button id="host-cta" type="button">商城主按钮</button>',
    scripts,
    '</body>',
    '</html>',
  ].join('\n')
}

type CapturedRequest = { url: string; headers: Record<string, string>; body: string | null }

/** 按冻结合同形状桩出 Widget API 与静态产物路由；返回捕获到的 API 请求记录。 */
async function stubWidgetRoutes(
  page: import('@playwright/test').Page,
  artifacts: { loaderJs: string; appHtml: string; appJs: string },
  options: StubOptions = {}
): Promise<{ apiRequests: CapturedRequest[] }> {
  const apiRequests: CapturedRequest[] = []

  await page.route('**/cs-host-fixture.html', (route) => {
    // 在请求时构造 fixture，origin 取自实际 baseURL（与 webServer 端口解耦）
    const requestOrigin = new URL(route.request().url()).origin
    void route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: hostFixtureHtml(requestOrigin, options.hostFixture ?? {}),
    })
  })
  await page.route('**/loader.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: artifacts.loaderJs })
  )
  await page.route('**/widget/index.html', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: artifacts.appHtml })
  )
  await page.route('**/assets/cs-widget.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: artifacts.appJs })
  )

  const record = (request: import('@playwright/test').Request): void => {
    const headers = { ...request.headers() }
    delete headers.cookie
    apiRequests.push({ url: request.url(), headers, body: request.postData() })
  }

  await page.route('**/api/v1/cs/widget/bootstrap', (route) => {
    record(route.request())
    if (options.bootstrapStatus !== undefined && options.bootstrapStatus !== 200) {
      void route.fulfill({ status: options.bootstrapStatus, body: 'stub bootstrap failure' })
      return
    }
    void route.fulfill({ contentType: 'application/json', body: envelope(BOOTSTRAP_PAYLOAD) })
  })
  await page.route('**/api/v1/cs/widget/sessions', (route) => {
    record(route.request())
    const request = route.request()
    if (request.method() === 'POST') {
      void route.fulfill({
        contentType: 'application/json',
        body: envelope({ session: { id: SESSION_ID, status: 'active' } }),
      })
      return
    }
    void route.fulfill({ contentType: 'application/json', body: envelope({ sessions: [] }) })
  })
  await page.route('**/api/v1/cs/widget/sessions/*/messages', (route) => {
    record(route.request())
    const request = route.request()
    if (request.method() === 'POST') {
      const sent = request.postDataJSON() as { client_msg_id: string; body: string }
      void route.fulfill({
        contentType: 'application/json',
        body: envelope({ message: { id: '900000000000000001', role: 'visitor', body: sent.body, client_msg_id: sent.client_msg_id, created_at: '2026-09-16T00:00:00Z' } }),
      })
      return
    }
    void route.fulfill({
      contentType: 'application/json',
      body: envelope({ messages: [], next_after_id: null }),
    })
  })
  await page.route('**/api/v1/cs/widget/sessions/*/rating', (route) => {
    record(route.request())
    void route.fulfill({
      contentType: 'application/json',
      body: envelope({ rating: { score: (route.request().postDataJSON() as { score: number }).score } }),
    })
  })
  // SSE：静态完成流（读完即触发 Last-Event-ID 重连，便于断言补偿头）；
  // 传数组时第 2 次连接起切换响应体（如 active → closed）
  const sseBodies = Array.isArray(options.sseBody) ? options.sseBody : [options.sseBody ?? defaultSseBody()]
  let sseConnections = 0
  await page.route('**/api/v1/cs/widget/sessions/*/events', (route) => {
    record(route.request())
    const body = sseBodies[Math.min(sseConnections, sseBodies.length - 1)]
    sseConnections += 1
    void route.fulfill({ contentType: 'text/event-stream', body })
  })

  return { apiRequests }
}

function defaultSseBody(): string {
  return [
    'retry: 3000',
    'event: state',
    `data: {"session":{"id":"${SESSION_ID}","status":"active"}}`,
    '',
    'id: 101',
    'event: message',
    'data: {"id":"800000000000000002","role":"agent","body":"您好，请问有什么可以帮您？"}',
    '',
    '',
  ].join('\n')
}

const SECRET_SHAPE = /shop[_-]?key|sk_(live|test|prod)_|widget_identity_key|BEGIN [A-Z ]*PRIVATE KEY|signature["']?\s*[:=]/i

test.describe('CSW-01 Widget 宿主页闭环', () => {
  test('A01：单段 script 出现按钮，点击打开 iframe（sandbox 最小权限）并进入 consent', async ({ page }) => {
    const artifacts = requireArtifacts()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await stubWidgetRoutes(page, artifacts, { hostFixture: { scriptCount: 1 } })
    await page.goto('/cs-host-fixture.html')

    const launcher = page.locator('[data-testid="cs-widget-launcher"]')
    await expect(launcher).toBeVisible()

    await launcher.click()
    const iframe = page.locator('[data-testid="cs-widget-iframe"]')
    await expect(iframe).toBeVisible()
    // A03：sandbox 最小权限 + 可访问标题
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
    await expect(iframe).toHaveAttribute('title', /客服聊天窗口/)

    // iframe 应用完成握手 → bootstrap（pending）→ consent 覆盖层
    await expect(iframe.contentFrame().getByTestId('cs-consent-accept')).toBeVisible({ timeout: 15_000 })
    expect(pageErrors).toEqual([])
  })

  test('A02：重复 loader（两份 script）仍单实例', async ({ page }) => {
    const artifacts = requireArtifacts()
    await stubWidgetRoutes(page, artifacts, { hostFixture: { scriptCount: 2 } })
    await page.goto('/cs-host-fixture.html')

    await expect(page.locator('[data-testid="cs-widget-launcher"]')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="cs-widget-root"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="cs-widget-launcher"]')).toHaveCount(1)
  })

  test('A03：伪造来源 postMessage 被拒绝 + 键盘可达（Tab+Enter 打开）', async ({ page }) => {
    const artifacts = requireArtifacts()
    await stubWidgetRoutes(page, artifacts, { hostFixture: { scriptCount: 1 } })
    await page.goto('/cs-host-fixture.html')

    // 键盘可达：宿主 CTA → Tab 聚焦 widget 按钮 → Enter 打开
    await page.locator('#host-cta').focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-testid="cs-widget-launcher"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="cs-widget-iframe"]')).toBeVisible()
    await expect(page.locator('[data-testid="cs-widget-launcher"]')).toHaveAttribute('aria-expanded', 'true')

    // 伪造来源：source 不是 loader 创建的 iframe → 被逐字校验拒绝（不崩溃、无未读变化）
    await page.evaluate(() => {
      window.postMessage({ source: 'imboy-cs-widget', type: 'unread', count: 99 }, '*')
    })
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="cs-widget-iframe"]')).toBeVisible()
    const ariaLabel = await page.locator('[data-testid="cs-widget-launcher"]').getAttribute('aria-label')
    expect(ariaLabel ?? '').not.toContain('99')
    expect(ariaLabel ?? '').not.toContain('未读')
  })

  test('A04：data-shop-key 反例被 loader 忽略并 warn；网络与页面无 secret', async ({ page }) => {
    const artifacts = requireArtifacts()
    const consoleWarnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') consoleWarnings.push(message.text())
    })
    const { apiRequests } = await stubWidgetRoutes(page, artifacts, {
      hostFixture: { scriptCount: 1, extraAttrs: ' data-shop-key="fake_secret_shape_E2EFIXTURE00000000"' },
    })
    await page.goto('/cs-host-fixture.html')
    await page.locator('[data-testid="cs-widget-launcher"]').click()
    await expect(page.locator('[data-testid="cs-widget-iframe"]').contentFrame().getByTestId('cs-consent-accept')).toBeVisible({ timeout: 15_000 })

    // loader 忽略未知键并 warn（只报键名，值不外泄）
    await expect
      .poll(() => consoleWarnings.join('\n'), { timeout: 5_000 })
      .toContain('shop-key')
    expect(consoleWarnings.join('\n')).not.toContain('fake_secret_shape_E2EFIXTURE00000000')

    // 捕获到的所有 Widget API 请求（头/体）不含 secret 形状；token 只在头、不在 URL
    expect(apiRequests.length).toBeGreaterThan(0)
    for (const request of apiRequests) {
      expect(request.url).not.toMatch(SECRET_SHAPE)
      expect(request.url).not.toMatch(/token/i)
      const serialized = JSON.stringify({ headers: request.headers, body: request.body })
      expect(serialized).not.toMatch(SECRET_SHAPE)
    }
    // 页面渲染文本无 secret 形状
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(SECRET_SHAPE)
  })

  test('A05：bootstrap 500 → 宿主页面不受影响（无 pageerror，宿主按钮可用）', async ({ page }) => {
    const artifacts = requireArtifacts()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await stubWidgetRoutes(page, artifacts, { bootstrapStatus: 500 })
    await page.goto('/cs-host-fixture.html')

    // 宿主自身功能完好
    await page.locator('#host-cta').click()
    await expect(page).toHaveTitle(/E2E 商城宿主页/)
    // Widget 故障被 loader/iframe 吸收：给出可重试错误态，无异常外泄
    const launcher = page.locator('[data-testid="cs-widget-launcher"]')
    await expect(launcher).toBeVisible()
    await launcher.click()
    await expect(page.locator('[data-testid="cs-widget-iframe"]').contentFrame().getByTestId('cs-retry-bootstrap')).toBeVisible({ timeout: 15_000 })
    await launcher.click() // 关闭面板后按钮回到连接状态标记
    await expect(launcher).toHaveAttribute('data-state', 'error', { timeout: 15_000 })
    await expect(launcher).toHaveAttribute('aria-label', /客服暂不可用/)
    expect(pageErrors).toEqual([])
  })

  test('聊天闭环：consent → 发送（client_msg_id 幂等）→ Last-Event-ID 补偿 → closed 评分', async ({ page }) => {
    const artifacts = requireArtifacts()
    // 连接 1：active（retry:5000 给发送留出窗口）；连接 2 起：closed → 评分
    const activeSseBody = [
      'retry: 5000',
      'event: state',
      `data: {"session":{"id":"${SESSION_ID}","status":"active"}}`,
      '',
      'id: 101',
      'event: message',
      'data: {"id":"800000000000000002","role":"agent","body":"您好，请问有什么可以帮您？"}',
      '',
      '',
    ].join('\n')
    const closedSseBody = [
      'event: state',
      `data: {"session":{"id":"${SESSION_ID}","status":"closed"}}`,
      '',
      '',
    ].join('\n')
    const { apiRequests } = await stubWidgetRoutes(page, artifacts, { sseBody: [activeSseBody, closedSseBody] })
    await page.goto('/cs-host-fixture.html')

    await page.locator('[data-testid="cs-widget-launcher"]').click()
    const frame = page.locator('[data-testid="cs-widget-iframe"]').contentFrame()

    // consent（pending → 同意）
    await frame.getByTestId('cs-consent-accept').click()

    // 发送消息（乐观气泡 + client_msg_id 幂等请求）
    await frame.getByTestId('cs-input').fill('E2E 的一条咨询消息')
    await frame.getByTestId('cs-send').click()
    await expect(frame.getByTestId('cs-message-list')).toContainText('E2E 的一条咨询消息', { timeout: 15_000 })
    const sendRequest = apiRequests.find((request) => /\/messages$/.test(request.url) && request.body !== null)
    expect(sendRequest).toBeDefined()
    const sentBody = JSON.parse(sendRequest?.body ?? '{}') as { client_msg_id: string; body: string }
    expect(sentBody.client_msg_id.length).toBeGreaterThan(8)
    expect(sentBody.body).toBe('E2E 的一条咨询消息')

    // SSE stub 读完即断 → 自动重连且携带 Last-Event-ID 补偿头（101 来自首个 message 事件）
    await expect
      .poll(() => {
        const requests = apiRequests.filter((request) => /\/events/.test(request.url))
        return requests.length >= 2 && requests[1]?.headers['last-event-id'] === '101'
      }, { timeout: 15_000 })
      .toBe(true)

    // closed → 评分（1..5；提交后进入感谢屏 = 幂等收口）
    await frame.getByTestId('cs-rate-5').click()
    await expect(frame.getByText('感谢您的评价！')).toBeVisible({ timeout: 15_000 })
    const ratingRequest = apiRequests.find((request) => /\/rating$/.test(request.url))
    expect(ratingRequest).toBeDefined()
    expect(JSON.parse(ratingRequest?.body ?? '{}')).toEqual({ score: 5 })
  })
})

test.describe('CSW-01-A06：Admin Widget 接入页直链门（需后端凭据）', () => {
  test('直链 /customer-service/widgets 受权限门保护且无敏感字段取值', async ({ page }) => {
    const credentials = requireAdminCredentials()
    // 先探活后端（登录依赖 imboy 实例）；不可达时跳过并注明（联调归 CSX-01）
    const backendBase = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800'
    let backendReachable = true
    try {
      await fetch(`${backendBase}/`, { signal: AbortSignal.timeout(2000) })
    } catch {
      backendReachable = false
    }
    test.skip(!backendReachable, `后端 ${backendBase} 不可达，A06 直链门 E2E 跳过（联调归 CSX-01）`)
    await loginAsAdmin(page, credentials)
    await page.goto('/customer-service/widgets')
    const pageRoot = page.locator('[data-page="cs-widget-installations"]')
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 15_000 })
    if (await forbidden.isVisible()) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 customer_service:read，直链门生效' })
      return
    }
    await expect(page.getByRole('heading', { name: 'Widget 接入' })).toBeVisible()
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(SECRET_SHAPE)
  })
})
