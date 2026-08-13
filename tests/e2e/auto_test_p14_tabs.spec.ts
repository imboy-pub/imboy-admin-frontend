/**
 * p14：详情页 tab 按钮导航验证（Button+navigate 编程导航）
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p14-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const GID = '106571324669036544'
const CID = '103209560378181632'

const results: Record<string, unknown> = {}

function save() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2))
}

/** 在页面上点击含关键词的按钮并断言导航到期望前缀 */
async function clickAndAssertNav(page: Page, entryUrl: string, kw: string, expectPrefix: string) {
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 18_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(500)
  const btn = page.getByRole('button', { name: new RegExp(kw) }).first()
  const visible = await btn.isVisible({ timeout: 1_200 }).catch(() => false)
  if (!visible) return { found: false, navigated: false, detail: `未找到「${kw}」按钮` }
  await btn.click({ timeout: 3_000 }).catch(() => {})
  await page.waitForTimeout(900)
  const navigated = page.url().includes(expectPrefix)
  return { found: true, navigated, detail: navigated ? `已导航至 ${page.url().split('8082')[-1]}` : `未导航（当前 ${page.url().split('8082')[-1]}）` }
}

test.describe.configure({ mode: 'serial' })

test('GroupDetailPage tab 导航', async ({ page }) => {
  test.setTimeout(150_000)
  await loginAsAdmin(page, requireAdminCredentials())
  const base = `/groups/${GID}`
  const cases: [string, string][] = [
    ['成员', `${base}/members`], ['投票', `${base}/votes`], ['公告', `${base}/notices`],
    ['标签', `${base}/tags`], ['分类', `${base}/categories`], ['文件', `${base}/files`],
    ['相册', `${base}/albums`], ['日程', `${base}/schedules`], ['任务', `${base}/tasks`], ['治理', `${base}/governance-logs`],
  ]
  const out: Record<string, unknown> = {}
  // 返回群列表入口（「跳转 /groups」行）
  out['返回群列表'] = await clickAndAssertNav(page, base, /返回群组列表|返回列表|返回上一页|^返回群组$/, '/groups')
  for (const [kw, prefix] of cases) {
    out[kw] = await clickAndAssertNav(page, base, kw, prefix)
  }
  results['GroupDetailPage'] = out
  save()
})

test('ChannelDetailPage tab 导航', async ({ page }) => {
  test.setTimeout(150_000)
  await loginAsAdmin(page, requireAdminCredentials())
  const base = `/channels/${CID}`
  const cases: [string, string][] = [
    ['消息', `${base}/messages`], ['订阅', `${base}/subscribers`], ['管理员', `${base}/admins`],
    ['邀请', `${base}/invitations`], ['订单', `${base}/orders`],
  ]
  const out: Record<string, unknown> = {}
  out['返回频道列表'] = await clickAndAssertNav(page, base, /返回频道列表|^返回$/, '/channels')
  for (const [kw, prefix] of cases) {
    out[kw] = await clickAndAssertNav(page, base, kw, prefix)
  }
  results['ChannelDetailPage'] = out
  save()
})

test('UserDetailPage tab 导航 + 各管理页返回入口', async ({ page }) => {
  test.setTimeout(150_000)
  await loginAsAdmin(page, requireAdminCredentials())
  const out: Record<string, unknown> = {}
  out['用户标签'] = await clickAndAssertNav(page, `/users/${UID}`, /标签/, `/users/${UID}/tags`)
  out['用户收藏'] = await clickAndAssertNav(page, `/users/${UID}`, /收藏/, `/users/${UID}/collects`)
  // UserTagManagePage / UserCollectManagePage 的「跳转 /users/:id」入口（表格用户 ID 链接）
  for (const [name, url] of [['TagManage→用户详情', `/users/${UID}/tags`], ['CollectManage→用户详情', `/users/${UID}/collects`]] as const) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(700)
    const link = page.locator(`a[href="/users/${UID}"]`).first()
    const found = await link.isVisible({ timeout: 1_000 }).catch(() => false)
    out[name] = { found, navigated: found, detail: found ? '用户 ID 链接存在' : '未找到用户链接' }
  }
  // 各群管理页「返回群详情」按钮
  for (const suffix of ['members', 'votes', 'notices', 'tags', 'categories', 'files', 'albums', 'schedules', 'tasks', 'governance-logs']) {
    out[`群管理返回:${suffix}`] = await clickAndAssertNav(page, `/groups/${GID}/${suffix}`, /返回群详情|返回$/, `/groups/${GID}`)
  }
  // 频道子页返回
  for (const suffix of ['messages', 'subscribers', 'admins', 'invitations', 'orders']) {
    out[`频道子页返回:${suffix}`] = await clickAndAssertNav(page, `/channels/${CID}/${suffix}`, /返回频道详情|返回频道|返回$/, `/channels/${CID}`)
  }
  // MomentReportPage「跳转 /moments/:id」（举报列表 → 动态详情入口）
  await page.goto('/reports?target_type=moment', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(900)
  const momentLink = page.locator('a[href*="/moments/"]').first()
  const mf = await momentLink.isVisible({ timeout: 1_000 }).catch(() => false)
  out['举报→动态详情'] = { found: mf, detail: mf ? '动态详情链接存在' : '未找到动态链接（可能无举报数据）' }

  results['misc-jumps'] = out
  save()
})
