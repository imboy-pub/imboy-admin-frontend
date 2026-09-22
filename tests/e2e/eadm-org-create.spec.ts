import { expect, type APIRequestContext, type Locator, type Page, type Request, type Response, test } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * EADM-07 · 计划 §9 第 3 条：创建 Organization **只能选 active Human**（Owner 经用户
 * 搜索选择，禁止手填裸 TSID）；创建成功后详情显示 Owner 与默认 Workspace。
 *
 * 冻结合同（CONTRACTS.md C2）：
 *   POST /api/adm/organizations
 *   请求体**严格三键**：{ name, owner_user_id (<active Human TSID string>), default_workspace_name }
 *   响应投影：organization{id,name,owner_id,status} + default_workspace{id,name,status} + created
 *   owner 用户不存在 / 非 active / 非 human → 4xx fail-closed（前端不得放宽，仅提示）。
 *
 * skip 约定（沿用本仓 admin-rbac.spec.ts 既有模式，不假装通过）：
 *   - **收集期凭据门**（同步，describe 级 test.skip）：缺 super_admin 凭据即整组 skip，
 *     不需要启动浏览器——否则「无凭据」会先撞 browserType.launch 硬失败（本环境实证）；
 *   - 体内仍用 requireAdminCredentials（同一 helper、同一 skip 语义，沿用既有约定）；
 *   - admin 前端(:8082) / imboy 后端(:9800) 任一不可达时显式 test.skip（环境阻塞）。
 * 严禁把 cookie/token/secret/手机号/邮箱写入文件或报告；断言只针对行为
 * （选择器形态 / 只读属性 / 摘要文案 / 请求体键值 / 详情事实域 / URL 上下文）。
 *
 * 已知实现缺口（已回报 A0，本卡不代修业务代码，见 RESULT-W2.defects_found）：
 *   组织详情页 `OrganizationDetailPage` 事实域只渲染「Workspace 数」（计数），
 *   不渲染默认 Workspace 的身份/指针（该面板已随 App 面迁移移除，文件头注释有述）。
 *   故 §9-3「成功后详情显示默认 Workspace」目前只在**创建对话框的确认摘要**与
 *   **详情 URL 的 `ws` 上下文件**两个行为位上被验证，详情页正文事实域无该项。
 */

async function probeFrontend(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get('/', { timeout: 5_000 })
    return res.status() < 500
  } catch {
    return false
  }
}

async function probeBackend(request: APIRequestContext): Promise<boolean> {
  const base = (process.env.IMBOY_ADMIN_BASE_URL || 'http://127.0.0.1:9800/api/adm').replace(/\/$/, '')
  try {
    const res = await request.get(`${base}/admin/config/sidebar`, { timeout: 5_000 })
    return res.status() < 500
  } catch {
    return false
  }
}

const CREATE_ORG_URL_RE = /\/api\/adm\/organizations$/

/** 运行期唯一名（避免与既有 seed 组织撞名触发 created=false 幂等分支，掩盖创建分支）。 */
function buildRunScopedName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`
}

/** Owner 搜索关键词：由运行环境提供（默认取宽泛关键词，命中即用第一个 active 用户）。 */
const OWNER_SEARCH_KEYWORD =
  process.env.IMBOY_ADMIN_E2E_OWNER_SEARCH_KEYWORD?.trim() || 'e2e'

/** 事实域取值定位：FactRow 渲染为 <dt>label</dt><dd>value</dd>（相邻兄弟）。 */
function factValue(page: Page, label: string): Locator {
  return page.locator(`dt:text-is("${label}") + dd`)
}

/**
 * 收集期凭据门（同步）：缺 super_admin 凭据即整组 skip。
 * 必须放在 describe 内、test 外——否则 page fixture 会先启动浏览器，
 * 「无凭据」将表现为 browserType.launch 硬失败而非 skip（本环境实证，见 RESULT-W2）。
 */
const SUPER_CREDENTIALS_HINT =
  '需要 super_admin 凭据（IMBOY_ADMIN_E2E_SUPER_ACCOUNT/_PASSWORD 或 IMBOY_ADMIN_E2E_ACCOUNT/_PASSWORD）；缺凭据在收集期即 skip，不启动浏览器'

test.describe('EADM-07 §9-3 · 创建 Organization 仅能从 active Human 选择器', () => {
  test.skip(!getAdminCredentials('super'), SUPER_CREDENTIALS_HINT)

  test('§9-3 Owner 经用户搜索选定 active Human；请求体三键合同；成功后详情显示 Owner 且默认 Workspace 上下文落地', async ({ page, request }) => {
    const credentials = requireAdminCredentials('super')
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞：需 Vite dev server）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞：需本地后端监听，或 .env.e2e 提供 IMBOY_ADMIN_BASE_URL）')

    const orgName = buildRunScopedName('eadm-org')
    const wsName = `${orgName}-ws`

    await loginAsAdmin(page, credentials)
    await page.goto('/organizations')

    // 行为断言 1：组织治理列表页可达（organizations:read 门内）。
    await expect(page.locator('[data-page="organization-list"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '组织治理' })).toBeVisible()

    // 行为断言 2：存在创建入口（organizations:write），点击后打开创建对话框。
    await page.getByTestId('org-create-entry').click()
    const dialog = page.getByTestId('org-create-dialog')
    await expect(dialog, '应打开创建组织对话框').toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByText('创建组织', { exact: true })).toBeVisible()

    // 行为断言 3（核心）：Owner 必须是**用户搜索选择器**，而不是可手填 TSID 的裸输入框。
    const ownerSearch = page.getByTestId('owner-search-input')
    await expect(ownerSearch, 'Owner 应经用户搜索选择（计划 §4.3 禁止手填裸 TSID）').toBeVisible()
    await expect(ownerSearch).toHaveAttribute('placeholder', '按账号 / 昵称搜索用户')

    await ownerSearch.fill(OWNER_SEARCH_KEYWORD)
    // 搜索是**显式触发**的（输入框只在 Enter 时调 runOwnerSearch，另有「搜索」按钮；
    // 没有 onChange 自动查询）⇒ 只 fill 不触发，结果区永远不会出现。
    await ownerSearch.press('Enter')

    // 行为断言 4：搜索结果里只把 active 用户做成可选项（非 active 项被 disabled）。
    const ownerOptions = page.getByTestId('owner-option')
    await expect(ownerOptions.first(), '用户搜索应返回候选用户').toBeVisible({ timeout: 15_000 })

    const activeOption = ownerOptions.filter({ hasText: 'active' }).first()
    await expect(activeOption, '应存在可选的 active 用户（本轮 seed 需含 active Human）').toBeVisible()
    await expect(activeOption, 'active 用户必须可选（非 active 项才 disabled）').toBeEnabled()
    await activeOption.click()

    // 行为断言 5：选中后进入「已选 Owner」形态；其 TSID 只以 **readOnly** 输入展示，
    // 证明正常流程无法手填/改写 Owner TSID。
    const ownerSelected = page.getByTestId('owner-selected')
    await expect(ownerSelected).toBeVisible()
    // Owner TSID 只在「已选 Owner」块内的**折叠**排障区里展示（<details> 默认收起）
    // ⇒ 先展开，再断言其只读形态；断言内容不变，只是把 UI 走到那个状态。
    await ownerSelected.getByText('高级排障（只读）：Owner TSID').click()
    const ownerTsidInput = page.getByTestId('owner-tsid-readonly')
    await expect(ownerTsidInput, 'Owner TSID 仅只读展示').toBeVisible()
    expect(
      await ownerTsidInput.getAttribute('readonly'),
      'Owner TSID 输入必须带 readonly（禁止手填）',
    ).not.toBeNull()

    const ownerTsid = (await ownerTsidInput.inputValue()).trim()
    expect(ownerTsid.length, 'Owner TSID 不得为空').toBeGreaterThan(0)
    expect(/^[A-Za-z0-9_-]{1,64}$/.test(ownerTsid), `Owner TSID 形态非法：${ownerTsid}`).toBe(true)

    // 行为断言 6：组织名 / 默认 Workspace 名称填写。
    await page.getByTestId('org-create-name').fill(orgName)
    await page.getByTestId('org-create-ws').fill(wsName)

    // 行为断言 7：提交前展示「Organization / Owner / 默认 Workspace」摘要并二次确认。
    await page.getByTestId('org-create-next').click()
    const summary = page.getByTestId('create-summary')
    await expect(summary, '提交前应展示创建摘要（二次确认）').toBeVisible({ timeout: 15_000 })
    await expect(summary, '摘要应含组织名').toContainText(orgName)
    await expect(summary, '摘要应含默认 Workspace').toContainText(wsName)
    await expect(summary, '摘要应含 Owner 事实').toContainText(ownerTsid)

    // 捕获真实发出的创建请求（不拦截，让后端真实处理）。
    const requestBodies: Array<Record<string, unknown>> = []
    const onRequest = (req: Request): void => {
      if (req.method() === 'POST' && CREATE_ORG_URL_RE.test(req.url())) {
        const data = req.postDataJSON() as Record<string, unknown> | null
        if (data) requestBodies.push(data)
      }
    }
    page.on('request', onRequest)

    // 收集创建响应投影（用于把详情 URL 的 org/ws 与后端返回的 id 对齐）。
    let createdOrgId: string | null = null
    let createdDefaultWsId: string | null = null
    const onResponse = (res: Response): void => {
      if (res.request().method() !== 'POST' || !CREATE_ORG_URL_RE.test(res.url())) return
      void (async () => {
        try {
          // admin API 一律走统一信封（elib_response:success）⇒ 业务投影在
          // `.payload` 里；直接读顶层会恒为 undefined，让后续 expect.poll 超时。
          const raw = (await res.json()) as Record<string, unknown>
          const payload = (raw['payload'] ?? raw) as Record<string, unknown>
          const org = payload['organization'] as Record<string, unknown> | null
          const ws = payload['default_workspace'] as Record<string, unknown> | null
          const orgId = org?.['id']
          const wsId = ws?.['id']
          if (typeof orgId === 'string') createdOrgId = orgId
          if (typeof wsId === 'string') createdDefaultWsId = wsId
        } catch {
          // 响应非 JSON 时不在此处报错：由后续 expect.poll 超时暴露真实原因。
        }
      })()
    }
    page.on('response', onResponse)

    await page.getByTestId('org-create-confirm').click()

    // 行为断言 8：请求体 = 严格三键合同，owner_user_id 即选择器选中的 TSID。
    await expect.poll(() => requestBodies.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const body = requestBodies[0] as Record<string, unknown>
    expect(
      Object.keys(body).sort(),
      '创建请求体必须严格三键（C2 冻结合同）',
    ).toEqual(['default_workspace_name', 'name', 'owner_user_id'])
    expect(body['name'], 'name 应为本次运行期唯一组织名').toBe(orgName)
    expect(body['owner_user_id'], 'owner_user_id 应等于选择器选中的 active 用户 TSID').toBe(ownerTsid)
    expect(typeof body['owner_user_id'], 'owner_user_id 必须是 TSID string（不得裸 number）').toBe('string')
    expect(body['default_workspace_name'], 'default_workspace_name 应为填写的默认工作区名').toBe(wsName)

    // 行为断言 9：创建成功 → 跳转组织详情页（路由携带 org/ws 上下文）。
    await page.waitForURL(/\/organizations\/[^/?#]+/, { timeout: 20_000 })
    await expect(page.locator('[data-page="organization-detail"]')).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: `组织：${orgName}` }),
      '详情页标题应含本次创建的组织名（证明打开的是新建组织，而非幂等命中的旧组织）',
    ).toBeVisible({ timeout: 15_000 })

    const detailUrl = new URL(page.url())
    const orgIdFromUrl = decodeURIComponent(detailUrl.pathname.replace(/^\/organizations\//, ''))
    expect(orgIdFromUrl, '详情路由 id 不得为空').not.toBe('')

    // 行为断言 10（§9-3 后半）：详情事实域显示 Owner，且与选择器选中的 TSID 一致。
    await expect(factValue(page, 'Owner（owner_id）'), '详情应显示 Owner 的 owner_id').toHaveText(ownerTsid)

    // 行为断言 11：详情 URL 的 org/ws 上下文与后端创建响应投影一致
    //（ws 即本次创建的 default workspace id → 默认 Workspace 随组织落地并进入上下文）。
    await expect.poll(() => createdOrgId, { timeout: 15_000 }).not.toBeNull()
    await expect.poll(() => createdDefaultWsId, { timeout: 15_000 }).not.toBeNull()
    expect(orgIdFromUrl, '详情 URL 的 org 应等于创建响应的 organization.id').toBe(createdOrgId)
    expect(
      detailUrl.searchParams.get('org'),
      '详情 URL 的 org 应等于创建响应的 organization.id',
    ).toBe(createdOrgId)
    expect(
      detailUrl.searchParams.get('ws'),
      '详情 URL 的 ws 应等于创建响应的 default_workspace.id（默认 Workspace 上下文落地）',
    ).toBe(createdDefaultWsId)
  })
})
