/**
 * AI 角色模板管理页 E2E。
 * 角色页使用版本化 role API；legacy ai_roles KV 仅由单元测试覆盖兼容回退。
 */

import { expect, test, type Page, type Route } from './support/aiAgentTest'

import { requireAdminCredentials } from './support/adminAuth'

type Role = {
  code: string
  name: string
  description: string
  status: 0 | 1
  active_version: number
  bound_agent_count: number
}

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

function createRoles(): Role[] {
  return [
    {
      code: 'doctor',
      name: '医生角色',
      description: '医疗助手角色',
      status: 1,
      active_version: 2,
      bound_agent_count: 1,
    },
    {
      code: 'lawyer',
      name: '律师角色',
      description: '法律助手角色',
      status: 1,
      active_version: 1,
      bound_agent_count: 0,
    },
  ]
}

async function mockRoleEndpoints(
  page: Page,
  roles: Role[],
  posted: Array<{ url: string; body: Record<string, unknown> }>
): Promise<void> {
  await page.route('**/api/adm/ai_agent/role/list*', async (route: Route) => {
    await route.fulfill(
      payloadResponse({ list: roles, page: 1, size: 10, total: roles.length })
    )
  })
  await page.route('**/api/adm/ai_agent/role/create*', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    posted.push({ url: '/role/create', body })
    const role: Role = {
      code: String(body.code),
      name: String(body.name),
      description: String(body.description ?? ''),
      status: 1,
      active_version: 0,
      bound_agent_count: 0,
    }
    roles.push(role)
    await route.fulfill(payloadResponse(role))
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
  await page.route('**/api/adm/ai_agent/role/set_status*', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    posted.push({ url: '/role/set_status', body })
    const role = roles.find((item) => item.code === String(body.role_code))
    if (role) role.status = Number(body.status) as 0 | 1
    await route.fulfill(payloadResponse({ role_code: body.role_code, status: body.status }))
  })
}

test.describe('AI 角色管理页 / AiRolesPage', () => {
  test.beforeEach(async () => {
    requireAdminCredentials('super')
  })

  test('渲染分页角色列表', async ({ page }) => {
    const roles = createRoles()
    await mockRoleEndpoints(page, roles, [])

    await page.goto('/ai-agents/roles')
    await expect(page.getByRole('table').getByText('医生角色').first()).toBeVisible()
    await expect(page.getByRole('table').getByText('律师角色').first()).toBeVisible()
    await expect(page.getByTestId('role-status-filter')).toHaveValue('')
  })

  test('新建角色：保存草稿后显式发布版本', async ({ page }) => {
    const roles = createRoles()
    const posted: Array<{ url: string; body: Record<string, unknown> }> = []
    await mockRoleEndpoints(page, roles, posted)

    await page.goto('/ai-agents/roles')
    await page.getByRole('button', { name: '新建角色' }).click()
    await page.getByTestId('role-id-input').fill('teacher')
    await page.getByLabel('角色名称').fill('教师角色')
    await page.getByTestId('role-prompt-input').fill('你是一名教师。')
    await page.getByRole('button', { name: '保存草稿' }).click()

    await expect(page.getByRole('button', { name: '发布 v1' })).toBeVisible()
    await page.getByRole('button', { name: '发布 v1' }).click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect.poll(() => posted.map((item) => item.url)).toEqual([
      '/role/create',
      '/role/draft',
      '/role/publish',
    ])
    expect(posted[1].body).toMatchObject({ role_code: 'teacher', version: 1 })
    expect(posted[2].body).toEqual({ role_code: 'teacher', version: 1 })
  })

  test('停用角色：确认后提交版本化状态变更', async ({ page }) => {
    const roles = createRoles()
    const posted: Array<{ url: string; body: Record<string, unknown> }> = []
    await mockRoleEndpoints(page, roles, posted)

    await page.goto('/ai-agents/roles')
    await expect(page.getByRole('table').getByText('医生角色').first()).toBeVisible()
    await page.getByRole('button', { name: '停用' }).first().click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toEqual({
      url: '/role/set_status',
      body: { role_code: 'doctor', status: 0 },
    })
  })
})
