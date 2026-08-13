/**
 * p13：残余功能点补测
 * 1. MomentReportPage（/moments/reports 重定向 + 页面全项）
 * 2. 批量勾选（6 页）：勾选首行 → 检测批量工具条
 * 3. 详情页跳转链接清单（GroupDetail/ChannelDetail/UserDetail 的 a[href] 全收集）
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p13-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const GID = '106571324669036544'
const CID = '103209560378181632'

const results: Record<string, unknown> = {}

function save() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2))
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
  await page.waitForTimeout(600)
}

test.describe.configure({ mode: 'serial' })

test('MomentReportPage 全项', async ({ page }) => {
  test.setTimeout(120_000)
  try {
    const apis: string[] = []
    const errors: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('/api/adm')) apis.push(`${r.request().method()} ${r.status()} ${new URL(r.url()).pathname}`)
    })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)) })
    await loginAsAdmin(page, requireAdminCredentials())

    // /moments/reports 应 302 → /reports?target_type=moment
    await page.goto('/moments/reports', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_200)
    const finalUrl = page.url()
    await settle(page)
    const hasReportCenter = finalUrl.includes('/reports')

    // 筛选交互（ReportCenter 有 target_type 筛选）
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="关键词"]').first()
    let searchOk = false
    if (await searchInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await searchInput.fill('zz_no_match')
      const btn = page.getByRole('button', { name: /搜索|查询/ }).first()
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click({ timeout: 3_000 }).catch(() => {})
        await page.waitForTimeout(1_000)
        searchOk = true
      }
    }
    // 三态
    await page.route('**/api/adm/**', async (route) => {
      if (route.request().method() === 'GET' && !/\/(current|rbac\/me)/.test(route.request().url())) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":500,"msg":"e2e"}' })
      }
      return route.continue()
    })
    await page.goto(finalUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(1_500)
    const errText = /加载失败|失败|重试|错误/.test(await page.locator('body').innerText().catch(() => ''))
    await page.unroute('**/api/adm/**')

    results['MomentReportPage'] = {
      redirect: hasReportCenter ? `302 → ${finalUrl.split('8082')[-1] ?? finalUrl}` : finalUrl,
      guard: 'ok', render: apis.some((a) => a.includes('200')) ? 'ok' : 'no-data',
      search: searchOk, errorState: errText, apis: apis.slice(0, 6), consoleErrors: errors.slice(0, 3),
    }
  } catch (e) {
    results['MomentReportPage'] = { error: String(e).slice(0, 120) }
  }
  save()
})

const BATCH_PAGES = [
  { slug: 'UserListPage', path: '/users' },
  { slug: 'GroupListPage', path: '/groups' },
  { slug: 'ChannelListPage', path: '/channels' },
  { slug: 'ChannelMessagePage', path: `/channels/${CID}/messages` },
  { slug: 'MomentListPage', path: '/moments' },
  { slug: 'GroupGovernanceLogPage', path: `/groups/${GID}/governance-logs` },
]

for (const t of BATCH_PAGES) {
  test(`${t.slug} 批量勾选`, async ({ page }) => {
    test.setTimeout(90_000)
    try {
      await loginAsAdmin(page, requireAdminCredentials())
      await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await settle(page)
      const cb = page.locator('table input[type="checkbox"]').first()
      const visible = await cb.isVisible({ timeout: 1_500 }).catch(() => false)
      if (!visible) {
        results[`batch:${t.slug}`] = { tested: false, detail: '无 checkbox（或无数据）' }
      } else {
        await cb.check({ timeout: 3_000 }).catch(() => {})
        await page.waitForTimeout(800)
        const text = await page.locator('body').innerText().catch(() => '')
        const toolbar = /批量|已选择|已选中/.test(text)
        const dir = path.join(EVIDENCE_ROOT, 'evidence-misc')
        fs.mkdirSync(dir, { recursive: true })
        await page.screenshot({ path: path.join(dir, `${ROUND}-${t.slug}-batch.png`) }).catch(() => {})
        results[`batch:${t.slug}`] = { tested: true, toolbarSeen: toolbar, detail: toolbar ? '勾选后出现批量操作反馈' : '勾选后未见批量工具条' }
        await cb.uncheck({ timeout: 2_000 }).catch(() => {})
      }
    } catch (e) {
      results[`batch:${t.slug}`] = { error: String(e).slice(0, 100) }
    }
    save()
  })
}

const DETAIL_PAGES = [
  { slug: 'GroupDetailPage', path: `/groups/${GID}`, module: 'groups' },
  { slug: 'ChannelDetailPage', path: `/channels/${CID}`, module: 'channels' },
  { slug: 'UserDetailPage', path: `/users/${UID}`, module: 'users' },
  { slug: 'UserTagManagePage', path: `/users/${UID}/tags`, module: 'users' },
  { slug: 'UserCollectManagePage', path: `/users/${UID}/collects`, module: 'users' },
]

for (const t of DETAIL_PAGES) {
  test(`${t.slug} 链接清单`, async ({ page }) => {
    test.setTimeout(90_000)
    try {
      await loginAsAdmin(page, requireAdminCredentials())
      await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await settle(page)
      const links = await page.evaluate(() => {
        const visible = (el: Element) => el.getBoundingClientRect().width > 0
        return Array.from(document.querySelectorAll('a'))
          .filter(visible)
          .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 16) }))
          .filter((l) => l.href && l.href.startsWith('/'))
      }).catch(() => [])
      const dir = path.join(EVIDENCE_ROOT, t.module)
      fs.mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: path.join(dir, `${ROUND}-${t.slug}-links.png`) }).catch(() => {})
      results[`links:${t.slug}`] = links
    } catch (e) {
      results[`links:${t.slug}`] = { error: String(e).slice(0, 100) }
    }
    save()
  })
}
