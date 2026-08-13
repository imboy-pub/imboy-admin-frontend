import fs from 'node:fs'
import path from 'node:path'
import { test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p17c-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const results: Record<string, unknown> = {}
function save() { fs.mkdirSync(EVIDENCE_ROOT, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2)) }

test('p17c title 定位 + UserDetail 状态', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await loginAsAdmin(page, requireAdminCredentials())

  // 1. ChannelList eye（title=查看详情）→ 频道详情
  await page.goto('/channels', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1_000)
  const cEye = page.locator('table tbody tr').first().locator('button[title="查看详情"]').first()
  if (await cEye.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await cEye.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(1_200)
    results['chlist:detail'] = { ok: /\/channels\/\d+/.test(page.url()), url: page.url().split('8082')[1] ?? page.url() }
  } else results['chlist:detail'] = { ok: false, method: 'no-title-btn' }

  // 2. UserList eye（title=查看详情）→ 用户详情
  await page.goto('/users', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1_000)
  const uEye = page.locator('table tbody tr').first().locator('button[title="查看详情"], button[title="查看用户"]').first()
  if (await uEye.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await uEye.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(1_200)
    results['ulist:detail'] = { ok: /\/users\/\d+/.test(page.url()), url: page.url().split('8082')[1] ?? page.url() }
  } else results['ulist:detail'] = { ok: false, method: 'no-title-btn' }

  // 3. UserDetail 页面状态 + 返回列表 + 用户标签治理
  await page.goto(`/users/${UID}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1_500)
  const bodyHead = (await page.locator('body').innerText().catch(() => '')).slice(0, 150).replace(/\n/g, '|')
  results['udetail:state'] = { url: page.url().split('8082')[1], bodyHead }
  for (const [k, pat, expect] of [['udetail:back', /返回列表/, '/users'], ['udetail:tags', /用户标签治理|标签治理|标签/, `/users/${UID}/tags`]] as const) {
    const btn = page.getByRole('button', { name: pat }).first()
    if (await btn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btn.click({ timeout: 3_000 }).catch(() => {})
      await page.waitForTimeout(1_000)
      results[k] = { ok: page.url().includes(expect), url: page.url().split('8082')[1] ?? page.url() }
      if (k === 'udetail:back') await page.goto(`/users/${UID}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    } else results[k] = { ok: false, method: 'no-match' }
  }
  save()
})
