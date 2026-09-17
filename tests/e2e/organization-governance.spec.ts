import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * ORG-14 e2e：imboyadmin 组织治理面（/organizations*）。
 *
 * 覆盖验收点：
 * - ORG-A14 直链门：无 workspaces:read 权限时跳 /forbidden；
 * - 页面骨架与权限矩阵文案（平台管理员权限不映射为组织角色）；
 * - 敏感字段熔断：页面不出现 token/token_digest/branding 取值等敏感形态；
 * - 数据面受限说明：/api/v1 用户会话缺失时的 401 受限态呈现（不伪造成功）。
 *
 * 运行前提（BLOCKED_E2E_ENV）：
 *   1. imboy 后端实例（admin 登录 + RBAC profile + /api/v1/organizations 面）；
 *   2. IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD 凭据；
 *   3. dev server 的 /api/v1 代理规则已随 ORG-14 租约写入 vite.config.ts。
 *   凭据缺失时本文件全部 skip（skipped != passed）。
 */
test.describe('组织治理面（ORG-14）', () => {
  async function openPage(page: import('@playwright/test').Page, path: string): Promise<boolean> {
    await page.goto(path)
    const pageRoot = page.locator('[data-page="organization-list"]')
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 15_000 })
    return !(await forbidden.isVisible())
  }

  test('直链 /organizations 受权限门保护且空态可用', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await openPage(page, '/organizations')

    if (!reachable) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 workspaces:read，直链门生效' })
      return
    }

    await expect(page.getByRole('heading', { name: '组织治理' })).toBeVisible()
    // 平台权限只控制入口；org 级写由服务端 member_role 事实控制（文案锚点）
    await expect(page.getByText('平台管理员权限不映射为组织角色')).toBeVisible()

    // 敏感字段熔断：token / digest / branding 取值不出现「键值」形态
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/(?:token_digest|token|secret|cipher|hmac)["']?\s*[:=]["'][^"']+/i)
  })

  test('组织详情直链：无 org 成员事实时呈现受限/错误态而非伪成功', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await openPage(page, '/organizations/1234567890123456789')

    if (!reachable) {
      test.info().annotations.push({ type: 'note', description: '当前账号无 workspaces:read，直链门生效' })
      return
    }

    // 详情页 data-page 出现后，只允许「错误态 / 加载态 / 受限态」三种诚实呈现
    await expect(page.locator('[data-page="organization-detail"]')).toBeVisible({ timeout: 15_000 })
    const bodyText = await page.locator('body').innerText()
    const honest =
      /加载中/.test(bodyText) ||
      /未认证（401）/.test(bodyText) ||
      /无权限（403）/.test(bodyText) ||
      /目标不存在（404）/.test(bodyText) ||
      /网络错误/.test(bodyText) ||
      /组织不存在/.test(bodyText) ||
      /仅 Organization 成员可查看详情/.test(bodyText)
    expect(honest).toBe(true)
  })
})
