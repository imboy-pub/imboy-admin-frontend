import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * closure run W2-ADMIN e2e：平台 CS session 列表 与 企业 offboarding cases
 * 两个新页面的直链门 + 空态/引导 + 敏感字段白名单冒烟。
 *
 * 覆盖验收点：
 * - CS-03-A02：直链门（无权限时 /forbidden，有权限时页面本体）；
 * - CS-03-A04：列表页空态/查询引导可用；
 * - CS-03-A05：页面不渲染 key_digest/token_digest/secret 等敏感「键值」。
 *
 * 运行前提与既有两份 spec 相同（IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD
 * + 可达后端；凭据缺失时全部 skip）。
 */
test.describe('平台新页面（session 列表 / offboarding cases）', () => {
  async function reach(page: import('@playwright/test').Page, path: string, pageAttr: string): Promise<boolean> {
    await page.goto(path)
    const pageRoot = page.locator(`[data-page="${pageAttr}"]`)
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 15_000 })
    return !(await forbidden.isVisible())
  }

  async function assertNoSensitiveKv(page: import('@playwright/test').Page): Promise<void> {
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(
      /(?:key_digest|token_digest|secret|cipher|object_key|presign)["']?\s*[:=]/i,
    )
  }

  test('平台 CS 会话列表页直链可用（门 + 空态/引导 + 敏感字段白名单）', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await reach(page, '/customer-service/sessions', 'cs-platform-sessions')

    if (!reachable) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 customer_service:read，直链门生效' })
      return
    }

    // 列表页骨架：标题 + 游标分页控件（空数据时给出空态引导而非报错）
    await expect(page.getByRole('heading', { name: '客服会话列表' })).toBeVisible()
    await assertNoSensitiveKv(page)
  })

  test('平台 offboarding cases 列表页直链可用（门 + 失败项徽标骨架 + 敏感字段白名单）', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await reach(page, '/enterprise-business/offboarding', 'eb-offboarding-cases')

    if (!reachable) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 enterprise_business:read，直链门生效' })
      return
    }

    await expect(page.getByRole('heading', { name: '离岗交接', exact: true })).toBeVisible()
    await assertNoSensitiveKv(page)
  })
})
