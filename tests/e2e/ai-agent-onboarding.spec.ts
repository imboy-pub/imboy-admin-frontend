/**
 * 新手引导配置页 E2E / OnboardingConfigPage E2E Tests
 *
 * 策略（混合方案 C，与 group-task.spec.ts 一致）/ Strategy (Hybrid C):
 *   - 登录走真实后端（loginAsAdmin）以获得合法 JWT 与权限上下文
 *   - 业务接口（/ai_agent/onboarding_config）通过 page.route() 固定 mock
 *
 * 覆盖场景 / Coverage:
 *   1. 表单按配置渲染（开关/UID/频道/模板）/ Form renders from config
 *   2. 修改并保存 → POST 载荷断言 + 成功 toast / Save posts patch + toast
 *   3. 加载失败 → ErrorState + 重试恢复 / Error state + retry recovers
 *
 * 前置条件 / Prerequisites:
 *   - IMBOY_ADMIN_E2E_SUPER_ACCOUNT / _PASSWORD（或基础账号 role_id ∈ [1,2]）
 *   - 后端可达 /login（业务端点已 mock，不依赖后端 onboarding 实现）
 *
 * 运行 / Run:
 *   bun run test:e2e -- --project=chromium ai-agent-onboarding
 */

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

// ---------------------------------------------------------------------------
// Mock 数据 / Mock data
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  enabled: true,
  welcome_agent_uid: '513242886082862',
  default_channels: ['1001', '1002'],
  welcome_template: '嗨 {{nickname}}，欢迎来到 imboy！我是 AI 欢迎助手。',
  welcome_llm_enabled: false,
}

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

const CONFIG_URL = '**/api/adm/ai_agent/onboarding_config*'

/** GET 返回固定配置，POST 记录载荷并回显合并结果 */
async function mockConfigEndpoints(
  page: Page,
  posted: Array<Record<string, unknown>>
): Promise<void> {
  await page.route(CONFIG_URL, async (route: Route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      posted.push(body)
      await route.fulfill(payloadResponse({ ...MOCK_CONFIG, ...body }))
      return
    }
    await route.fulfill(payloadResponse(MOCK_CONFIG))
  })
}

test.describe('新手引导配置页 / OnboardingConfigPage', () => {
  test.beforeEach(async ({ page }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
  })

  test('表单按配置渲染开关、UID、频道与模板', async ({ page }) => {
    await mockConfigEndpoints(page, [])
    await page.goto('/ai-agents/onboarding')

    await expect(
      page.getByRole('heading', { name: '新手引导配置' })
    ).toBeVisible()

    // 两个开关：启用新手引导（on）/ LLM 个性化（off）
    const switches = page.getByRole('switch')
    await expect(switches).toHaveCount(2)
    await expect(switches.nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'false')

    await expect(page.getByLabel('欢迎助手 UID')).toHaveValue(
      MOCK_CONFIG.welcome_agent_uid
    )
    await expect(page.getByLabel('默认订阅频道（逗号分隔）')).toHaveValue(
      '1001, 1002'
    )
    await expect(page.getByLabel('欢迎文案模板')).toHaveValue(
      MOCK_CONFIG.welcome_template
    )
  })

  test('修改字段并保存：POST 载荷正确且弹出成功 toast', async ({ page }) => {
    const posted: Array<Record<string, unknown>> = []
    await mockConfigEndpoints(page, posted)
    await page.goto('/ai-agents/onboarding')

    await expect(
      page.getByRole('heading', { name: '新手引导配置' })
    ).toBeVisible()

    await page.getByLabel('欢迎助手 UID').fill('987654321098765')
    await page.getByLabel('默认订阅频道（逗号分隔）').fill('2001, 2002, ')
    await page.getByLabel('欢迎文案模板').fill('你好 {{nickname}}！')
    // 开启 LLM 个性化开关
    await page.getByRole('switch').nth(1).click()

    await page.getByRole('button', { name: '保存配置' }).click()

    await expect(page.getByText('新手引导配置已保存')).toBeVisible()
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({
      enabled: true,
      welcome_agent_uid: '987654321098765',
      // 逗号分隔文本 → 数组，尾逗号/空白被剔除
      default_channels: ['2001', '2002'],
      welcome_template: '你好 {{nickname}}！',
      welcome_llm_enabled: true,
    })
  })

  test('加载失败显示错误态，重试后恢复渲染', async ({ page }) => {
    let failFirst = true
    await page.route(CONFIG_URL, async (route: Route) => {
      if (failFirst && route.request().method() === 'GET') {
        failFirst = false
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 500, msg: 'boom', payload: null }),
        })
        return
      }
      await route.fulfill(payloadResponse(MOCK_CONFIG))
    })

    await page.goto('/ai-agents/onboarding')
    await expect(page.getByText('加载新手引导配置失败')).toBeVisible()

    await page.getByRole('button', { name: /重试|Retry/ }).click()
    await expect(
      page.getByRole('heading', { name: '新手引导配置' })
    ).toBeVisible()
  })
})
