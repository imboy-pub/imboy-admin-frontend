/**
 * Bot 运营管理页 E2E / BotListPage E2E Tests
 *
 * 策略（与 ai-agent-manage.spec.ts 一致的混合方案 C）:
 *   - 登录走真实后端（loginAsAdmin，worker 级复用会话）
 *   - 业务接口（/bot/list|detail|disable|enable）与 /rbac/me 通过 page.route() 固定 mock
 *     （rbac/me mock 是为了让 bots:read 权限不依赖后端权限种子版本）
 *
 * 覆盖场景 / Coverage:
 *   1. 列表渲染 + list→items 归一化（后端 legacy list 信封）
 *   2. 详情抽屉：jsonb 能力声明（commands/events/permissions）渲染
 *   3. 停用 → POST /bot/disable 载荷断言 + toast + 列表刷新
 *   4. 启用（已停用行）→ POST /bot/enable
 *
 * 运行 / Run:
 *   bun run test:e2e -- --project=chromium bot-manage
 */

import { expect, test, type Route } from './support/aiAgentTest'

import { requireAdminCredentials } from './support/adminAuth'

// ---------------------------------------------------------------------------
// Mock 数据 / Mock data
// ---------------------------------------------------------------------------

const LIST_ROW_ACTIVE = {
  user_id: '2001',
  name: 'GitHub 通知',
  username: 'github_bot',
  description: 'PR/Issue 通知推送',
  owner_uid: '100',
  nickname: '张三',
  avatar: '',
  is_public: true,
  status: 1,
}

const LIST_ROW_DISABLED = {
  ...LIST_ROW_ACTIVE,
  user_id: '2002',
  name: '天气助手',
  username: 'weather_bot',
  nickname: '李四',
  status: 0,
}

const DETAIL = {
  ...LIST_ROW_ACTIVE,
  webhook_url: 'https://example.com/hook',
  commands: '["/pr","/issue"]',
  permissions: '["send:messages"]',
  events: '["message"]',
  created_at: '2026-08-22 08:00:00',
  updated_at: '2026-08-22 08:00:00',
}

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

const LIST_URL = '**/api/adm/bot/list*'
const DETAIL_URL = '**/api/adm/bot/detail*'
const DISABLE_URL = '**/api/adm/bot/disable*'
const ENABLE_URL = '**/api/adm/bot/enable*'
const RBAC_ME_URL = '**/api/adm/rbac/me*'

test.describe('Bot 管理页 / BotListPage', () => {
  test.beforeEach(async ({ page }) => {
    requireAdminCredentials('super')
    // 权限 mock：PermissionRoute(bots:read) 不依赖后端权限种子版本
    await page.route(RBAC_ME_URL, async (route: Route) => {
      await route.fulfill(
        payloadResponse({
          role_id: '1',
          role_ids: ['1'],
          role_name: 'super_admin',
          permissions: ['bots:read', 'bots:update', 'finance:write'],
          menu_paths: ['/bots'],
        })
      )
    })
  })

  test('列表渲染：legacy list 信封归一化 + 属主列可见', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(
        payloadResponse({ list: [LIST_ROW_ACTIVE, LIST_ROW_DISABLED], page: 1, size: 10, total: 2 })
      )
    })

    await page.goto('/bots')
    await expect(page.getByRole('table').getByText('GitHub 通知')).toBeVisible()
    await expect(page.getByRole('table').getByText('@github_bot')).toBeVisible()
    await expect(page.getByRole('table').getByText('张三')).toBeVisible()
    await expect(page.getByRole('table').getByText('天气助手')).toBeVisible()
  })

  test('详情抽屉：webhook 与 jsonb 能力声明渲染', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(payloadResponse({ list: [LIST_ROW_ACTIVE], page: 1, size: 10, total: 1 }))
    })
    await page.route(DETAIL_URL, async (route: Route) => {
      await route.fulfill(payloadResponse(DETAIL))
    })

    await page.goto('/bots')
    await expect(page.getByRole('table').getByText('GitHub 通知')).toBeVisible()

    await page.getByRole('button', { name: /详情/ }).first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Webhook')).toBeVisible()
    await expect(drawer.getByText('https://example.com/hook')).toBeVisible()
    // commands 解析为数组后的 Badge
    await expect(drawer.getByText('/pr')).toBeVisible()
    await expect(drawer.getByText('/issue')).toBeVisible()
    // 订阅事件 Badge（限定 Badge 内，避免 drawer 其他位置误匹配）
    await expect(drawer.getByText('message', { exact: true })).toBeVisible()
  })

  test('停用：确认后 POST /bot/disable 载荷正确 + 状态刷新', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(payloadResponse({ list: [LIST_ROW_ACTIVE], page: 1, size: 10, total: 1 }))
    })
    let disableBody: Record<string, unknown> | null = null
    await page.route(DISABLE_URL, async (route: Route) => {
      disableBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill(payloadResponse({ user_id: '2001', status: 0 }))
    })

    await page.goto('/bots')
    await expect(page.getByRole('table').getByText('GitHub 通知')).toBeVisible()

    await page.getByRole('button', { name: /停用/ }).first().click()
    await expect(page.getByText(/停用后 @github_bot/)).toBeVisible()
    await page.getByRole('button', { name: /^停用$/ }).click()

    await expect.poll(() => disableBody).toEqual({ bot_id: '2001' })
    await expect(page.getByText('Bot 已停用')).toBeVisible()
  })

  test('启用：已停用行走 POST /bot/enable', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(payloadResponse({ list: [LIST_ROW_DISABLED], page: 1, size: 10, total: 1 }))
    })
    let enableBody: Record<string, unknown> | null = null
    await page.route(ENABLE_URL, async (route: Route) => {
      enableBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill(payloadResponse({ user_id: '2002', status: 1 }))
    })

    await page.goto('/bots')
    await expect(page.getByRole('table').getByText('天气助手')).toBeVisible()

    await page.getByRole('button', { name: /启用/ }).first().click()
    await page.getByRole('button', { name: /^启用$/ }).click()

    await expect.poll(() => enableBody).toEqual({ bot_id: '2002' })
    await expect(page.getByText('Bot 已启用')).toBeVisible()
  })
})
