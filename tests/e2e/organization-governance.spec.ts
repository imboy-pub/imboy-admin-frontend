import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * ORG-14 e2e（App 面时代）：imboyadmin 组织治理面（/organizations*）。
 *
 * ⚠️ superseded by admin-organization-governance.spec.ts (wave2)。
 * 本 spec 断言的 /api/v1 App 面（/organizations/mine、member_role 受限态、
 * 「仅 Organization 成员可查看详情」文案）已随 f34be178 迁移到 /api/adm 平台面
 * 而不存在：页面行为、错误语义（401 = 管理会话失效走全局登出，而非 App 面
 * 受限态）均已改变，保留执行只会红。保留文件以存证 ORG-14 验收脉络
 * （openPage pageMarker 参数化教训见下），wave2 新 spec 跑绿后由协调者决定
 * 是否随提交删除。
 */
test.describe.skip('组织治理面（ORG-14）', () => {
  async function openPage(
    page: import('@playwright/test').Page,
    path: string,
    pageMarker = '[data-page="organization-list"]'
  ): Promise<boolean> {
    // pageMarker：目标路由渲染后的页面标记；详情直链传 organization-detail
    // （首次真实执行时发现助手写死列表页标记，详情路由永远等不到——spec 笔误）。
    await page.goto(path)
    const pageRoot = page.locator(pageMarker)
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
    const reachable = await openPage(page, '/organizations/1234567890123456789', '[data-page="organization-detail"]')

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
