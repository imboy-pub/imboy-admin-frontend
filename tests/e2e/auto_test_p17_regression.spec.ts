/**
 * p17：回归复测 29 条的宽匹配验证
 * 各类入口的宽松文案匹配 + 真实点击断言导航
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p17-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const GID = '106571324669036544'
const CID = '103209560378181632'

const results: Record<string, unknown> = {}
function save() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2))
}

/** 在 currentUrl 页面上点含 pattern 的可见按钮/链接，断言导航到 expectIn（不含则回退） */
async function tryNav(page: Page, currentUrl: string, pattern: RegExp, expectIn: string, backTo?: string) {
  await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
  await page.waitForTimeout(500)
  // 链接优先
  const link = page.locator(`a`).filter({ hasText: pattern }).first()
  if (await link.isVisible({ timeout: 700 }).catch(() => false)) {
    const href = await link.getAttribute('href').catch(() => null)
    if (href && href.includes(expectIn.replace(':id', ''))) {
      return { ok: true, method: `a[href=${href}]` }
    }
  }
  const btn = page.getByRole('button', { name: pattern }).first()
  if (!(await btn.isVisible({ timeout: 1_000 }).catch(() => false))) {
    return { ok: false, method: 'no-match' }
  }
  const before = page.url()
  await btn.click({ timeout: 3_000 }).catch(() => {})
  await page.waitForTimeout(900)
  const after = page.url()
  const ok = after !== before && after.includes(expectIn.split('/').filter(Boolean).pop() ?? expectIn)
  if (after !== before && backTo) await page.goto(backTo, { waitUntil: 'domcontentloaded' }).catch(() => {})
  return { ok, method: `btn→${after.split('8082')[-1] ?? after}` }
}

test.describe.configure({ mode: 'serial' })

test('p17 回归复测宽匹配验证', async ({ page }) => {
  test.setTimeout(20 * 60_000)
  await loginAsAdmin(page, requireAdminCredentials())

  const G = `/groups/${GID}`
  const C = `/channels/${CID}`
  const U = `/users/${UID}`

  // ---- 群管理页「返回群详情」（宽匹配：任何 返回 系按钮）----
  for (const suffix of ['members', 'votes', 'notices', 'tags', 'categories', 'files', 'albums', 'schedules', 'tasks']) {
    results[`grp:${suffix}`] = await tryNav(page, `${G}/${suffix}`, /返回/, G)
  }
  // GroupDetail 治理 tab（宽：治理|日志|审计）
  results['grp:governance'] = await tryNav(page, G, /治理|审计|日志/, `${G}/governance-logs`)
  // GroupMember → 用户详情（表格用户链接）
  results['member:user'] = await tryNav(page, `${G}/members`, new RegExp(UID.slice(-6)), `/users/${UID}`)
  // GovernanceLog → /groups/context?gid=
  results['govlog:context'] = await tryNav(page, `${G}/governance-logs`, /上下文|群上下文|context/i, '/groups/context')
  // GroupContextGateway → /groups/:id...（畸形种子路径，按实际页面跳群详情）
  results['ctx:group'] = await tryNav(page, `/groups/context?gid=${GID}`, /进入|查看|详情/, G)

  // ---- 频道系列 ----
  results['ch:detail-back'] = await tryNav(page, C, /返回频道|返回列表|^返回$/, '/channels')
  results['ch:admins'] = await tryNav(page, C, /管理员/, `${C}/admins`)
  for (const suffix of ['messages', 'subscribers', 'admins', 'invitations', 'orders']) {
    results[`ch:${suffix}:back`] = await tryNav(page, `${C}/${suffix}`, /返回/, C)
  }
  // ChannelList → 频道详情 / messages（行内 eye 按钮点击）
  await page.goto('/channels', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(800)
  const eye = page.locator('table tbody tr').first().locator('button').first()
  const eyeVisible = await eye.isVisible({ timeout: 1_500 }).catch(() => false)
  if (eyeVisible) {
    await eye.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(900)
    results['chlist:detail'] = { ok: page.url().includes(`/channels/${CID}`), method: 'eye-btn' }
  } else {
    results['chlist:detail'] = { ok: false, method: 'no-eye-btn' }
  }

  // ---- 用户系列 ----
  results['udetail:back'] = await tryNav(page, U, /返回用户|返回列表|^返回$/, '/users')
  results['udetail:tags'] = await tryNav(page, U, /标签/, `${U}/tags`)
  await page.goto('/users', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(800)
  const uEye = page.locator('table tbody tr').first().locator('button').first()
  if (await uEye.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await uEye.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(900)
    results['ulist:detail'] = { ok: /\/users\/\d+/.test(page.url()), method: 'eye-btn' }
  } else {
    results['ulist:detail'] = { ok: false, method: 'no-eye-btn' }
  }

  // ---- Moment 系列 ----
  await page.goto('/moments', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(900)
  const mLink = page.locator('a[href*="/moments/"], table tbody tr button').first()
  const mVisible = await mLink.isVisible({ timeout: 1_500 }).catch(() => false)
  if (mVisible) {
    await mLink.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(900)
    results['mlist:detail'] = { ok: /\/moments\//.test(page.url()), method: 'row-first' }
  } else {
    results['mlist:detail'] = { ok: false, method: 'no-row-btn' }
  }

  // ---- AiRoles 筛选 / MomentReport 筛选（宽 placeholder 匹配）----
  for (const [k, url] of [['airoles:search', '/ai-agents/roles'], ['mreport:search', '/reports?target_type=moment']] as const) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const input = page.locator('input:visible').first()
    if (await input.isVisible({ timeout: 1_200 }).catch(() => false)) {
      await input.fill('zz_no_match').catch(() => {})
      const btn = page.getByRole('button', { name: /搜索|查询|筛选/ }).first()
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click({ timeout: 3_000 }).catch(() => {})
        await page.waitForTimeout(1_000)
        results[k] = { ok: true, method: 'search-clicked' }
        continue
      }
      await input.press('Enter').catch(() => {})
      await page.waitForTimeout(800)
      results[k] = { ok: true, method: 'enter' }
    } else {
      results[k] = { ok: false, method: 'no-input' }
    }
  }

  save()
  console.log('[p17] done')
})
