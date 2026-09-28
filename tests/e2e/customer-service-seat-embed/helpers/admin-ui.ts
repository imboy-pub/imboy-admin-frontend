/**
 * SC-E2E：Admin 治理面登录驱动（P2 helpers/admin-ui.ts 的参数化副本 ——
 * ADMIN origin/账号取本目录 helpers/env 常量；不为复用而改动 P2 目录）。
 *
 * 真实链路：admin.test/login（SPA 表单，captcha 1234 为 local 合同测试码）→
 * 平台会话 Cookie（adm_user_id/adm_user_sig）→ 治理面路由。
 */
import { expect, type Page } from '@playwright/test'
import { ADMIN, ADMIN_ORIGIN } from './env'

/** SPA 登录表单真实提交（RSA 公钥加密在页面内发生，测试只填表单）。 */
export async function adminLogin(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/login`)
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill(ADMIN.account)
  await page.getByLabel('密码', { exact: true }).fill(ADMIN.password)
  await page.getByLabel('验证码', { exact: true }).fill(ADMIN.captcha)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}
