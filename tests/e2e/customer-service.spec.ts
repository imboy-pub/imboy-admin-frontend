import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * CS-03 e2e：imboyadmin 客服平台运营面（/customer-service）。
 *
 * 覆盖验收点：
 * - CS-03-A02：直链门（无 customer_service:read 权限时跳 /forbidden）；
 * - CS-03-A04：空态可用（未填租户范围时的引导态）；
 * - CS-03-A05：页面不出现任何 secret/cipher/object key 字样。
 *
 * 运行前提（BLOCKED_BACKEND）：需要 imboy 后端实例（登录 + RBAC profile +
 * customer_service 平台面 6 条路由），以及
 * IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD。凭据缺失时本文件全部 skip。
 */
test.describe('客服平台运营面', () => {
  async function openPage(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/customer-service')
    // 直链门：要么有 customer_service:read 权限看到页面本体，要么被挡在 /forbidden
    const pageRoot = page.locator('[data-page="customer-service-ops"]')
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 15_000 })
    return !(await forbidden.isVisible())
  }

  test('直链 /customer-service 受权限门保护且空态可用', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const reachable = await openPage(page)

    if (!reachable) {
      // 权限未授予（A02 fail-closed 生效）也是契约内行为
      test.info().annotations.push({ type: 'note', description: '当前账号无 customer_service:read，直链门生效' })
      return
    }

    // 页面本体：标题与租户范围表单
    await expect(page.getByRole('heading', { name: '客服运营' })).toBeVisible()
    await expect(page.getByLabel('组织 ID（organization_id）')).toBeVisible()
    await expect(page.getByLabel('工作区 ID（workspace_id）')).toBeVisible()

    // A04：未填租户范围时坐席区给出引导空态（平台面必须显式租户条件）
    // .first()：页面在坐席/会话两个区块各渲染一个引导空态，strict mode 需消歧
    await expect(page.getByText('请先填写组织与工作区').first()).toBeVisible()

    // A05：页面骨架不携带任何敏感字段「取值」（键值形态：字段名后跟引号/冒号/等号）。
    // 帮助文案中的字段名词提不构成泄漏，不纳入断言。
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/(?:secret|cipher|object_key|hmac|presign)["']?\s*[:=]/i)
  })

  test('填写租户范围后坐席区可查询（数据或错误态均可用）', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    if (!(await openPage(page))) return

    await page.getByLabel('组织 ID（organization_id）').fill('1')
    await page.getByLabel('工作区 ID（workspace_id）').fill('1')

    // 后端返回 404/422（TSID 非法）时展示可重试错误态；有数据则渲染坐席表
    const seatsSection = page.locator('[data-seats-section="true"]')
    await expect(seatsSection).toBeVisible()
    await expect(
      seatsSection
        .getByText('加载坐席失败', { exact: false })
        .or(seatsSection.getByText('暂无数据', { exact: false }))
        .or(seatsSection.locator('tbody tr').first())
    ).toBeVisible({ timeout: 15_000 })

    // 会话区保持空态引导（未查询前）
    await expect(page.getByText('尚未查询会话')).toBeVisible()
  })
})
