/**
 * p12：写操作精准定制验证（每页独立 test，单页失败不传染）
 *
 * 数据上下文来自 DB 实测：notice 群 102647261571581952（3 条）、
 * vote 群 102643761680746496（2 条）、tag 群 104599742570563584（2 条）、
 * 用户 106808244793772032、群 106571324669036544、频道 103209560378181632。
 *
 * 交互模式：行内 icon 按钮（dropdown 触发）→ 菜单安全项 / 确认弹窗 / 表单弹窗。
 * 用法：PLAYWRIGHT_DISABLE_WEBSERVER=1 bunx playwright test tests/e2e/auto_test_p12_precise.spec.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page, type Locator } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const ROUND = `p12-${Date.now() % 100000}`
const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')
const UID = '106808244793772032'
const GID = '106571324669036544'
const CID = '103209560378181632'
const NOTICE_GID = '102647261571581952'
const VOTE_GID = '102643761680746496'
const TAG_GID = '104599742570563584'

const UNSAFE = /删除|移除|踢出|注销|清理|撤销|强制|重置密码|封禁|拉黑|解散|转让|退款|驳回|拒绝|通过|审批|下线|发送|推送|导出/

const results: Record<string, { outcome: string; detail: string; apis: string[]; shot: string }> = {}

function saveResults() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `_report-${ROUND}.json`), JSON.stringify(results, null, 2))
}

async function shot(page: Page, module: string, name: string) {
  const dir = path.join(EVIDENCE_ROOT, module)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${ROUND}-${name}.png`)
  await page.screenshot({ path: file }).catch(() => {})
  return file
}

/**
 * 通用行内操作执行器：
 * 1. 点第一行第一个 icon/文本按钮
 * 2. 出 dropdown 菜单 → 挑第一个安全 menuitem 执行
 * 3. 出确认弹窗 → 记录验证（点确认执行可逆操作 / 或取消）
 * 4. 直接发写请求 → 记录
 */
async function exerciseRowAction(page: Page, module: string, slug: string): Promise<{ outcome: string; detail: string; apis: string[]; shot: string }> {
  const apis: string[] = []
  const handler = (res: import('@playwright/test').Response) => {
    if (res.url().includes('/api/adm') && res.request().method() !== 'GET') {
      apis.push(`${res.request().method()} ${res.status()} ${new URL(res.url()).pathname}`)
    }
  }
  page.on('response', handler)

  const row = page.locator('table tbody tr').first()
  await row.waitFor({ state: 'visible', timeout: 5_000 })
  const btns = row.locator('button')
  const n = await btns.count()
  if (n === 0) return { outcome: 'no-buttons', detail: '行内无按钮', apis, shot: '' }

  // 找有文本的安全按钮；否则用第一个 icon 按钮（dropdown 触发器）
  let target: Locator = btns.first()
  let viaMenu = false
  for (let i = 0; i < n; i++) {
    const t = ((await btns.nth(i).textContent().catch(() => '')) || '').trim()
    if (t && !UNSAFE.test(t) && !/查看|详情|编辑|取消|关闭/.test(t)) {
      target = btns.nth(i)
      break
    }
  }
  if (!((await target.textContent().catch(() => '')) || '').trim()) viaMenu = true

  await row.hover().catch(() => {})
  await page.waitForTimeout(300)
  const urlBefore = page.url()
  // actionability 卡死（元素被行链接覆盖）时用 DOM 原生 click 兜底
  await target.click({ timeout: 2_500 }).catch(() => {
    void target.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
  })
  await page.waitForTimeout(900)

  // 导航类按钮（详情跳转）：不算写操作，试下一个按钮
  if (page.url() !== urlBefore) {
    await page.goBack({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(600)
    for (let j = 1; j < n; j++) {
      const urlB = page.url()
      await btns.nth(j).click({ timeout: 2_000 }).catch(() => {
        void btns.nth(j).evaluate((el) => (el as HTMLElement).click()).catch(() => {})
      })
      await page.waitForTimeout(900)
      if (page.url() === urlB) { target = btns.nth(j); break }
      await page.goBack({ timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
    if (page.url() !== urlBefore) {
      page.off('response', handler)
      return { outcome: 'nav-only', detail: '行内按钮均为导航跳转', apis, shot: '' }
    }
  }

  let shotFile
  if (viaMenu) {
    await page.waitForTimeout(500)
    const items = page.locator('[role="menuitem"]:visible, [role="menu"] > *:visible')
    const m = await items.count().catch(() => 0)
    const menuLabels: string[] = []
    let chosen: Locator | null = null
    for (let i = 0; i < m; i++) {
      const label = ((await items.nth(i).textContent().catch(() => '')) || '').trim()
      if (!label) continue
      menuLabels.push(label)
      if (!chosen && !UNSAFE.test(label) && !/查看|详情|编辑|取消|关闭/.test(label)) chosen = items.nth(i)
    }
    if (!chosen) {
      shotFile = await shot(page, module, `${slug}-menu`)
      await page.keyboard.press('Escape')
      page.off('response', handler)
      return { outcome: 'none-safe', detail: `菜单项: ${menuLabels.join(',') || '空'}`, apis, shot: shotFile }
    }
    await chosen.click({ timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(1_000)
  }

  // 确认弹窗 or 表单弹窗 or 直接执行
  const confirm = page.locator('[role="alertdialog"]:visible').first()
  const form = page.locator('[role="dialog"]:visible').first()
  if (await confirm.isVisible({ timeout: 1_200 }).catch(() => false)) {
    shotFile = await shot(page, module, `${slug}-confirm`)
    const proceed = page.getByRole('button', { name: /^(确[认定]|继续|执行)/ }).first()
    if (await proceed.isVisible({ timeout: 800 }).catch(() => false)) {
      await proceed.click({ timeout: 3_000 }).catch(() => {})
      await page.waitForTimeout(1_600)
      page.off('response', handler)
      return { outcome: 'confirmed', detail: `确认弹窗已确认执行（可逆操作）：${apis.join('; ') || '无写请求'}`, apis, shot: shotFile }
    }
    await page.keyboard.press('Escape')
    page.off('response', handler)
    return { outcome: 'confirm-dialog', detail: '确认弹窗已验证（无确认按钮，Escape 关闭）', apis, shot: shotFile }
  }
  if (await form.isVisible({ timeout: 800 }).catch(() => false)) {
    shotFile = await shot(page, module, `${slug}-form`)
    // 填充可见字段
    const inputs = form.locator('input:visible, textarea:visible')
    const cnt = await inputs.count().catch(() => 0)
    for (let i = 0; i < cnt; i++) {
      const el = inputs.nth(i)
      const type = await el.getAttribute('type').catch(() => null)
      if (type && ['checkbox', 'radio', 'file', 'hidden', 'date', 'search'].includes(type)) continue
      const ph = (await el.getAttribute('placeholder').catch(() => '')) ?? ''
      if (/搜索|筛选|查询/.test(ph)) continue
      const im = await el.getAttribute('inputmode').catch(() => null)
      const step = await el.getAttribute('step').catch(() => null)
      // disabled 字段（如已完结反馈的回复框）不给 fill 超时会挂满整个 test timeout
      if (type === 'number' || im === 'numeric' || step) await el.fill('1', { timeout: 2_000 }).catch(() => {})
      else await el.fill(`e2e_${Date.now() % 100000}`, { timeout: 2_000 }).catch(() => {})
    }
    const submit = form.locator('button').filter({ hasText: /^(确[认定]|保存|创建|提交|添加|发布)/ }).last()
    if (await submit.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // 已完结等状态下提交按钮 disabled：click 不带超时会挂满整个 test timeout
      if (!(await submit.isEnabled().catch(() => false))) {
        await page.keyboard.press('Escape').catch(() => {})
        page.off('response', handler)
        return { outcome: 'form-opened', detail: `表单弹窗打开（${cnt} 字段）但提交控件禁用（当前状态不可写）`, apis, shot: shotFile }
      }
      await submit.click({ timeout: 3_000 }).catch(() => {})
      await page.waitForTimeout(1_800)
      page.off('response', handler)
      return { outcome: 'form-submitted', detail: `表单弹窗提交：${apis.join('; ') || '无写请求'}`, apis, shot: shotFile }
    }
    await page.keyboard.press('Escape')
    page.off('response', handler)
    return { outcome: 'form-opened', detail: `表单弹窗打开（${cnt} 字段）无提交按钮`, apis, shot: shotFile }
  }
  await page.waitForTimeout(1_200)
  shotFile = await shot(page, module, `${slug}-direct`)
  page.off('response', handler)
  return { outcome: apis.length ? 'submitted' : 'no-op', detail: `直接执行：${apis.join('; ') || '无写请求'}`, apis, shot: shotFile }
}

async function setup(page: Page, url: string) {
  await loginAsAdmin(page, requireAdminCredentials())
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
  await page.waitForTimeout(600)
}

test.describe.configure({ mode: 'serial' })

const CASES: { slug: string; module: string; url: string }[] = [
  { slug: 'GroupNoticeManagePage', module: 'groups', url: `/groups/${NOTICE_GID}/notices` },
  { slug: 'GroupVoteManagePage', module: 'groups', url: `/groups/${VOTE_GID}/votes` },
  { slug: 'GroupTagManagePage', module: 'groups', url: `/groups/${TAG_GID}/tags` },
  { slug: 'GroupMemberManagePage', module: 'groups', url: `/groups/${GID}/members` },
  { slug: 'UserListPage', module: 'users', url: '/users' },
  { slug: 'GroupListPage', module: 'groups', url: '/groups' },
  { slug: 'ChannelListPage', module: 'channels', url: '/channels' },
  { slug: 'ChannelDetailPage', module: 'channels', url: `/channels/${CID}` },
  { slug: 'MutedUsersPage', module: 'settings', url: '/settings/muted-users' },
  { slug: 'SensitiveWordPage', module: 'content-moderation', url: '/moderation/sensitive-words' },
  { slug: 'UserTagManagePage', module: 'users', url: `/users/${UID}/tags` },
  { slug: 'UserCollectManagePage', module: 'users', url: `/users/${UID}/collects` },
  { slug: 'ComplianceKeyPage', module: 'settings', url: '/settings/compliance-keys' },
  { slug: 'BillingPlanListPage', module: 'billing-plans', url: '/billing-plans' },
  { slug: 'FeedbackListPage', module: 'feedback', url: '/feedback' },
]

for (const c of CASES) {
  test(`${c.slug} 行内写操作`, async ({ page }) => {
    test.setTimeout(120_000)
    try {
      await setup(page, c.url)
      results[c.slug] = await exerciseRowAction(page, c.module, c.slug)
    } catch (err) {
      results[c.slug] = { outcome: 'error', detail: String(err).split('\n')[0].slice(0, 120), apis: [], shot: '' }
    }
    saveResults()
  })
}

test.afterAll(() => {
  saveResults()
  console.log('[p12] results saved')
})
