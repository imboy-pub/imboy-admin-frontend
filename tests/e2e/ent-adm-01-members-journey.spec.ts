import { expect, type APIRequestContext, type Page, test } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin } from './support/adminAuth'

/**
 * ENT-ADM-01 · 成员页真实路由旅程：复合筛选 → 列持久化 → 关系 Drawer。
 *
 * ⚠️ 执行归属：本 spec 需要真实 dev server + wave2 后端节点（VITE_PROXY_TARGET
 * 指向的 adm API），按 run 计划由 **ENT-INT-01 集中执行**（本卡 ENT-ADM-01 只
 * 交付 spec 文件，不在隔离 run 内启动后端）。环境门沿用 eadm-org-create.spec.ts
 * 的 skip 约定（缺凭据 / 前端 / 后端任一即显式 skip，不假装通过），组件级行为
 * 已由 OrganizationMembersPage.test.tsx 覆盖（L0 绿）。
 *
 * 旅程（只读为主，不动服务端治理状态——suspend/remove/transfer 均不触碰）：
 *   ① 进入 seed 组织成员页（/organizations/:id/members）；
 *   ② 复合筛选——角色档 owner：表格收敛到 owner 行 + 客户端筛选覆盖范围标注
 *      （adm 合同 members 端点无服务端筛选参数，筛选在浏览器侧执行）；
 *   ③ 关键词筛选 + 重置回全量；
 *   ④ 列持久化（ENT-FND-01 能力回归）：列面板隐藏「邀请人」列 → localStorage
 *      落盘 → 重新加载页面列仍隐藏 → 重置恢复；
 *   ⑤ 关系 Drawer（EntityDrawer sections）：行点击打开 → 成员事实分区 +
 *      合同背书关系导航（所属组织 / 用户详情 / 邀请人）→ Escape 关闭。
 *
 * 运行前提：
 *   - super_admin 凭据：IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD；
 *   - seed 组织：IMBOY_ADMIN_E2E_ORG_SEED_NAME（默认 org15-e2e-w2-seed），
 *     组织内至少含 owner 成员行（wave2 种子即满足）；
 *   - 前端 dev server（playwright.config webServer）+ 后端 adm API 可达。
 */

const SEED_ORG_NAME = process.env.IMBOY_ADMIN_E2E_ORG_SEED_NAME?.trim() || 'org15-e2e-w2-seed'

const COLUMN_STORAGE_KEY = 'imboy_admin_column_state:organization-members'

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

async function readJson(res: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** seed 组织发现：keyword 命中组织名（服务端搜索，同 admin-organization-governance 模式）。 */
async function findSeedOrg(page: Page): Promise<{ id: string } | null> {
  const res = await page.request.get(`/api/adm/organizations?page=1&size=10&keyword=${encodeURIComponent(SEED_ORG_NAME)}`)
  const body = (await readJson(res)) as { payload?: { list?: Array<Record<string, unknown>> } } | null
  const rows = body?.payload?.list ?? []
  const hit = rows.find((row) => typeof row['name'] === 'string' && row['name'] === SEED_ORG_NAME)
  const id = hit?.['id']
  return typeof id === 'string' && id.length > 0 ? { id } : null
}

test.describe('ENT-ADM-01 成员页旅程（复合筛选 → 列持久化 → 关系 Drawer）', () => {
  /** 收集期凭据门（同步，eadm-org-create 模式）：缺任一前置即整组显式 skip。 */
  test.skip(
    () => getAdminCredentials() == null,
    '缺 super_admin 凭据（IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD）——由 ENT-INT-01 集中执行时供给'
  )

  let skipInBody = false
  test.beforeEach(async ({ request }) => {
    skipInBody = !(await probeFrontend(request)) || !(await probeBackend(request))
  })

  test('筛选 → 列持久化（重载生效）→ 关系 Drawer', async ({ page }) => {
    test.skip(skipInBody, 'admin 前端 / adm 后端不可达——由 ENT-INT-01 提供真实环境后集中执行')

    // PR-W2-C05：loginAsAdmin 需要显式凭据（原 `loginAsAdmin(page)` 漏参，
    // credentials.account undefined → TypeError，旅程从未真正执行过）。
    const credentials = getAdminCredentials()
    test.skip(credentials == null, '缺 super_admin 凭据（IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD）')
    await loginAsAdmin(page, credentials as { account: string; password: string })
    const seed = await findSeedOrg(page)
    test.skip(seed == null, `seed 组织 ${SEED_ORG_NAME} 不存在（IMBOY_ADMIN_E2E_ORG_SEED_NAME）`)
    const orgId = (seed as { id: string }).id

    // ① 成员页就绪
    await page.goto(`/organizations/${orgId}/members`)
    await expect(page.locator('[data-page="organization-members"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('members-filter-bar')).toBeVisible()
    // owner 行（seed 组织必有）就绪：角色徽章 data-role=owner
    await expect(page.locator('tr', { has: page.locator('[data-role="owner"]') }).first()).toBeVisible({ timeout: 15_000 })
    const allRoleCells = page.locator('tbody [data-role]')
    const totalBefore = await allRoleCells.count()
    expect(totalBefore).toBeGreaterThan(0)

    // ② 角色筛选 owner：表格收敛 + 客户端筛选覆盖范围标注
    await page.getByTestId('member-role-filter').selectOption('owner')
    await expect(page.locator('tbody [data-role="owner"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(allRoleCells).toHaveCount(1, { timeout: 15_000 })
    const scopeNote = page.getByTestId('members-filter-scope-note')
    await expect(scopeNote).toContainText('命中 1 行')
    await expect(scopeNote).toContainText('adm 合同 members 端点无服务端筛选参数')

    // ③ 关键词筛选（owner 昵称未知，用组织 seed 名中的 owner 不一定命中——
    //    用空集路径验证交集语义与「无匹配成员」空态，再重置回全量）
    await page.getByTestId('member-keyword-input').fill('ent-adm-01-no-such-member')
    await page.getByTestId('member-filter-submit').click()
    await expect(page.getByText('无匹配成员（当前筛选条件下）').first()).toBeVisible({ timeout: 15_000 })
    await expect(scopeNote).toContainText('命中 0 行')
    await page.getByTestId('member-filter-reset').click()
    await expect(allRoleCells).toHaveCount(totalBefore, { timeout: 15_000 })
    await expect(scopeNote).toHaveCount(0)

    // ④ 列持久化：隐藏「邀请人」列 → 落盘 → 重载仍隐藏 → 重置恢复
    await page.getByTestId('members-column-panel-btn').click()
    await page.getByTestId('members-column-toggle-invitedBy').click()
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), COLUMN_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored as string).invitedBy).toBe(false)

    await page.reload()
    await expect(page.locator('tr', { has: page.locator('[data-role="owner"]') }).first()).toBeVisible({ timeout: 15_000 })
    // 重载后邀请人列保持隐藏：表头不再出现「邀请人」
    await expect(page.getByRole('columnheader', { name: '邀请人' })).toHaveCount(0)
    await page.getByTestId('members-column-panel-btn').click()
    await page.getByTestId('members-column-reset-btn').click()
    await expect(page.getByRole('columnheader', { name: '邀请人' })).toHaveCount(1)

    // ⑤ 关系 Drawer：行点击 → 成员事实分区 + 合同背书关系导航 → Escape 关闭
    await page.locator('tbody tr').first().click()
    const sections = page.getByTestId('entity-drawer-sections')
    await expect(sections).toBeVisible({ timeout: 15_000 })
    await expect(sections.locator('[data-section-id="member-facts"] [data-field-label="用户 TSID"]')).toBeVisible()
    await expect(sections.locator('a[data-relation-id="relation-organization"]')).toHaveAttribute(
      'href',
      `/organizations/${orgId}`
    )
    await expect(sections.locator('a[data-relation-id="relation-user-detail"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sections).toHaveCount(0)
  })
})
