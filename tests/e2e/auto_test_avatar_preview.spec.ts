/**
 * ai_agent 头像预览降级复验（批次42）
 *
 * 背景：AiAgentListPage 编辑 Dialog 的头像 <img> 用 Garage 私桶裸 URL 直读 403 裂图。
 * 修复：onError 后回退本地 blob 预览（上传场景），无 blob 时降级「不可预览」占位 + URL 文本。
 *
 * 判据：
 * 1. 上传头像 POST 2xx，toast「头像已上传，保存后生效」
 * 2. 服务端裸 URL 加载失败后 <img src> 回退为 blob: 且 naturalWidth > 0（不裂图）
 *
 * 用法：PLAYWRIGHT_DISABLE_WEBSERVER=1 bunx playwright test tests/e2e/auto_test_avatar_preview.spec.ts
 */
import path from 'node:path'
import fs from 'node:fs'
import { test, expect, type Response } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const EVID = path.resolve(process.cwd(), 'tests/auto_test/evidence/ai_agent')
const TAG = process.env.AUTO_TEST_ROUND || `avatar-verify-${Date.now() % 100000}`

test('编辑 Dialog 头像上传后 403 降级 blob 预览不裂图', async ({ page }) => {
  test.setTimeout(120_000)
  const credentials = requireAdminCredentials()

  const apiCalls: { method: string; status: number; url: string }[] = []
  const avatarGets: { status: number; url: string }[] = []
  page.on('response', (res: Response) => {
    const url = new URL(res.url())
    if (url.pathname.includes('/api/')) {
      apiCalls.push({ method: res.request().method(), status: res.status(), url: url.pathname + url.search })
    }
    // 头像对象的 GET（Garage 直连或经代理），用于证明 403 存在
    if (res.request().method() === 'GET' && /\.(png|jpe?g|webp)(\?|$)/i.test(url.pathname)) {
      avatarGets.push({ status: res.status(), url: res.url().slice(0, 160) })
    }
  })

  await loginAsAdmin(page, credentials)
  await page.goto('/ai-agents', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

  await page.getByRole('button', { name: /^编辑$/ }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('avatar-input')).toBeVisible({ timeout: 5_000 }).catch(() => {})
  fs.mkdirSync(EVID, { recursive: true })
  await page.screenshot({ path: path.join(EVID, `${TAG}-dialog-before-upload.png`) })

  // 上传 1x1 PNG：应看到 POST avatar 2xx + toast
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: 'avatar-e2e.png', mimeType: 'image/png', buffer: PNG_1PX })
  const uploadOk = apiCalls.some((c) => c.method === 'POST' && /avatar/i.test(c.url) && c.status < 300)
  await expect
    .poll(() => apiCalls.some((c) => c.method === 'POST' && /avatar/i.test(c.url) && c.status < 300), { timeout: 10_000 })
    .toBe(true)
  await expect(page.getByText('头像已上传，保存后生效')).toBeVisible({ timeout: 5_000 })

  // 降级链：服务端裸 URL 403 → onError → src 回退 blob:
  await expect
    .poll(
      async () => (await page.getByTestId('avatar-preview').getAttribute('src')) ?? '',
      { timeout: 10_000 },
    )
    .toContain('blob:')
  await expect
    .poll(
      async () =>
        page.getByTestId('avatar-preview').evaluate((el) => (el as HTMLImageElement).naturalWidth),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0)
  const natural = await page.getByTestId('avatar-preview').evaluate((el) => (el as HTMLImageElement).naturalWidth)

  await page.screenshot({ path: path.join(EVID, `${TAG}-dialog-blob-fallback.png`) })

  // 不点保存（不改业务数据），取消关闭
  await page.getByRole('button', { name: /取消/ }).first().click().catch(() => {})

  // 证据落盘：API 摘要 + 头像 GET 状态
  fs.writeFileSync(
    path.join(EVID, `_report-${TAG}.json`),
    JSON.stringify({ round: TAG, uploadOk, naturalWidth: natural, apiCalls, avatarGets }, null, 2),
  )
})
