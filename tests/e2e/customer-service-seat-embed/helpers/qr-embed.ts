/**
 * SC-E2E：宿主 iframe 内的坐席 QR 登录驱动（P2 helpers/qr-login.ts 的 frame 变体）。
 *
 * 差异点：工作台不在顶层页面，而在 shop.test 宿主页嵌入的
 * `<iframe title="IMBoy 客服工作台">`（cs.test origin）里 ——
 *   * UI 断言走 FrameLocator；换码风暴监听仍挂 page 级（Playwright 的
 *     page.on('request') 覆盖所有 frame，qr_login/create 请求原样可见）；
 *   * scan/confirm 走预认证 API context（坐席护照 JWT 调公共 passport 端点，
 *     与 P2 同一真实合同面）；helper 本地实现（P2 未导出 scanAndConfirm，
 *     不为复用而改动 P2 目录）。
 *
 * 已知产品竞态（与 P2 同款，如实驱动不掩盖）：页面重渲染 dispose+重建 QR 会话
 * （换码），confirm 撞上旧码得 5200 —— 整轮重试；预认证期 contexts 401 缓存
 * 可能让工作台停在可重试错误态 —— JWT 到达后点真实「重试」入口复核。
 */
import { expect, type Browser, type FrameLocator, type Page } from '@playwright/test'
import { BE_MAIN, CONSOLE_PUBLIC_ID, CS_ORIGIN, SEAT, SHOP, seatPassportLogin } from './env'

/** 宿主 iframe 定位器（snippet 冻结合同：title 固定为「IMBoy 客服工作台」）。 */
export function embedFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="IMBoy 客服工作台"]')
}

/** 打开某宿主 origin 的嵌入页并等 iframe 挂载；返回顶层 page 与 frame 定位器。 */
export async function openSeatEmbed(
  browser: Browser,
  hostOrigin: string = SHOP,
): Promise<{ page: Page; frame: FrameLocator }> {
  const page = await browser.newPage()
  await page.goto(`${hostOrigin}/`, { waitUntil: 'domcontentloaded' })
  const iframe = page.locator('iframe[title="IMBoy 客服工作台"]')
  await expect(iframe).toBeAttached({ timeout: 15_000 })
  return { page, frame: embedFrame(page) }
}

/** 预认证 API context：扫码 + 确认（手机端同款合同面；Bearer=坐席护照 JWT）。 */
async function scanAndConfirm(seatJwt: string, qrToken: string): Promise<void> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${seatJwt}` }
  const scan = await fetch(`${BE_MAIN}/api/v1/passport/qr_login/scan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const scanBody = (await scan.json()) as { code: number; msg?: string }
  if (scanBody.code !== 0) throw new Error(`qr scan failed: ${JSON.stringify(scanBody)}`)
  const confirm = await fetch(`${BE_MAIN}/api/v1/passport/qr_login/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const confirmBody = (await confirm.json()) as { code: number; msg?: string }
  if (confirmBody.code !== 0) throw new Error(`qr confirm failed: ${JSON.stringify(confirmBody)}`)
}

/**
 * 在宿主页嵌入的 iframe 内完成坐席 QR 登录，收敛到已挂载的工作台。
 * page 必须已开在嵌入了 seat console iframe 的宿主页（openSeatEmbed）。
 */
export async function qrLoginSeatInFrame(page: Page, account: string = SEAT.account): Promise<void> {
  const seatJwt = await seatPassportLogin(account)
  const frame = embedFrame(page)
  const qrCode = frame.getByTestId('seat-qr-code')
  await expect(qrCode.locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(qrCode).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, { timeout: 30_000 })

  // 换码风暴等待：以「2 秒窗口内无新 qr_login/create 请求」为静默判据。
  let lastCreateAt = Date.now()
  const createListener = (req: { url(): string }): void => {
    if (req.url().includes('/passport/qr_login/create')) lastCreateAt = Date.now()
  }
  page.on('request', createListener)
  const waitQuiet = async (): Promise<void> => {
    const deadline = Date.now() + 30_000
    while (Date.now() - lastCreateAt < 2_000) {
      if (Date.now() > deadline) throw new Error('qr create churn never settled')
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
      await scanAndConfirm(seatJwt, decodeURIComponent(encoded))
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
    if (stillThere) throw new Error('qr confirm did not reach the page current session')
  }

  // JWT 到达后：工作台直接挂载，或命中预认证期缓存的 contexts 401 错误态 ——
  // 点真实重试入口复核（重试后带 Bearer 成功）。
  const workspace = frame.getByTestId('seat-workspace')
  const contextsRetry = frame.getByTestId('seat-contexts-error-retry')
  await expect(workspace.or(contextsRetry).first()).toBeVisible({ timeout: 30_000 })
  if ((await contextsRetry.count()) > 0) {
    await contextsRetry.click()
  }
  await expect(workspace).toBeVisible({ timeout: 30_000 })
}

/** 访客链路：shop.test/visitor.html 经 hosted loader 真实建一条 queued 会话。 */
export async function createVisitorSession(
  page: Page,
  marker: string,
): Promise<void> {
  await page.goto(`${SHOP}/visitor.html`, { waitUntil: 'domcontentloaded' })
  const launcher = page.locator('#imboy-cs-widget-root').locator('button').first()
  await expect(launcher).toBeAttached({ timeout: 15_000 })
  await launcher.click()
  const widgetFrame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await expect(widgetFrame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 30_000 })
  await widgetFrame.getByTestId('cs-consent-accept').click()
  await expect(widgetFrame.getByTestId('cs-input')).toBeVisible()
  await widgetFrame.getByTestId('cs-input').fill(`sc153 访客消息 ${marker}`)
  await widgetFrame.getByTestId('cs-send').click()
  await expect(widgetFrame.getByTestId('cs-message-list')).toContainText(`sc153 访客消息 ${marker}`, {
    timeout: 20_000,
  })
}

/** frame URL 合同：iframe src = <CS_ORIGIN>/seat/<public id>（公开 ID 非凭证）。 */
export function expectedFrameUrl(): string {
  return `${CS_ORIGIN}/seat/${CONSOLE_PUBLIC_ID}`
}
