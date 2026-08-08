/**
 * AI 助手管理页 E2E / AiAgentListPage E2E Tests（#18 表单增强 + 头像上传 + 分类筛选）
 *
 * 策略（混合方案 C，与 ai-agent-onboarding.spec.ts 一致）:
 *   - 登录走真实后端（loginAsAdmin）
 *   - 业务接口（/ai_agent/list|detail|update|upload_avatar）通过 page.route() 固定 mock
 *
 * 覆盖场景 / Coverage:
 *   1. 分类筛选 → 请求带 category 且页码重置 1
 *   2. 编辑回显扩展字段 + 保存 → POST /ai_agent/update 载荷断言
 *   3. 头像上传 → POST multipart → 预览 URL 更新
 *
 * 运行 / Run:
 *   bun run test:e2e -- --project=chromium ai-agent-manage
 */

import { expect, test, type Route } from './support/aiAgentTest'

import { requireAdminCredentials } from './support/adminAuth'

// ---------------------------------------------------------------------------
// Mock 数据 / Mock data
// ---------------------------------------------------------------------------

const LIST_ROW = {
  user_id: '1001',
  nickname: '医生助手',
  avatar: '',
  provider: 'bailian',
  model: 'qwen-flash',
  description: '专业医生',
  visibility: 1,
  status: 1,
  owner_uid: '0',
  category: 'medical',
}

const DETAIL = {
  user_id: '1001',
  provider: 'bailian',
  model: 'qwen-flash',
  role_id: 'doctor',
  system_prompt: '你是一名医生',
  owner_uid: '0',
  status: 1,
  description: '专业医生',
  visibility: 1,
  category: 'medical',
  voice_id: 'xiaoyan',
  greeting: '您好，我是您的健康顾问',
  capabilities: '{"knowledge":true,"proactive":false}',
  temperature: 0.7,
}

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

const LIST_URL = '**/api/adm/ai_agent/list*'
const DETAIL_URL = '**/api/adm/ai_agent/detail*'
const UPDATE_URL = '**/api/adm/ai_agent/update*'
const UPLOAD_URL = '**/api/adm/ai_agent/upload_avatar*'
const ROLE_LIST_URL = '**/api/adm/ai_agent/role/list*'

test.describe('AI 助手管理页 / AiAgentListPage', () => {
  test.beforeEach(async ({ page }) => {
    requireAdminCredentials('super')
    await page.route(ROLE_LIST_URL, async (route: Route) => {
      await route.fulfill(
        payloadResponse({
          list: [
            {
              code: 'doctor',
              name: '医生角色',
              description: '医疗助手角色',
              status: 1,
              active_version: 2,
              bound_agent_count: 1,
            },
          ],
          page: 1,
          size: 100,
          total: 1,
        })
      )
    })
  })

  test('分类筛选：请求带 category 且页码重置 1', async ({ page }) => {
    const listRequests: string[] = []
    await page.route(LIST_URL, async (route: Route) => {
      listRequests.push(route.request().url())
      await route.fulfill(
        payloadResponse({ list: [LIST_ROW], page: 1, size: 10, total: 1 })
      )
    })

    await page.goto('/ai-agents')
    await expect(page.getByRole('table').getByText('医生助手')).toBeVisible()

    // 初始请求无 category
    expect(listRequests.length).toBeGreaterThan(0)
    expect(listRequests[listRequests.length - 1]).not.toContain('category=')

    // 输入「medical」
    await page.getByTestId('category-filter').fill('medical')
    await expect
      .poll(() => listRequests[listRequests.length - 1])
      .toContain('category=medical')
    const last = listRequests[listRequests.length - 1]
    expect(last).toContain('page=1')
  })

  test('编辑回显扩展字段，保存 POST 载荷正确', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(
        payloadResponse({ list: [LIST_ROW], page: 1, size: 10, total: 1 })
      )
    })
    await page.route(DETAIL_URL, async (route: Route) => {
      await route.fulfill(payloadResponse(DETAIL))
    })

    let postedBody: Record<string, unknown> | null = null
    await page.route(UPDATE_URL, async (route: Route) => {
      postedBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill(payloadResponse({ user_id: '1001' }))
    })

    await page.goto('/ai-agents')
    await expect(page.getByRole('table').getByText('医生助手')).toBeVisible()

    await page.getByRole('button', { name: /编辑/ }).first().click()
    // 扩展字段回显
    await expect(page.getByTestId('f-category')).toHaveValue('medical')
    await expect(page.getByTestId('f-voice')).toHaveValue('xiaoyan')
    await expect(page.getByTestId('f-greeting')).toHaveValue('您好，我是您的健康顾问')
    await expect(page.getByTestId('f-temperature')).toHaveValue('0.7')
    await expect(page.getByTestId('f-role-id')).toHaveValue('doctor')
    await expect(page.getByTestId('f-capabilities')).toHaveCount(0)

    // 改欢迎语并保存
    await page.getByTestId('f-greeting').fill('新的欢迎语')
    await page.getByRole('button', { name: '保存' }).click()

    await expect.poll(() => postedBody).not.toBeNull()
    expect(postedBody).toMatchObject({
      user_id: '1001',
      category: 'medical',
      voice_id: 'xiaoyan',
      greeting: '新的欢迎语',
      temperature: 0.7,
    })
    expect(postedBody).not.toHaveProperty('system_prompt')
    expect(postedBody).not.toHaveProperty('capabilities')
  })

  test('头像上传：multipart POST 后预览更新', async ({ page }) => {
    await page.route(LIST_URL, async (route: Route) => {
      await route.fulfill(
        payloadResponse({ list: [LIST_ROW], page: 1, size: 10, total: 1 })
      )
    })
    await page.route(DETAIL_URL, async (route: Route) => {
      await route.fulfill(payloadResponse(DETAIL))
    })

    let uploaded = false
    await page.route(UPLOAD_URL, async (route: Route) => {
      // multipart 请求体（postData() 为 binary buffer）
      expect(route.request().postData()).toBeTruthy()
      uploaded = true
      await route.fulfill(payloadResponse({ url: 'https://s3.example.com/new-avatar.png' }))
    })

    await page.goto('/ai-agents')
    await expect(page.getByRole('table').getByText('医生助手')).toBeVisible()

    await page.getByRole('button', { name: /编辑/ }).first().click()
    await expect(page.getByTestId('avatar-input')).toBeAttached()

    // setInputFiles 走真实的文件选择（change 事件），非 fireEvent
    await page.getByTestId('avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('PNGDATA', 'utf-8'),
    })

    await expect.poll(() => uploaded).toBe(true)
    await expect(page.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      /new-avatar\.png/
    )
  })
})
