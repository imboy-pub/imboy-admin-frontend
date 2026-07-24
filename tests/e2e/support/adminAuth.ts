import { expect, Page, test } from '@playwright/test'

const FIXED_TEST_CAPTCHA = '1234'

type CredentialKind = 'default' | 'super'

type AdminCredentials = {
  account: string
  password: string
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function getAdminCredentials(kind: CredentialKind = 'default'): AdminCredentials | null {
  if (kind === 'super') {
    const account = readEnv('IMBOY_ADMIN_E2E_SUPER_ACCOUNT') || readEnv('IMBOY_ADMIN_E2E_ACCOUNT')
    const password = readEnv('IMBOY_ADMIN_E2E_SUPER_PASSWORD') || readEnv('IMBOY_ADMIN_E2E_PASSWORD')
    if (!account || !password) return null
    return { account, password }
  }

  const account = readEnv('IMBOY_ADMIN_E2E_ACCOUNT')
  const password = readEnv('IMBOY_ADMIN_E2E_PASSWORD')
  if (!account || !password) return null
  return { account, password }
}

export function requireAdminCredentials(kind: CredentialKind = 'default'): AdminCredentials {
  const credentials = getAdminCredentials(kind)
  if (kind === 'super') {
    test.skip(!credentials, '需要提供 IMBOY_ADMIN_E2E_SUPER_ACCOUNT / IMBOY_ADMIN_E2E_SUPER_PASSWORD，或复用基础账号密码')
  } else {
    test.skip(!credentials, '需要提供 IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD')
  }
  return credentials as AdminCredentials
}

export async function loginAsAdmin(page: Page, credentials: AdminCredentials): Promise<void> {
  await page.goto('/login')

  // exact: 避免命中 aria-label 含「密码/验证码」的辅助按钮（显示密码、刷新验证码）
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
  await expect(page.getByLabel('验证码', { exact: true })).toBeVisible()
  // 验证码图片依赖后端 API，无后端时不可见，不阻塞登录
  await expect(page.getByRole('img', { name: '验证码' })).toBeVisible({ timeout: 3_000 }).catch(() => {})

  await page.getByLabel('账号', { exact: true }).fill(credentials.account)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByLabel('验证码', { exact: true }).fill(FIXED_TEST_CAPTCHA)
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible()
}
