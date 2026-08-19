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
/** 只跑这些 slug（逗号分隔） */
const ONLY = (process.env.AUTO_TEST_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean)
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')

type Target = { slug: string; module: string; path: string }

/**
 * 安全可自动提交的创建类页面（测试库数据，可接受测试数据累积）。
 * 仅含真实「创建类」入口的页面：其余管理/治理页（GroupCategory/GroupSchedule/GroupTask/
 * UserTag/GroupTag/GroupNotice/GroupVote/GroupAlbum）只有删除/取消/结束/筛选等操作，
 * 无新建入口，不属于本 spec 范围（批次40 源码核实后移除）。
 */
const TARGETS: Target[] = [
  { slug: 'AnnouncementListPage', module: 'announcements', path: '/announcements' },
  { slug: 'RolePermissionPage', module: 'roles', path: '/roles' },
  { slug: 'SensitiveWordPage', module: 'content-moderation', path: '/moderation/sensitive-words' },
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

/**
 * 定位表单容器：Radix Dialog → 内联 form（Card 表单模式）→ 整页兜底。
 * 返回 Playwright Locator（容器）。
 */
async function locateFormScope(page: Page, formsBefore = 0) {
  const dlg = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').first()
  if (await dlg.isVisible({ timeout: 600 }).catch(() => false)) return dlg
  // 内联 Card 表单：点击后新增的 <form> 即目标（通常 append 在容器尾部）
  const forms = page.locator('form:visible')
  const formsAfter = await forms.count().catch(() => 0)
  if (formsAfter > formsBefore) return forms.nth(formsAfter - 1)
  if (formsAfter > 0) return forms.last()
  return page.locator('body')
}

/** 找到第一个「可见」的匹配按钮（.first() 可能命中隐藏按钮） */
async function firstVisibleButton(page: Page, name: RegExp, timeout = 1_500) {
  const btns = page.getByRole('button', { name })
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const n = await btns.count().catch(() => 0)
    for (let i = 0; i < Math.min(n, 10); i++) {
      if (await btns.nth(i).isVisible().catch(() => false)) return btns.nth(i)
    }
    await page.waitForTimeout(250)
  }
  return null
}

async function fillVisibleInputs(page: Page, scope: import('@playwright/test').Locator, stamp: string) {
  const dialog = scope
  const inputs = dialog.locator('input:visible, textarea:visible')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i)
    const type = await el.getAttribute('type').catch(() => null)
    if (type && ['checkbox', 'radio', 'file', 'hidden', 'date', 'search'].includes(type)) continue
    if (await el.isDisabled().catch(() => true)) continue
    // 跳过筛选/搜索区输入（兜底整页扫描时避免误填）
    const ph = ((await el.getAttribute('placeholder').catch(() => '')) ?? '')
    if (/搜索|筛选|查询/.test(ph)) continue
    const inputmode = await el.getAttribute('inputmode').catch(() => null)
    const step = await el.getAttribute('step').catch(() => null)
    const role = await el.getAttribute('role').catch(() => null)
    // 数字字段识别：type=number / inputmode=numeric / step / spinbutton
    const isNumeric = type === 'number' || inputmode === 'numeric' || inputmode === 'decimal' || Boolean(step) || role === 'spinbutton'
    if (isNumeric) {
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
    if (ONLY.length && !ONLY.includes(t.slug)) continue
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

      // 按钮文案按页面实际用词放宽：新建/创建/新增/添加/发布；遍历找第一个可见的
      const createBtn = await firstVisibleButton(page, /^(新建|创建|新增|添加|发布)/)
      if (!createBtn) {
        entry.detail = '未找到新建类按钮'
        report.push(entry)
        saveReport()
        page.off('response', handler)
        continue
      }
      const formsBefore = await page.locator('form:visible').count().catch(() => 0)
      // actionTimeout 默认 0（无限等待）：disabled 按钮会让 click 卡到测试超时，显式超时快速失败
      await createBtn.click({ timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(1_000)

      // 表单容器：Dialog 优先，其次新增的内联 Card 表单（form），最后整页
      const scope = await locateFormScope(page, formsBefore)
      const filled = await fillVisibleInputs(page, scope, stamp)
      entry.screenshot = await shot(t.module, `${t.slug}-writeop-filled`)

      // 提交（Dialog 内按钮 / form submit / form 内动作按钮）
      const dlgOpen = await page.locator('[role="dialog"]:visible').first().isVisible().catch(() => false)
      let submitBtn = dlgOpen
        ? page.locator('[role="dialog"] button')
            .filter({ hasText: /^(确[认定]|保存|创建|提交|添加|发布)/ })
            .last()
        : page.locator('form button[type="submit"]').first()
      if (!(await submitBtn.isVisible({ timeout: 800 }).catch(() => false))) {
        // 无 form submit 时：整页找动作按钮（排除取消/关闭/导入/导出/搜索）。
        // 「时间/者」排除词防列头排序按钮：DataTable 可排序列头（「添加时间/创建时间/创建者ID」）
        // 以 button 渲染且 .last() 会命中它们 → 点击变成排序而非提交（批次40实测 6 页「无写请求」根因）
        submitBtn = page.getByRole('button', { name: /^(确[认定]|保存|创建|提交|添加|发布)/ })
          .filter({ hasNotText: /取消|关闭|导入|导出|搜索|重置|时间|者/ })
          .last()
      }
      const submittable = await submitBtn.isVisible({ timeout: 1_500 }).catch(() => false)
      if (!submittable) {
        entry.detail = `填充 ${filled} 字段后未找到提交按钮`
        await page.keyboard.press('Escape')
      } else {
        // disabled 提交按钮（表单校验未过）会让 click 无限等待，显式超时后按「不可提交」记录
        const clicked = await submitBtn.click({ timeout: 10_000 }).then(() => true).catch(() => false)
        if (!clicked) {
          entry.detail = '提交按钮不可操作（表单校验未通过或按钮 disabled）'
          await page.keyboard.press('Escape')
        } else {
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
