import { expect, type APIResponse, type Locator, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './support/adminAuth'

/**
 * J02 / AT09 / P0 越权 —— 三段 e2e（ADMIN_E2E_MAPPING.md §4 拆解方案落地）。
 *
 * 背景合同（源码锚，2026-11-09 行级核对）：
 * - 卡面（TEST_PLAN.md:49 / AT09_ASSERTION_MAP.md §3）：取消创建→查询无记录；
 *   C 登录调一个允许 + 一个禁止接口；修改 R 后刷新→权限按既定缓存/刷新规则生效。
 * - 内置角色 ACL 基线：imboy/src/adm/adm_index_handler.erl role_acl(3)（audit_admin）
 *   授 dashboard:view / messages:read / logout_applications:read / roles:view /
 *   logs:view / plugins:read / organizations:read（+ux:events:ingest），**不含**
 *   admins:read / roles:create / organizations:write。
 * - 服务端 fail-closed：adm_acl:ensure_permission/3 默认入口保留信封语义
 *   （elib_response:error → HTTP 200 + code=403；显式选择时真 HTTP 403），
 *   断言落在业务码（「HTTP 403 或信封 code=403」，eadm-readonly-access 同款传输约定）。
 * - 端点门：GET /api/adm/role/list 需 roles:view；POST /api/adm/role/create 需
 *   roles:create（adm_role_handler list_action L38 / create_action L58）。
 * - 路由门（App.tsx PermissionRoute）：/organizations 仅 permission=organizations:read
 *   （无角色约束，自定义角色可过）；/admins 需 admins:read + roles=['1']；
 *   /roles 需 roles:view + roles=['1','3','5']；/dashboard 需 dashboard:view +
 *   roles=['1'..'6'] —— **自定义角色 TSID 不在 1..6，即便授 dashboard:view，
 *   仪表盘路由门也结构性拒绝 → 登录后落地 /forbidden（现行合同，非缺陷）**。
 * - 改权限传播合同：POST /api/adm/role/permissions/save（roles:update）→
 *   adm_role_handler:save_role_permissions → config_ds:set('adm_role_permissions')
 *   → save 内 imboy_cache:invalidate（config_ds.erl L189）；GET /api/adm/rbac/me
 *   每次现读 override（adm_index_handler apply_role_acl_override）→ C 侧整页刷新
 *   后权限立即按新矩阵生效（「既定缓存/刷新规则」= 写侧失效 + 读侧现取）。
 * - 防提权（写侧既有负例，本 spec 不重复）：不能改自己所属角色 / 不能授超集
 *   （adm_role_handler guard_permission_escalation）；super_admin 权限锚定代码全集。
 *
 * skip 政策：**本文件禁止 skip**（attachment-lifecycle-v5 同款合同）——凭据缺失
 * 一律 fail-fast 抛错显式红，不用 test.skip、不默认回退、不打印凭据值。
 * 复用 .env.e2e 既有键（无新增基础设施）：
 *   IMBOY_ADMIN_E2E_ACCOUNT / PASSWORD（super，SUPER_* 缺省回退同 adminAuth）
 *   IMBOY_ADMIN_E2E_READONLY_ACCOUNT / PASSWORD（段 b：内置角色 C = audit_admin）
 *   IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX / NEW_ROLE_DESCRIPTION / ROLE_PERMISSION_KEY
 *   IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX / NEW_ADMIN_PASSWORD（段 c：R 与 C 构造）
 */

// ---------------------------------------------------------------------------
// 环境（fail-fast：键缺失 = 显式红带键名；不 skip、不默认回退、不打印值）
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') {
    throw new Error(
      `J02 spec 缺少必需环境变量 ${name}（写入 imboyadmin/.env.e2e；` +
        `本套件禁止 skip，前置缺失必须显式红）`,
    )
  }
  return value
}

/** super 凭据（与 adminAuth getAdminCredentials('super') 同一回退链，但缺失即抛，不 skip）。 */
function superCredentials(): { account: string; password: string } {
  const account = process.env.IMBOY_ADMIN_E2E_SUPER_ACCOUNT?.trim() ||
    process.env.IMBOY_ADMIN_E2E_ACCOUNT?.trim()
  const password = process.env.IMBOY_ADMIN_E2E_SUPER_PASSWORD?.trim() ||
    process.env.IMBOY_ADMIN_E2E_PASSWORD?.trim()
  if (!account || !password) {
    throw new Error(
      'J02 spec 缺少 super 凭据（IMBOY_ADMIN_E2E_SUPER_ACCOUNT/PASSWORD 或 ' +
        'IMBOY_ADMIN_E2E_ACCOUNT/PASSWORD）；本套件禁止 skip，前置缺失必须显式红',
    )
  }
  return { account, password }
}

function readOnlyCredentials(): { account: string; password: string } {
  return {
    account: requiredEnv('IMBOY_ADMIN_E2E_READONLY_ACCOUNT'),
    password: requiredEnv('IMBOY_ADMIN_E2E_READONLY_PASSWORD'),
  }
}

function buildRunScopedName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`
}

// ---------------------------------------------------------------------------
// 小工具（信封形态：{ code, msg, payload? }，src/types/api.ts ApiResponse）
// ---------------------------------------------------------------------------

type Envelope = { code?: number; msg?: string; payload?: unknown }

/** 信封读取：同时接受 page.request 的 APIResponse 与 waitForResponse 的 Response。 */
async function readEnvelope(res: { json: () => Promise<unknown> }): Promise<Envelope> {
  try {
    return (await res.json()) as Envelope
  } catch {
    return {}
  }
}

/** 拒绝码观测：本仓 403 按端点分两种传输（HTTP 403 或 HTTP 200 + 信封 code=403）。 */
async function denyCodeOf(res: APIResponse): Promise<number> {
  if (res.status() === 403) return 403
  const body = await readEnvelope(res)
  return typeof body.code === 'number' ? body.code : res.status()
}

function payloadList(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.items)) return record.items
  if (Array.isArray(record.list)) return record.list
  return []
}

function stringList(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const raw = (payload as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) return []
  // 仅用于小整数/短字符串键（'3'、'dashboard:view'）；TSID 大整数禁止走此路径
  return raw.map((item) => (typeof item === 'number' ? String(item) : typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function roleCard(page: Page, roleName: string): Locator {
  return page.locator(`[data-role-name="${roleName}"]`).first()
}

/** 登录页手工登录（adminAuth.loginAsAdmin 同款步骤）；落地断言由调用方给定
 *（自定义角色 C 登录后落在 /forbidden，不能复用 loginAsAdmin 的仪表盘断言）。 */
async function loginOnLoginPage(page: Page, credentials: { account: string; password: string }): Promise<void> {
  await page.goto('/login')
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
  // 验证码图片依赖后端 API，无后端时不可见，不阻塞登录（adminAuth 同款容忍）
  await page.getByLabel('账号', { exact: true }).fill(credentials.account)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByLabel('验证码', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '登录' }).click()
}

// ---------------------------------------------------------------------------
// 段 a：取消创建零副作用（J02 卡面「取消创建→查询无记录」）
// ---------------------------------------------------------------------------

test('J02-a 角色创建取消零副作用：无写请求、列表无新角色、查询无记录', async ({ page }) => {
  const credentials = superCredentials()
  const roleName = buildRunScopedName(
    process.env.IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX?.trim() || 'pw_e2e_role',
  )
  const roleDescription = process.env.IMBOY_ADMIN_E2E_NEW_ROLE_DESCRIPTION?.trim() ||
    'Playwright E2E created role'
  const permissionKey = process.env.IMBOY_ADMIN_E2E_ROLE_PERMISSION_KEY?.trim() || 'reports:read'

  await loginAsAdmin(page, credentials)
  // 基线锚在服务端响应（而非首帧 DOM）：/roles 页卡片先渲染 fallback 模板、
  // role/list 落地后才换成 DB 数据——以 API 响应为基线，等卡片数收敛到一致，
  // 避免「基线读到 fallback、取消后读到 DB 数据」的假红。
  const roleListResPromise = page.waitForResponse(
    (res) => res.url().includes('/api/adm/role/list') && res.request().method() === 'GET',
  )
  await page.goto('/roles')
  const roleListRes = await roleListResPromise
  await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
  const roleListBody = await readEnvelope(roleListRes)
  const baselineNames = payloadList(roleListBody.payload).map((item) =>
    typeof item === 'object' && item !== null ? String((item as Record<string, unknown>)['name'] ?? '') : '',
  )
  expect(baselineNames.length, '角色列表基线非空').toBeGreaterThan(0)
  const roleCards = page.locator('[data-role-name]')
  await expect.poll(
    () => roleCards.count(),
    { message: '等待角色卡片收敛到 role/list 响应形态', timeout: 15_000 },
  ).toBe(baselineNames.length)

  // 网络监听：取消路径必须零写请求（J02 验收「取消不落库」的传输侧证据）
  const createPostUrls: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/adm/role/create')) {
      createPostUrls.push(req.url())
    }
  })

  // 进入创建 → 填写（名称/描述/初始权限键都填，确保「若误提交」会真实落库）
  await page.getByRole('button', { name: '新增角色' }).click()
  const roleDrawer = page.locator('aside').filter({
    hasText: '创建新角色并设置初始权限集合',
  }).first()
  await expect(roleDrawer).toBeVisible()
  await roleDrawer.getByPlaceholder('例如：内容巡检管理员').fill(roleName)
  await roleDrawer.getByPlaceholder('可选').fill(roleDescription)
  await roleDrawer.getByPlaceholder('支持逗号、空格或换行分隔，例如：reports:read, reports:handle')
    .fill(permissionKey)

  // 取消：抽屉卸载（EntityDrawer open=false → return null，表单离开 DOM）
  await roleDrawer.getByRole('button', { name: '取消' }).click()
  await expect(roleDrawer).toHaveCount(0)

  // 残留断言 1：列表无新角色（角色卡片集合逐一相等）
  await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
  const afterNames = await roleCards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-role-name') || ''),
  )
  expect(afterNames, '取消后角色集合不得变化').toEqual(baselineNames)
  await expect(page.locator(`[data-role-name="${roleName}"]`)).toHaveCount(0)

  // 残留断言 2：全程零次 POST /api/adm/role/create
  expect(createPostUrls, '取消创建不得发出任何角色创建写请求').toHaveLength(0)

  // 残留断言 3（J02 卡面「查询无记录」）：服务端 role/list 不得含该名称
  const listRes = await page.request.get('/api/adm/role/list?page=1&size=100&status=-1')
  expect(listRes.status(), 'super 会话查询 role/list 应被允许（roles:view）').toBe(200)
  const listBody = await readEnvelope(listRes)
  expect(listBody.code, 'role/list 业务码应为 0').toBe(0)
  const serverNames = payloadList(listBody.payload).map((item) =>
    typeof item === 'object' && item !== null ? String((item as Record<string, unknown>)['name'] ?? '') : '',
  )
  expect(serverNames, '服务端角色列表不得包含被取消的角色名').not.toContain(roleName)
})

// ---------------------------------------------------------------------------
// 段 b：内置角色 C 登录权限矩阵（允许面可见 + 禁止面拒绝，按 ACL 矩阵合同）
// ---------------------------------------------------------------------------

test('J02-b 内置角色 C（audit_admin）登录：允许面可见、禁止面拒绝（ACL 矩阵合同）', async ({ page }) => {
  const cCredentials = readOnlyCredentials()

  // C 登录：dashboard:view ∈ role_acl(3) 基线 → 登录落地仪表盘
  await loginAsAdmin(page, cCredentials)

  // 权威权限集（GET /api/adm/rbac/me 每次现读，role_acl(3) 基线锚）：
  // 先钉住基线，再断言 UI/API 行为与之一致（「按 ACL 矩阵合同」）。
  const meRes = await page.request.get('/api/adm/rbac/me')
  expect(meRes.status(), 'C 会话读取 rbac/me 应被允许').toBe(200)
  const meBody = await readEnvelope(meRes)
  expect(meBody.code, 'rbac/me 业务码应为 0').toBe(0)
  const cPermissions = stringList(meBody.payload, 'permissions')
  const cRoleIds = stringList(meBody.payload, 'role_ids')
  expect(cRoleIds, 'C 应绑定内置角色 role_id=3（audit_admin 种子合同）').toContain('3')
  // 基线授予面（允许侧锚）
  expect(cPermissions, '基线应含 dashboard:view').toContain('dashboard:view')
  expect(cPermissions, '基线应含 organizations:read').toContain('organizations:read')
  expect(cPermissions, '基线应含 roles:view').toContain('roles:view')
  // 基线排除面（禁止侧锚）
  expect(cPermissions, '基线不得含 admins:read').not.toContain('admins:read')
  expect(cPermissions, '基线不得含 roles:create').not.toContain('roles:create')
  expect(cPermissions, '基线不得含 organizations:write').not.toContain('organizations:write')

  // 允许面 1：/organizations（路由仅 permission 门，organizations:read 已授）
  await page.goto('/organizations')
  await expect(
    page.locator('[data-page="organization-list"]'),
    'C 持 organizations:read 应能进入组织治理只读页',
  ).toBeVisible({ timeout: 15_000 })

  // 允许面 2：/roles（roles:view 已授 + 角色门 ['1','3','5'] 含 '3'）；
  // 且因 roles:create 未授，页面不得出现「新增角色」写入口（前端隐藏不是安全边界，
  // 仅是矩阵一致性旁证，服务端拒绝见下方 API 断言）。
  await page.goto('/roles')
  await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '新增角色' }),
    'C 无 roles:create，不得看到「新增角色」写入口',
  ).toHaveCount(0)

  // 禁止面 1（结构性角色门）：/admins 需 roles=['1'] → 直达被顶到 /forbidden
  await page.goto('/admins')
  await expect(page, 'C 直达 /admins 必须被路由门顶到 /forbidden').toHaveURL(/\/forbidden$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '无权限访问' })).toBeVisible()

  // 禁止面 2（J02 卡面「禁止接口」）：直调 POST /role/create（roles:create 未授）
  // → 服务端 fail-closed 恒拒（HTTP 403 或信封 code=403）；探针名 run 唯一，
  // 万一权限泄漏误建成功，断言红且该角色名可识别清理。
  const probeRoleName = buildRunScopedName('j02_probe_role')
  const createRes = await page.request.post('/api/adm/role/create', {
    data: { name: probeRoleName, permissions: ['reports:read'], status: 1 },
  })
  const observedCreateDeny = await denyCodeOf(createRes)
  expect(
    observedCreateDeny,
    'C 直调 POST /api/adm/role/create 必须被 fail-closed 拒绝（HTTP 403 或信封 code=403）',
  ).toBe(403)

  // 允许接口对照（J02 卡面「允许接口」）：GET /role/list（roles:view 已授）
  // → 放行且业务码 0，证明拒绝的是写权限、会话仍有效。
  const listRes = await page.request.get('/api/adm/role/list?page=1&size=10&status=-1')
  expect(listRes.status(), 'C 直调 GET /api/adm/role/list 应被允许（roles:view 已授）').toBe(200)
  const listBody = await readEnvelope(listRes)
  expect(listBody.code, 'C 的 role/list 业务码应为 0').toBe(0)
})

// ---------------------------------------------------------------------------
// 段 c：改 R 权限 → C 侧刷新传播（撤权方向生效 + 未撤权限不受影响）
// ---------------------------------------------------------------------------

test('J02-c 修改角色 R 权限后 C 侧刷新传播：撤权生效、未撤权限保持', async ({ page, browser }) => {
  const credentials = superCredentials()
  const roleName = buildRunScopedName(
    process.env.IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX?.trim() || 'pw_e2e_role',
  )
  const account = buildRunScopedName(
    process.env.IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX?.trim() || 'pw_e2e_admin',
  )
  const password = process.env.IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD?.trim() || 'Passw0rd!'
  // R 初始授权：dashboard:view + organizations:read（均为权限目录 established 键）
  const grantedKeys = 'dashboard:view, organizations:read'
  const revokeKey = 'organizations:read'

  // —— 超管：创建角色 R（初始权限经创建抽屉「初始权限键」文本域提交，
  //      POST /role/create 原样落 override map）——
  await loginAsAdmin(page, credentials)
  await page.goto('/roles')
  await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
  await page.getByRole('button', { name: '新增角色' }).click()
  const roleDrawer = page.locator('aside').filter({
    hasText: '创建新角色并设置初始权限集合',
  }).first()
  await expect(roleDrawer).toBeVisible()
  await roleDrawer.getByPlaceholder('例如：内容巡检管理员').fill(roleName)
  await roleDrawer.getByPlaceholder('可选').fill(`J02-c propagation role ${roleName}`)
  await roleDrawer.getByPlaceholder('支持逗号、空格或换行分隔，例如：reports:read, reports:handle')
    .fill(grantedKeys)
  await roleDrawer.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByText('角色创建成功')).toBeVisible()
  await expect(roleCard(page, roleName)).toBeVisible()

  // —— 超管：创建管理员 C 并绑定 R（/admins 创建抽屉角色下拉选 R）——
  await page.goto('/admins')
  await expect(page.getByRole('heading', { name: '管理员中心' })).toBeVisible()
  await page.getByRole('button', { name: '新增管理员' }).click()
  const adminDrawer = page.locator('aside').filter({
    hasText: '创建后台管理员账号并分配初始角色',
  }).first()
  await expect(adminDrawer).toBeVisible()
  await adminDrawer.getByPlaceholder('请输入管理员账号').fill(account)
  await adminDrawer.getByPlaceholder('至少 6 位').fill(password)
  const drawerRoleSelect = adminDrawer.locator('select').first()
  await expect.poll(
    async () => {
      const labels = await drawerRoleSelect.locator('option').evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLOptionElement).textContent?.trim() || ''),
      )
      return labels.includes(roleName)
    },
    { message: '等待新建角色 R 出现在可分配角色下拉中', timeout: 15_000 },
  ).toBe(true)
  await drawerRoleSelect.selectOption({ label: roleName })
  await adminDrawer.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByText('管理员创建成功')).toBeVisible()

  // —— C 侧（独立 browser context）：登录 → 权限初态观测 ——
  const cContext = await browser.newContext()
  try {
    const cPage = await cContext.newPage()
    // 自定义角色 C：/dashboard 路由角色门 roles=['1'..'6'] 不含自定义 TSID
    // → 登录成功后落地 /forbidden（结构性拒绝，与权限授予无关，现行合同）
    await loginOnLoginPage(cPage, { account, password })
    await expect(cPage).toHaveURL(/\/forbidden$/, { timeout: 15_000 })
    await expect(cPage.getByRole('heading', { name: '无权限访问' })).toBeVisible()

    // 初态允许面：/organizations 仅 permission 门（organizations:read 已授）→ 可见
    await cPage.goto('/organizations')
    await expect(
      cPage.locator('[data-page="organization-list"]'),
      '授权期 C 应能进入组织治理页',
    ).toBeVisible({ timeout: 15_000 })
    const orgsBefore = await cPage.request.get('/api/adm/organizations?page=1&size=1')
    expect(orgsBefore.status(), '授权期 C 直调 GET /api/adm/organizations 应被允许').toBe(200)

    // —— 超管：改 R 权限（撤掉 organizations:read，保留 dashboard:view）并保存 ——
    await page.goto('/roles')
    await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
    await roleCard(page, roleName).getByRole('button', { name: '编辑权限' }).click()
    await page.getByPlaceholder('搜索权限名 / 模块 / 路径 / 键名').fill(revokeKey)
    const permissionItem = page.locator(`[data-permission-key="${revokeKey}"]`).first()
    await expect(permissionItem).toBeVisible()
    await permissionItem.locator('input[type="checkbox"]').first().uncheck()
    await expect(page.getByText('有未保存变更')).toBeVisible()
    await page.getByRole('button', { name: '保存权限' }).click()
    // 保存会弹「确认保存角色权限」二次确认框（alertdialog），确认后才真正提交
    const saveConfirmDialog = page.getByRole('alertdialog')
    await expect(saveConfirmDialog).toBeVisible()
    await saveConfirmDialog.getByRole('button', { name: '确认保存' }).click()
    await expect(page.getByText('角色权限已保存')).toBeVisible()

    // —— 传播（服务端）：按既定缓存/刷新规则（save → invalidate → 现读生效），
    //      C 会话的服务端 ACL 判定翻转为拒绝（expect.poll 吸收失效延迟，超时即红）——
    await expect.poll(
      async () => {
        const res = await cPage.request.get('/api/adm/organizations?page=1&size=1')
        return await denyCodeOf(res)
      },
      {
        message: '等待 R 权限变更传播到 C 的服务端 ACL 判定（撤权后必须拒绝）',
        timeout: 20_000,
      },
    ).toBe(403)

    // —— 传播（C 侧刷新）：原地整页 reload → /rbac/me 现读新矩阵 →
    //      /organizations 路由门重新判定 → 被顶到 /forbidden ——
    await cPage.reload()
    await expect(cPage, '撤权后 C 刷新必须被路由门顶到 /forbidden').toHaveURL(/\/forbidden$/, { timeout: 15_000 })
    await expect(cPage.getByRole('heading', { name: '无权限访问' })).toBeVisible()

    // —— 定向性：未撤销的权限不得被连带回收（C 会话仍然有效、拒绝的是被撤键）——
    //    （dashboard:view 因 /dashboard 结构性角色门对自定义角色恒不可达，
    //     故定向性以「会话仍活 + 服务端精确拒绝被撤键」表达；rbac/me 仍 200。）
    const meAfter = await cPage.request.get('/api/adm/rbac/me')
    expect(meAfter.status(), '撤权不影响 C 会话本身（rbac/me 仍可读）').toBe(200)
    const meAfterBody = await readEnvelope(meAfter)
    expect(meAfterBody.code, '撤权后 rbac/me 业务码应为 0').toBe(0)
    const cPermissionsAfter = stringList(meAfterBody.payload, 'permissions')
    expect(
      cPermissionsAfter,
      '撤权后 C 权限集不得再含 organizations:read',
    ).not.toContain(revokeKey)
    expect(
      cPermissionsAfter,
      '撤权后 C 权限集仍应保留未被撤销的 dashboard:view',
    ).toContain('dashboard:view')
  } finally {
    await cContext.close()
  }
})
