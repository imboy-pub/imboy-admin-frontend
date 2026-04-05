import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

test('管理员可以通过浏览器登录并进入仪表盘', async ({ page }) => {
  const credentials = requireAdminCredentials()

  await loginAsAdmin(page, credentials)

  await expect(page.getByText('验证登录状态...')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible()
})
