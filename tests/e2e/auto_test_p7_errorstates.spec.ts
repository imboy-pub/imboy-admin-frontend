/**
 * p7：错误态注入复测（时序 bug 修复后的干净数据，仅覆盖 p4 未检出的 17 页）
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Route } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const TARGETS = [
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
  { slug: 'LicensePage', module: 'license', path: '/license' },
  { slug: 'LogoutApplicationListPage', module: 'logout-applications', path: '/logout-applications' },
  { slug: 'McpGovernanceListPage', module: 'mcp-governance', path: '/mcp-governance' },
  { slug: 'ReportCenterPage', module: 'reports', path: '/reports' },
  { slug: 'StorageOverviewPage', module: 'storage', path: '/storage' },
  { slug: 'GroupTaskListPage', module: 'groups', path: '/groups/tasks' },
  { slug: 'GroupContextGatewayPage', module: 'groups', path: '/groups/context' },
]

test('错误态注入复测（修复后）', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000)
  await loginAsAdmin(page, requireAdminCredentials())
  const results: Record<string, { detected: boolean; detail: string; forbidden: boolean }> = {}

  for (const t of TARGETS) {
    try {
      await page.route('**/api/adm/**', async (route: Route) => {
        const url = route.request().url()
        if (/\/(current|rbac\/me|logout)/.test(url)) return route.continue()
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, msg: 'e2e injected error' }) })
        }
        return route.continue()
      })
      await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.waitForTimeout(1_800)
      const forbidden = page.url().includes('/forbidden')
      const bodyText = await page.locator('body').innerText().catch(() => '')
      const detected = /加载失败|错误|失败|重试|Error/i.test(bodyText)
      const dir = path.join(EVIDENCE_ROOT, t.module)
      fs.mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: path.join(dir, `p7-${t.slug}-error-state.png`) }).catch(() => {})
      results[t.slug] = { detected, detail: detected ? '错误态文案已渲染' : bodyText.slice(0, 80).replace(/\n/g, ' '), forbidden }
      await page.unroute('**/api/adm/**')
    } catch (err) {
      results[t.slug] = { detected: false, detail: `异常: ${String(err).slice(0, 80)}`, forbidden: false }
      await page.unroute('**/api/adm/**').catch(() => {})
    }
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, '_report-p7-errorstates.json'), JSON.stringify({ results }, null, 2))
  console.log('[p7]', JSON.stringify(results, null, 1).slice(0, 1500))
})
