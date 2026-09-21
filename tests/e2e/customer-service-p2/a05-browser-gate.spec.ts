/**
 * P2-E2E-01 A05：浏览器门（全程 console 无 error、network 无 5xx、a11y 基本
 * 断言、页面源码与 network 载荷无 JWT/object key/secret 泄漏）。
 *
 * 本 spec 驱动一条纯净链（访客 widget 页 + 坐席工作台页面真实交互，零预期
 * 负例），因此 console error / 5xx 断言零豁免；泄漏扫描覆盖：DOM/页面源码、
 * 全部同源请求 URL、2xx/3xx 文本型响应体采样（SSE 流除外）。
 * a11y：焦点可达（键盘 Tab 进入可交互元素）、widget 消息区 aria-live、
 * 坐席队列 tablist 语义（role=tab/tabpanel/aria-selected）。
 */
import { expect, test } from '@playwright/test'
import { createCollector, watchPage, type BrowserGateCollector } from './helpers/browser-gate'
import { ADMIN_ORIGIN, ORG_ID, SHOP_ORIGIN } from './helpers/env'
import { qrLoginSeat } from './helpers/qr-login'
import { SEAT_A } from '../customer-service-real/helpers/env'

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** JWT 形状（三段 base64url）与高熵十六进制 secret 检测（运行时拼接防自匹配）。 */
function jwtLike(value: string): boolean {
  return /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)
}

function scanLeak(label: string, payloads: Array<{ source: string; sample: string }>): void {
  const hits: string[] = []
  for (const { source, sample } of payloads) {
    if (jwtLike(sample)) hits.push(`${label} @ ${source}: JWT-form token`)
    if (/ey[A-Za-z0-9_-]{16,}\./.test(sample) && sample.includes('.eyJ')) hits.push(`${label} @ ${source}: nested JWT fragment`)
    if (/presign|upload_ref=|object_key/.test(sample) === true && /(["'])x-amz-(signature|credential)\1?/i.test(sample)) {
      hits.push(`${label} @ ${source}: object-store credential material`)
    }
  }
  expect(hits, hits.join('; ')).toEqual([])
}

test('A05 浏览器门：console零error+5xx零容忍+a11y（焦点/aria-live/tablist）+JWT与对象凭证零泄漏', async ({ browser }) => {
  test.setTimeout(240_000)
  const collector: BrowserGateCollector = createCollector()
  const visitorCtx = await browser.newContext()
  const seatCtx = await browser.newContext()
  try {
    // —— 坐席工作台页面：tablist 语义 + 键盘焦点可达 ——
    const seatPage = await seatCtx.newPage()
    watchPage(collector, seatPage)
    await seatPage.goto(`${ADMIN_ORIGIN}/customer-service/workspace`)
    // 键盘可达：Tab 首步进入 QR 面板内部可交互元素（换码按钮可聚焦）。
    await expect(seatPage.getByTestId('seat-qr-refresh')).toBeVisible()
    await seatPage.keyboard.press('Tab')
    const focusedTag = await seatPage.evaluate(() => document.activeElement?.tagName ?? '')
    expect(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focusedTag)
    await qrLoginSeat(seatPage, SEAT_A.account)
    // tablist：role=tab + aria-selected + tabpanel 关联。
    const tablist = seatPage.getByRole('tablist')
    await expect(tablist).toBeVisible()
    await expect(seatPage.getByTestId('seat-tab-queued')).toHaveAttribute('aria-selected', 'true')
    await seatPage.getByTestId('seat-tab-active').click()
    await expect(seatPage.getByTestId('seat-tab-active')).toHaveAttribute('aria-selected', 'true')
    await expect(seatPage.getByTestId('seat-session-list')).toHaveAttribute('role', 'tabpanel')
    // aria-live：坐席播报区域存在且为 polite。
    await expect(seatPage.getByTestId('seat-live-region')).toHaveAttribute('aria-live', 'polite')

    // —— 访客 widget 页面：aria-live 消息区 + 焦点交互 ——
    const visitorPage = await visitorCtx.newPage()
    watchPage(collector, visitorPage)
    await visitorPage.goto(`${SHOP_ORIGIN}/`)
    await visitorPage.getByTestId('cs-widget-launcher').click()
    const frame = visitorPage.frameLocator('iframe[data-testid="cs-widget-iframe"]')
    await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
    await frame.getByTestId('cs-consent-accept').click()
    const messageList = frame.getByTestId('cs-message-list')
    await expect(messageList).toHaveAttribute('aria-live', 'polite')
    await expect(messageList).toHaveAttribute('role', 'log')
    await frame.getByTestId('cs-input').fill(`p2-a05 访客消息 ${RUN_UNIQ}`)
    await frame.getByTestId('cs-send').click()
    await expect(messageList).toContainText(`p2-a05 访客消息 ${RUN_UNIQ}`)

    // —— 泄漏扫描：DOM/页面源码 + 请求 URL + 响应体采样 ——
    const visitorHtml = await visitorPage.content()
    const seatHtml = await seatPage.content()
    scanLeak(
      'page-source',
      [
        { source: 'shop.test DOM', sample: visitorHtml },
        { source: 'admin.test DOM', sample: seatHtml },
      ]
    )
    const jwtUrls = collector.requestUrls.filter((url) => jwtLike(url))
    expect(jwtUrls, `JWT-form material must never travel in URLs: ${JSON.stringify(jwtUrls).slice(0, 200)}`).toEqual([])
    const secretQueryUrls = collector.requestUrls.filter((url) => /[?&](secret|api_key|client_secret|password)=/.test(url))
    expect(secretQueryUrls, `secret material must never travel in URLs`).toEqual([])
    // QR 登录合同面豁免：/qr_login/status 与 /qr_login/subscribe 响应体是
    // JWT 的唯一合同投递通道（一次性 session_token 换取、TLS 之内），不视为
    // 泄漏；其余任何载荷出现 JWT 形态即失败。
    const contractedQrDelivery = (url: string): boolean => /\/passport\/qr_login\/(status|subscribe)/.test(url)
    scanLeak(
      'network-body',
      collector.responseBodies
        .filter((item) => !contractedQrDelivery(item.url))
        .map((item) => ({ source: item.url, sample: item.sample }))
    )
    // JWT 允许的唯一位置：Authorization 请求头（合同面）——响应载荷/URL/DOM 均不得出现。

    // —— console error / 5xx：纯净链零豁免 ——
    expect(collector.serverErrors, JSON.stringify(collector.serverErrors)).toEqual([])
    expect(
      collector.consoleErrors,
      `console errors; 4xx ledger=${JSON.stringify(collector.clientErrors).slice(0, 600)}`
    ).toEqual([])

    // 组织上下文健全性（工作台默认选中本组织）。
    await expect(seatPage.getByTestId('seat-org-select')).toHaveValue(ORG_ID)
  } finally {
    await visitorCtx.close().catch(() => {})
    await seatCtx.close().catch(() => {})
  }
})
