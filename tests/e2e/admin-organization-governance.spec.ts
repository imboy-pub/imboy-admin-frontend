import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin } from './support/adminAuth'

/**
 * ORG-14 wave2 e2e：平台组织治理面（/api/adm/organizations，f34be178 迁移后）。
 *
 * 覆盖六旅程 + fail-closed 负例（合同：control/org15/adm-org-api-contract.md
 * A0 冻结版 r1 + r2 勘误，正文 18 条端点）：
 *   ① 列表与详情（服务端搜索 / 分页骨架 / 敏感字段熔断）
 *   ② 组织 archive→restore（含 409 冲突分支与 C16 archived 禁写）
 *   ③ Owner 转移（owner 不变量负例：自转移 400 / 非成员 409 / owner 不可停用移除）
 *   ④ 成员 suspend→restore→remove（「最近停用」面板为恢复入口）
 *   ⑤ 邀请 create→list→cancel（一次性 token / pending→revoked）
 *   ⑥ 部门与 Workspace（目录渲染 / create / rename 正路径 + expected_version
 *      CAS 冲突 / archive；workspaces 只读端点走 API 层——W3 无该 UI 页面）
 *   负例：未登录 401 / 无效 TSID 404 / read-only 403。
 *
 * 关于「expected_version 409」的落点说明（与任务卡的口径差异，按实现事实写）：
 *   - 组织 lifecycle（archive/restore）在合同 r1/r2 与后端实现中均无
 *     expected_version（organization 行无 version 列，adm_organization_handler
 *     body 为 {}）；且 transition 对「目标态 == 当前态」是幂等重放（changed=false，
 *     合同 r2 勘误的 lifecycle 信封语义），不产生 409。组织域的 409 分支 =
 *     「archived 态成员/邀请/部门写 → 409（C16 fail-closed）」。
 *   - expected_version CAS 只存在于部门域（rename/move）；且后端错误表只把
 *     层级/归档冲突映射为 409，版本冲突兜底映射为 400（W3 页面注释与
 *     pureFunctions.suggestRefreshForCasMutation 均按此口径），因此部门
 *     rename 的过期版本断言为 code ∈ {400, 409}。
 *   - 邀请负例按 adm 面后端事实选取：未注册 target → 404；同 (org,target)
 *     重复 pending → 409。App 面的「已是组织成员 → 409」检查
 *     （organization_invitation_app.erl）在 adm 面 admin_invitation_create 中
 *     不存在，故本 spec 不对该分支断言（页面文案继承自 App 面语义）。
 *
 * 运行前提（BLOCKED_E2E_ENV）：required 前置缺失 = 硬失败（非 0 退出），不得 skip：
 *   1. wave2 后端节点（erl 直起 9822，加载含 W2 adm org 端点的 ebin）；
 *   2. VITE_PROXY_TARGET=http://127.0.0.1:9822（vite proxy ^/api/adm 规则转发）；
 *   3. IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD（super_admin，
 *      经 /api/adm/setup/init 种号；role_id=[1] 的代码级 role_acl 含
 *      organizations:read + organizations:write，六旅程全程可用）；
 *   4. 种子数据（预研方案 §3.6，SQL 直插，org15_e2e_ 前缀测后可整体清理）：
 *      - organization 1 行，name = IMBOY_ADMIN_E2E_ORG_SEED_NAME（默认
 *        org15-e2e-w2-seed），owner 指向 seed 用户 U1；
 *      - organization_member：U1(owner) + U2(member) + U3(member)；
 *      - 成员/组织行引用的用户必须是已注册用户（邀请旅程目标亦然）。
 *      旅程③会把 owner 转给 U2，④ 停用/移除 U3，⑤ 邀请 U3（removed 终态
 *      的「重新邀请」语义）；若另备非成员已注册用户，可用
 *      IMBOY_ADMIN_E2E_SEED_INVITEE_ID 指定其为邀请目标。
 *   5. read-only 403 负例（**必备**）：IMBOY_ADMIN_E2E_READONLY_ACCOUNT /
 *      IMBOY_ADMIN_E2E_READONLY_PASSWORD —— role_id=[3]（audit_admin，代码级
 *      role_acl 仅 organizations:read，对全部 mutation 恒 403）。setup/init 只
 *      能创建 super_admin，该账号需 wave2 执行方另行准备（adm 用户管理或 SQL）。
 *      ORG-A14 要求 read-only Admin mutation 被拒必须被验证，该账号不是可选项。
 *
 * required 前置缺失语义（ORG-A14 修复轮）：凭据（super_admin / read-only）、
 * seed 组织、owner + ≥2 普通成员、前序旅程产出的 owner/member/invitation 状态、
 * 创建后 Department 可回读——任一缺失 = 相应用例**硬失败**（throw → 非 0 退出），
 * 一律不得 test.skip。历史由 Git 与证据归档承担，不靠运行时 skip。
 *
 * 用例顺序：六旅程 describe 为 serial（修改共享服务端状态，后续用例依赖
 * 前序状态：③ 转移 owner、④ 移除成员、⑤ 邀请被移除者）。不要 --grep 单跑
 * 后段用例。负例 describe 无状态依赖。
 */

const SEED_ORG_NAME = process.env.IMBOY_ADMIN_E2E_ORG_SEED_NAME?.trim() || 'org15-e2e-w2-seed'

/**
 * required 前置硬失败（ORG-A14 修复轮）：缺失必须 throw（用例 FAIL、非 0 退出），
 * 不得 test.skip——静默跳过会掩盖环境劣化（skipped != passed）。
 */
function requireFixture(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`required fixture 缺失：${message}（硬失败，不得 skip）`)
  }
}

/** super_admin 凭据获取（硬失败版）：不使用共享 requireAdminCredentials（其内部是 test.skip 语义）。 */
function requireCreds(): { account: string; password: string } {
  const credentials = getAdminCredentials()
  requireFixture(credentials, 'super_admin 凭据（IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD）')
  return credentials
}

/** 格式合法但（几乎必然）不存在的 TSID——沿用 ORG-14 旧 spec 惯例。 */
const INVALID_TSID = '1234567890123456789'

/** 敏感字段熔断（沿用旧 spec 惯例）：不出现 token/digest/secret 类「键值」形态。 */
const SENSITIVE_KEY_VALUE_RE = /(?:token_digest|token|secret|cipher|hmac)["']?\s*[:=]["'][^"']+/i

/** adm 面错误语义码：业务错误 = HTTP 200 + envelope code；认证边界 = 真 HTTP 状态码。 */
function envelopeCode(status: number, body: unknown): number {
  if (status >= 400) return status
  if (body != null && typeof body === 'object' && !Array.isArray(body)) {
    const code = (body as Record<string, unknown>)['code']
    if (typeof code === 'number' && Number.isFinite(code)) return code
  }
  return -1
}

async function readJson(res: APIResponse): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** 登录态 API GET（page.request 继承 browser context 的 adm cookie）。 */
async function apiGet(page: Page, path: string): Promise<{ status: number; body: unknown }> {
  const res = await page.request.get(path)
  return { status: res.status(), body: await readJson(res) }
}

/** 登录态 API POST（mutation 命令，JSON body）。 */
async function apiPost(page: Page, path: string, data: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> {
  const res = await page.request.post(path, { data })
  return { status: res.status(), body: await readJson(res) }
}

function payloadOf(body: unknown): Record<string, unknown> {
  if (body != null && typeof body === 'object' && !Array.isArray(body)) {
    const payload = (body as Record<string, unknown>)['payload']
    if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>
    }
  }
  return {}
}

/** seed 组织发现：keyword 命中组织名（服务端搜索，同列表页数据面）。 */
async function findSeedOrg(page: Page): Promise<{ id: string; ownerId: string } | null> {
  const { body } = await apiGet(page, `/api/adm/organizations?page=1&size=10&status=all&keyword=${encodeURIComponent(SEED_ORG_NAME)}`)
  const payload = payloadOf(body)
  const list = Array.isArray(payload['list']) ? (payload['list'] as unknown[]) : []
  for (const item of list) {
    const row = item != null && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const id = typeof row['id'] === 'string' ? row['id'] : String(row['id'] ?? '')
    if (id.length > 0 && (typeof row['name'] === 'string' ? row['name'] : '').includes(SEED_ORG_NAME)) {
      const ownerId = typeof row['owner_id'] === 'string' ? row['owner_id'] : String(row['owner_id'] ?? '')
      return { id, ownerId }
    }
  }
  return null
}

type MemberFact = { userId: string; role: string }

/** 成员分页（仅 active 行）运行时发现 owner / 普通成员，不写死 seed ID。 */
async function fetchActiveMembers(page: Page, orgId: string): Promise<MemberFact[]> {
  const { body } = await apiGet(page, `/api/adm/organizations/${orgId}/members?page=1&size=50`)
  const payload = payloadOf(body)
  const list = Array.isArray(payload['list']) ? (payload['list'] as unknown[]) : []
  return list
    .map((item) => {
      const row = item != null && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const userId = typeof row['user_id'] === 'string' ? row['user_id'] : String(row['user_id'] ?? '')
      const role = typeof row['role'] === 'string' ? row['role'] : ''
      return { userId, role }
    })
    .filter((row) => row.userId.length > 0)
}

/** 页面根标记等待（参数化 pageMarker——ac93d61 教训：写死列表页标记详情路由永不绿）。 */
async function waitPageRoot(page: Page, pageMarker: string): Promise<void> {
  await expect(page.locator(pageMarker).or(page.locator('text=无权访问')).first()).toBeVisible({ timeout: 20_000 })
}

/** 列表页搜索并等待表格过滤结果（返回提交函数，由调用方决定后续清空）。 */
async function searchOrganizations(page: Page, keyword: string): Promise<void> {
  await page.locator('#org-list-q').fill(keyword)
  await page.getByTestId('org-search-submit').click()
}

// ---------------------------------------------------------------------------
// 六旅程共享的服务端状态（serial 链条上由前序用例写入，后序用例读取）
// ---------------------------------------------------------------------------
let seedOrgId = ''
let memberKeptId = '' // 旅程③接收 Owner 的普通成员（U2）
let memberRemovedId = '' // 旅程④被移除的成员（U3），旅程⑤的邀请目标

// ===========================================================================
// fail-closed 负例（无状态依赖；403 为条件用例）
// ===========================================================================
test.describe('平台组织治理面 · fail-closed 负例', () => {
  test('未登录 API 请求被 401 拒绝（adm cookie 会话边界，不伪造成功）', async ({ request }) => {
    // request fixture 独立于 browser context：无 adm cookie。
    const res = await request.get('/api/adm/organizations')
    expect(res.status()).toBe(401)
    const body = await readJson(res)
    // 未登录 envelope code=706（Need to log in again）；语义断言以 HTTP 401 为准。
    expect(envelopeCode(res.status(), body)).toBe(401)
  })

  test('无效 TSID：detail API 返回 404 语义码（HTTP 200 + envelope code 形态）', async ({ page }) => {
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)
    const { status, body } = await apiGet(page, `/api/adm/organizations/${INVALID_TSID}`)
    expect(status).toBe(200)
    expect(envelopeCode(status, body)).toBe(404)
  })

  test('无效 TSID：详情直链呈现诚实错误态（目标不存在 404），且不触发敏感字段泄漏', async ({ page }) => {
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)
    await page.goto(`/organizations/${INVALID_TSID}`)
    await waitPageRoot(page, '[data-page="organization-detail"]')
    await expect(page.getByText('目标不存在（404）')).toBeVisible({ timeout: 15_000 })
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(SENSITIVE_KEY_VALUE_RE)
  })

  test('无效 TSID：mutation（archive）同样返回 404 语义码', async ({ page }) => {
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)
    const { status, body } = await apiPost(page, `/api/adm/organizations/${INVALID_TSID}/archive`)
    expect(envelopeCode(status, body)).toBe(404)
  })

  test('read-only 账号（audit_admin）对 mutation 恒 403（adm_acl 分权）', async ({ page }) => {
    const account = process.env.IMBOY_ADMIN_E2E_READONLY_ACCOUNT?.trim()
    const password = process.env.IMBOY_ADMIN_E2E_READONLY_PASSWORD?.trim()
    requireFixture(account && password, '需要 role_id=[3] audit_admin 账号（IMBOY_ADMIN_E2E_READONLY_ACCOUNT/PASSWORD）')

    await loginAsAdmin(page, { account: account as string, password: password as string })
    // 分权语义（实测锚定 74dc41d7）：audit_admin 持有 organizations:read，
    // GET detail 权限过 → 业务裁决无效 TSID = 404；POST archive 无 write 权限，
    // ensure_permission 先于业务裁决 = 403。
    const read = await apiGet(page, `/api/adm/organizations/${INVALID_TSID}`)
    expect(envelopeCode(read.status, read.body)).toBe(404)
    const write = await apiPost(page, `/api/adm/organizations/${INVALID_TSID}/archive`)
    expect(envelopeCode(write.status, write.body)).toBe(403)
    // UI 侧注记：read-only 的 organizations:write 分支文案（列表页「只读（无
    // organizations:write 权限）」）在当前路由门下不可达——/organizations* 路由
    // PermissionRoute 门为 workspaces:read + roles ['1','2']，audit_admin 两者皆无，
    // 直链会被重定向 /forbidden（这本身是 fail-closed，但不属于本用例断言面）。
  })
})

// ===========================================================================
// 六旅程（serial：修改共享服务端状态，按声明顺序执行）
// ===========================================================================
// ⚠️ serial 全链会消耗服务端状态（④ remove 为 removed 终态）。重跑前复位种子：
//   UPDATE organization_member SET status='active'
//     WHERE organization_id=<seed org> AND status<>'active';
//   UPDATE organization_member SET role='member'
//     WHERE organization_id=<seed org> AND user_id IN (<plain member uids>) AND role<>'member';
//   UPDATE organization SET owner_id=<owner uid> WHERE id=<seed org>;
//   DELETE FROM organization_invitation WHERE organization_id=<seed org>;
test.describe('平台组织治理面 · 六旅程（/api/adm/organizations）', () => {
  test.describe.configure({ mode: 'serial' })

  test('① 列表页骨架：页面标记、权限矩阵文案、搜索表单与分页条（不依赖 seed）', async ({ page }) => {
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)
    await page.goto('/organizations')
    await waitPageRoot(page, '[data-page="organization-list"]')

    await expect(page.getByRole('heading', { name: '组织治理' })).toBeVisible()
    // 平台 RBAC 语义锚点（App 面 member_role 矩阵时代的文案已随迁移保留）
    await expect(page.getByText('平台管理员权限不映射为组织角色')).toBeVisible()
    await expect(page.locator('#org-list-q')).toBeVisible()
    await expect(page.getByTestId('org-search-submit')).toBeVisible()
    // 分页骨架（DataTablePagination「第 X / Y 页」；重跑场景可能多行，用正则）
    await expect(page.getByText(/第 \d+ \/ \d+ 页/)).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(SENSITIVE_KEY_VALUE_RE)
  })

  test('① seed 组织：服务端搜索命中、行渲染与详情事实域投影', async ({ page }) => {
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    const seed = await findSeedOrg(page)
    requireFixture(seed, `缺少 seed 组织（keyword=${SEED_ORG_NAME}）：按预研方案 §3.6 种子后再跑`)
    seedOrgId = (seed as { id: string }).id

    await page.goto('/organizations')
    await waitPageRoot(page, '[data-page="organization-list"]')

    // 搜索命中：服务端 keyword 过滤后表格出现 seed 行
    await searchOrganizations(page, SEED_ORG_NAME)
    await expect(page.locator('tr', { hasText: seedOrgId }).first()).toBeVisible()

    // 搜索不命中：空态文案（DataTable emptyMessage，keyword 分支）
    // 注：DataTable 渲染桌面/移动两份 DOM（同一文案各一份，桌面份在 DOM 前且
    // 在默认视口可见），strict mode 下取 .first() 即桌面可见份
    await searchOrganizations(page, `${SEED_ORG_NAME}__no_match`)
    await expect(
      page.getByRole('heading', { name: '没有匹配搜索条件的组织' }).first(),
    ).toBeVisible()

    // 清空搜索，恢复全量视图（保证后续用例/重跑不受过滤态影响）
    await searchOrganizations(page, '')

    // 详情：行内组织名按钮（openDetail）进入事实域
    await page.locator('tr', { hasText: seedOrgId }).first().getByRole('button', { name: SEED_ORG_NAME }).click()
    await waitPageRoot(page, '[data-page="organization-detail"]')
    await expect(page.locator('[data-page="organization-detail"] [data-status="active"]')).toBeVisible()
    // FactRow：组织 ID / Owner（owner_id）事实投影（TSID string）
    await expect(page.getByText(seedOrgId).first()).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(SENSITIVE_KEY_VALUE_RE)
  })

  test('② 组织 lifecycle：active→restore 幂等重放 → archive → C16 archived 禁写 → restore 复原', async ({ page }) => {
    requireFixture(seedOrgId.length > 0, 'seed 未发现（前序用例未产出 seed 组织）')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    const members = await fetchActiveMembers(page, seedOrgId)
    const plainMembers = members.filter((m) => m.role === 'member')
    requireFixture(plainMembers.length >= 2, `seed 成员不足（需 owner + 2 个 member，实得 ${members.map((m) => m.role).join(',')}）`)
    memberKeptId = plainMembers[0]?.userId ?? ''
    memberRemovedId = plainMembers[1]?.userId ?? ''

    // 1) 幂等重放分支（合同 r2 lifecycle 信封）：active 态 restore → changed=false、零写入
    const premature = await apiPost(page, `/api/adm/organizations/${seedOrgId}/restore`)
    expect(envelopeCode(premature.status, premature.body)).toBe(0)
    const prematurePayload = payloadOf(premature.body)
    expect(prematurePayload['changed']).toBe(false)
    expect(prematurePayload['status']).toBe('active')

    // 2) UI archive（列表页行内按钮 + 二次确认；按 seedOrgId 定位行，防重跑多行 strict 冲突）
    await page.goto('/organizations')
    await waitPageRoot(page, '[data-page="organization-list"]')
    await searchOrganizations(page, SEED_ORG_NAME)
    await page.locator('tr', { hasText: seedOrgId }).first().getByTestId('org-archive-btn').click()
    await page.getByRole('button', { name: '确认归档' }).click()
    // 归档后行内出现「已归档」Badge（react-query invalidate 后列表刷新）
    await expect(page.locator('tr', { hasText: seedOrgId }).first().getByText('已归档')).toBeVisible({ timeout: 15_000 })

    // 3) C16 fail-closed：archived 态成员写被服务端 409 拒绝
    const suspendedInArchived = await apiPost(page, `/api/adm/organizations/${seedOrgId}/members/${memberKeptId}/suspend`)
    expect(envelopeCode(suspendedInArchived.status, suspendedInArchived.body)).toBe(409)

    // 4) UI restore（详情页危险区，archived 态唯一放行写）→ 复原 active
    await page.goto(`/organizations/${seedOrgId}`)
    await waitPageRoot(page, '[data-page="organization-detail"]')
    await expect(page.locator('[data-page="organization-detail"] [data-status="archived"]')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('org-restore-btn').click()
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.locator('[data-page="organization-detail"] [data-status="active"]')).toBeVisible({ timeout: 15_000 })
  })

  test('③ Owner 不变量：owner 行不可停用/移除（UI 镜像 + API 409）', async ({ page }) => {
    requireFixture(seedOrgId.length > 0, 'seed 组织未发现')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    const members = await fetchActiveMembers(page, seedOrgId)
    const owner = members.find((m) => m.role === 'owner')
    requireFixture(owner, '成员页无 owner 行（seed 异常）')
    const ownerId = (owner as MemberFact).userId

    // API：owner 目标 suspend / remove 均 409（先转移 Owner）
    const suspendOwner = await apiPost(page, `/api/adm/organizations/${seedOrgId}/members/${ownerId}/suspend`)
    expect(envelopeCode(suspendOwner.status, suspendOwner.body)).toBe(409)
    const removeOwner = await apiPost(page, `/api/adm/organizations/${seedOrgId}/members/${ownerId}/remove`)
    expect(envelopeCode(removeOwner.status, removeOwner.body)).toBe(409)

    // UI：owner 行以组织角色 badge（data-role="owner"）定位——成员行「邀请人」列
    // 也可能显示 owner 的 TSID，不能用 hasText(ownerId) 概念匹配多行。
    await page.goto(`/organizations/${seedOrgId}/members`)
    await waitPageRoot(page, '[data-page="organization-members"]')
    const ownerRow = page.locator('tr', { has: page.locator('[data-role="owner"]') }).first()
    await expect(ownerRow.getByText('主 Owner 不可直接操作（先转移 Owner）')).toBeVisible({ timeout: 15_000 })
    await expect(ownerRow.getByTestId('member-suspend-btn')).toHaveCount(0)
    await expect(ownerRow.getByTestId('member-remove-btn')).toHaveCount(0)
  })

  test('③ Owner 转移：自转移 400 / 非成员 409（负例）+ 正向转移（单事务投影）', async ({ page }) => {
    requireFixture(seedOrgId.length > 0 && memberKeptId.length > 0, 'seed 未发现或普通成员不足')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    const members = await fetchActiveMembers(page, seedOrgId)
    const owner = members.find((m) => m.role === 'owner')
    requireFixture(owner, '成员页无 owner 行（seed 异常）')
    const ownerId = (owner as MemberFact).userId

    // 负例①：自转移（target = 当前 owner 自己）→ 400
    const self = await apiPost(page, `/api/adm/organizations/${seedOrgId}/owner-transfer`, {
      target_user_id: ownerId,
    })
    expect(envelopeCode(self.status, self.body)).toBe(400)

    // 负例②：目标非本组织成员（格式合法的不存在 TSID）→ 409「该用户不是组织成员或已被移除」
    const outsider = await apiPost(page, `/api/adm/organizations/${seedOrgId}/owner-transfer`, {
      target_user_id: INVALID_TSID,
    })
    expect(envelopeCode(outsider.status, outsider.body)).toBe(409)

    // 正向：UI 弹窗冒烟只验证可打开/搜索选择器就位（不提交）——转移提交由 API 直调断言。
    // 教训（run13/14 实测）：UI 提交与 API 直调各转一次，第二次必然自转移 400。
    // 2026-09-23 起 Owner 转移统一走用户搜索选择对话框（禁止手填 TSID）：
    // transfer-owner-btn 打开 OrganizationOwnerTransferDialog（owner-transfer-* 选择器）。
    await page.goto(`/organizations/${seedOrgId}/members`)
    await waitPageRoot(page, '[data-page="organization-members"]')
    await page.getByTestId('transfer-owner-btn').click()
    await expect(page.getByTestId('owner-transfer-dialog')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('owner-transfer-search-input')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('transfer-owner-btn')).toBeVisible({ timeout: 15_000 })

    const fwd = await apiPost(page, `/api/adm/organizations/${seedOrgId}/owner-transfer`, {
      target_user_id: memberKeptId,
    })
    expect(envelopeCode(fwd.status, fwd.body)).toBe(0)

    // 服务端投影：memberKeptId 升级 owner，旧 owner 降级 admin（单事务）
    const after = await fetchActiveMembers(page, seedOrgId)
    expect(after.find((m) => m.userId === memberKeptId)?.role).toBe('owner')
    expect(after.find((m) => m.userId === ownerId)?.role).toBe('admin')
  })

  test('④ 成员 suspend → 「最近停用」面板 → restore 回表', async ({ page }) => {
    requireFixture(seedOrgId.length > 0 && memberRemovedId.length > 0, 'seed 未发现或普通成员不足')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    await page.goto(`/organizations/${seedOrgId}/members`)
    await waitPageRoot(page, '[data-page="organization-members"]')
    const targetRow = page.locator('tr', { hasText: memberRemovedId }).first()
    await expect(targetRow).toBeVisible({ timeout: 15_000 })

    // suspend：行内停用 + 确认 → 面板出现该成员，表格（仅 active 行）消失
    await targetRow.getByTestId('member-suspend-btn').click()
    await page.getByRole('button', { name: '确认停用' }).click()
    await expect(page.getByTestId('suspended-members-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('suspended-members-panel').getByText(memberRemovedId)).toBeVisible()
    await expect(page.locator('tr', { hasText: memberRemovedId })).toHaveCount(0)

    // restore：面板内恢复 → 成员回到 active 表格
    await page.getByTestId('member-restore-btn').click()
    await expect(page.locator('tr', { hasText: memberRemovedId }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('suspended-members-panel')).toHaveCount(0)

    // API 负例：非 suspended 目标 restore → 409（状态机守卫）
    const redundant = await apiPost(page, `/api/adm/organizations/${seedOrgId}/members/${memberRemovedId}/restore`)
    expect(envelopeCode(redundant.status, redundant.body)).toBe(409)
  })

  test('④ 成员 remove：再次停用后从面板移除（removed 终态）', async ({ page }) => {
    requireFixture(seedOrgId.length > 0 && memberRemovedId.length > 0, 'seed 未发现或普通成员不足')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    await page.goto(`/organizations/${seedOrgId}/members`)
    await waitPageRoot(page, '[data-page="organization-members"]')
    const targetRow = page.locator('tr', { hasText: memberRemovedId }).first()
    await expect(targetRow).toBeVisible({ timeout: 15_000 })

    await targetRow.getByTestId('member-suspend-btn').click()
    await page.getByRole('button', { name: '确认停用' }).click()
    await expect(page.getByTestId('suspended-members-panel')).toBeVisible({ timeout: 15_000 })

    // 面板内移除 → removed 终态：面板与表格均无此成员
    // 注：面板入口的移除是直执行（无二级确认弹窗；ConfirmDialog 只在表格行入口）
    await page.getByTestId('suspended-remove-btn').click()
    await expect(page.getByTestId('suspended-members-panel')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('tr', { hasText: memberRemovedId })).toHaveCount(0)

    // API 终态验证：active 成员分页不再包含该成员
    const members = await fetchActiveMembers(page, seedOrgId)
    expect(members.find((m) => m.userId === memberRemovedId)).toBeUndefined()
  })

  test('⑤ 邀请：未注册 target 404 → 创建（非成员）→ 一次性 token → 重复 pending 409 → cancel → revoked', async ({ page }) => {
    requireFixture(seedOrgId.length > 0, 'seed 组织未发现')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    // 负例：未注册用户（格式合法的不存在 TSID）→ 404「用户不存在」
    const toUnregistered = await apiPost(page, `/api/adm/organizations/${seedOrgId}/invitations`, {
      target_user_id: INVALID_TSID,
    })
    expect(envelopeCode(toUnregistered.status, toUnregistered.body)).toBe(404)
    // 注：App 面「已是组织成员 → 409」在 adm 面后端不存在（见文件头说明），不测。

    // 邀请目标：removed 成员（重新邀请语义）或显式注入的非成员用户
    const invitee = process.env.IMBOY_ADMIN_E2E_SEED_INVITEE_ID?.trim() || memberRemovedId
    requireFixture(invitee.length > 0, '无可用的非成员邀请目标（且 ④ 未产出 removed 成员）')

    await page.goto(`/organizations/${seedOrgId}/invitations`)
    await waitPageRoot(page, '[data-page="organization-invitations"]')

    // 创建：2026-09-23 起被邀请人走用户搜索选择（禁止手填 TSID）。seed 只有
    // TSID 无已知账号，搜索命中不可控 → UI 段降级为冒烟（对话框 + 搜索选择器
    // 就位），提交与一次性 token 断言改由 API 直调（reveal UI 链路由组件单测覆盖）。
    await page.getByTestId('invitation-create-btn').click()
    await expect(page.getByTestId('invitation-target-search-input')).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('invitation-create-btn')).toBeVisible({ timeout: 15_000 })

    // API 创建：响应含一次性 token（唯一出现点）
    const created = await apiPost(page, `/api/adm/organizations/${seedOrgId}/invitations`, {
      target_user_id: invitee,
    })
    expect(envelopeCode(created.status, created.body)).toBe(0)
    const tokenValue = String((created.body as { payload?: { token?: string } })?.payload?.token ?? '')
    expect(tokenValue.length).toBeGreaterThan(8)

    // token 明文只出现一次：创建后 body 不含 token 子串（服务端只存 digest）
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain(tokenValue)
    expect(bodyText).not.toMatch(SENSITIVE_KEY_VALUE_RE)

    // 负例：同 (org,target) 重复 pending → 409（部分唯一索引 uq_organization_invitation_single_pending）
    const duplicate = await apiPost(page, `/api/adm/organizations/${seedOrgId}/invitations`, {
      target_user_id: invitee,
    })
    expect(envelopeCode(duplicate.status, duplicate.body)).toBe(409)

    // API 直建绕过了页面 react-query 缓存——reload 使列表重新拉取（PR-W2-C05：
    // 原断言在无刷新下等待新行，列表永不重取，用例恒败）。
    await page.reload()
    await waitPageRoot(page, '[data-page="organization-invitations"]')

    // 列表：pending 行可见（badge data-status）
    const inviteeRow = page.locator('tr', { hasText: invitee }).first()
    await expect(inviteeRow).toBeVisible({ timeout: 15_000 })
    await expect(inviteeRow.locator('[data-status="pending"]')).toBeVisible()

    // cancel：行内取消 + 确认 → revoked（已撤销）
    await inviteeRow.getByTestId('invitation-cancel-btn').click()
    await page.getByRole('button', { name: '确认取消' }).click()
    await expect(inviteeRow.locator('[data-status="revoked"]')).toBeVisible({ timeout: 15_000 })
  })

  test('⑥ 部门：目录渲染 + 创建 + rename（正路径 / expected_version CAS 冲突）+ 归档', async ({ page }) => {
    requireFixture(seedOrgId.length > 0, 'seed 组织未发现')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    await page.goto(`/organizations/${seedOrgId}/departments`)
    await waitPageRoot(page, '[data-page="organization-departments"]')
    // 目录渲染：空态（「暂无部门」）或既有树（重跑场景），两者都成立
    await expect(page.getByTestId('department-tree').or(page.getByText('暂无部门')).first()).toBeVisible({ timeout: 15_000 })

    // 创建（合同端点 #15）：建根部门，名称带时间戳避免重跑唯一冲突
    const deptName = `e2e-w2-dept-${Date.now()}`
    await page.getByTestId('dept-create-btn').click()
    await page.locator('#dept-create-name').fill(deptName)
    await page.getByTestId('dept-create-submit').click()
    await expect(page.getByTestId('department-tree').getByText(deptName)).toBeVisible({ timeout: 15_000 })

    // rename 正路径 + CAS 冲突（合同端点 #16，expected_version）
    const deptList = await apiGet(page, `/api/adm/organizations/${seedOrgId}/departments?status=all`)
    const payload = payloadOf(deptList.body)
    // 注：departments 目录接口与 /api/v1 同形=裸数组。payloadOf 会把数组形态
    // 归一为 {}（其签名面向分页信封对象），故这里直接从 body 取 payload。
    const rawPayload = (deptList.body as Record<string, unknown> | null)?.['payload']
    const departments = Array.isArray(rawPayload)
      ? (rawPayload as unknown[])
      : Array.isArray(payload['list'])
        ? (payload['list'] as unknown[])
        : []

    const created = departments
      .map((item) => (item != null && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
      .find((row) => (typeof row['name'] === 'string' ? row['name'] : '') === deptName)
    requireFixture(created, 'API 部门目录未见刚创建的部门（数据同步异常）')
    const deptId = typeof created?.['id'] === 'string' ? created['id'] : String(created?.['id'] ?? '')
    const realVersion = typeof created?.['version'] === 'number' ? (created['version'] as number) : 1

    // CAS 负例：过期 expected_version → 409（层级/归档冲突）或 400（后端错误表兜底映射）
    const casConflict = await apiPost(page, `/api/adm/organizations/${seedOrgId}/departments/${deptId}/rename`, {
      name: `${deptName}-stale`,
      expected_version: realVersion + 1000,
    })
    expect([400, 409]).toContain(envelopeCode(casConflict.status, casConflict.body))

    // 正路径：当前版本 rename 成功
    const renamed = `${deptName}-v2`
    const casOk = await apiPost(page, `/api/adm/organizations/${seedOrgId}/departments/${deptId}/rename`, {
      name: renamed,
      expected_version: realVersion,
    })
    expect(envelopeCode(casOk.status, casOk.body)).toBe(0)
    // rename 经 API 直调，页面缓存不感知——reload 后断言树渲染新名
    await page.reload()
    await waitPageRoot(page, '[data-page="organization-departments"]')
    await expect(page.getByTestId('department-tree').getByText(renamed)).toBeVisible({ timeout: 15_000 })

    // 归档（合同端点 #18）：UI 行内归档 → 「已归档」Badge
    const nodeRow = page.getByTestId('department-tree').locator('li', { hasText: deptId }).first()
    await nodeRow.getByTestId('dept-archive-btn').click()
    await page.getByRole('button', { name: '确认归档' }).click()
    await expect(nodeRow.getByText('已归档')).toBeVisible({ timeout: 15_000 })
  })

  test('⑥ workspaces 只读关系端点（合同 #6；W3 无该 UI 页面，API 层断言）', async ({ page }) => {
    requireFixture(seedOrgId.length > 0, 'seed 组织未发现')
    const credentials = requireCreds()
    await loginAsAdmin(page, credentials)

    const { status, body } = await apiGet(page, `/api/adm/organizations/${seedOrgId}/workspaces?page=1&size=10`)
    expect(envelopeCode(status, body)).toBe(0)
    const payload = payloadOf(body)
    expect(Array.isArray(payload['list'])).toBe(true)
  })
})
