/**
 * 用户管理页面 E2E 测试 / User Management Page E2E Tests
 *
 * 覆盖场景 / Covered scenarios:
 * - 用户列表加载与分页 / User list load & pagination
 * - 关键词搜索 / Keyword search
 * - 用户详情查看 / User detail view
 * - 冻结/解冻操作入口可见 / Freeze/unfreeze action visibility
 */

import { expect, test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

test.describe('用户管理 / User Management', () => {
  test.beforeEach(async ({ page }) => {
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  })

  test('用户列表正常加载并显示表格 / user list renders table', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('columnheader', { name: /用户|账号|UID/i })).toBeVisible()
  })

  test('关键词搜索缩小结果 / keyword search filters results', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/搜索|Search/i).first()
    await expect(searchInput).toBeVisible()

    const initialCount = await page.locator('table tbody tr').count()

    await searchInput.fill('test')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    const filteredCount = await page.locator('table tbody tr').count()
    const hasEmpty = await page.getByText(/暂无数据|No data|未找到/i).isVisible()
    expect(hasEmpty || filteredCount <= initialCount).toBeTruthy()

    await searchInput.clear()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
  })

  test('分页控件正常工作 / pagination controls work', async ({ page }) => {
    const pagination = page
      .locator('[aria-label*="分页"], [class*="pagination"], nav')
      .first()
    await expect(pagination).toBeVisible()

    const nextBtn = page.getByRole('button', { name: /下一页|Next/i })
    if (await nextBtn.isEnabled()) {
      const firstRowBefore = await page.locator('table tbody tr').first().innerText()
      await nextBtn.click()
      await page.waitForTimeout(400)
      const firstRowAfter = await page.locator('table tbody tr').first().innerText()
      expect(firstRowAfter).not.toBe(firstRowBefore)
    }
  })

  test('点击用户行可查看详情 / clicking user row opens detail', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible()

    const detailBtn = firstRow.getByRole('button', { name: /详情|查看|View/i })
    if (await detailBtn.isVisible()) {
      await detailBtn.click()
    } else {
      await firstRow.click()
    }

    const detailPanel = page
      .getByRole('dialog')
      .or(page.getByText(/用户详情|User Detail/i))
    await expect(detailPanel.first()).toBeVisible({ timeout: 5_000 })
  })

  test('操作列包含冻结/解冻入口 / action column has freeze toggle', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible()

    const freezeBtn = firstRow.getByRole('button', { name: /冻结|Freeze|封禁/i })
    const unfreezeBtn = firstRow.getByRole('button', { name: /解冻|Unfreeze|解封/i })

    const hasFreeze = await freezeBtn.isVisible()
    const hasUnfreeze = await unfreezeBtn.isVisible()

    if (!hasFreeze && !hasUnfreeze) {
      const menuTrigger = firstRow
        .locator('[aria-haspopup="menu"], [data-radix-collection-item]')
        .first()
      if (await menuTrigger.isVisible()) {
        await menuTrigger.click()
        await expect(
          page.getByRole('menuitem', { name: /冻结|Freeze|解冻|Unfreeze/i }).first(),
        ).toBeVisible({ timeout: 3_000 })
        return
      }
    }

    expect(hasFreeze || hasUnfreeze).toBeTruthy()
  })
})
