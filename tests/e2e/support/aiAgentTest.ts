import { expect, test as base, type BrowserContext, type Page, type Route } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin } from './adminAuth'

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>

type WorkerFixtures = {
  aiAgentStorageState: AuthStorageState | null
}

const baseURL = process.env.IMBOY_ADMIN_E2E_BASE_URL || 'http://127.0.0.1:8082'

const E2E_ADMIN = {
  id: 'e2e-admin',
  account: 'e2e-admin',
  nickname: 'E2E 管理员',
  avatar: '',
  role_id: 1,
  status: 1,
  created_at: '',
  updated_at: '',
}

/**
 * AI Agent 相关 E2E 共用一个 worker 级管理员会话。
 * 后端登录接口有登录尝试限流；每个测试重复登录会让业务 E2E 被环境限流掩盖。
 */
export const test = base.extend<Record<never, never>, WorkerFixtures>({
  aiAgentStorageState: [
    async ({ browser }, use) => {
      const credentials = getAdminCredentials('super')
      if (!credentials) {
        await use(null)
        return
      }

      const context = await browser.newContext({ baseURL })
      const loginPage = await context.newPage()
      await loginAsAdmin(loginPage, credentials)
      const storageState = await context.storageState()
      await context.close()
      await use(storageState)
    },
    { scope: 'worker' },
  ],
  page: async ({ browser, aiAgentStorageState }, use) => {
    const context = await browser.newContext({
      baseURL,
      ...(aiAgentStorageState ? { storageState: aiAgentStorageState } : {}),
    })
    await context.route('**/api/adm/current*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, msg: 'ok', payload: E2E_ADMIN }),
      })
    })
    const page = await context.newPage()
    // Playwright fixture callback parameter, not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
    await context.close()
  },
})

export { expect }
export type { Page, Route }
