import { expect, Page, test } from '@playwright/test'

export const FIXED_TEST_CAPTCHA = '1234'

type CredentialKind = 'default' | 'super'

export type AdminCredentials = {
  account: string
  password: string
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

export function getAdminCredentials(kind: CredentialKind = 'default'): AdminCredentials | null {
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

export function requireChannelId(): string {
  const channelId = readEnv('IMBOY_ADMIN_E2E_CHANNEL_ID')
  test.skip(!channelId, '需要提供 IMBOY_ADMIN_E2E_CHANNEL_ID 才能执行频道消息治理 E2E')
  return channelId as string
}

export async function loginAsAdmin(page: Page, credentials: AdminCredentials): Promise<void> {
  await page.goto('/login')

  await expect(page.getByLabel('账号')).toBeVisible()
  await expect(page.getByLabel('密码')).toBeVisible()
  await expect(page.getByLabel('验证码')).toBeVisible()
  await expect(page.getByRole('img', { name: '验证码' })).toBeVisible()

  await page.getByLabel('账号').fill(credentials.account)
  await page.getByLabel('密码').fill(credentials.password)
  await page.getByLabel('验证码').fill(FIXED_TEST_CAPTCHA)
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible()
}
