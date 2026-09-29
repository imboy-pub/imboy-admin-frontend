import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * CS-03 e2e：imboyadmin 客服平台运营面（/customer-service）——真实后端口径。
 *
 * PR-W2-C05 改写说明：本 spec 原断言旧版「客服运营」页（data-page=customer-service-ops、
 * 租户范围 org/ws ID 表单、独立坐席/会话区块）。页面已演进为「在线客服坐席」平台
 * 运营面（data-page=customer-service-home：跨企业坐席键集分页表 + org 过滤 + 统计面板，
 * CustomerServiceHomePage.tsx）；旧标记与表单在 src 中零命中。现按现行合同改写。
 *
 * 覆盖验收点（对齐 CS-03 现行语义）：
 * - 直链门：无 customer_service:read 权限时跳 /forbidden（fail-closed）；
 * - 空态可用：无坐席数据时表格显式空态，不伪装数据；
 * - 页面不出现任何 secret/cipher/object key 字样。
 *
 * 运行前提：imboy 后端实例（登录 + RBAC + /api/adm/customer-service/* 路由），
 * IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD。凭据缺失时本文件全部 skip。
 */
test.describe('客服平台运营面', () => {
  async function openPage(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/customer-service')
    // 直链门：要么有 customer_service:read 权限看到页面本体，要么被挡在 /forbidden
    // 首测冷启动口径：dev server 首次按需编译客服面（含 charts vendor）实测可超
    // 15s，与权限门语义无关；后续测试复用已编译 chunk 不受影响（同文件 #6 实证 1.4s 过）。
    const pageRoot = page.locator('[data-page="customer-service-home"]')
    const forbidden = page.locator('text=无权访问')
    await expect(pageRoot.or(forbidden).first()).toBeVisible({ timeout: 30_000 })
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

    // 页面本体：跨企业坐席表 + org 过滤 + 统计面板
    await expect(page.getByRole('heading', { name: '在线客服坐席', level: 1 })).toBeVisible()
    await expect(page.getByLabel('企业过滤')).toBeVisible()

    // 空态可用：无坐席数据时表格显式空态（cs.home.emptyAll；DataTable 双 DOM 取 first）
    await expect(page.getByText('全部企业的客服坐席').first()).toBeVisible()
    await expect(page.getByText('平台还没有客服坐席').first()).toBeVisible({ timeout: 15_000 })

    // 统计面板：org 过滤缺省「全部企业」→ 显式空态（不伪装数据）
    await expect(page.getByText('统计按企业维度查看')).toBeVisible()

    // A05：页面骨架不携带任何敏感字段「取值」（键值形态：字段名后跟引号/冒号/等号）。
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/(?:secret|cipher|object_key|hmac|presign)["']?\s*[:=]/i)
  })

  test('选择企业后统计面板按 org 维度查询（数据或错误态均可用）', async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    if (!(await openPage(page))) return

    // 组织选项由后端 /api/adm/organizations 提供；取第一个非「全部企业」选项
    const orgFilter = page.getByLabel('企业过滤')
    const optionValue = await orgFilter.locator('option').evaluateAll((nodes) => {
      const hit = nodes.find((node) => node.value && node.value.length > 0)
      return hit ? (hit as HTMLOptionElement).value : ''
    })
    test.skip(optionValue.length === 0, '后端无 active 组织可过滤（种子组织缺失）')

    await orgFilter.selectOption(optionValue)
    // 统计面板离开「全部企业」空态：显示按企业维度的统计卡（数据/无样本均可）
    await expect(page.getByText('统计按企业维度查看')).toHaveCount(0)
  })
})
