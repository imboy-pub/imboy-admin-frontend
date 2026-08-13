/**
 * p17b：7 条失败回归项的精确文案重验
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p17b-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const GID = '106571324669036544'
const CID = '103209560378181632'

const results: Record<string, unknown> = {}
function save() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2))
}

async function navByBtn(page: Page, url: string, pattern: RegExp, expectUrlPart: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
  await page.waitForTimeout(600)
  const btn = page.getByRole('button', { name: pattern }).first()
  if (!(await btn.isVisible({ timeout: 1_500 }).catch(() => false))) return { ok: false, method: 'no-match' }
  await btn.click({ timeout: 3_000 }).catch(() => {})
  await page.waitForTimeout(1_000)
  return { ok: page.url().includes(expectUrlPart), method: page.url().split('8082')[-1] ?? page.url() }
}

test('p17b 精确文案重验', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  await loginAsAdmin(page, requireAdminCredentials())
  const G = `/groups/${GID}`
  const C = `/channels/${CID}`
  const U = `/users/${UID}`

  // 1. GroupDetail「治理日志」tab（精确文案）
  results['grp:governance'] = await navByBtn(page, G, /治理日志/, `${G}/governance-logs`)
  // 2. GroupMember「查看用户」→ /users/:id
  results['member:user'] = await navByBtn(page, `${G}/members`, /查看用户/, `/users/`)
  // 3. ChannelDetail「管理员」tab —— 先看真实文案（频道管理员|管理员设置|管理员）
  results['ch:admins:v1'] = await navByBtn(page, C, /频道管理员|管理员设置/, `${C}/admins`)
  if (!(results['ch:admins:v1'] as { ok: boolean }).ok) {
    results['ch:admins:v2'] = await navByBtn(page, C, /^管理员$/, `${C}/admins`)
  }
  // 4. UserDetail「返回列表」+「用户标签治理」
  results['udetail:back'] = await navByBtn(page, U, /返回列表/, '/users')
  results['udetail:tags'] = await navByBtn(page, U, /用户标签治理/, `${U}/tags`)
  // 5. ChannelList eye 按钮（应 navigate 到频道详情）
  await page.goto('/channels', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1_000)
  await page.locator('table tbody tr').first().locator('button').first().click({ timeout: 3_000 }).catch(() => {})
  await page.waitForTimeout(1_200)
  results['chlist:detail'] = { ok: page.url().includes(`/channels/${CID}`), method: page.url().split('8082')[-1] ?? '' }
  // 6. UserList eye 按钮
  await page.goto('/users', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1_000)
  await page.locator('table tbody tr').first().locator('button').first().click({ timeout: 3_000 }).catch(() => {})
  await page.waitForTimeout(1_200)
  results['ulist:detail'] = { ok: /\/users\/\d+/.test(page.url()), method: page.url().split('8082')[-1] ?? '' }

  save()
})
