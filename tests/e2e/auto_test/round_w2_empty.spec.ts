/**
 * W2R1 补充验证：ProjectListPage / WorkspaceListPage 空态（无命中关键字 → 暂无数据）
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

test('W2R1 补充：列表页空态（无命中关键字）', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsAdmin(page, requireAdminCredentials())

  await test.step('projects 空态', async () => {
    await page.goto('/projects')
    await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible()
    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/list') && r.url().includes('keyword=zzz'), { timeout: 15_000 })
    await page.getByPlaceholder('搜索项目名称...').fill('zzz-no-hit-w2r1')
    await page.getByRole('button', { name: '搜索' }).click()
    expect((await resp).status()).toBeLessThan(300)
    // DataTable 桌面+移动双 DOM 空态渲染两份
    await expect(page.getByText('暂无数据').first()).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r1-empty-projects.png' })
  })

  await test.step('wslist 空态', async () => {
    await page.goto('/workspaces')
    await expect(page.getByRole('heading', { name: '工作区管理' })).toBeVisible()
    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes('keyword=zzz'), { timeout: 15_000 })
    await page.getByPlaceholder('搜索工作区名称...').fill('zzz-no-hit-w2r1')
    await page.getByRole('button', { name: '搜索' }).click()
    expect((await resp).status()).toBeLessThan(300)
    await expect(page.getByText('暂无数据').first()).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r1-empty-wslist.png' })
  })
})
