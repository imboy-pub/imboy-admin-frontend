/**
 * AI Agent 与角色模板继承 E2E。
 * 登录使用真实管理员会话，角色/助手业务接口使用 route mock，避免依赖模型供应商。
 */

import { expect, test, type Route } from './support/aiAgentTest'

import { requireAdminCredentials } from './support/adminAuth'

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

test.describe('AI Agent 角色继承 / role inheritance', () => {
  test.beforeEach(async () => {
    requireAdminCredentials('super')
  })

  test('创建草稿并显式发布版本', async ({ page }) => {
    const posted: Array<{ url: string; body: Record<string, unknown> }> = []
    await page.route('**/api/adm/ai_agent/role/list*', async (route: Route) => {
      await route.fulfill(
        payloadResponse({ list: [], page: 1, size: 10, total: 0 })
      )
    })
    await page.route('**/api/adm/ai_agent/role/create*', async (route: Route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      posted.push({ url: '/role/create', body })
      await route.fulfill(
        payloadResponse({
          code: body.code,
          name: body.name,
          description: body.description ?? '',
          status: 1,
          active_version: 0,
          bound_agent_count: 0,
        })
      )
    })
    await page.route('**/api/adm/ai_agent/role/draft*', async (route: Route) => {
      posted.push({
        url: '/role/draft',
        body: route.request().postDataJSON() as Record<string, unknown>,
      })
      await route.fulfill(payloadResponse({ version: 1, state: 'draft' }))
    })
    await page.route('**/api/adm/ai_agent/role/publish*', async (route: Route) => {
      posted.push({
        url: '/role/publish',
        body: route.request().postDataJSON() as Record<string, unknown>,
      })
      await route.fulfill(payloadResponse({ version: 1, state: 'published' }))
    })

    await page.goto('/ai-agents/roles')
    await page.getByRole('button', { name: '新建角色' }).click()
    await page.getByTestId('role-id-input').fill('support')
    await page.getByLabel('角色名称').fill('客服助手')
    await page.getByTestId('role-prompt-input').fill('你是客服助手。')
    await page.getByRole('button', { name: '保存草稿' }).click()

    await expect(page.getByRole('button', { name: '发布 v1' })).toBeVisible()
    await page.getByRole('button', { name: '发布 v1' }).click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect
      .poll(() => posted.map((item) => item.url))
      .toEqual(['/role/create', '/role/draft', '/role/publish'])
    expect(posted[1].body).toMatchObject({ role_code: 'support', version: 1 })
    expect(posted[2].body).toEqual({ role_code: 'support', version: 1 })
  })

  test('绑定角色的助手保存时不再提交自由提示词和能力覆盖', async ({ page }) => {
    let updated: Record<string, unknown> | null = null
    await page.route('**/api/adm/ai_agent/role/list*', async (route: Route) => {
      await route.fulfill(
        payloadResponse({
          list: [
            {
              code: 'support',
              name: '客服角色',
              description: '客服',
              status: 1,
              active_version: 1,
              bound_agent_count: 1,
            },
          ],
          page: 1,
          size: 100,
          total: 1,
        })
      )
    })
    await page.route('**/api/adm/ai_agent/list*', async (route: Route) => {
      await route.fulfill(
        payloadResponse({
          list: [
            {
              user_id: '1001',
              nickname: '客服助手',
              avatar: '',
              provider: 'openai',
              model: 'gpt-4o-mini',
              description: '客服',
              visibility: 1,
              status: 1,
              owner_uid: '0',
              category: 'support',
            },
          ],
          page: 1,
          size: 10,
          total: 1,
        })
      )
    })
    await page.route('**/api/adm/ai_agent/detail*', async (route: Route) => {
      await route.fulfill(
        payloadResponse({
          user_id: '1001',
          provider: 'openai',
          model: 'gpt-4o-mini',
          role_id: 'support',
          system_prompt: '旧提示词',
          owner_uid: '0',
          status: 1,
          description: '客服',
          visibility: 1,
          category: 'support',
          voice_id: '',
          greeting: '',
          capabilities: '{}',
          temperature: 0.7,
        })
      )
    })
    await page.route('**/api/adm/ai_agent/update*', async (route: Route) => {
      updated = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill(payloadResponse({ user_id: '1001' }))
    })

    await page.goto('/ai-agents')
    await page.getByRole('button', { name: /编辑/ }).first().click()
    await expect(page.getByTestId('f-role-id')).toHaveValue('support')
    await page.getByRole('button', { name: '保存' }).click()

    await expect.poll(() => updated).not.toBeNull()
    expect(updated).toMatchObject({ user_id: '1001', role_id: 'support' })
    expect(updated).not.toHaveProperty('system_prompt')
    expect(updated).not.toHaveProperty('capabilities')
  })
})
