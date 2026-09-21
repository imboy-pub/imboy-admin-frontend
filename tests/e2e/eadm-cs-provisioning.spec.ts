import { expect, type APIRequestContext, type Request, test } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * EADM-07 · 计划 §9 第 4 条：从组织上下文进入客服开通，选择**两个 active member**，
 * 断言发送的请求含正确的 `user_id` / `display_name`、`workspace_id` 来自 URL 的 `ws`
 * 参数，且**不含 `business_identity_id`**（§4.4 冻结合同；A5 修正的契约漂移根因）。
 *
 * 冻结请求合同（CONTRACTS.md C3 / api-surface-freeze.json admin_provisioning）：
 *   POST /api/adm/customer-service/organizations/:org_id/provisioning
 *   body 严格白名单四键：{ workspace_id, user_id, display_name, max_concurrent }
 *   - workspace_id = URL 的 `ws`（绝不以组织 TSID 充当工作区）；
 *   - user_id = 该 org 的 active Human member（UI 必须过滤非 active）；
 *   - display_name = 成员昵称或账号（非空）；
 *   - max_concurrent = 数值，合法域 1..20；
 *   - **禁止**发送 business_identity_id（后端以 user_id 派生 identity）。
 *
 * skip 约定（沿用本仓 admin-rbac.spec.ts 既有模式，不假装通过）：
 *   - **收集期凭据门**（同步，describe 级 test.skip）：缺 super_admin 凭据即整组 skip，
 *     不需要启动浏览器——否则「无凭据」会先撞 browserType.launch 硬失败（本环境实证）；
 *   - 体内仍用 requireAdminCredentials（同一 helper、同一 skip 语义，沿用既有约定）；
 *   - admin 前端(:8082) / imboy 后端(:9800) 任一不可达时显式 test.skip（环境阻塞）。
 * 严禁把 cookie/token/secret/手机号/邮箱写入文件或报告；断言只针对行为
 * （页面 data-page 标记 / 选择器选项值 / 请求体键值与取值 / URL 查询参数）。
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

const PROVISIONING_URL_RE = /\/api\/adm\/customer-service\/organizations\/[^/]+\/provisioning$/

/** 冻结白名单键（C3）；顺序无关的集合比对。 */
const PROVISIONING_BODY_KEYS = ['display_name', 'max_concurrent', 'user_id', 'workspace_id']

const MAX_CONCURRENT_MIN = 1
const MAX_CONCURRENT_MAX = 20

/** 形态合法的 TSID（仅作为 URL 上下文，不对应任何真实实体）。 */
const ORG_TSID = '1234567890123456789'
const WS_TSID = '1234567890123456788'

/** 需要开通的坐席数（§9-4 明确要求「选两个 active member」）。 */
const REQUIRED_MEMBER_COUNT = 2

type MemberOption = { value: string; label: string }

/**
 * 收集期凭据门（同步）：缺 super_admin 凭据即整组 skip。
 * 必须放在 describe 内、test 外——否则 page fixture 会先启动浏览器，
 * 「无凭据」将表现为 browserType.launch 硬失败而非 skip（本环境实证，见 RESULT-W2）。
 */
const SUPER_CREDENTIALS_HINT =
  '需要 super_admin 凭据（IMBOY_ADMIN_E2E_SUPER_ACCOUNT/_PASSWORD 或 IMBOY_ADMIN_E2E_ACCOUNT/_PASSWORD）；缺凭据在收集期即 skip，不启动浏览器'

test.describe('EADM-07 §9-4 · 客服开通请求合同（user_id + display_name；无 business_identity_id）', () => {
  test.skip(!getAdminCredentials('super'), SUPER_CREDENTIALS_HINT)

  test('§9-4 依次开通两个 active member：请求体四键白名单、user_id/display_name 取自成员选择器、workspace_id 来自 ws、不含 business_identity_id', async ({ page, request }) => {
    const credentials = requireAdminCredentials('super')
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞：需 Vite dev server）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞：需本地后端监听，或 .env.e2e 提供 IMBOY_ADMIN_BASE_URL）')

    await loginAsAdmin(page, credentials)

    // 从组织/工作区上下文进入开通向导（org/ws 由共享选择器写入 URL，URL 是上下文真源）。
    await page.goto(`/customer-service/provisioning?org=${ORG_TSID}&ws=${WS_TSID}`)

    // 行为断言 1：向导页面本体渲染（非空白/非报错页）。
    await expect(page.locator('[data-page="cs-provisioning-wizard"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '客服开通向导' })).toBeVisible()

    // 行为断言 2：URL 上下文未被向导改写（org/ws 仍是进入时的值）。
    const wizardUrl = new URL(page.url())
    expect(wizardUrl.searchParams.get('org'), '向导不得丢失 org 上下文').toBe(ORG_TSID)
    expect(wizardUrl.searchParams.get('ws'), '向导不得丢失 ws 上下文').toBe(WS_TSID)

    // 行为断言 3：成员选择器呈现，且候选成员 ≥ 2（否则无法验证「两个 active member」）。
    const memberSelect = page.getByTestId('cs-provision-member-select')
    await expect(memberSelect, '应渲染成员选择器（org 上下文已就绪 ⇒ 直接进入开通步骤）').toBeVisible({ timeout: 20_000 })

    const memberOptions = await memberSelect.locator('option').evaluateAll((nodes): MemberOption[] =>
      nodes
        .map((node) => node as HTMLOptionElement)
        .filter((option) => option.value !== '')
        .map((option) => ({ value: option.value, label: (option.textContent ?? '').trim() })),
    )
    expect(
      memberOptions.length,
      `需至少 ${REQUIRED_MEMBER_COUNT} 个 active member 才能验证多坐席开通（本轮 seed 需提供）`,
    ).toBeGreaterThanOrEqual(REQUIRED_MEMBER_COUNT)

    // 捕获真实发出的开通请求（不拦截，让后端真实处理）。
    const captured: Array<Record<string, unknown>> = []
    const onRequest = (req: Request): void => {
      if (req.method() === 'POST' && PROVISIONING_URL_RE.test(req.url())) {
        const data = req.postDataJSON() as Record<string, unknown> | null
        if (data) captured.push(data)
      }
    }
    page.on('request', onRequest)

    const submit = page.getByTestId('cs-provision-submit')
    const provisionedUserIds: string[] = []

    for (let index = 0; index < REQUIRED_MEMBER_COUNT; index += 1) {
      const member = memberOptions[index] as MemberOption

      // 行为断言 4：选中该成员后提交按钮可用（memberId 非空 ⇒ 允许提交）。
      await memberSelect.selectOption(member.value)
      await expect(submit, `选择成员 ${index + 1} 后应可提交`).toBeEnabled({ timeout: 15_000 })
      await submit.click()

      // 行为断言 5：真实发出了第 index+1 个开通请求。
      await expect.poll(() => captured.length, { timeout: 25_000 }).toBeGreaterThan(index)
      const body = captured[index] as Record<string, unknown>

      // 行为断言 6：body 是冻结合同的四键白名单（多一键少一键都算契约漂移）。
      expect(
        Object.keys(body).sort(),
        '开通请求体必须是 C3 冻结的四键白名单',
      ).toEqual(PROVISIONING_BODY_KEYS)

      // 行为断言 7：user_id 即选择器选中的成员 TSID（string，非裸 number）。
      expect(typeof body['user_id'], 'user_id 必须是 TSID string（不得裸 number）').toBe('string')
      expect(body['user_id'], `user_id 应等于成员选择器第 ${index + 1} 项的取值`).toBe(member.value)
      provisionedUserIds.push(body['user_id'] as string)

      // 行为断言 8：display_name 非空，且来自该成员的选项文案（昵称或账号）。
      const displayName = body['display_name']
      expect(typeof displayName, 'display_name 必须是 string').toBe('string')
      expect((displayName as string).trim().length, 'display_name 不得为空').toBeGreaterThan(0)
      expect(
        member.label,
        `成员选项文案应承载 display_name（选项「${member.label}」/ 请求「${String(displayName)}」）`,
      ).toContain(displayName as string)

      // 行为断言 9（核心）：workspace_id 来自 URL 的 ws，绝不把 org 当工作区。
      expect(body['workspace_id'], 'workspace_id 应等于 URL 的 ws 参数').toBe(WS_TSID)
      expect(body['workspace_id'], '组织 TSID 绝不允许充当 workspace_id').not.toBe(ORG_TSID)

      // 行为断言 10：max_concurrent 是数值且落在 1..20 合法域。
      const maxConcurrent = body['max_concurrent']
      expect(typeof maxConcurrent, 'max_concurrent 必须为数值（不得是字符串）').toBe('number')
      expect(Number.isInteger(maxConcurrent), 'max_concurrent 必须为整数').toBe(true)
      expect(
        maxConcurrent as number,
        `max_concurrent 必须落在 ${MAX_CONCURRENT_MIN}..${MAX_CONCURRENT_MAX}`,
      ).toBeGreaterThanOrEqual(MAX_CONCURRENT_MIN)
      expect(maxConcurrent as number).toBeLessThanOrEqual(MAX_CONCURRENT_MAX)

      // 行为断言 11（负向，漂移根因）：绝不发送 business_identity_id。
      expect(
        Object.prototype.hasOwnProperty.call(body, 'business_identity_id'),
        '冻结合同禁止发送 business_identity_id（后端以 user_id 派生 identity）',
      ).toBe(false)
    }

    // 行为断言 12：两次开通对应**两个不同**的 active member（真正覆盖「选两个」）。
    expect(new Set(provisionedUserIds).size, '两次开通必须是两个不同的 member').toBe(REQUIRED_MEMBER_COUNT)
  })
})
