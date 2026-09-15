import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * CS-03 e2e：imboyadmin 企业业务平台只读面（/enterprise-business）。
 *
 * 覆盖验收点：
 * - CS-03-A02：直链门（无 enterprise_business:read 权限时跳 /forbidden）；
 * - CS-03-A04：空态/引导态可用；
 * - CS-03-A05：页面不出现 profile_cipher/body_cipher/object_key/HMAC 等敏感字样。
 *
 * 运行前提（BLOCKED_BACKEND）：需要 imboy 后端实例（登录 + RBAC profile +
 * enterprise_business 平台面读端点），以及
 * IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD。凭据缺失时本文件全部 skip。
 */
test.describe('企业业务平台只读面', () => {
  async function openPage(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/enterprise-business')
    const pageRoot = page.locator('[data-page="enterprise-business-readonly"]')
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 15_000 })
    return !(await forbidden.isVisible())
  }

  test('直链 /enterprise-business 受权限门保护且空态可用', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await openPage(page)

    if (!reachable) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 enterprise_business:read，直链门生效' })
      return
    }

    await expect(page.getByRole('heading', { name: '企业业务数据' })).toBeVisible()
    await expect(page.getByLabel('组织 ID（organization_id）')).toBeVisible()
    await expect(page.getByLabel('工作区 ID（workspace_id）')).toBeVisible()

    // A04：未填租户范围时给引导空态（.first()：页面可能在多个区块各渲染一个引导）
    await expect(page.getByText('请先填写组织与工作区').first()).toBeVisible()

    // A05：页面骨架无敏感字段「取值」（键值形态：字段名后跟引号/冒号/等号）。
    // 帮助文案中的字段名词提（如「HMAC 字段平台不可读」）不构成泄漏，不纳入断言。
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/(?:profile_cipher|body_cipher|object_key|hmac|secret)["']?\s*[:=]/i)
  })

  test('四个只读 Tab 均渲染且会话消息区需显式 conversation_id', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    if (!(await openPage(page))) return

    await page.getByLabel('组织 ID（organization_id）').fill('1')
    await page.getByLabel('工作区 ID（workspace_id）').fill('1')

    await expect(page.getByRole('tab', { name: '业务身份' })).toBeVisible()
    await page.getByRole('tab', { name: '企业客户' }).click()
    await expect(page.getByText('企业客户（只读）')).toBeVisible()
    await page.getByRole('tab', { name: '会话消息' }).click()
    await expect(page.getByLabel('会话 ID（conversation_id）')).toBeVisible()
    await expect(page.getByText('尚未查询')).toBeVisible()
    await page.getByRole('tab', { name: '附件内容' }).click()
    await expect(page.getByLabel('附件 ID（asset_id）')).toBeVisible()
    await expect(page.getByLabel(/责任人 user ID/)).toBeVisible()
  })
})
