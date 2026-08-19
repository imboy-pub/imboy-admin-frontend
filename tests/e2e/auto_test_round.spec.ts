/**
 * auto_test 一轮巡检器（阶段A：导航 + 安全交互）
 *
 * 目的：对 tests/auto_test/ 计划中的全部页面做一轮自动化证据采集：
 * - 逐页导航，记录 API 响应码 / console 错误 / 最终 URL / 截图
 * - 每页执行一组「安全交互」：搜索、重置、新建弹窗打开后取消、导出、翻页
 * - 从列表页响应中提取真实业务 ID，供 :id 详情页使用
 *
 * 输出：tests/auto_test/evidence/_report-<round>.json + 各模块截图
 *
 * 用法：
 *   PLAYWRIGHT_DISABLE_WEBSERVER=1 bunx playwright test tests/e2e/auto_test_round.spec.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Response } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'
import { safeParseBigIntJson } from '../../src/lib/safeParseBigIntJson'

type PageSpec = {
  slug: string
  module: string
  path: string
  /** 需要从哪个列表的 API 响应里提取真实 ID */
  idFrom?: 'users' | 'groups' | 'channels' | 'moments'
  /** 敏感模块（资金/审批/密钥）不自动点「新建」类按钮 */
  skipCreate?: boolean
}

type ApiCall = { method: string; status: number; url: string }

type ActionRecord = { name: string; ok: boolean; detail: string; apiDelta: ApiCall[] }

type PageReport = {
  slug: string
  module: string
  requestedPath: string
  finalUrl: string
  redirected: boolean
  apis: ApiCall[]
  consoleErrors: string[]
  pageErrors: string[]
  actions: ActionRecord[]
  screenshots: string[]
  skippedReason?: string
}

const ROUND = process.env.AUTO_TEST_ROUND || `round-${new Date().toISOString().slice(5, 10).replace(/-/g, '')}-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const REPORT_PATH = path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`)
/** 断点续跑：从该 slug 之后继续（含） */
const START_FROM = process.env.AUTO_TEST_START_FROM || ''
/** 只跑这些 slug（逗号分隔，优先于 START_FROM） */
const ONLY = (process.env.AUTO_TEST_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
/** 硬超时：单个 action 最多执行这么久，防卡死 */
const withHardTimeout = <T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> =>
  Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`hard-timeout ${label} ${ms}ms`)), ms)),
  ])

/** 全部 74 个页面（与 App.tsx 路由一一对应） */
const PAGES: PageSpec[] = [
  { slug: 'AnalyticsPage', module: 'analytics', path: '/analytics' },
  { slug: 'AnnouncementListPage', module: 'announcements', path: '/announcements' },
  { slug: 'BillingInvoiceListPage', module: 'billing-invoices', path: '/billing-invoices', skipCreate: true },
  { slug: 'BillingPlanListPage', module: 'billing-plans', path: '/billing-plans', skipCreate: true },
  { slug: 'BillingSubscriptionListPage', module: 'billing-subscriptions', path: '/billing-subscriptions', skipCreate: true },
  { slug: 'PaymentTransactionListPage', module: 'payment-transactions', path: '/payment-transactions', skipCreate: true },
  { slug: 'RechargeOrderListPage', module: 'recharge-orders', path: '/recharge-orders', skipCreate: true },
  { slug: 'WalletListPage', module: 'wallets', path: '/wallets', skipCreate: true },
  { slug: 'WithdrawalsPage', module: 'withdrawals', path: '/withdrawals', skipCreate: true },
  { slug: 'FinanceReportPage', module: 'finance-report', path: '/finance-report' },
  { slug: 'PricingPage', module: 'pricing', path: '/pricing' },

  { slug: 'SensitiveWordPage', module: 'content-moderation', path: '/moderation/sensitive-words' },
  { slug: 'ContentReviewQueuePage', module: 'content-moderation', path: '/moderation/review-queue', skipCreate: true },

  { slug: 'DashboardPage', module: 'dashboard', path: '/dashboard' },
  { slug: 'ForbiddenPage', module: 'errors', path: '/forbidden' },
  { slug: 'NotFoundPage', module: 'errors', path: '/nonexistent-xyz-404' },
  { slug: 'LicensePage', module: 'license', path: '/license', skipCreate: true },
  { slug: 'LogoutApplicationListPage', module: 'logout-applications', path: '/logout-applications', skipCreate: true },
  { slug: 'AuditLogPage', module: 'logs', path: '/logs' },
  { slug: 'McpGovernanceListPage', module: 'mcp-governance', path: '/mcp-governance', skipCreate: true },
  { slug: 'MessageListPage', module: 'messages', path: '/messages' },
  { slug: 'ReportCenterPage', module: 'reports', path: '/reports' },
  { slug: 'RolePermissionPage', module: 'roles', path: '/roles' },
  { slug: 'StorageOverviewPage', module: 'storage', path: '/storage' },
  { slug: 'SystemHealthPage', module: 'system-health', path: '/system-health' },
  { slug: 'PluginManagementPage', module: 'plugin_management', path: '/plugins' },
  { slug: 'PluginLogPage', module: 'plugin_management', path: '/plugins/logs' },

  { slug: 'UserListPage', module: 'users', path: '/users' },
  { slug: 'UserDetailPage', module: 'users', path: '/users/{id}', idFrom: 'users' },
  { slug: 'UserTagManagePage', module: 'users', path: '/users/{id}/tags', idFrom: 'users' },
  { slug: 'UserCollectManagePage', module: 'users', path: '/users/{id}/collects', idFrom: 'users' },

  { slug: 'GroupListPage', module: 'groups', path: '/groups' },
  { slug: 'GroupTaskListPage', module: 'groups', path: '/groups/tasks' },
  { slug: 'GroupContextGatewayPage', module: 'groups', path: '/groups/context' },
  { slug: 'GroupDetailPage', module: 'groups', path: '/groups/{id}', idFrom: 'groups' },
  { slug: 'GroupMemberManagePage', module: 'groups', path: '/groups/{id}/members', idFrom: 'groups' },
  { slug: 'GroupVoteManagePage', module: 'groups', path: '/groups/{id}/votes', idFrom: 'groups' },
  { slug: 'GroupNoticeManagePage', module: 'groups', path: '/groups/{id}/notices', idFrom: 'groups' },
  { slug: 'GroupCategoryManagePage', module: 'groups', path: '/groups/{id}/categories', idFrom: 'groups' },
  { slug: 'GroupTagManagePage', module: 'groups', path: '/groups/{id}/tags', idFrom: 'groups' },
  { slug: 'GroupFileManagePage', module: 'groups', path: '/groups/{id}/files', idFrom: 'groups' },
  { slug: 'GroupAlbumManagePage', module: 'groups', path: '/groups/{id}/albums', idFrom: 'groups' },
  { slug: 'GroupScheduleManagePage', module: 'groups', path: '/groups/{id}/schedules', idFrom: 'groups' },
  { slug: 'GroupTaskManagePage', module: 'groups', path: '/groups/{id}/tasks', idFrom: 'groups' },
  { slug: 'GroupGovernanceLogPage', module: 'groups', path: '/groups/{id}/governance-logs', idFrom: 'groups' },

  { slug: 'MomentListPage', module: 'moments', path: '/moments' },
  { slug: 'MomentDetailPage', module: 'moments', path: '/moments/{id}', idFrom: 'moments' },
  { slug: 'MomentReportPage', module: 'moments', path: '/moments/reports' },

  { slug: 'ChannelListPage', module: 'channels', path: '/channels' },
  { slug: 'PaidChannelOpsPage', module: 'channels', path: '/channels/paid' },
  { slug: 'ChannelDetailPage', module: 'channels', path: '/channels/{id}', idFrom: 'channels' },
  { slug: 'ChannelMessagePage', module: 'channels', path: '/channels/{id}/messages', idFrom: 'channels' },
  { slug: 'ChannelSubscriberPage', module: 'channels', path: '/channels/{id}/subscribers', idFrom: 'channels' },
  { slug: 'ChannelAdminPage', module: 'channels', path: '/channels/{id}/admins', idFrom: 'channels' },
  { slug: 'ChannelInvitationPage', module: 'channels', path: '/channels/{id}/invitations', idFrom: 'channels' },
  { slug: 'ChannelOrderPage', module: 'channels', path: '/channels/{id}/orders', idFrom: 'channels' },

  { slug: 'SettingsHomePage', module: 'settings', path: '/settings' },
  { slug: 'FeatureConfigPage', module: 'settings', path: '/settings/features' },
  { slug: 'ProfileSwitchPage', module: 'settings', path: '/settings/profile' },
  { slug: 'CapabilityConfigPage', module: 'settings', path: '/settings/capabilities' },
  { slug: 'ComplianceKeyPage', module: 'settings', path: '/settings/compliance-keys', skipCreate: true },
  { slug: 'VersionPage', module: 'settings', path: '/settings/versions' },
  { slug: 'MutedUsersPage', module: 'settings', path: '/settings/muted-users' },
  { slug: 'PushTokenListPage', module: 'settings', path: '/settings/push-tokens' },
  { slug: 'DDLPage', module: 'settings', path: '/settings/ddl' },
  { slug: 'SSOConfigPage', module: 'settings', path: '/settings/sso', skipCreate: true },

  { slug: 'AiAgentListPage', module: 'ai_agent', path: '/ai-agents' },
  { slug: 'OnboardingConfigPage', module: 'ai_agent', path: '/ai-agents/onboarding' },
  { slug: 'KnowledgeConfigPage', module: 'ai_agent', path: '/ai-agents/knowledge' },
  { slug: 'AiRolesPage', module: 'ai_agent', path: '/ai-agents/roles' },

  { slug: 'AdminListPage', module: 'admins', path: '/admins', skipCreate: true },

  // ⚠️ FeedbackListPage 疑似导致浏览器崩溃（两轮均在此页后失联），放最后单独采集
  { slug: 'FeedbackListPage', module: 'feedback', path: '/feedback' },
]

const harvestedIds: Record<string, string[]> = { users: [], groups: [], channels: [], moments: [] }
const report: PageReport[] = []

// 断点续跑：同一 ROUND 已有报告则先读入
if (process.env.AUTO_TEST_START_FROM && fs.existsSync(REPORT_PATH)) {
  try {
    const prev = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))
    report.push(...(prev.pages ?? []))
  } catch {
    /* 读取失败则从零开始 */
  }
}

function saveReport() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ round: ROUND, startedAt: new Date().toISOString(), pages: report }, null, 2))
}

/** 深度查找对象数组里的 id 类字段（id/group_id/channel_id/...） */
function deepFindIds(node: unknown, keyword: string, out: Set<string>, depth = 0) {
  if (depth > 7 || node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 8)) deepFindIds(item, keyword, out, depth + 1)
    return
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const keys = keyword === 'users' ? ['id', 'user_id'] : keyword === 'groups' ? ['id', 'group_id'] : keyword === 'channels' ? ['id', 'channel_id'] : ['id', 'moment_id']
    for (const key of keys) {
      const v = obj[key]
      if (typeof v === 'string' && v.length > 0 && v.length < 64) out.add(v)
      else if (typeof v === 'number' && Number.isSafeInteger(v)) out.add(String(v))
    }
    for (const v of Object.values(obj)) deepFindIds(v, keyword, out, depth + 1)
  }
}

function isApiUrl(url: string): boolean {
  return url.includes('/api/') || url.includes('/adm')
}

test.describe.configure({ mode: 'serial' })

test('auto_test 一轮巡检：全部页面导航 + 安全交互', async ({ page }) => {
  test.setTimeout(60 * 60 * 1000)

  const credentials = requireAdminCredentials()
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  let apis: ApiCall[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)))
  page.on('response', (res: Response) => {
    if (isApiUrl(res.url())) {
      apis.push({ method: res.request().method(), status: res.status(), url: new URL(res.url()).pathname + new URL(res.url()).search })
    }
  })

  // 登录（LoginPage 功能点的直接证据）
  await loginAsAdmin(page, credentials)

  const shot = (module: string, name: string) => {
    const dir = path.join(EVIDENCE_ROOT, module)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${ROUND}-${name}.png`)
    return withHardTimeout(`screenshot ${name}`, 20_000, () => page.screenshot({ path: file, fullPage: false }))
      .then(() => file)
      .catch(() => '')
  }

  const waitSettle = () => page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {}).then(() => page.waitForTimeout(500))

  for (const spec of PAGES) {
    if (ONLY.length && !ONLY.includes(spec.slug)) continue
    if (!ONLY.length && START_FROM && PAGES.findIndex((p) => p.slug === START_FROM) > PAGES.findIndex((p) => p.slug === spec.slug)) continue
    const entry: PageReport = {
      slug: spec.slug,
      module: spec.module,
      requestedPath: spec.path,
      finalUrl: '',
      redirected: false,
      apis: [],
      consoleErrors: [],
      pageErrors: [],
      actions: [],
      screenshots: [],
    }
    let target = spec.path
    if (spec.path.includes('{id}')) {
      const ids = harvestedIds[spec.idFrom as string] ?? []
      if (ids.length === 0) {
        entry.skippedReason = `无可用 ${spec.idFrom} ID（列表为空或列表接口异常）`
        report.push(entry)
        saveReport()
        continue
      }
      target = spec.path.replace('{id}', encodeURIComponent(ids[0]))
    }

    consoleErrors.length = 0
    pageErrors.length = 0
    apis = []

    try {
      await withHardTimeout(`goto ${target}`, 40_000, () => page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25_000 }))
      await waitSettle()
    } catch (err) {
      entry.skippedReason = `导航失败: ${String(err).slice(0, 200)}`
      report.push(entry)
      saveReport()
      continue
    }

    entry.finalUrl = page.url()
    entry.redirected = !entry.finalUrl.includes(target.split('?')[0])
    entry.apis = [...apis]
    entry.consoleErrors = [...consoleErrors]
    entry.pageErrors = [...pageErrors]
    entry.screenshots.push(await shot(spec.module, `${spec.slug}-initial`))

    // 从列表页响应中提取真实 ID（供后续 :id 页面）
    const idFrom = (spec as PageSpec).idFrom
    if (idFrom === undefined && ['users', 'groups', 'channels', 'moments'].some((k) => spec.path === `/${k}`)) {
      // API 路径用单数（/user/list /group/list ...），URL 匹配必须用单数
      const plural = spec.path.slice(1)
      const keyword = { users: 'user', groups: 'group', channels: 'channel', moments: 'moment' }[plural] ?? plural
      const found = new Set<string>()
      // 专门监听一次 reload 提取响应体里的 ID
      try {
        const handler = async (res: Response) => {
          if (isApiUrl(res.url()) && res.request().method() === 'GET' && res.url().includes(keyword)) {
            try {
              // res.json() 用标准 JSON.parse 会把超 MAX_SAFE_INTEGER 的 TSID 解析成
              // 丢精度 number，再被 deepFindIds 的 isSafeInteger 守卫滤掉（moment/list
              // 的 id 是 number 序列化，users/groups/channels 是 string 故侥幸通过）。
              // 改走原始文本 + safeParseBigIntJson，大整数变 string 精确入库。
              const body = safeParseBigIntJson(await res.text())
              deepFindIds(body, plural, found)
            } catch {
              /* 非 JSON 忽略 */
            }
          }
        }
        page.on('response', handler)
        await withHardTimeout('harvest-reload', 30_000, () => page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 })).catch(() => {})
        await waitSettle()
        page.off('response', handler)
      } catch {
        /* 忽略 */
      }
      harvestedIds[plural] = Array.from(found).slice(0, 5)
      entry.apis = [...apis]
    }

    const runAction = async (name: string, fn: () => Promise<string>) => {
      const before = apis.length
      try {
        const detail = await withHardTimeout(name, 40_000, fn)
        entry.actions.push({ name, ok: true, detail, apiDelta: apis.slice(before) })
      } catch (err) {
        entry.actions.push({ name, ok: false, detail: String(err).split('\n')[0].slice(0, 160), apiDelta: apis.slice(before) })
      }
    }

    // 1. 搜索/筛选
    await runAction('search', async () => {
      const input = page.locator('input[placeholder*="搜索"], input[placeholder*="关键词"], input[placeholder*="查询"]').first()
      await input.waitFor({ state: 'visible', timeout: 1_500 })
      await input.fill('zz_no_match_test')
      const btn = page.getByRole('button', { name: /搜索|查询/ }).first()
      await btn.waitFor({ state: 'visible', timeout: 1_500 })
      await btn.click()
      await page.waitForTimeout(1_200)
      return '已填入 zz_no_match_test 并点击搜索'
    })

    // 2. 重置
    await runAction('reset', async () => {
      const btn = page.getByRole('button', { name: /重置|清空筛选/ }).first()
      await btn.waitFor({ state: 'visible', timeout: 1_000 })
      await btn.click()
      await page.waitForTimeout(800)
      return '已点击重置'
    })

    // 3. 新建弹窗打开后取消（不提交）
    if (!spec.skipCreate) {
      await runAction('create-dialog', async () => {
        const btn = page.getByRole('button', { name: /^(新建|创建|新增)/ }).first()
        await btn.waitFor({ state: 'visible', timeout: 1_000 })
        await btn.click()
        await page.waitForTimeout(1_000)
        const dialogVisible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false)
        entry.screenshots.push(await shot(spec.module, `${spec.slug}-create-dialog`))
        const cancel = page.getByRole('button', { name: /取消|关闭/ }).first()
        if (await cancel.isVisible({ timeout: 800 }).catch(() => false)) {
          await cancel.click()
        } else {
          await page.keyboard.press('Escape')
        }
        await page.waitForTimeout(400)
        return dialogVisible ? '弹窗已打开并取消' : '未检测到 dialog（可能为 Drawer 或直接动作）'
      })
    }

    // 4. 导出（只读操作）
    await runAction('export', async () => {
      const btn = page.getByRole('button', { name: /导出/ }).first()
      await btn.waitFor({ state: 'visible', timeout: 1_000 })
      await btn.click()
      await page.waitForTimeout(1_500)
      return '已点击导出'
    })

    // 5. 翻页
    await runAction('next-page', async () => {
      const btn = page.getByRole('button', { name: /下一页/ }).first()
      await btn.waitFor({ state: 'visible', timeout: 1_000 })
      if (!(await btn.isEnabled())) return '无下一页（单页数据）'
      await btn.click()
      await page.waitForTimeout(1_000)
      return '已点击下一页'
    })

    entry.apis = [...apis]
    entry.consoleErrors = [...new Set(consoleErrors)]
    entry.pageErrors = [...pageErrors]
    report.push(entry)
    saveReport()
  }

  saveReport()
})

test('auto_test 守卫与登录页行为', async ({ browser }) => {
  test.setTimeout(120_000)
  const entries: PageReport[] = []

  // 未登录访问受保护页 → 应跳 /login
  const ctx = await browser.newContext({ baseURL: new URL(page_base()).origin })
  const p1 = await ctx.newPage()
  await p1.goto('/users', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await p1.waitForTimeout(1_500)
  entries.push({
    slug: 'guard-incognito',
    module: 'auth',
    requestedPath: '/users',
    finalUrl: p1.url(),
    redirected: true,
    apis: [],
    consoleErrors: [],
    pageErrors: [],
    actions: [],
    screenshots: [],
  })
  await p1.context().close()

  // 登录页在登录态下访问 /login 的行为 + /setup 可达性
  const ctx2 = await browser.newContext({ baseURL: new URL(page_base()).origin })
  const p2 = await ctx2.newPage()
  await loginAsAdmin(p2, requireAdminCredentials())
  await p2.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await p2.waitForTimeout(1_000)
  await p2.goto('/setup', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await p2.waitForTimeout(1_000)
  entries.push({
    slug: 'login-and-setup-when-authed',
    module: 'auth',
    requestedPath: '/login → /setup',
    finalUrl: p2.url(),
    redirected: false,
    apis: [],
    consoleErrors: [],
    pageErrors: [],
    actions: [],
    screenshots: [],
  })
  await ctx2.close()

  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}-guards.json`), JSON.stringify({ round: ROUND, guards: entries }, null, 2))
})

function page_base(): string {
  return process.env.IMBOY_ADMIN_E2E_BASE_URL || 'http://127.0.0.1:8082'
}
