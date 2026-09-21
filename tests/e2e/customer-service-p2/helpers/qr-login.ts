/**
 * P2-E2E-01（A7）：坐席 QR 扫码登录的页面驱动 + 预认证 API confirm。
 *
 * 任务 A01 指定链路：工作台页面（admin.test/customer-service/workspace）真实
 * 走 QR create → 页面渲染二维码内容 →（预认证 API context：坐席护照 JWT 调
 * scan/confirm 模拟手机端动作）→ 页面经 QR subscribe SSE 收到 confirmed+JWT
 * → establishSeatSession → 工作台挂载。页面不 mock 不跳步：create/subscribe/
 * 状态收敛全部发生在真实页面内。
 *
 * 已知产品竞态（如实驱动，不掩盖）：页面重渲染会 dispose+重建 QR 会话（换码），
 * confirm 撞上刚被换掉的码会得到 5200 无效二维码 —— helper 对此整轮重试（换新
 * 码重扫）；另外 seat-contexts 查询在预认证期缓存的 401 可能让工作台停在可重试
 * 错误态 —— JWT 到达后点真实「重试」入口复核（用户可达路径）。
 */
import { expect, type Page } from '@playwright/test'
import { BACKEND_BASE, SEAT_PASSWORD } from './env'

/** 坐席护照登录（真实 passport/login；rsa_encrypt:0 沙盒口径）。 */
export async function seatPassportLogin(account: string): Promise<string> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'mobile', account, pwd: SEAT_PASSWORD, rsa_encrypt: '0' }),
  })
  const body = (await res.json()) as { code: number; payload?: { token?: string } }
  if (res.status !== 200 || body.code !== 0 || typeof body.payload?.token !== 'string') {
    throw new Error(`seat passport login failed for ${account}: HTTP ${res.status}`)
  }
  return body.payload.token
}

/** 预认证 API context：扫码 + 确认（手机端同款合同面；Bearer=坐席护照 JWT）。 */
async function scanAndConfirm(seatJwt: string, qrToken: string): Promise<void> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${seatJwt}` }
  const scan = await fetch(`${BACKEND_BASE}/api/v1/passport/qr_login/scan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const scanBody = (await scan.json()) as { code: number; msg?: string }
  if (scanBody.code !== 0) throw new Error(`qr scan failed: ${JSON.stringify(scanBody)}`)
  const confirm = await fetch(`${BACKEND_BASE}/api/v1/passport/qr_login/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qr_token: qrToken }),
  })
  const confirmBody = (await confirm.json()) as { code: number; msg?: string }
  if (confirmBody.code !== 0) throw new Error(`qr confirm failed: ${JSON.stringify(confirmBody)}`)
}

/**
 * 在给定页面完成坐席 QR 登录（页面 create/subscribe + API scan/confirm），
 * 收敛到已挂载的工作台。page 必须已开在 workspace 路由。
 */
export async function qrLoginSeat(page: Page, account: string): Promise<void> {
  if (process.env.CSWW_P2_DEBUG === '1') {
    page.on('response', (res) => {
      const url = res.url()
      // 只记录终态响应；SSE 流绝不能 text()（会与页面 reader 抢流）。
      if ((url.includes('/api/v1/cs/') || url.includes('/qr_login/')) && !url.includes('/events')) {
        void res
          .text()
          .then((body) => console.log(`[qr-debug ${account}]`, res.status(), url.slice(0, 110), body.slice(0, 120)))
          .catch(() => {})
      } else if (url.includes('/events')) {
        console.log(`[qr-debug ${account}]`, res.status(), url.slice(0, 110), '(stream open)')
      }
    })
  }
  const seatJwt = await seatPassportLogin(account)
  const qrCode = page.getByTestId('seat-qr-code')
  await expect(qrCode).toContainText('imboy://qr_login?qr_token=', { timeout: 30_000 })

  // 换码风暴等待：页面重渲染会 dispose+重建 QR 会话（每次渲染一个新 create）。
  // 以「2 秒窗口内无新 qr_login/create 请求」为静默判据，再读当前码。
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

  // 读「已静默」的二维码 token → scan/confirm → 校验页面反应（phase 变已扫码
  // 或直接挂载）：反应缺失说明确认落在已被换掉的旧会话上，重读当前码重试。
  let lastError: Error | null = null
  let confirmed = false
  for (let attempt = 0; attempt < 4 && !confirmed; attempt += 1) {
    try {
      await waitQuiet()
      const content = (await qrCode.textContent()) ?? ''
      const encoded = /imboy:\/\/qr_login\?qr_token=([^&\s]+)/.exec(content)?.[1]
      if (encoded === undefined || encoded === '') break // 面板已不在（可能已确认成功）
      await scanAndConfirm(seatJwt, decodeURIComponent(encoded))
      lastError = null
      const reacted = await page
        .getByText('已扫码，请在手机上确认')
        .or(page.getByTestId('seat-workspace'))
        .or(page.getByTestId('seat-contexts-error-retry'))
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

  // JWT 经 subscribe SSE / status 轮询到达后：工作台直接挂载，或命中预认证期
  // 缓存的 contexts 401 错误态 —— 点真实重试入口复核（重试后带 Bearer 成功）。
  const workspace = page.getByTestId('seat-workspace')
  const contextsRetry = page.getByTestId('seat-contexts-error-retry')
  await expect(workspace.or(contextsRetry).first()).toBeVisible({ timeout: 30_000 })
  if ((await contextsRetry.count()) > 0) {
    await contextsRetry.click()
  }
  await expect(workspace).toBeVisible({ timeout: 30_000 })
}
