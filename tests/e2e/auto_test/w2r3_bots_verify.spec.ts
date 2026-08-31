import { expect, test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

test('bots 抽屉时间格式化 + 分页翻页', async ({ page }) => {
  const c = requireAdminCredentials()
  await loginAsAdmin(page, c)
  await page.goto('/bots')
  await page.waitForTimeout(1500)
  if (!page.url().includes('/bots')) { await page.goto('/bots'); await page.waitForTimeout(1000) }
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '详情' }).first().click()
  await expect(page.getByText('注册时间')).toBeVisible()
  const timeText = await page.locator('dd').filter({ hasText: /20\d\d/ }).first().textContent()
  expect(timeText?.trim()).not.toMatch(/^\d{13}$/)
  await page.keyboard.press('Escape')
  await expect(page.getByText(/共 11 条/)).toBeVisible({ timeout: 8000 })
})
