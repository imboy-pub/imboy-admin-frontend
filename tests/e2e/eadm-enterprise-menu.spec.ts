import { expect, type APIRequestContext, test } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * EADM-07 · 计划 §9 第 1 / 5 / 6 条（菜单域集成 E2E）。
 *
 *   §9-1 —— super admin 登录后从菜单进入企业组织，「企业管理」6 个叶子全部可达。
 *   §9-5 —— 在线客服 / 企业业务数据 / 离岗交接均从菜单可达，
 *           且**刷新后仍保留 URL 的 `org` / `ws` 上下文**（URL 是上下文真源，EADM-06 codec）。
 *   §9-6 —— `/customer-service/workspace` 仍要求 Seat 二维码登录，**不继承 Admin Cookie**
 *           （两认证域绝不混用，合同 C1 尾注 / SEAT-01-A01）。
 *
 * 冻结真源：
 *   - 6 叶子表（path 为唯一比较键），后端 adm_admin_handler:default_sidebar_config/0；
 *   - Admin presentation 映射 = src/components/layout/sidebarSchema.ts（顶级组名「企业管理」）；
 *   - Seat 域独立路由 = src/App.tsx（/customer-service/workspace 在 ProtectedRoute **之外**）。
 *
 * skip 约定（沿用本仓 admin-rbac.spec.ts 既有模式，不假装通过）：
 *   - **收集期凭据门**（同步，describe 级 test.skip）：缺 super_admin 凭据即整组 skip，
 *     不需要启动浏览器——否则「无凭据」会先撞 browserType.launch 硬失败（本环境实证）；
 *   - 体内仍用 requireAdminCredentials（同一 helper、同一 skip 语义，沿用既有约定）；
 *   - admin 前端(:8082) / imboy 后端(:9800) 任一不可达时显式 test.skip（环境阻塞）。
 * 严禁把 cookie/token/secret/手机号/邮箱写入文件或报告；断言只针对行为
 * （菜单项可见性 / 路由 pathname / 页面 data-page 标记 / 真实文案 / URL 查询参数）。
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
    return res.status() < 500 // 401/403 = 后端可达（仅缺鉴权）
  } catch {
    return false
  }
}

/** 顶级菜单组名（C1 冻结）。 */
const ENTERPRISE_GROUP_LABEL = '企业管理'

/** §9-6：坐席工作台是独立 Seat 认证域，不在 Admin 保护路由内。 */
const SEAT_WORKSPACE_PATH = '/customer-service/workspace'

/**
 * §9-1 中可断言「点击 → 落到该 Admin 页面」的 5 个叶子（marker = 页面 data-page）。
 * PR-W2-C05 对齐：后端 default_sidebar_config 已演进为 9 叶子（组织治理/工作区/
 * 企业项目/企业群/企业频道/客服坐席/应用与集成/离岗交接/企业审计业务数据），
 * 旧 6 叶子标签（企业组织/在线客服/坐席工作台）已不存在，按现行合同改写。
 */
const ADMIN_LEAF_MENUS = [
  { label: '组织治理', path: '/organizations', marker: '[data-page="organization-list"]' },
  { label: '企业审计/业务数据', path: '/enterprise-business', marker: '[data-page="enterprise-business-readonly"]' },
  { label: '离岗交接', path: '/enterprise-business/offboarding', marker: '[data-page="eb-offboarding-cases"]' },
  { label: '应用与集成', path: '/enterprise/applications', marker: '[data-page="enterprise-applications"]' },
  { label: '客服坐席', path: '/customer-service', marker: '[data-page="customer-service-home"]' },
] as const

/** 现行 9 叶子中无独立 data-page 标记的 4 个（presence-only：入口存在即菜单合同成立）。 */
const PRESENCE_ONLY_LEAVES = ['工作区', '企业项目', '企业群', '企业频道'] as const

/** 独立 Seat 入口：/customer-service/workspace 直达（现行侧栏无该叶子；Seat 域独立路由）。 */
const _SEAT_LEAF = { label: '坐席工作台', path: SEAT_WORKSPACE_PATH } as const

/** 「企业管理」叶子（顺序即 sidebarSchema 下发顺序）。 */
const ENTERPRISE_LEAF_MENUS = [...ADMIN_LEAF_MENUS, ...PRESENCE_ONLY_LEAVES.map((label) => ({ label, path: '', marker: '' }))] as const

/**
 * §9-5：需要 org/ws 上下文的 3 个叶子。
 * scopeProbe 存在时 = 该页把 URL 的 org/ws 作为「只读事实域」渲染出来，
 * 可做与 URL 精确比对的强断言（不依赖后端 seed 数据）。
 */
const ORG_WS_LEAF_MENUS = [
  {
    label: '客服坐席',
    path: '/customer-service',
    marker: '[data-page="customer-service-home"]',
    scopeProbe: null,
  },
  {
    label: '企业审计/业务数据',
    path: '/enterprise-business',
    marker: '[data-page="enterprise-business-readonly"]',
    scopeProbe: '[data-testid="eb-scope-troubleshooting"]',
  },
  {
    label: '离岗交接',
    path: '/enterprise-business/offboarding',
    marker: '[data-page="eb-offboarding-cases"]',
    scopeProbe: '[data-testid="eb-off-scope-troubleshooting"]',
  },
] as const

/** 形态合法的 TSID（与既有 spec 惯例一致：仅用于 URL 上下文，不是任何真实实体）。 */
const ORG_TSID = '1234567890123456789'
const WS_TSID = '1234567890123456788'

/**
 * 收集期凭据门（同步）：缺 super_admin 凭据即整组 skip。
 * 必须放在 describe 内、test 外——否则 page fixture 会先启动浏览器，
 * 「无凭据」将表现为 browserType.launch 硬失败而非 skip（本环境实证，见 RESULT-W2）。
 */
const SUPER_CREDENTIALS_HINT =
  '需要 super_admin 凭据（IMBOY_ADMIN_E2E_SUPER_ACCOUNT/_PASSWORD 或 IMBOY_ADMIN_E2E_ACCOUNT/_PASSWORD）；缺凭据在收集期即 skip，不启动浏览器'

function currentPath(page: { url: () => string }): string {
  return new URL(page.url()).pathname
}

test.describe('EADM-07 §9-1 · 企业管理菜单可达性（6 个叶子）', () => {
  test.skip(!getAdminCredentials('super'), SUPER_CREDENTIALS_HINT)

  test('§9-1 super admin 从菜单进入企业组织，5 个 Admin 叶子点击后落到页面本体，Seat 叶子入口可见', async ({ page, request }) => {
    const credentials = requireAdminCredentials('super')
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞：需 Vite dev server；或设 PLAYWRIGHT_DISABLE_WEBSERVER=1）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞：需本地后端监听，或 .env.e2e 提供 IMBOY_ADMIN_BASE_URL）')

    await loginAsAdmin(page, credentials)

    // 行为断言 1：侧边栏渲染 C1 冻结的顶级组名「企业管理」。
    await expect(
      page.getByText(ENTERPRISE_GROUP_LABEL, { exact: true }).first(),
      '侧边栏应呈现「企业管理」分组（C1 冻结顶级组名）',
    ).toBeVisible()

    // 行为断言 2：9 个叶子的菜单入口全部存在（现行 default_sidebar_config 合同）。
    for (const menu of ENTERPRISE_LEAF_MENUS) {
      await expect(
        page.getByRole('link', { name: menu.label, exact: true }).first(),
        `侧边栏应含「${menu.label}」菜单项（现行冻结叶子）`,
      ).toBeVisible()
    }

    // 行为断言 3：5 个 Admin 叶子点击后 both 路由 pathname 与页面 data-page 标记都命中
    //（只断言 URL 不足以证明页面本体渲染成功）。
    for (const menu of ADMIN_LEAF_MENUS) {
      await page.goto('/dashboard')
      await page.getByRole('link', { name: menu.label, exact: true }).first().click()

      await expect
        .poll(() => currentPath(page), { timeout: 15_000 })
        .toBe(menu.path)
      await expect(
        page.locator(menu.marker),
        `点击「${menu.label}」后应渲染页面标记 ${menu.marker}`,
      ).toBeVisible({ timeout: 15_000 })
    }
  })
})

test.describe('EADM-07 §9-5 · 3 个任务入口可达 + 刷新保留 org/ws', () => {
  test.skip(!getAdminCredentials('super'), SUPER_CREDENTIALS_HINT)

  test('§9-5 在线客服/企业业务/离岗交接从菜单可达，且刷新后 URL 仍保留 org/ws 并恢复同页上下文', async ({ page, request }) => {
    const credentials = requireAdminCredentials('super')
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞）')

    await loginAsAdmin(page, credentials)

    for (const target of ORG_WS_LEAF_MENUS) {
      // 行为断言 1：菜单入口存在（§9-5「均从菜单可达」）。
      const link = page.getByRole('link', { name: target.label, exact: true }).first()
      await expect(link, `侧边栏应含「${target.label}」菜单项`).toBeVisible()
      await link.click()
      await expect
        .poll(() => currentPath(page), { timeout: 15_000 })
        .toBe(target.path)

      // 行为断言 2：带 org/ws 进入后页面渲染自身标记（未跳登录、未 404、未白屏）。
      await page.goto(`${target.path}?org=${ORG_TSID}&ws=${WS_TSID}`)
      await expect(
        page.locator(target.marker),
        `「${target.label}」应渲染 ${target.marker}`,
      ).toBeVisible({ timeout: 15_000 })

      // 行为断言 3：刷新（真实 reload）后 URL 仍带 org/ws，且页面标记仍在。
      // 这证明上下文来自 URL 而非内存态——刷新/分享都不丢（EADM-06 codec 语义）。
      await page.reload()
      await expect(
        page.locator(target.marker),
        `刷新后「${target.label}」应仍在同页（不得因丢上下文被弹走）`,
      ).toBeVisible({ timeout: 15_000 })

      const afterReload = new URL(page.url())
      expect(afterReload.pathname, '刷新后路由不得漂移').toBe(target.path)
      expect(afterReload.searchParams.get('org'), '刷新后 org 不得丢失').toBe(ORG_TSID)
      expect(afterReload.searchParams.get('ws'), '刷新后 ws 不得丢失').toBe(WS_TSID)

      // 行为断言 4（强化，不依赖后端 seed）：企业业务数据 / 离岗交接把 URL 的
      // org/ws 作为只读事实域原样渲染 → 与 URL 精确比对，证明解析值未被误解或互换。
      if (target.scopeProbe !== null) {
        const probe = page.locator(target.scopeProbe)
        await expect(probe, `「${target.label}」应渲染 org/ws 事实域`).toBeVisible()
        await expect(probe, 'org 事实域必须等于 URL 的 org（不得把 ws 当 org）').toContainText(`org: ${ORG_TSID}`)
        await expect(probe, 'ws 事实域必须等于 URL 的 ws（不得把 org 当 ws）').toContainText(`ws: ${WS_TSID}`)
      }
    }
  })
})

test.describe('EADM-07 §9-6 · Seat 域不继承 Admin Cookie', () => {
  test.skip(!getAdminCredentials('super'), SUPER_CREDENTIALS_HINT)

  test('§9-6 /customer-service/workspace 仍要求 Seat 二维码登录，Admin Cookie 不放行坐席工作台', async ({ page, request }) => {
    const credentials = requireAdminCredentials('super')
    test.skip(!(await probeFrontend(request)), 'admin 前端(:8082) 未启动（环境阻塞）')
    test.skip(!(await probeBackend(request)), 'imboy 后端(:9800) 不可达（环境阻塞）')

    // 前置：先建立有效 Admin 会话（Cookie 已被 Admin 面接受）。
    await loginAsAdmin(page, credentials)
    await expect(page, '前置：Admin 会话应已就绪（/dashboard）').toHaveURL(/\/dashboard(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible()

    // 行为断言 1：直链进入独立 Seat 路由（现行侧栏已无「坐席工作台」叶子，2026-09
    // 演进为 9 叶子合同；Seat 域独立路由合同不变，见 src/App.tsx）。
    await page.goto(SEAT_WORKSPACE_PATH)

    // 行为断言 2：落到独立 Seat 路由（不在 Admin 保护路由内）。
    await expect
      .poll(() => currentPath(page), { timeout: 15_000 })
      .toBe(SEAT_WORKSPACE_PATH)

    // 行为断言 3：呈现 Seat 二维码登录门（真实标题 / 说明 / 换码入口）。
    await expect(page.getByTestId('seat-qr-login'), '应呈现 Seat 扫码登录门').toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('坐席登录', { exact: true })).toBeVisible()
    await expect(page.getByText('使用手机 Imboy 扫码，登录 Web 坐席工作台')).toBeVisible()
    await expect(page.getByRole('button', { name: '换一张码' })).toBeVisible()

    // 行为断言 4（核心）：Admin Cookie 绝不授予坐席工作台——未建立 Seat 会话时
    // 工作台本体不得渲染（seat-workspace 是「已认证」分支的标记）。
    await expect(
      page.getByTestId('seat-workspace'),
      'Admin Cookie 不得直接打开坐席工作台（两认证域绝不混用）',
    ).toHaveCount(0)

    // 行为断言 5：Seat 域不渲染 Admin 外壳（无「企业管理」等后台导航）。
    await expect(
      page.getByText(ENTERPRISE_GROUP_LABEL, { exact: true }),
      'Seat 域不得渲染 Admin 侧边栏',
    ).toHaveCount(0)

    // 行为断言 6：直链刷新仍回到 Seat 登录门（Admin Cookie 不在刷新后被消费）。
    await page.reload()
    await expect(page.getByTestId('seat-qr-login'), '刷新后仍应要求 Seat 扫码登录').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('seat-workspace')).toHaveCount(0)
    expect(currentPath(page), '刷新后仍应停在 Seat 路由').toBe(SEAT_WORKSPACE_PATH)
  })
})
