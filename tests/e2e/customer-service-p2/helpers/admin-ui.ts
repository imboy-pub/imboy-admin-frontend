/**
 * P2-E2E-01（A7）：Admin 治理面（平台 Cookie）页面驱动。
 *
 * 真实链路：admin.test/login（SPA 表单，captcha 1234 为 local 合同测试码）→
 * 平台会话 Cookie（adm_user_id/adm_user_sig）→ /customer-service/sessions
 * 平台会话列表（customer_service:read 权限门 + /api/adm 平台面）。
 */
import { expect, type Page } from '@playwright/test'
import { ADMIN, ADMIN_ORIGIN, ORG_ID, WORKSPACE_ID } from './env'

/** SPA 登录表单真实提交（RSA 公钥加密在页面内发生，测试只填表单）。 */
export async function adminLogin(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/login`)
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill(ADMIN.account)
  await page.getByLabel('密码', { exact: true }).fill(ADMIN.password)
  await page.getByLabel('验证码', { exact: true }).fill(ADMIN.captcha)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

/** 打开平台客服会话列表（治理观察面）并锁定 org+workspace 作用域。 */
export async function openPlatformSessions(page: Page, orgId = ORG_ID, workspaceId = WORKSPACE_ID): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/customer-service/sessions`)
  const orgInput = page.locator('#cs-sessions-org')
  const wsInput = page.locator('#cs-sessions-ws')
  await expect(orgInput).toBeVisible({ timeout: 30_000 })
  await orgInput.fill(orgId)
  await wsInput.fill(workspaceId)
}
