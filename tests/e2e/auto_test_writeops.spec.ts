/**
 * auto_test 写操作验证（阶段B）：
 * 对白名单页面的「创建类」操作做真实提交（自动填充表单 → 提交 → 抓 API 2xx）。
 * 资金/审批/不可逆模块一律跳过（由 md 标注阻塞）。
 *
 * 用法：PLAYWRIGHT_DISABLE_WEBSERVER=1 bunx playwright test tests/e2e/auto_test_writeops.spec.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = process.env.AUTO_TEST_ROUND || `writeops-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')

type Target = { slug: string; module: string; path: string }

/** 安全可自动提交的创建类页面（测试库数据，可接受测试数据累积） */
const TARGETS: Target[] = [
  { slug: 'AnnouncementListPage', module: 'announcements', path: '/announcements' },
  { slug: 'RolePermissionPage', module: 'roles', path: '/roles' },
  { slug: 'SensitiveWordPage', module: 'content-moderation', path: '/moderation/sensitive-words' },
  { slug: 'UserTagManagePage', module: 'users', path: '/users/{id}/tags' },
  { slug: 'GroupCategoryManagePage', module: 'groups', path: '/groups/{id}/categories' },
  { slug: 'GroupTagManagePage', module: 'groups', path: '/groups/{id}/tags' },
  { slug: 'GroupNoticeManagePage', module: 'groups', path: '/groups/{id}/notices' },
  { slug: 'GroupVoteManagePage', module: 'groups', path: '/groups/{id}/votes' },
  { slug: 'GroupScheduleManagePage', module: 'groups', path: '/groups/{id}/schedules' },
  { slug: 'GroupTaskManagePage', module: 'groups', path: '/groups/{id}/tasks' },
  { slug: 'GroupAlbumManagePage', module: 'groups', path: '/groups/{id}/albums' },
  { slug: 'VersionPage', module: 'settings', path: '/settings/versions' },
  { slug: 'AiRolesPage', module: 'ai_agent', path: '/ai-agents/roles' },
  { slug: 'AiAgentListPage', module: 'ai_agent', path: '/ai-agents' },
]

type WriteOpReport = {
  slug: string
  module: string
  path: string
  tested: boolean
  detail: string
  apiCalls: { method: string; status: number; url: string }[]
  screenshot: string
}

const report: WriteOpReport[] = []
const REPORT_PATH = path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`)

function saveReport() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ round: ROUND, pages: report }, null, 2))
}

function isApiUrl(url: string) {
  return url.includes('/api/adm')
}

/** 从列表页响应提取业务 ID（与主巡检一致的宽匹配） */
async function harvestId(page: Page, keyword: string): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false
    const handler = async (res: import('@playwright/test').Response) => {
      if (done) return
      const url = res.url()
      if (isApiUrl(url) && res.request().method() === 'GET' && url.includes(keyword)) {
        try {
          const body = await res.json()
          const id = deepFindId(body)
          if (id) {
            done = true
            page.off('response', handler)
            resolve(id)
          }
        } catch {
          /* ignore */
        }
      }
    }
    page.on('response', handler)
    page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
    setTimeout(() => {
      if (!done) {
        done = true
        page.off('response', handler)
        resolve(null)
      }
    }, 6_000)
  })
}

function deepFindId(node: unknown, depth = 0): string | null {
  if (depth > 7 || node === null || node === undefined) return null
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 5)) {
      const found = deepFindId(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const v = obj.id ?? obj.group_id ?? obj.user_id
    if (typeof v === 'string' && v.length > 0 && v.length < 64 && !v.includes(' ')) return v
    if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v)
    for (const child of Object.values(obj)) {
      const found = deepFindId(child, depth + 1)
      if (found) return found
    }
  }
  return null
}

async function fillVisibleInputs(page: Page, scope: string, stamp: string) {
  const dialog = page.locator(scope).first()
  const inputs = dialog.locator('input:visible, textarea:visible')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i)
    const type = await el.getAttribute('type').catch(() => null)
    if (type && ['checkbox', 'radio', 'file', 'hidden', 'date'].includes(type)) continue
    if (await el.isDisabled().catch(() => true)) continue
    if (type === 'number') {
      await el.fill('1').catch(() => {})
    } else {
      const tag = await el.evaluate((n) => n.tagName).catch(() => 'INPUT')
      await el.fill(tag === 'TEXTAREA' ? 'e2e测试数据，可安全删除' : `e2e_${stamp}`).catch(() => {})
    }
  }
  // Radix Select（role=combobox）：逐个点开选第一项
  const combos = dialog.locator('[role="combobox"]:visible')
  const comboCount = await combos.count().catch(() => 0)
  for (let i = 0; i < comboCount; i++) {
    const combo = combos.nth(i)
    await combo.click().catch(() => {})
    await page.waitForTimeout(400)
    const option = page.locator('[role="option"]:visible').first()
    if (await option.isVisible({ timeout: 1_200 }).catch(() => false)) {
      await option.click().catch(() => {})
      await page.waitForTimeout(300)
    } else {
      await page.keyboard.press('Escape')
    }
  }
  return count + comboCount
}

test.describe.configure({ mode: 'serial' })

test('auto_test 写操作真实提交（白名单页面）', async ({ page }) => {
  test.setTimeout(40 * 60 * 1000)
  await loginAsAdmin(page, requireAdminCredentials())

  const stampBase = String(Date.now() % 1000000)
  const shot = (module: string, name: string) => {
    const dir = path.join(EVIDENCE_ROOT, module)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${ROUND}-${name}.png`)
    return page.screenshot({ path: file }).then(() => file).catch(() => '')
  }

  // 预取业务 ID（用户/群）
  const userIds: string[] = []
  const groupIds: string[] = []
  await page.goto('/users', { waitUntil: 'domcontentloaded' })
  const uid = await harvestId(page, '/user/')
  if (uid) userIds.push(uid)
  await page.goto('/groups', { waitUntil: 'domcontentloaded' })
  const gid = await harvestId(page, '/group/')
  if (gid) groupIds.push(gid)

  for (let idx = 0; idx < TARGETS.length; idx++) {
    const t = TARGETS[idx]
    const stamp = `${stampBase}_${idx}`
    const entry: WriteOpReport = { slug: t.slug, module: t.module, path: t.path, tested: false, detail: '', apiCalls: [], screenshot: '' }

    let target = t.path
    if (target.includes('{id}')) {
      const id = target.startsWith('/users') ? userIds[0] : groupIds[0]
      if (!id) {
        entry.detail = '无可用业务 ID'
        report.push(entry)
        saveReport()
        continue
      }
      target = target.replace('{id}', id)
    }

    const apiCalls: { method: string; status: number; url: string }[] = []
    const handler = (res: import('@playwright/test').Response) => {
      const m = res.request().method()
      if (isApiUrl(res.url()) && m !== 'GET') {
        apiCalls.push({ method: m, status: res.status(), url: new URL(res.url()).pathname })
      }
    }
    page.on('response', handler)

    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
      await page.waitForTimeout(400)

      const createBtn = page.getByRole('button', { name: /^(新建|创建|新增)/ }).first()
      if (!(await createBtn.isVisible({ timeout: 1_500 }).catch(() => false))) {
        entry.detail = '未找到新建类按钮'
        report.push(entry)
        saveReport()
        page.off('response', handler)
        continue
      }
      await createBtn.click()
      await page.waitForTimeout(1_000)

      const scope = (await page.locator('[role="dialog"]').first().isVisible().catch(() => false))
        ? '[role="dialog"]'
        : '[role="dialog"], [data-state="open"]'
      const filled = await fillVisibleInputs(page, scope, stamp)
      entry.screenshot = await shot(t.module, `${t.slug}-writeop-filled`)

      // 提交（排除取消/关闭）
      const submitBtn = page.locator('[role="dialog"] button, [data-state="open"] button')
        .filter({ hasText: /^(确[认定]|保存|创建|提交|添加|发布)/ })
        .first()
      const submittable = await submitBtn.isVisible({ timeout: 1_500 }).catch(() => false)
      if (!submittable) {
        entry.detail = `填充 ${filled} 字段后未找到提交按钮`
        await page.keyboard.press('Escape')
      } else {
        await submitBtn.click()
        await page.waitForTimeout(1_800)
        entry.tested = true
        const ok = apiCalls.some((c) => c.status >= 200 && c.status < 300)
        entry.screenshot = await shot(t.module, `${t.slug}-writeop-result`)
        entry.detail = ok ? '提交返回 2xx' : `提交调用: ${apiCalls.map((c) => `${c.method} ${c.status}`).join(',') || '无写请求'}`

        // 若有确认弹窗（危险确认），确认它
        const confirmBtn = page.locator('[role="alertdialog"] button, [role="dialog"] button').filter({ hasText: /^(确[认定])/ }).first()
        if (await confirmBtn.isVisible({ timeout: 800 }).catch(() => false)) {
          await confirmBtn.click().catch(() => {})
          await page.waitForTimeout(1_200)
        }
      }
      entry.apiCalls = [...apiCalls]
    } catch (err) {
      entry.detail = `异常: ${String(err).split('\n')[0].slice(0, 140)}`
      await page.keyboard.press('Escape').catch(() => {})
    }
    page.off('response', handler)
    report.push(entry)
    saveReport()
  }
  saveReport()
})
