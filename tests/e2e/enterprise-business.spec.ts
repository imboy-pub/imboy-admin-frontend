import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * 企业业务平台只读面（/enterprise-business）真实后端 E2E。
 *
 * PR-W2-C05 改写说明：原 spec 断言旧版「组织 ID / 工作区 ID 手填输入框」租户表单；
 * 页面已演进为 EADM-06 URL codec + OrganizationWorkspacePicker（组合选择器，
 * scope 真源是 URL 的 org/ws 查询参数）。旧 getByLabel('组织 ID（organization_id）')
 * 在 src 中零命中。现按现行合同改写：
 *   - 无 scope 直链 → 显式引导空态「请先填写组织与工作区」；
 *   - URL 携带 org/ws → 高级排障事实域原样回显 + 四只读 Tab 渲染；
 *   - 会话消息/附件 Tab 的显式 ID 前置条件合同不变。
 *
 * 运行前提：imboy 后端实例 + IMBOY_ADMIN_E2E_ACCOUNT / _PASSWORD；
 * scope 用 IMBOY_ADMIN_E2E_EADM_ORG_ID / _WS_ID（seed 脚本落库的 org/ws 对）。
 */
const SCOPE_ORG = process.env.IMBOY_ADMIN_E2E_EADM_ORG_ID?.trim() || ''
const SCOPE_WS = process.env.IMBOY_ADMIN_E2E_EADM_WS_ID?.trim() || ''

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

    // 租户范围组合选择器（scope 真源 = URL org/ws，非手填 ID 输入框）
    await expect(page.getByLabel('选择组织与工作区')).toBeVisible()

    // A04：无 scope 时给引导空态（平台面不存在无租户条件的全局列举）
    await expect(page.getByText('请先填写组织与工作区').first()).toBeVisible()

    // A05：页面骨架无敏感字段「取值」（键值形态：字段名后跟引号/冒号/等号）。
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/(?:profile_cipher|body_cipher|object_key|hmac|secret)["']?\s*[:=]/i)
  })

  test('URL 携带 org/ws 后四个只读 Tab 均渲染且排障事实域回显', async ({ page }) => {
    test.skip(SCOPE_ORG.length === 0 || SCOPE_WS.length === 0, '缺 scope org/ws（IMBOY_ADMIN_E2E_EADM_ORG_ID / _WS_ID，由 seed 脚本提供）')
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    if (!(await openPage(page))) return

    await page.goto(`/enterprise-business?org=${SCOPE_ORG}&ws=${SCOPE_WS}`)
    // scope 就位：高级排障事实域原样回显 URL 的 org/ws（不互换、不重算）
    const probe = page.getByTestId('eb-scope-troubleshooting')
    await expect(probe).toBeVisible({ timeout: 15_000 })
    await expect(probe).toContainText(`org: ${SCOPE_ORG}`)
    await expect(probe).toContainText(`ws: ${SCOPE_WS}`)

    await expect(page.getByRole('tab', { name: '业务身份' })).toBeVisible()
    await page.getByRole('tab', { name: '企业客户' }).click()
    await page.getByRole('tab', { name: '会话消息' }).click()
    await expect(page.getByText('会话 ID（conversation_id）')).toBeVisible()
    await expect(page.getByText('尚未查询').first()).toBeVisible()
    await page.getByRole('tab', { name: '附件内容' }).click()
    await expect(page.getByText('附件 ID（asset_id）')).toBeVisible()
    await expect(page.getByText(/责任人 user ID/)).toBeVisible()
  })
})
