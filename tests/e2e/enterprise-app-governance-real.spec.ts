/**
 * FULL-08 真后端联调 E2E：Admin 企业应用治理（`/enterprise/applications*`）。
 *
 * 口径（诚实记录）：
 *   - 与 `enterprise-app-governance.spec.ts`（合成 page.route，gate 用）互补。
 *   - 本 spec 在 `IMBOY_E2E_REAL_BACKEND`（后端 API base，如 http://127.0.0.1:9903）
 *     **显式设置时**才运行；未设置时整文件 skip —— gate 的确定性不受影响。
 *   - 登录链：走**真实后端** `/api/adm/passport/meta` →（RSA-OAEP-SHA256 加密
 *     md5(password)）→ `/api/adm/setup/init` + `/api/adm/passport/login`
 *     （captcha=`1234` 为 local 档测试验证码，`adm_passport_handler:1234`），
 *     拿到真实 `adm_user_id` / `adm_user_sig` cookie 后注入浏览器。
 *     UI 表单的 WebCrypto 加密路径已由合成 spec 覆盖，此处不重复点按钮。
 *   - 页面渲染后全部 `/api/adm/*` 请求经 vite proxy（`VITE_PROXY_TARGET`）
 *     打到真实后端 —— **无任何 page.route**。
 *   - 数据前提（scratch 库种子，合成 ID 段 997xxx，无真实 PII）：
 *     org=997010 / app=997020(status=active,version=1) / credential=997030
 *     (prefix=admine2e-c1) / grant=997040。
 *
 * 运行：
 *   VITE_PROXY_TARGET=http://127.0.0.1:9903 bun run dev -- --host 127.0.0.1 --port 8082 &
 *   IMBOY_E2E_REAL_BACKEND=http://127.0.0.1:9903 PLAYWRIGHT_DISABLE_WEBSERVER=1 \
 *     IMBOY_ADMIN_E2E_BASE_URL=http://127.0.0.1:8082 \
 *     PLAYWRIGHT_EXECUTABLE_PATH="$PLAYWRIGHT_CHROME" \
 *     bun run test:e2e -- --project=chromium enterprise-app-governance-real
 */
import crypto from 'node:crypto'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const API = process.env.IMBOY_E2E_REAL_BACKEND || ''

test.skip(!API, 'IMBOY_E2E_REAL_BACKEND 未设置：真后端联调用例仅显式设置时运行')

const ORG = '997010'
const APP = '997020'
const ACCOUNT = process.env.IMBOY_E2E_ADMIN_ACCOUNT || 'admine2e_admin@example.invalid'
const PASSWORD = process.env.IMBOY_E2E_ADMIN_PASSWORD || 'Admine2e#2026'

type Cookie = { name: string; value: string; domain: string; path: string }

function toPem(raw: string): string {
  const b64 = raw.replace(/-----[A-Z ]*-----/g, '').replace(/\s+/g, '')
  const body = (b64.match(/.{1,64}/g) ?? []).join('\n')
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
}

function encryptPassword(publicKey: string): string {
  // 与前端登录链一致：RSA-OAEP-SHA256( md5(password) )，后端
  // elib_cipher:rsa_decrypt/1 优先按 OAEP-SHA256 解密。
  const md5hex = crypto.createHash('md5').update(PASSWORD).digest('hex')
  return crypto
    .publicEncrypt(
      { key: toPem(publicKey), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(md5hex, 'utf8'),
    )
    .toString('base64')
}

async function apiLogin(): Promise<Cookie[]> {
  const metaRes = await fetch(`${API}/api/adm/passport/meta`)
  const meta = await metaRes.json()
  const csrf: string = meta?.payload?.csrf_token ?? ''
  const publicKey: string = meta?.payload?.public_key ?? ''
  if (!csrf || !publicKey) throw new Error(`passport/meta 缺 csrf/公钥: ${JSON.stringify(meta)}`)

  const loginRes = await fetch(`${API}/api/adm/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account: ACCOUNT,
      pwd: encryptPassword(publicKey),
      captcha: '1234',
      csrf_token: csrf,
    }),
  })
  const login = await loginRes.json()
  if (login?.code !== 0) throw new Error(`登录失败: ${JSON.stringify(login)}`)
  const cookies = loginRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('adm_user'))
    .map((c) => {
      const idx = c.indexOf('=')
      return { name: c.slice(0, idx), value: c.slice(idx + 1), domain: '127.0.0.1', path: '/' }
    })
  if (cookies.length < 2) throw new Error('登录响应缺少 adm_user cookie')
  return cookies
}

let loginCookies: Cookie[] = []
let ctx: BrowserContext | undefined

test.beforeAll(async ({ browser }) => {
  loginCookies = await apiLogin()
  ctx = await browser.newContext()
  await ctx.addCookies(loginCookies)
})

test.afterAll(async () => {
  await ctx?.close()
})

/** 新开注入登录态的页面，并记录全部请求路径。 */
async function openPage(trackRequests: string[] = []): Promise<Page> {
  const page = await ctx!.newPage()
  page.on('request', (req) => trackRequests.push(new URL(req.url()).pathname))
  return page
}

async function openDetail(page: Page): Promise<void> {
  await page.goto('/enterprise/applications')
  await expect(page.locator('[data-page="enterprise-applications"]')).toBeVisible()
  await page.getByLabel('组织 ID（organization_id）').fill(ORG)
  await page.getByRole('button', { name: '详情' }).first().click()
  await expect(page.locator('[data-page="enterprise-application-detail"]')).toBeVisible()
  await expect(page.getByTestId('credential-panel')).toBeVisible({ timeout: 15_000 })
}

function assertNoInternalV1(paths: string[]): void {
  const hits = paths.filter((p) => p.startsWith('/api/internal/v1/') || p.startsWith('/api/v1/'))
  expect(hits, `治理面不得触达 internal/v1 或 human/v1: ${hits.join(', ')}`).toEqual([])
}

test.describe.configure({ mode: 'serial' })

test('A-01/A-02 列表与详情渲染真后端数据（合成种子 org=997010/app=997020）', async () => {
  const paths: string[] = []
  const page = await openPage(paths)
  await openDetail(page)
  await expect(page).toHaveTitle(/.*/)
  await expect(page.locator('body')).toContainText('admine2e app')
  assertNoInternalV1(paths)
  await page.close()
})

test('A-05 凭证读面只有元数据：prefix 可见、digest 明文不可见', async () => {
  const paths: string[] = []
  const page = await openPage(paths)
  await openDetail(page)
  await expect(
    page.getByTestId('credential-panel').getByRole('cell', { name: 'admine2e-c1' }),
  ).toBeVisible()
  const body = await page.content()
  expect(body, '64 位 secret 摘要不得出现在任何渲染文本里').not.toContain('b'.repeat(64))
  assertNoInternalV1(paths)
  await page.close()
})

test('A-06 签发凭证：secret 恰出现一次、刷新后不可再见、列表 +1', async () => {
  const paths: string[] = []
  const page = await openPage(paths)
  await openDetail(page)

  const before = await page
    .getByTestId('credential-panel')
    .getByRole('row')
    .count()
  await page.getByTestId('credential-issue').click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认执行' }).click()

  const secretNode = page.getByTestId('secret-once-value')
  await expect(secretNode).toBeVisible({ timeout: 15_000 })
  const secret = (await secretNode.innerText()).trim()
  expect(secret).toMatch(/^ib_int_\d+\.\S+/)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText.split(secret).length - 1).toBe(1)

  // 刷新后：一次性 secret 不可再见，但脱敏行 +1
  await page.reload()
  await expect(page.getByTestId('credential-panel')).toBeVisible({ timeout: 15_000 })
  expect((await page.locator('body').innerText())).not.toContain(secret)
  const after = await page.getByTestId('credential-panel').getByRole('row').count()
  expect(after).toBeGreaterThan(before)
  assertNoInternalV1(paths)
  await page.close()
})

test('A-03 CAS 状态变更 + A-14 审计落痕（active → disabled）', async () => {
  const paths: string[] = []
  const page = await openPage(paths)
  await openDetail(page)

  // 自愈：上一轮遗留「停用」时先真实地切回启用（同为 A-03 链路），
  // 保证本用例从 active → disabled 可重复执行
  const statusBadge = page.getByTestId('application-status')
  if ((await statusBadge.innerText()).includes('停用')) {
    await page.getByTestId('lifecycle-to-active').click()
    const resume = page.getByRole('alertdialog')
    await expect(resume).toBeVisible()
    await resume.getByRole('button', { name: '确认执行' }).click()
    await expect(statusBadge).toContainText('启用', { timeout: 15_000 })
  }

  await page.getByTestId('lifecycle-to-disabled').click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认执行' }).click()

  // 真后端 CAS 成功：回列表页（每次进页重新拉取）断言状态徽标翻转
  await page.goto('/enterprise/applications')
  await expect(page.locator('[data-page="enterprise-applications"]')).toBeVisible()
  await page.getByLabel('组织 ID（organization_id）').fill(ORG)
  await expect(page.getByTestId(`app-status-${APP}`).first()).toContainText('停用', { timeout: 15_000 })

  // 审计面板出现非空记录（后端 append_tx 写 platform_admin 审计）
  await page.goto(`/enterprise/applications/${APP}?org_id=${ORG}`)
  await expect(page.getByTestId('audit-trail-panel')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('暂无审计记录')).toBeHidden()
  await expect(page.locator('[data-audit-action]')).not.toHaveCount(0)
  assertNoInternalV1(paths)
  await page.close()
})
