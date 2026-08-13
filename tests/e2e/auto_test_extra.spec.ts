/**
 * auto_test 补充巡检（阶段A2）：
 * 1. 错误态注入：拦截页面主 API 返回 500，验证 ErrorState 渲染
 * 2. 跳转链接：按 md 里「跳转 /xxx」功能点检查 DOM 中链接存在
 * 3. 二次确认弹窗：点击危险按钮 → 检测确认 Dialog → 取消 → 断言无写请求
 *
 * 用法：
 *   PLAYWRIGHT_DISABLE_WEBSERVER=1 bunx playwright test tests/e2e/auto_test_extra.spec.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Route } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = process.env.AUTO_TEST_ROUND || `extra-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const REPORT_PATH = path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`)

/** 与主巡检器一致的目标页面（module/slug/path），不含需要 {id} 的页面（另行处理） */
type Target = { slug: string; module: string; path: string }

const TARGETS: Target[] = [
  { slug: 'AnalyticsPage', module: 'analytics', path: '/analytics' },
  { slug: 'AnnouncementListPage', module: 'announcements', path: '/announcements' },
  { slug: 'BillingInvoiceListPage', module: 'billing-invoices', path: '/billing-invoices' },
  { slug: 'BillingPlanListPage', module: 'billing-plans', path: '/billing-plans' },
  { slug: 'BillingSubscriptionListPage', module: 'billing-subscriptions', path: '/billing-subscriptions' },
  { slug: 'PaymentTransactionListPage', module: 'payment-transactions', path: '/payment-transactions' },
  { slug: 'RechargeOrderListPage', module: 'recharge-orders', path: '/recharge-orders' },
  { slug: 'WalletListPage', module: 'wallets', path: '/wallets' },
  { slug: 'WithdrawalsPage', module: 'withdrawals', path: '/withdrawals' },
  { slug: 'FinanceReportPage', module: 'finance-report', path: '/finance-report' },
  { slug: 'PricingPage', module: 'pricing', path: '/pricing' },
  { slug: 'SensitiveWordPage', module: 'content-moderation', path: '/moderation/sensitive-words' },
  { slug: 'ContentReviewQueuePage', module: 'content-moderation', path: '/moderation/review-queue' },
  { slug: 'DashboardPage', module: 'dashboard', path: '/dashboard' },
  { slug: 'FeedbackListPage', module: 'feedback', path: '/feedback' },
  { slug: 'LicensePage', module: 'license', path: '/license' },
  { slug: 'LogoutApplicationListPage', module: 'logout-applications', path: '/logout-applications' },
  { slug: 'AuditLogPage', module: 'logs', path: '/logs' },
  { slug: 'McpGovernanceListPage', module: 'mcp-governance', path: '/mcp-governance' },
  { slug: 'MessageListPage', module: 'messages', path: '/messages' },
  { slug: 'ReportCenterPage', module: 'reports', path: '/reports' },
  { slug: 'RolePermissionPage', module: 'roles', path: '/roles' },
  { slug: 'StorageOverviewPage', module: 'storage', path: '/storage' },
  { slug: 'SystemHealthPage', module: 'system-health', path: '/system-health' },
  { slug: 'PluginManagementPage', module: 'plugin_management', path: '/plugins' },
  { slug: 'PluginLogPage', module: 'plugin_management', path: '/plugins/logs' },
  { slug: 'UserListPage', module: 'users', path: '/users' },
  { slug: 'GroupListPage', module: 'groups', path: '/groups' },
  { slug: 'GroupTaskListPage', module: 'groups', path: '/groups/tasks' },
  { slug: 'GroupContextGatewayPage', module: 'groups', path: '/groups/context' },
  { slug: 'MomentListPage', module: 'moments', path: '/moments' },
  { slug: 'ChannelListPage', module: 'channels', path: '/channels' },
  { slug: 'PaidChannelOpsPage', module: 'channels', path: '/channels/paid' },
  { slug: 'SettingsHomePage', module: 'settings', path: '/settings' },
  { slug: 'FeatureConfigPage', module: 'settings', path: '/settings/features' },
  { slug: 'ProfileSwitchPage', module: 'settings', path: '/settings/profile' },
  { slug: 'CapabilityConfigPage', module: 'settings', path: '/settings/capabilities' },
  { slug: 'ComplianceKeyPage', module: 'settings', path: '/settings/compliance-keys' },
  { slug: 'VersionPage', module: 'settings', path: '/settings/versions' },
  { slug: 'MutedUsersPage', module: 'settings', path: '/settings/muted-users' },
  { slug: 'PushTokenListPage', module: 'settings', path: '/settings/push-tokens' },
  { slug: 'DDLPage', module: 'settings', path: '/settings/ddl' },
  { slug: 'SSOConfigPage', module: 'settings', path: '/settings/sso' },
  { slug: 'AiAgentListPage', module: 'ai_agent', path: '/ai-agents' },
  { slug: 'OnboardingConfigPage', module: 'ai_agent', path: '/ai-agents/onboarding' },
  { slug: 'KnowledgeConfigPage', module: 'ai_agent', path: '/ai-agents/knowledge' },
  { slug: 'AiRolesPage', module: 'ai_agent', path: '/ai-agents/roles' },
  { slug: 'AdminListPage', module: 'admins', path: '/admins' },
]

type ExtraReport = {
  slug: string
  module: string
  errorState: { tested: boolean; detected: boolean; detail: string; screenshot: string }
  jumpLinks: { target: string; found: boolean }[]
  confirmDialog: { tested: boolean; dialogSeen: boolean; writeBlocked: boolean; detail: string; screenshot: string }
}

const report: ExtraReport[] = []

function saveReport() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ round: ROUND, pages: report }, null, 2))
}

/** 从 md 计划中提取每页「跳转 /xxx」目标 */
function loadJumpTargets(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const mdRoot = path.resolve(process.cwd(), 'tests/auto_test')
  for (const modDir of fs.readdirSync(mdRoot)) {
    const modPath = path.join(mdRoot, modDir)
    if (!fs.statSync(modPath).isDirectory() || modDir === 'evidence') continue
    for (const mdFile of fs.readdirSync(modPath).filter((f) => f.endsWith('.md'))) {
      const slug = mdFile.replace('.md', '')
      const targets: string[] = []
      for (const line of fs.readFileSync(path.join(modPath, mdFile), 'utf8').split('\n')) {
        if (!line.startsWith('| ')) continue
        const desc = line.split('|')[4] ?? ''
        const m = desc.match(/跳转\s+`([^`]+)`/)
        if (m) targets.push(m[1])
      }
      if (targets.length) map.set(slug, targets)
    }
  }
  return map
}

const DANGEROUS_BTN = /^(删除|移除|禁用|拉黑|屏蔽|注销|清理|撤销|重置密码|强制|下线|封禁|解封|恢复|驳回|拒绝|通过|标记)/

test.describe.configure({ mode: 'serial' })

test('auto_test 补充巡检：错误态 + 跳转链接 + 二次确认', async ({ page }) => {
  test.setTimeout(40 * 60 * 1000)
  const jumpMap = loadJumpTargets()

  await loginAsAdmin(page, requireAdminCredentials())

  const shot = (module: string, name: string) => {
    const dir = path.join(EVIDENCE_ROOT, module)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${ROUND}-${name}.png`)
    return page.screenshot({ path: file }).then(() => file).catch(() => '')
  }

  for (const t of TARGETS) {
    const entry: ExtraReport = {
      slug: t.slug,
      module: t.module,
      errorState: { tested: false, detected: false, detail: '', screenshot: '' },
      jumpLinks: [],
      confirmDialog: { tested: false, dialogSeen: false, writeBlocked: false, detail: '', screenshot: '' },
    }

    // ---------- 1. 正常态访问：跳转链接 + 二次确认 ----------
    try {
      await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
      await page.waitForTimeout(400)

      // 跳转链接 DOM 判定
      const targets = jumpMap.get(t.slug) ?? []
      for (const target of targets) {
        const clean = target.replace(/:id/g, '').replace(/:[a-z_]+/g, '')
        const found = await page.locator(`a[href^="${clean}"]`).first().isVisible({ timeout: 800 }).catch(() => false)
        // 兜底：按钮/链接文本包含目标路径片段
        const foundAlt = found || (await page.locator(`[href*="${clean.split('/').pop()}"]`).first().isVisible({ timeout: 500 }).catch(() => false))
        entry.jumpLinks.push({ target, found: Boolean(foundAlt) })
      }

      // 二次确认：点行内危险按钮 → 期待确认 Dialog → 取消
      if (!['WithdrawalsPage', 'McpGovernanceListPage', 'LicensePage', 'LogoutApplicationListPage', 'AdminListPage', 'ContentReviewQueuePage', 'BillingInvoiceListPage'].includes(t.slug)) {
        try {
          const writeCalls: string[] = []
          const handler = (res: import('@playwright/test').Response) => {
            const m = res.request().method()
            if (m !== 'GET' && res.url().includes('/api/')) writeCalls.push(`${m} ${res.url()}`)
          }
          page.on('response', handler)
          const btn = page.getByRole('button', { name: DANGEROUS_BTN }).first()
          const visible = await btn.isVisible({ timeout: 1_200 }).catch(() => false)
          if (visible) {
            await btn.click()
            await page.waitForTimeout(800)
            const dialog = page.locator('[role="dialog"], [role="alertdialog"]').first()
            entry.confirmDialog.dialogSeen = await dialog.isVisible({ timeout: 1_500 }).catch(() => false)
            entry.confirmDialog.tested = true
            if (entry.confirmDialog.dialogSeen) {
              entry.confirmDialog.screenshot = await shot(t.module, `${t.slug}-confirm-dialog`)
              const cancel = page.getByRole('button', { name: /取消|关闭/ }).first()
              if (await cancel.isVisible({ timeout: 800 }).catch(() => false)) await cancel.click()
              else await page.keyboard.press('Escape')
              await page.waitForTimeout(600)
            } else {
              // 没弹窗 —— 可能直接执行了（危险！）或按钮非写操作；截图取证
              entry.confirmDialog.screenshot = await shot(t.module, `${t.slug}-no-confirm`)
              await page.keyboard.press('Escape')
            }
            entry.confirmDialog.writeBlocked = writeCalls.length === 0
            entry.confirmDialog.detail = writeCalls.length ? `点击后出现写请求: ${writeCalls.slice(0, 2).join('; ')}` : '取消路径无写请求'
          } else {
            entry.confirmDialog.tested = false
            entry.confirmDialog.detail = '页面上无危险操作按钮'
          }
          page.off('response', handler)
        } catch (err) {
          entry.confirmDialog.detail = `异常: ${String(err).split('\n')[0].slice(0, 120)}`
        }
      } else {
        entry.confirmDialog.detail = '敏感页面跳过（资金/审批/不可逆）'
      }
    } catch (err) {
      entry.confirmDialog.detail = `导航失败: ${String(err).split('\n')[0].slice(0, 120)}`
    }

    // ---------- 2. 错误态注入 ----------
    try {
      await page.route('**/api/adm/**', async (route: Route) => {
        const url = route.request().url()
        // 鉴权/权限接口放行，否则会登出/403 干扰判定
        if (/\/(current|rbac\/me|logout)/.test(url)) return route.continue()
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, msg: 'e2e injected error' }) })
        }
        return route.continue()
      })
      await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(1_500)
      entry.errorState.tested = true
      const bodyText = await page.locator('body').innerText().catch(() => '')
      entry.errorState.detected = /加载失败|错误|失败|重试|Error/i.test(bodyText) && !/暂无|没有数据/.test(bodyText.slice(0, 2000))
      entry.errorState.screenshot = await shot(t.module, `${t.slug}-error-state`)
      entry.errorState.detail = entry.errorState.detected ? '页面呈现错误态文案' : '未见明确错误态文案'
      await page.unroute('**/api/adm/**')
    } catch (err) {
      entry.errorState.detail = `注入失败: ${String(err).split('\n')[0].slice(0, 120)}`
      await page.unroute('**/api/adm/**').catch(() => {})
    }

    report.push(entry)
    saveReport()
  }

  saveReport()
})
