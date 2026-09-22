import { expect, type APIRequestContext, test } from '@playwright/test'

import { loginAsAdmin } from './support/adminAuth'

/**
 * EADM-07 · 计划 §9 第 2 条：read-only 账号能进入只读页，但**看不到任何写入口**
 *（创建组织 / 提交开通），且**直调写 API 恒 403**（服务端 adm_acl fail-closed，
 * 前端隐藏按钮不是安全边界）。
 *
 * read-only 账号语义（沿用 ORG-14 既有口径）：role_id = 3（audit_admin），
 * 代码级 role_acl 仅 `organizations:read` → 对全部 mutation 恒 403。
 *
 * skip 条件（显式，不假装通过）：
 *   - **收集期凭据门**（同步，describe 级 test.skip）：缺 read-only 账号凭据即 skip，
 *     不需要启动浏览器——否则「无凭据」会先撞 browserType.launch 硬失败（本环境实证）；
 *   - admin 前端(:8082) / imboy 后端(:9800) 不可达 → 体内 test.skip（环境阻塞）。
 * 严禁写 cookie/token/secret/手机号/邮箱；断言只针对行为
 * （页面 data-page 标记 / 写入口计数 / HTTP 状态码 / 响应体形态）。
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

/**
 * 同步读取 read-only 凭据（不调用 test.skip，因而可在 test 外求值，
 * 供「收集期凭据门」使用）。
 */
function readOnlyCredentialsOrNull(): { account: string; password: string } | null {
  const account = process.env.IMBOY_ADMIN_E2E_READONLY_ACCOUNT?.trim()
  const password = process.env.IMBOY_ADMIN_E2E_READONLY_PASSWORD?.trim()
  if (!account || !password) return null
  return { account, password }
}

const READONLY_CREDENTIALS_HINT =
  '需要提供 read-only 账号 IMBOY_ADMIN_E2E_READONLY_ACCOUNT / IMBOY_ADMIN_E2E_READONLY_PASSWORD（角色仅含 read 权限，如 role_id=3 audit_admin）；缺凭据在收集期即 skip，不启动浏览器'

/** 形态合法的 TSID（仅用于构造被拒绝的写请求，不对应任何真实实体）。 */
const PROBE_ORG_TSID = '1234567890123456789'
const PROBE_WS_TSID = '1234567890123456788'
const PROBE_USER_TSID = '1234567890123456787'

/** 敏感键值熔断（沿用既有 spec 惯例）：读响应不得含 token/secret 类「键值」形态。 */
const SENSITIVE_KEY_VALUE_RE = /(?:token_digest|secret|cipher|hmac)["']?\s*[:=]\s*["'][^"']+/i

test.describe('EADM-07 §9-2 · read-only 账号无写能力', () => {
  test.skip(readOnlyCredentialsOrNull() === null, READONLY_CREDENTIALS_HINT)

  test('§9-2 read-only 只见只读页、无写入口，直调写 API 恒 403（读 API 仍允许）', async ({ page, request }) => {
    const credentials = readOnlyCredentialsOrNull()
    if (credentials === null) {
      // 兜底：describe 级收集期门已覆盖，此处保证类型收窄且语义一致。
      test.skip(true, READONLY_CREDENTIALS_HINT)
      return
    }
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞）')

    await loginAsAdmin(page, credentials)

    // 行为断言 1：只读页可达（read-only 持有 organizations:read，组织治理面应正常渲染）。
    await page.goto('/organizations')
    await expect(page.locator('[data-page="organization-list"]'), 'read-only 应能进入组织治理只读页').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '组织治理' })).toBeVisible()

    // 行为断言 2：组织治理页**无**「创建组织」写入口（organizations:write 被收起）。
    await expect(
      page.getByTestId('org-create-entry'),
      'read-only 不应看到「创建组织」写入口',
    ).toHaveCount(0)

    // 行为断言 3：客服开通向导**无**「提交开通」写按钮（customer_service:write 被收起）。
    await page.goto('/customer-service/provisioning')
    await expect(
      page.getByTestId('cs-provision-submit'),
      'read-only 不应看到「提交开通」写按钮',
    ).toHaveCount(0)

    // 行为断言 4（安全边界）：前端隐藏之外，服务端必须独立 fail-closed。
    // 直调创建组织写 API → 拒绝码 403。
    //
    // 传输约定（2026-09-22 实测，原始报文见 W4/evidence/readonly-403-transport.txt）：
    // 本仓 admin 的 403 **按端点分两种传输**，不能一刀切：
    //   · POST /api/adm/organizations → HTTP **200** + 信封 {"code":403,"msg":"无权限操作"}
    //     （adm_acl:ensure_permission/3 → elib_response:error/3 → reply_json_with_status(200,…)）
    //   · POST .../provisioning        → HTTP **403** + 信封 {"code":403,"msg":"permission_missing"}
    //     （cs_http:reply_error/2 → elib_response:error_with_status/4）
    // 两者**信封 code 恒为 403**，HTTP 状态却不统一 ⇒ 断言落在业务码上
    // （「HTTP 403 或 信封 code=403」），而不是绑死传输层。
    // 证据链：断言 6 的读 API 对照返回 code=0 放行 ⇒ 证明被拒的是写权限、会话仍有效。
    const createRes = await page.request.post('/api/adm/organizations', {
      data: {
        name: 'eadm-readonly-probe',
        owner_user_id: PROBE_USER_TSID,
        default_workspace_name: 'eadm-readonly-probe',
      },
    })
    const createBody = (await createRes.json().catch(() => ({}))) as { code?: number }
    expect(
      createRes.status() === 403 ? 403 : createBody.code,
      'read-only 直调 POST /api/adm/organizations 必须被 fail-closed 拒绝（HTTP 403 或信封 code=403）',
    ).toBe(403)

    // 行为断言 5：直调客服开通写 API → 拒绝码 403（实测 HTTP 403 + 信封 code=403，同上）。
    const provisionRes = await page.request.post(
      `/api/adm/customer-service/organizations/${PROBE_ORG_TSID}/provisioning`,
      {
        data: {
          workspace_id: PROBE_WS_TSID,
          user_id: PROBE_USER_TSID,
          display_name: 'readonly-probe',
          max_concurrent: 3,
        },
      },
    )
    const provisionBody = (await provisionRes.json().catch(() => ({}))) as { code?: number }
    expect(
      provisionRes.status() === 403 ? 403 : provisionBody.code,
      'read-only 直调 POST provisioning 必须被 fail-closed 拒绝（HTTP 403 或信封 code=403）',
    ).toBe(403)

    // 行为断言 6（对照）：读 API 仍允许 → 证明被拒绝的是**写权限**，
    // 而不是会话失效/整体拒绝；且读响应不得回传敏感键值。
    const readRes = await page.request.get('/api/adm/organizations?page=1&size=1')
    expect(readRes.status(), 'read-only 直调 GET /api/adm/organizations 应被允许').toBe(200)
    const readText = await readRes.text()
    expect(readText, '读响应不得含 token/secret 类键值').not.toMatch(SENSITIVE_KEY_VALUE_RE)
  })
})
