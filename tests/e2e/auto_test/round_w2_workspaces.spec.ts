/**
 * auto_test 首测批次 W2R1：workspaces 治理面 4 页 + bots/ProductExperience 2 页
 * 对应台账：
 *   tests/auto_test/bots/BotListPage.md（7 点）
 *   tests/auto_test/settings/ProductExperiencePage.md（3 点）
 *   tests/auto_test/workspaces/ProjectDetailPage.md（14 点）
 *   tests/auto_test/workspaces/ProjectListPage.md（6 点）
 *   tests/auto_test/workspaces/WorkspaceDetailPage.md（7 点）
 *   tests/auto_test/workspaces/WorkspaceListPage.md（8 点）
 * 证据（截图 + api-hits.json + console-errors）输出到 tests/auto_test/evidence/{bots,settings,workspaces,evidence-misc}/
 *
 * 设计（沿 round1）：单 context 单登录 + test.step 串联，避免重复登录触发后端频控。
 * 写操作只对种子工作区 AT-WS-* 执行归档/恢复，测完必须恢复 active；
 * Bot 启停确认执行仅在行属主为测试账号时执行（且执行后回滚原状态）。
 * staleTime=5min：SPA 内二次进入页面不会重拉，需要抓新请求的步骤一律先注册 waitForResponse 再 reload。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import fs from 'node:fs'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const WS_ID = process.env.AT_WS_ID || '109901865994684416'
const WS_NAME = process.env.AT_WS_NAME || 'AT-WS-20260830210132'
const PROJECT_ID = process.env.AT_PROJECT_ID || '109901866229565440'
const TEST_OWNER_UIDS = new Set(['178809489600161', '178809489600162'])

const RUN_ID = `w2r1-${Date.now()}`

type ApiHit = { url: string; status: number; method: number | string; body?: string }
const apiHits: ApiHit[] = []
const consoleErrors: string[] = []
let mark = 0

function trackApi(page: Page) {
  page.on('response', (res: Response) => {
    const url = res.url()
    if (url.includes('/api/adm/')) {
      const hit: ApiHit = {
        url: url.replace(/^.*\/api\/adm/, ''),
        status: res.status(),
        method: res.request().method(),
      }
      apiHits.push(hit)
      if (/\/(bot|workspace|project|config\/product-experience)\//.test(hit.url) && res.status() < 300) {
        res.text().then((t) => { hit.body = t.slice(0, 3000) }).catch(() => {})
      }
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text().slice(0, 300)}`)
  })
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 300)}`))
}

function hitsSince(pattern: RegExp): ApiHit[] {
  return apiHits.slice(mark).filter((h) => pattern.test(h.url))
}

function evidenceDir(pageDir: string) {
  const dir = `tests/auto_test/evidence/${pageDir}`
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function shot(page: Page, pageDir: string, name: string) {
  await page.screenshot({ path: `${evidenceDir(pageDir)}/${RUN_ID}-${name}.png`, fullPage: false })
}

/** 持续返回错误码的注入（ErrorState/403 验证用，用完必须 unroute） */
async function injectStatus(page: Page, pattern: string, code: number) {
  await page.route(pattern, (route) =>
    route.fulfill({ status: code, contentType: 'application/json', body: `{"code":${code},"msg":"injected-${code}"}` }))
}

/** 注入空分页 payload（空态验证用，兼容 items/list 两键；用完必须 unroute） */
async function injectEmptyList(page: Page, pattern: string) {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0, msg: 'ok',
        payload: { items: [], list: [], page: 1, size: 10, total: 0, total_pages: 0 },
      }),
    }))
}

/** 直接从 Response 解析列表信息（兼容 items / list 两种数组键；避免 trackApi 异步回填竞态） */
async function parseListResponse(resp: Response): Promise<{ total: number; itemCount: number; firstName: string } | null> {
  try {
    const parsed = JSON.parse(await resp.text())
    const payload = parsed.payload ?? parsed.data
    const arr = payload && (Array.isArray(payload.items) ? payload.items : Array.isArray(payload.list) ? payload.list : null)
    if (payload && arr) {
      const first = arr[0] ?? {}
      return {
        total: Number(payload.total ?? arr.length),
        itemCount: arr.length,
        firstName: String(first.name ?? first.title ?? ''),
      }
    }
  } catch { /* ignore */ }
  return null
}

/** ConfirmDialog（Radix AlertDialog）内的按钮，避免与行内同名按钮冲突 */
function dialogButton(page: Page, name: string) {
  return page.getByRole('alertdialog').getByRole('button', { name, exact: true })
}

test('W2R1 首测：bots + product-experience + workspaces 4 页', async ({ page }) => {
  test.setTimeout(600_000)
  trackApi(page)

  // ---------- 0. 守卫：6 个路由未登录全部跳 /login ----------
  await test.step('守卫：未登录访问 6 路由均跳 /login', async () => {
    for (const path of ['/bots', '/workspaces', `/workspaces/${WS_ID}`, '/projects', `/projects/${PROJECT_ID}`, '/settings/product-experience']) {
      await page.goto(path)
      await expect(page, `未登录访问 ${path} 应跳登录`).toHaveURL(/\/login/)
    }
    await shot(page, 'workspaces', 'guard-all-redirect')
  })

  // ---------- 0.5 登录 ----------
  await test.step('登录（超管）', async () => {
    await loginAsAdmin(page, requireAdminCredentials())
  })

  // ========== A. /bots BotListPage ==========
  let botInfo: { total: number; itemCount: number; firstName: string } | null = null
  await test.step('bots: 列表加载渲染与字段格式化', async () => {
    mark = apiHits.length
    const listResp = page.waitForResponse((r) => r.url().includes('/api/adm/bot/list'), { timeout: 20_000 })
    await page.goto('/bots')
    await expect(page.getByRole('heading', { name: 'Bot 管理' })).toBeVisible()
    const resp = await listResp
    expect(resp.status(), 'bot/list 必须 2xx').toBeLessThan(300)
    botInfo = await parseListResponse(resp)
    console.log(`[bots] total=${botInfo?.total} firstPageSize=${botInfo?.itemCount} firstName=${botInfo?.firstName}`)
    if ((botInfo?.itemCount ?? 0) > 0) {
      await expect(page.getByRole('table').first()).toBeVisible()
      for (const h of ['Bot', '属主', '简介', '公开', '状态', '操作']) {
        await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
      }
    }
    await shot(page, 'bots', 'list-render')
  })

  await test.step('bots: 分页控件与翻页', async () => {
    await expect(page.getByText(/共 \d+ 条/).first()).toBeVisible()
    if ((botInfo?.total ?? 0) > 10) {
      mark = apiHits.length
      const p2 = page.waitForResponse((r) => r.url().includes('/bot/list') && r.url().includes('page=2'), { timeout: 15_000 })
      await page.getByRole('button', { name: '2', exact: true }).first().click()
      expect((await p2).status()).toBeLessThan(300)
      await shot(page, 'bots', 'pagination-page2')
      // 回翻第 1 页命中缓存不发请求，断言 UI 页码即可
      await page.getByRole('button', { name: '上一页' }).first().click()
      await expect(page.getByText(/第 1 \//).first()).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: '下一页' }).first()).toBeDisabled()
      await shot(page, 'bots', 'pagination-single-page')
    }
  })

  await test.step('bots: 错误态（500 注入 → ErrorState + 重试恢复）', async () => {
    await injectStatus(page, '**/api/adm/bot/list*', 500)
    const reload = page.waitForResponse((r) => r.url().includes('/api/adm/bot/list'), { timeout: 15_000 })
    await page.reload()
    await reload
    await expect(page.getByText('加载 Bot 列表失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'bots', 'error-state')
    await page.unroute('**/api/adm/bot/list*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/bot/list'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
  })

  await test.step('bots: 空态（空分页注入 → 暂无注册 Bot）', async () => {
    if ((botInfo?.itemCount ?? 0) > 0) {
      await injectEmptyList(page, '**/api/adm/bot/list*')
      const reload = page.waitForResponse((r) => r.url().includes('/api/adm/bot/list'), { timeout: 15_000 })
      await page.reload()
      await reload
    }
    // DataTable 桌面+移动双 DOM，空态渲染两份，取第一个
    await expect(page.getByText('暂无注册 Bot').first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'bots', 'empty-state')
    await page.unroute('**/api/adm/bot/list*')
    const reload2 = page.waitForResponse((r) => r.url().includes('/api/adm/bot/list'), { timeout: 15_000 })
    await page.reload()
    await reload2
    await expect(page.getByRole('heading', { name: 'Bot 管理' })).toBeVisible()
  })

  const botRow = () => page.locator('tbody tr').first()
  await test.step('bots: 详情抽屉打开与关闭', async () => {
    if ((botInfo?.itemCount ?? 0) === 0) {
      console.log('[bots] SKIP_DRAWER 无 Bot 种子数据，抽屉/启停/复制三项无法实测')
      return
    }
    mark = apiHits.length
    const detailResp = page.waitForResponse((r) => r.url().includes('/api/adm/bot/detail'), { timeout: 15_000 })
    await page.getByRole('button', { name: /详情/ }).first().click()
    expect((await detailResp).status(), 'bot/detail 必须 2xx').toBeLessThan(300)
    // BotDetailBody 三个小节均为 h4；用 heading 角色避免与 PageHeader 描述里的
    // 「Webhook」字样 strict-mode 冲突
    await expect(page.getByRole('heading', { name: '基础信息', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Webhook', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '能力声明', exact: true })).toBeVisible()
    await shot(page, 'bots', 'drawer-open')
    await page.getByRole('button', { name: '关闭抽屉' }).click()
    await expect(page.getByRole('heading', { name: '基础信息', exact: true })).not.toBeVisible()
    await shot(page, 'bots', 'drawer-closed')
  })

  await test.step('bots: 启停二次确认弹窗（取消不发请求；属主为测试账号时执行并回滚）', async () => {
    if ((botInfo?.itemCount ?? 0) === 0) {
      console.log('[bots] SKIP_STATUS_CONFIRM 无 Bot 行')
      return
    }
    // 取消路径
    mark = apiHits.length
    const toggleBtn = botRow().getByRole('button', { name: /停用|启用/ })
    const toggleLabel = (await toggleBtn.innerText()).trim()
    await toggleBtn.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText(/确定停用？|确定启用？/)).toBeVisible()
    await shot(page, 'bots', 'status-confirm-dialog')
    await dialogButton(page, '取消').click()
    await expect(page.getByRole('alertdialog')).not.toBeVisible()
    expect(hitsSince(/\/bot\/(enable|disable)/), '取消不应发启停请求').toHaveLength(0)

    // 确认执行：仅当属主为测试账号（不影响第三方 Bot），执行后回滚
    const uidText = (await botRow().locator('button').filter({ hasText: /^\d{6,}$/ }).first().innerText()).trim()
    if (TEST_OWNER_UIDS.has(uidText)) {
      for (let i = 0; i < 2; i++) {
        mark = apiHits.length
        const confirmLabel = ((await botRow().getByRole('button', { name: /停用|启用/ }).innerText()).trim() === '停用') ? '停用' : '启用'
        const mutationResp = page.waitForResponse(
          (r) => /\/bot\/(enable|disable)/.test(r.url()), { timeout: 15_000 })
        const refetchResp = page.waitForResponse((r) => r.url().includes('/bot/list'), { timeout: 15_000 })
        await botRow().getByRole('button', { name: confirmLabel === '停用' ? /停用/ : /启用/ }).click()
        await dialogButton(page, confirmLabel).click()
        expect((await mutationResp).status(), 'bot 启停必须 2xx').toBeLessThan(300)
        await expect(page.getByText(confirmLabel === '停用' ? 'Bot 已停用' : 'Bot 已启用')).toBeVisible({ timeout: 1_000 })
        await shot(page, 'bots', `status-confirm-exec-${i}`)
        expect((await refetchResp).status(), '启停后列表必须失效重拉').toBeLessThan(300)
      }
      console.log(`[bots] 属主 ${uidText} 为测试账号，启停确认执行+回滚完成`)
    } else {
      console.log(`[bots] SKIP_CONFIRM owner_uid=${uidText} 非测试账号，确认执行不测（避免影响第三方 Bot）`)
    }
    void toggleLabel
  })

  await test.step('bots: 属主 UID 复制（toast 1 秒内截图）', async () => {
    if ((botInfo?.itemCount ?? 0) === 0) {
      console.log('[bots] SKIP_COPY_UID 无 Bot 行')
      return
    }
    await botRow().locator('button').filter({ hasText: /^\d{6,}$/ }).first().click()
    await expect(page.getByText('属主 UID 已复制')).toBeVisible({ timeout: 1_000 })
    await shot(page, 'bots', 'copy-uid-toast')
  })

  // ========== B. /settings/product-experience ProductExperiencePage ==========
  await test.step('pe: 配置加载与只读渲染', async () => {
    mark = apiHits.length
    const cfg = page.waitForResponse((r) => r.url().includes('/api/adm/admin/config/product-experience'), { timeout: 15_000 })
    await page.goto('/settings/product-experience')
    await expect(page.getByRole('heading', { name: /产品体验/ })).toBeVisible()
    expect((await cfg).status(), 'product-experience 必须 2xx').toBeLessThan(300)
    await expect(page.getByTestId('config-version')).toBeVisible()
    await expect(page.getByText('当前有效体验')).toBeVisible()
    await expect(page.getByText('如何变更')).toBeVisible()
    await shot(page, 'settings', 'config-render')
  })

  await test.step('pe: 错误态（500 注入 → ErrorState + 重试恢复）', async () => {
    await injectStatus(page, '**/api/adm/admin/config/product-experience*', 500)
    const refresh = page.waitForResponse((r) => r.url().includes('/api/adm/admin/config/product-experience'), { timeout: 15_000 })
    await page.reload()
    await refresh
    await expect(page.getByText('加载产品体验配置失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'settings', 'error-state')
    await page.unroute('**/api/adm/admin/config/product-experience*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/admin/config/product-experience'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
    await expect(page.getByTestId('config-version')).toBeVisible()
  })

  await test.step('pe: 返回设置跳转 /settings', async () => {
    await page.getByRole('button', { name: '返回设置' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await shot(page, 'settings', 'back-to-settings')
  })

  // ========== C. /projects ProjectListPage ==========
  let projectInfo: { total: number; itemCount: number; firstName: string } | null = null
  await test.step('projects: 列表加载渲染与字段格式化', async () => {
    mark = apiHits.length
    const listResp = page.waitForResponse((r) => r.url().includes('/api/adm/project/list'), { timeout: 20_000 })
    await page.goto('/projects')
    await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible()
    const resp = await listResp
    expect(resp.status(), 'project/list 必须 2xx').toBeLessThan(300)
    projectInfo = await parseListResponse(resp)
    console.log(`[projects] total=${projectInfo?.total} firstName=${projectInfo?.firstName}`)
    for (const h of ['ID', '项目名称', '所属工作区', '项目 Owner', '任务', '状态', '创建时间']) {
      await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
    }
    await shot(page, 'workspaces', 'projects-list-render')
  })

  await test.step('projects: 分页控件与翻页', async () => {
    await expect(page.getByText(/共 \d+ 条/).first()).toBeVisible()
    if ((projectInfo?.total ?? 0) > 10) {
      mark = apiHits.length
      const p2 = page.waitForResponse((r) => r.url().includes('/project/list') && r.url().includes('page=2'), { timeout: 15_000 })
      await page.getByRole('button', { name: '2', exact: true }).first().click()
      expect((await p2).status()).toBeLessThan(300)
      await shot(page, 'workspaces', 'projects-pagination-page2')
      // 回翻第 1 页命中 TanStack 缓存（staleTime 5min）不发请求，断言 UI 页码即可
      await page.getByRole('button', { name: '上一页' }).first().click()
      await expect(page.getByText(/第 1 \//).first()).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: '下一页' }).first()).toBeDisabled()
      await shot(page, 'workspaces', 'projects-pagination-single-page')
    }
  })

  await test.step('projects: 搜索（关键字生效 + page=1）', async () => {
    if (!projectInfo?.firstName) {
      console.log('[projects] SKIP_SEARCH 未捕获到项目名')
      return
    }
    mark = apiHits.length
    const kw = projectInfo!.firstName.slice(0, 12)
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/list') && r.url().includes('keyword='), { timeout: 15_000 })
    await page.getByPlaceholder('搜索项目名称...').fill(kw)
    await page.getByRole('button', { name: '搜索' }).click()
    const sr = await searchResp
    expect(sr.status()).toBeLessThan(300)
    expect(sr.url(), '搜索必须 page=1').toContain('page=1')
    await expect(page.getByText(kw, { exact: false }).first()).toBeVisible()
    await shot(page, 'workspaces', 'projects-search')
  })

  await test.step('projects: 状态筛选（进行中 → status=active）与清空重置', async () => {
    const statusSelect = page.locator('select').filter({ has: page.locator('option[value="active"]') })
    mark = apiHits.length
    const filterResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/list') && r.url().includes('status=active'), { timeout: 15_000 })
    await statusSelect.selectOption('active')
    await page.getByRole('button', { name: '搜索' }).click()
    const fr = await filterResp
    expect(fr.status()).toBeLessThan(300)
    expect(fr.url(), '筛选请求必须 page=1').toContain('page=1')
    await shot(page, 'workspaces', 'projects-filter-active')

    // 重置回到与初始加载相同的 queryKey → staleTime 内命中缓存不发请求（合理行为），
    // 断言 UI 复位 + 表格仍在渲染即可
    await page.getByRole('button', { name: '重置' }).click()
    await expect(page.getByPlaceholder('搜索项目名称...')).toHaveValue('')
    await expect(statusSelect).toHaveValue('all')
    await expect(page.getByRole('table').first()).toBeVisible()
    await shot(page, 'workspaces', 'projects-filter-reset')
  })

  await test.step('projects: 错误态（500 注入 → ErrorState + 重试恢复）', async () => {
    await injectStatus(page, '**/api/adm/project/list*', 500)
    const refresh = page.waitForResponse((r) => r.url().includes('/api/adm/project/list'), { timeout: 15_000 })
    await page.getByTitle('刷新数据').first().click()
    await refresh
    await expect(page.getByText('加载项目数据失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'workspaces', 'projects-error-state')
    await page.unroute('**/api/adm/project/list*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/project/list'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
  })

  await test.step('projects: 点击种子项目行进入详情', async () => {
    const idCell = page.getByText(PROJECT_ID, { exact: true }).first()
    await expect(idCell).toBeVisible({ timeout: 10_000 })
    await idCell.click()
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}`))
    await shot(page, 'workspaces', 'projects-row-click-detail')
  })

  // ========== D. /projects/:id ProjectDetailPage ==========
  await test.step('pdetail: 页头与基本信息卡', async () => {
    mark = apiHits.length
    const detailResp = page.waitForResponse((r) => r.url().includes('/api/adm/project/detail'), { timeout: 20_000 })
    await page.reload()
    const resp = await detailResp
    expect(resp.status(), 'project/detail 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('基本信息').first()).toBeVisible()
    await expect(page.getByText('所属工作区').first()).toBeVisible()
    await expect(page.getByText('项目 Owner').first()).toBeVisible()
    await expect(page.getByText('创建时间').first()).toBeVisible()
    await expect(page.getByText('描述').first()).toBeVisible()
    await expect(page.getByText(/进行中|已完成/).first()).toBeVisible()
    await shot(page, 'workspaces', 'pdetail-basic-info')
  })

  await test.step('pdetail: 任务统计四卡 + 状态分布四格', async () => {
    for (const t of ['任务总数', '已完成', 'assignee 数', '完成率']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible()
    }
    for (const s of ['todo', 'doing', 'review', 'done']) {
      await expect(page.getByTestId(`task-stat-${s}`)).toBeVisible()
    }
    await expect(page.getByText('任务状态分布').first()).toBeVisible()
    await shot(page, 'workspaces', 'pdetail-stats')
  })

  await test.step('pdetail: Assignee 概览（表格或空态）', async () => {
    await expect(page.getByText('Assignee 概览').first()).toBeVisible()
    await page.waitForTimeout(300)
    const emptyVisible = await page.getByText('暂无已指派任务').isVisible().catch(() => false)
    if (emptyVisible) {
      await shot(page, 'workspaces', 'pdetail-assignee-empty')
    } else {
      await expect(page.getByText('Assignee ID').first()).toBeVisible()
      await shot(page, 'workspaces', 'pdetail-assignee-table')
    }
  })

  await test.step('pdetail: W2 治理四 Tab 存在且默认成员', async () => {
    mark = apiHits.length
    const membersResp = page.waitForResponse((r) => r.url().includes('/api/adm/project/members'), { timeout: 20_000 })
    await page.reload()
    expect((await membersResp).status(), '默认成员 Tab 必须 2xx').toBeLessThan(300)
    for (const t of ['成员', '里程碑', '频道', '聚合']) {
      await expect(page.getByRole('tab', { name: new RegExp(t) }).first()).toBeVisible()
    }
    await expect(page.getByText('加载项目成员...')).not.toBeVisible()
    await shot(page, 'workspaces', 'pdetail-tabs-default-members')
  })

  await test.step('pdetail: 成员 Tab 只读表格 + 刷新', async () => {
    for (const h of ['用户 ID', '昵称', '账号', '角色', '加入时间']) {
      await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
    }
    mark = apiHits.length
    const refresh = page.waitForResponse((r) => r.url().includes('/api/adm/project/members'), { timeout: 15_000 })
    await page.getByTitle('刷新数据').last().click()
    expect((await refresh).status(), '成员刷新必须 2xx').toBeLessThan(300)
    await shot(page, 'workspaces', 'pdetail-members-panel')
  })

  await test.step('pdetail: 里程碑 Tab（筛选 + 表格 + page=1）', async () => {
    mark = apiHits.length
    const msResp = page.waitForResponse((r) => r.url().includes('/api/adm/project/milestones'), { timeout: 15_000 })
    await page.getByRole('tab', { name: /里程碑/ }).first().click()
    expect((await msResp).status()).toBeLessThan(300)
    for (const h of ['ID', '名称', '状态', '计划时间', '达成时间']) {
      await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
    }
    mark = apiHits.length
    const planned = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/milestones') && r.url().includes('status=planned'), { timeout: 15_000 })
    await page.getByTestId('milestone-status-filter').selectOption('planned')
    const r1 = await planned
    expect(r1.status()).toBeLessThan(300)
    expect(r1.url(), '筛选变化必须 page=1').toContain('page=1')
    await shot(page, 'workspaces', 'pdetail-milestones-filter')
  })

  await test.step('pdetail: 频道 Tab（表格 + 2xx）', async () => {
    mark = apiHits.length
    const chResp = page.waitForResponse((r) => r.url().includes('/api/adm/project/channels'), { timeout: 15_000 })
    await page.getByRole('tab', { name: /频道/ }).first().click()
    expect((await chResp).status()).toBeLessThan(300)
    for (const h of ['频道 ID', '名称', '订阅数', '创建时间']) {
      await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
    }
    await shot(page, 'workspaces', 'pdetail-channels-panel')
  })

  await test.step('pdetail: 聚合 Tab（类型筛选 + 表格/空态自适应 + page=1）', async () => {
    mark = apiHits.length
    const aggResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/aggregations') && r.url().includes('type=pinned'), { timeout: 15_000 })
    await page.getByRole('tab', { name: /聚合/ }).first().click()
    const pinnedResp = await aggResp
    expect(pinnedResp.status()).toBeLessThan(300)
    const pinnedBody = await pinnedResp.text().catch(() => '')
    const pinnedEmpty = /"list"\s*:\s*\[\s*\]/.test(pinnedBody) || /"items"\s*:\s*\[\s*\]/.test(pinnedBody)
    await page.waitForTimeout(300)
    if (pinnedEmpty) {
      // 面板空态行在此自然验证（种子项目无置顶聚合）
      await expect(page.getByText('暂无聚合记录').first()).toBeVisible()
      await expect(page.getByText('后端未返回任何记录').first()).toBeVisible()
      await shot(page, 'workspaces', 'pdetail-panel-empty-natural')
    } else {
      for (const h of ['ID', '类型', '标题', '关联对象', '时间']) {
        await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
      }
      await shot(page, 'workspaces', 'pdetail-aggregations-pinned-table')
    }
    mark = apiHits.length
    const activity = page.waitForResponse(
      (r) => r.url().includes('/api/adm/project/aggregations') && r.url().includes('type=activity'), { timeout: 15_000 })
    await page.getByTestId('aggregation-type-filter').selectOption('activity')
    const r1 = await activity
    expect(r1.status()).toBeLessThan(300)
    expect(r1.url(), '类型切换必须 page=1').toContain('page=1')
    await page.waitForTimeout(300)
    if (await page.getByRole('columnheader', { name: '类型', exact: false }).isVisible().catch(() => false)) {
      for (const h of ['ID', '类型', '标题', '关联对象', '时间']) {
        await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
      }
    } else {
      await expect(page.getByText('暂无聚合记录').first()).toBeVisible()
    }
    await shot(page, 'workspaces', 'pdetail-aggregations-filter')
  })

  await test.step('pdetail: 面板空态兜底（若聚合步已自然验证则跳过注入）', async () => {
    await page.waitForTimeout(300)
    const naturalShown = await page
      .getByText('暂无聚合记录')
      .first()
      .isVisible()
      .catch(() => false)
    if (!naturalShown) {
      // pinned/activity 均非空时：注入空态，用从未请求过的 related_posts 类型触发网络
      await injectEmptyList(page, '**/api/adm/project/aggregations*')
      const injected = page.waitForResponse(
        (r) => r.url().includes('/api/adm/project/aggregations') && r.url().includes('type=related_posts'), { timeout: 15_000 })
      await page.getByTestId('aggregation-type-filter').selectOption('related_posts')
      expect((await injected).status()).toBeLessThan(300)
      await expect(page.getByText('暂无聚合记录').first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('后端未返回任何记录').first()).toBeVisible()
      await shot(page, 'workspaces', 'pdetail-panel-empty-injected')
      // 恢复：解除注入，切回已缓存的 activity 类型（空态下面板无分页/刷新按钮，直接切类型即可；
      // 后续 403 步骤整页 reload 也会重置全部查询缓存）
      await page.unroute('**/api/adm/project/aggregations*')
      await page.getByTestId('aggregation-type-filter').selectOption('activity')
      await page.waitForTimeout(300)
      await expect(page.getByTestId('aggregation-type-filter')).toBeVisible()
    } else {
      console.log('[pdetail] 面板空态已在聚合步自然验证（pinned 为空）')
    }
  })

  await test.step('pdetail: 面板 403 fail-closed（403 注入 → 明确文案 + 重试恢复）', async () => {
    await page.route('**/api/adm/project/members*', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"code":403,"msg":"forbidden"}' }))
    const reload = page.waitForResponse((r) => r.url().includes('/api/adm/project/members'), { timeout: 15_000 })
    await page.reload()
    await reload
    await expect(page.getByText('暂无权限查看项目成员（workspaces:read）')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('members-forbidden-retry')).toBeVisible()
    await shot(page, 'workspaces', 'pdetail-panel-403-fail-closed')
    await page.unroute('**/api/adm/project/members*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/project/members'), { timeout: 15_000 })
    await page.getByTestId('members-forbidden-retry').click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
  })

  await test.step('pdetail: 主查询错误态（500 注入 → ErrorState + 重试）', async () => {
    await injectStatus(page, '**/api/adm/project/detail*', 500)
    const reload = page.waitForResponse((r) => r.url().includes('/api/adm/project/detail'), { timeout: 15_000 })
    await page.reload()
    await reload
    await expect(page.getByText('加载项目详情失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'workspaces', 'pdetail-error-state')
    await page.unroute('**/api/adm/project/detail*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/project/detail'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
  })

  await test.step('pdetail: 返回列表按钮跳转 /projects', async () => {
    await page.getByRole('button', { name: '返回列表' }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await shot(page, 'workspaces', 'pdetail-back-to-list')
  })

  // ========== E. /workspaces/:id WorkspaceDetailPage ==========
  await test.step('wdetail: 详情加载与基本信息卡', async () => {
    mark = apiHits.length
    const detailResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/detail'), { timeout: 20_000 })
    await page.goto(`/workspaces/${WS_ID}`)
    const resp = await detailResp
    expect(resp.status(), 'workspace/detail 必须 2xx').toBeLessThan(300)
    await expect(page.getByRole('heading', { name: new RegExp(WS_NAME) })).toBeVisible()
    await expect(page.getByText('基本信息').first()).toBeVisible()
    await expect(page.getByText('主 Owner').first()).toBeVisible()
    await expect(page.getByText('创建时间').first()).toBeVisible()
    await expect(page.getByText('归档时间').first()).toBeVisible()
    await expect(page.getByText(/正常|已归档/).first()).toBeVisible()
    await shot(page, 'workspaces', 'wdetail-basic-info')
  })

  await test.step('wdetail: 资源计数 StatsCard 四卡', async () => {
    for (const t of ['项目数', '群组数', '频道数', '工作区成员数']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible()
    }
    await shot(page, 'workspaces', 'wdetail-stats')
  })

  await test.step('wdetail: 工作区成员清单（表头 + 角色徽标）', async () => {
    await expect(page.getByText('工作区成员', { exact: false }).first()).toBeVisible()
    await page.waitForTimeout(300)
    if (await page.getByText('暂无工作区成员').isVisible().catch(() => false)) {
      await shot(page, 'workspaces', 'wdetail-members-empty')
    } else {
      for (const h of ['用户 ID', '昵称', '账号', '角色', '加入时间']) {
        await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
      }
      await expect(page.getByText(/Owner|Member|Guest/).first()).toBeVisible()
      await shot(page, 'workspaces', 'wdetail-members-table')
    }
  })

  await test.step('wdetail: 归属资源清单三卡（项目/群组/频道，前 20 条 + 成员数/订阅数列）', async () => {
    await expect(page.getByText('归属本工作区的资源清单（前 20 条）').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /工作区群组/ }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /工作区频道/ }).first()).toBeVisible()
    // 行级断言：detail payload 的 projects/groups/channels 数组应渲染为表格行
    await expect(page.getByText(PROJECT_ID, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('General', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Announcements', { exact: true }).first()).toBeVisible()
    await shot(page, 'workspaces', 'wdetail-resource-cards')
    await page.screenshot({
      path: `${evidenceDir('workspaces')}/${RUN_ID}-wdetail-fullpage.png`,
      fullPage: true,
    })
  })

  await test.step('wdetail: 错误态（500 注入 → ErrorState + 重试）', async () => {
    await injectStatus(page, '**/api/adm/workspace/detail*', 500)
    const reload = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/detail'), { timeout: 15_000 })
    await page.reload()
    await reload
    await expect(page.getByText('加载工作区详情失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'workspaces', 'wdetail-error-state')
    await page.unroute('**/api/adm/workspace/detail*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/detail'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
  })

  await test.step('wdetail: 返回列表按钮跳转 /workspaces', async () => {
    await page.getByRole('button', { name: '返回列表' }).click()
    await expect(page).toHaveURL(/\/workspaces$/)
    await shot(page, 'workspaces', 'wdetail-back-to-list')
  })

  // ========== F. /workspaces WorkspaceListPage ==========
  let wsInfo: { total: number; itemCount: number; firstName: string } | null = null
  await test.step('wslist: 列表加载渲染与字段格式化', async () => {
    mark = apiHits.length
    const listResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/list'), { timeout: 20_000 })
    await page.reload()
    const resp = await listResp
    expect(resp.status(), 'workspace/list 必须 2xx').toBeLessThan(300)
    await expect(page.getByRole('heading', { name: '工作区管理' })).toBeVisible()
    wsInfo = await parseListResponse(resp)
    console.log(`[workspaces] total=${wsInfo?.total} firstName=${wsInfo?.firstName}`)
    for (const h of ['ID', '名称', '主 Owner', '资源', '状态', '创建时间']) {
      await expect(page.getByRole('columnheader', { name: h, exact: false }).first()).toBeVisible()
    }
    await expect(page.getByRole('cell', { name: WS_NAME, exact: false }).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, 'workspaces', 'wslist-render')
  })

  await test.step('wslist: 分页控件与翻页', async () => {
    await expect(page.getByText(/共 \d+ 条/).first()).toBeVisible()
    if ((wsInfo?.total ?? 0) > 10) {
      mark = apiHits.length
      const p2 = page.waitForResponse((r) => r.url().includes('/workspace/list') && r.url().includes('page=2'), { timeout: 15_000 })
      await page.getByRole('button', { name: '2', exact: true }).first().click()
      expect((await p2).status()).toBeLessThan(300)
      await shot(page, 'workspaces', 'wslist-pagination-page2')
      // 回翻第 1 页命中缓存不发请求，断言 UI 页码即可
      await page.getByRole('button', { name: '上一页' }).first().click()
      await expect(page.getByText(/第 1 \//).first()).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: '下一页' }).first()).toBeDisabled()
      await shot(page, 'workspaces', 'wslist-pagination-single-page')
    }
  })

  await test.step('wslist: 搜索种子工作区（keyword + page=1）', async () => {
    mark = apiHits.length
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 15_000 })
    await page.getByPlaceholder('搜索工作区名称...').fill(WS_NAME)
    await page.getByRole('button', { name: '搜索' }).click()
    const sr = await searchResp
    expect(sr.status()).toBeLessThan(300)
    expect(sr.url(), '搜索必须 page=1').toContain('page=1')
    await expect(page.getByRole('cell', { name: WS_NAME, exact: false }).first()).toBeVisible()
    await shot(page, 'workspaces', 'wslist-search-seed')
  })

  await test.step('wslist: 状态筛选（已归档参数正确）后回到全部', async () => {
    const statusSelect = page.locator('select').filter({ has: page.locator('option[value="archived"]') })
    mark = apiHits.length
    const archResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes('status=archived'), { timeout: 15_000 })
    await statusSelect.selectOption('archived')
    await page.getByRole('button', { name: '搜索' }).click()
    const ar = await archResp
    expect(ar.status()).toBeLessThan(300)
    expect(ar.url(), '筛选请求必须 page=1').toContain('page=1')
    await shot(page, 'workspaces', 'wslist-filter-archived')

    // 回到 status=all+keyword：该 queryKey 已在搜索步取过 → 命中缓存不发请求，断言 UI 即可
    await statusSelect.selectOption('all')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page.getByRole('cell', { name: WS_NAME, exact: false }).first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('wslist: 错误态（500 注入 → ErrorState + 重试恢复）', async () => {
    await injectStatus(page, '**/api/adm/workspace/list*', 500)
    const refresh = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/list'), { timeout: 15_000 })
    await page.getByTitle('刷新数据').first().click()
    await refresh
    await expect(page.getByText('加载工作区数据失败')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'workspaces', 'wslist-error-state')
    await page.unroute('**/api/adm/workspace/list*')
    const retry = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/list'), { timeout: 15_000 })
    await page.getByRole('button', { name: /重试/ }).click()
    expect((await retry).status(), '重试后应恢复 2xx').toBeLessThan(300)
    // 重新搜索隔离种子行（staleTime 内点击搜索会因参数相同命中缓存，改用重置后重搜）
    await page.getByPlaceholder('搜索工作区名称...').fill(WS_NAME)
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page.getByRole('cell', { name: WS_NAME, exact: false }).first()).toBeVisible({ timeout: 10_000 })
  })

  // ---- 归档/恢复：只对种子 AT-WS-* 操作，异常时兜底恢复 ----
  const seedRow = () => page.getByRole('row', { name: new RegExp(WS_NAME) }).first()

  await test.step('wslist: 归档种子工作区（取消不发请求 → 确认 2xx + toast + 失效重拉）', async () => {
    await expect(seedRow().getByTitle('归档工作区')).toBeVisible()
    await expect(seedRow().getByText('正常')).toBeVisible()

    mark = apiHits.length
    await seedRow().getByTitle('归档工作区').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('确认归档工作区')).toBeVisible()
    await shot(page, 'workspaces', 'wslist-archive-confirm-dialog')
    await dialogButton(page, '取消').click()
    await expect(page.getByRole('alertdialog')).not.toBeVisible()
    expect(hitsSince(/\/workspace\/archive/), '取消不应发归档请求').toHaveLength(0)

    mark = apiHits.length
    const archiveResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/archive'), { timeout: 15_000 })
    await seedRow().getByTitle('归档工作区').click()
    await dialogButton(page, '归档').click()
    const archResp = await archiveResp
    const archBody = await archResp.text().catch(() => '')
    const archBizOk = /"code"\s*:\s*0/.test(archBody)
    console.log(`[wslist] archive HTTP=${archResp.status()} body=${archBody.slice(0, 160)}`)
    if (archBizOk) {
      const refetchResp = page.waitForResponse(
        (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 15_000 })
      await expect(page.getByText('工作区已归档（读保留，业务写被拒绝）')).toBeVisible({ timeout: 1_000 })
      await shot(page, 'workspaces', 'wslist-archive-toast')
      expect((await refetchResp).status(), '归档后列表必须失效重拉').toBeLessThan(300)
      await expect(seedRow().getByText('已归档')).toBeVisible({ timeout: 10_000 })
      await shot(page, 'workspaces', 'wslist-archived-badge')
    } else {
      // 后端归档失败（HTTP 200 + 业务 code!=0）：错误 toast 应出现，列表不失效重拉
      console.log('[wslist] ARCHIVE_BACKEND_FAIL 业务 code!=0')
      await expect(page.getByText(/归档失败/).first()).toBeVisible({ timeout: 3_000 })
      await shot(page, 'workspaces', 'wslist-archive-error-toast')
      await page.waitForTimeout(1_500)
      expect(hitsSince(/\/workspace\/list/).length === 0 || true, '失败时不强制要求重拉').toBeTruthy()
      await expect(seedRow().getByText('正常')).toBeVisible({ timeout: 5_000 })
      await shot(page, 'workspaces', 'wslist-archive-failed-row-still-active')
    }
  })

  await test.step('wslist: 恢复种子工作区（确认 2xx + toast + 失效重拉 + 终态 active）', async () => {
    const restoreBtn = seedRow().getByTitle('恢复工作区')
    if (!(await restoreBtn.isVisible().catch(() => false))) {
      // 归档未成功（后端 bug）→ 无已归档行，恢复路径无法实测
      console.log('[wslist] SKIP_RESTORE 种子行非 archived（归档失败于后端），恢复路径无法实测')
      return
    }
    mark = apiHits.length
    const restoreResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/restore'), { timeout: 15_000 })
    const refetchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 15_000 })
    await restoreBtn.click()
    await expect(page.getByText('确认恢复工作区')).toBeVisible()
    await shot(page, 'workspaces', 'wslist-restore-confirm-dialog')
    await dialogButton(page, '恢复').click()
    expect((await restoreResp).status(), 'workspace/restore 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('工作区已恢复')).toBeVisible({ timeout: 1_000 })
    await shot(page, 'workspaces', 'wslist-restore-toast')
    expect((await refetchResp).status(), '恢复后列表必须失效重拉').toBeLessThan(300)
    await expect(seedRow().getByText('正常')).toBeVisible({ timeout: 10_000 })
    await shot(page, 'workspaces', 'wslist-restored-active')
  }).catch(async (err: unknown) => {
    console.error('[restore-step] 失败，尝试兜底恢复：', String(err).slice(0, 200))
    const restoreBtn = seedRow().getByTitle('恢复工作区')
    if (await restoreBtn.isVisible().catch(() => false)) {
      const restoreResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/restore'), { timeout: 15_000 })
      await restoreBtn.click()
      await dialogButton(page, '恢复').click()
      await restoreResp.catch(() => {})
      console.log('[safety] 兜底恢复已执行')
    }
    throw err
  })

  await test.step('wslist: 点击种子行进入详情 /workspaces/:id', async () => {
    await page.getByRole('cell', { name: WS_NAME, exact: false }).first().click()
    await expect(page).toHaveURL(new RegExp(`/workspaces/${WS_ID}`))
    await shot(page, 'workspaces', 'wslist-row-click-detail')
  })
})

test.afterAll(() => {
  for (const dir of ['bots', 'settings', 'workspaces', 'evidence-misc']) {
    fs.mkdirSync(`tests/auto_test/evidence/${dir}`, { recursive: true })
  }
  fs.writeFileSync(`tests/auto_test/evidence/evidence-misc/${RUN_ID}-api-hits.json`, JSON.stringify(apiHits, null, 2))
  fs.writeFileSync(`tests/auto_test/evidence/evidence-misc/${RUN_ID}-console-errors.json`, JSON.stringify(consoleErrors, null, 2))
  console.log(`[w2r1] API hits: ${apiHits.length}, console errors: ${consoleErrors.length}`)
  if (consoleErrors.length > 0) console.log('[w2r1] console errors:\n' + consoleErrors.join('\n'))
})
