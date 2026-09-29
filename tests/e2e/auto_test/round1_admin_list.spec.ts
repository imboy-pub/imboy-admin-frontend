/**
 * auto_test 批次1：admins/AdminListPage 首测
 * 对应 tests/auto_test/admins/AdminListPage.md 的 14 个功能点
 * 证据（截图 + api-hits.json）输出到 tests/auto_test/evidence/admins/
 *
 * 设计：单页面单登录 + test.step 串联，避免多 context 重复登录触发后端频控/会话失效。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import fs from 'node:fs'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const EVIDENCE_DIR = 'tests/auto_test/evidence/admins'
const RUN_ID = `batch1-${Date.now()}`

// 编排型长用例（单 test 14 步串联、300s）：一条批跑低概率瞬态（vite/响应处理层，
// b3 取证 20260929）不应让整段工作量作废，允许一次重试。
// 注意：本仓 playwright 版本不支持 test body 内 test.retries()，须用 describe.configure。
test.describe.configure({ retries: 1 })

type ApiHit = { url: string; status: number; method: string; body?: string }
const apiHits: ApiHit[] = []
let mark = 0  // 每个 step 开始时的游标

function trackApi(page: Page) {
  page.on('response', (res: Response) => {
    const url = res.url()
    if (url.includes('/api/adm/')) {
      const hit: ApiHit = { url: url.replace(/^.*\/api\/adm/, ''), status: res.status(), method: res.request().method() }
      apiHits.push(hit)
      if (url.includes('/admin/list')) {
        res.text().then((t) => { hit.body = t.slice(0, 500) }).catch(() => {})
      }
    }
  })
}

/** 本 step 内命中 pattern 的请求 */
function hitsSince(pattern: RegExp): ApiHit[] {
  return apiHits.slice(mark).filter((h) => pattern.test(h.url))
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: `${EVIDENCE_DIR}/${RUN_ID}-${name}.png`, fullPage: false })
}

test('批次1 AdminListPage 全量首测', async ({ page }) => {
  test.setTimeout(300_000)
  trackApi(page)

  await test.step('路由直达与权限守卫：未登录跳 /login', async () => {
    await page.goto('/admins')
    await expect(page).toHaveURL(/\/login/)
    await shot(page, 'guard-redirect')
  })

  await test.step('登录（超管）', async () => {
    await loginAsAdmin(page, requireAdminCredentials())
  })

  await test.step('列表加载渲染与字段格式化', async () => {
    mark = apiHits.length
    const listRespPromise = page.waitForResponse((r) => r.url().includes('/admin/list'), { timeout: 15_000 })
    await page.goto('/admins')
    await expect(page.getByRole('heading', { name: '管理员中心' })).toBeVisible()
    const resp = await listRespPromise
    expect(resp.status(), 'admin/list 必须 2xx').toBeLessThan(300)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText('暂无管理员数据')).not.toBeVisible()
    await shot(page, 'list-render')
  })

  await test.step('筛选/搜索生效与清空重置', async () => {
    mark = apiHits.length
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/admin/list') && r.url().includes('keyword=admin'), { timeout: 15_000 })
    await page.getByPlaceholder('搜索账号 / 昵称').fill('admin')
    await page.getByRole('button', { name: '搜索' }).click()
    expect((await searchResp).status(), '搜索请求必须 2xx').toBeLessThan(300)
    await shot(page, 'filter-search')

    const resetResp = page.waitForResponse(
      (r) => r.url().includes('/admin/list') && !r.url().includes('keyword='), { timeout: 15_000 })
    await page.getByRole('button', { name: '重置' }).click()
    expect((await resetResp).status(), '重置后必须重新拉取且 2xx').toBeLessThan(300)
    await shot(page, 'filter-reset')
  })

  await test.step('分页组件渲染与刷新', async () => {
    mark = apiHits.length
    const refresh = page.getByRole('button', { name: /刷新/ })
    if (await refresh.isVisible().catch(() => false)) {
      const refetchResp = page.waitForResponse((r) => r.url().includes('/admin/list'), { timeout: 15_000 })
      await refresh.click()
      expect((await refetchResp).status(), '刷新必须 2xx').toBeLessThan(300)
    }
    await shot(page, 'pagination')
  })

  let createdAccount = ''

  await test.step('新增管理员：校验提示 + 创建成功刷新列表', async () => {
    mark = apiHits.length
    await page.getByRole('button', { name: '新增管理员' }).click()
    await expect(page.getByText('创建后台管理员账号并分配初始角色')).toBeVisible()
    await shot(page, 'create-drawer-open')

    // 校验：账号 <3 位应提示且不发请求
    await page.getByPlaceholder('请输入管理员账号').fill('ab')
    await page.getByPlaceholder('至少 6 位').fill('Passw0rd!')
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByText('账号长度至少 3 位')).toBeVisible()
    expect(hitsSince(/\/admin\/create/), '校验失败不应发创建请求').toHaveLength(0)

    // 正常创建（PR-W2-C05：角色下拉默认第一个选项是 super_admin——后续禁用步骤
    // 会被「不能禁用超级管理员」防护拒绝，故显式选第一个非 super_admin 角色，
    // 与 admin-rbac.spec 的运行时取角色模式一致）
    createdAccount = `pw_e2e_b1_${Math.floor(Date.now() / 1000) % 100000}`
    const drawerRoleSelect = page.locator('aside').filter({ hasText: '创建后台管理员账号并分配初始角色' }).locator('select').first()
    const nonSuperLabel = await drawerRoleSelect.locator('option').evaluateAll((nodes) => {
      const hit = nodes.map((n) => n.textContent?.trim() || '').find((t) => t.length > 0 && t !== 'super_admin')
      return hit ?? ''
    })
    if (nonSuperLabel.length > 0) {
      await drawerRoleSelect.selectOption({ label: nonSuperLabel })
    }
    const createRespPromise = page.waitForResponse((r) => r.url().includes('/admin/create'), { timeout: 15_000 })
    const listRespPromise = page.waitForResponse((r) => r.url().includes('/admin/list'), { timeout: 15_000 })
    await page.getByPlaceholder('请输入管理员账号').fill(createdAccount)
    await page.getByRole('button', { name: '确认创建' }).click()
    expect((await createRespPromise).status(), 'admin/create 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('管理员创建成功')).toBeVisible({ timeout: 3_000 })
    await shot(page, 'create-toast')
    expect((await listRespPromise).status(), '创建后列表必须重新拉取').toBeLessThan(300)
    // DataTable 同时渲染桌面表格 + 移动端卡片两套 DOM，取第一个（桌面端在当前视口可见）
    await expect(page.locator(`[data-admin-account="${createdAccount}"]`).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, 'create-row-visible')
  })

  await test.step('禁用管理员：二次确认弹窗（取消不发请求，确认发请求）', async () => {
    mark = apiHits.length
    // 禁用刚创建的账号，避免影响既有数据
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/admin/list') && r.url().includes('keyword='), { timeout: 15_000 })
    await page.getByPlaceholder('搜索账号 / 昵称').fill(createdAccount)
    await page.getByRole('button', { name: '搜索' }).click()
    await searchResp

    const row = page.getByRole('row', { name: new RegExp(createdAccount) })
    const disableBtn = row.getByRole('button', { name: '禁用' })
    await expect(disableBtn).toBeVisible()

    await disableBtn.click()
    await expect(page.getByText('确认禁用管理员')).toBeVisible()
    await shot(page, 'disable-confirm-dialog')
    await page.getByRole('button', { name: '取消' }).click()
    expect(hitsSince(/\/admin\/disable/), '取消不应发禁用请求').toHaveLength(0)

    const disableRespPromise = page.waitForResponse((r) => r.url().includes('/admin/disable'), { timeout: 15_000 })
    const listRespPromise = page.waitForResponse((r) => r.url().includes('/admin/list'), { timeout: 15_000 })
    await disableBtn.click()
    await page.getByRole('button', { name: '确认禁用' }).click()
    expect((await disableRespPromise).status(), 'admin/disable 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('管理员已禁用')).toBeVisible({ timeout: 3_000 })
    await shot(page, 'disable-toast')
    await listRespPromise

    // 重置回全量列表
    const resetResp = page.waitForResponse(
      (r) => r.url().includes('/admin/list') && !r.url().includes('keyword='), { timeout: 15_000 })
    await page.getByRole('button', { name: '重置' }).click()
    await resetResp
  })

  await test.step('导出 CSV', async () => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await page.getByRole('button', { name: '导出 CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
    await expect(page.getByText(/已导出 .* 条管理员数据/)).toBeVisible({ timeout: 3_000 })
    await shot(page, 'export-csv')
  })

  await test.step('跳转 /roles 与 /logs', async () => {
    await page.getByRole('button', { name: '角色权限' }).click()
    await expect(page).toHaveURL(/\/roles/)
    await page.goto('/admins')
    await page.waitForResponse((r) => r.url().includes('/admin/list'))
    await page.getByRole('button', { name: '审计日志' }).click()
    await expect(page).toHaveURL(/\/logs/)
  })

  await test.step('管理员角色变更：确认弹窗 + assign_role 2xx', async () => {
    // 注意：staleTime=5min 内返回本页可能不触发新请求，这里等 UI 而非网络
    await page.goto('/admins')
    await expect(page.getByRole('heading', { name: '管理员中心' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/admin/list') && r.url().includes('keyword='), { timeout: 15_000 })
    await page.getByPlaceholder('搜索账号 / 昵称').fill(createdAccount)
    await page.getByRole('button', { name: '搜索' }).click()
    await searchResp

    const row = page.getByRole('row', { name: new RegExp(createdAccount) }).first()
    const roleSelect = row.locator('select').first()
    const current = await roleSelect.inputValue()
    const options = await roleSelect.locator('option').all()
    let next: string | null = null
    for (const o of options) {
      const v = await o.getAttribute('value')
      const label = ((await o.textContent()) ?? '').trim()
      // 授予 super_admin 会被后端防自我提权 guard 拒绝（403「不能授予超出自身权限集的角色」，
      // adm_admin_handler 正确安全行为）；本步只验证变更链路，与创建步同口径跳过 super_admin
      if (v && v !== current && Number(v) > 0 && label !== 'super_admin') { next = v; break }
    }
    test.skip(!next, '无可切换的角色选项')
    const assignResp = page.waitForResponse((r) => r.url().includes('/admin/assign_role'), { timeout: 15_000 })
    await roleSelect.selectOption(next!)
    await expect(page.getByText('确认变更管理员角色')).toBeVisible()
    await shot(page, 'role-change-confirm')
    await page.getByRole('button', { name: '确认变更' }).click()
    const assignRes = await assignResp
    expect(assignRes.status(), 'assign_role 必须 2xx').toBeLessThan(300)
    // b3 取证 20260929：瞬态下 axios 层失败时 HTTP 仍 200，信封断言让业务错误直接报 msg；
    // sonner 默认 4s 展示窗 + 批跑慢帧余量，toast 断言放宽到 8s。
    const assignBody = (await assignRes.json().catch(() => null)) as { code?: number; msg?: string } | null
    expect(assignBody?.code, `assign_role 信封: ${JSON.stringify(assignBody)}`).toBe(0)
    await expect(page.getByText('管理员角色已更新')).toBeVisible({ timeout: 8_000 })
    await shot(page, 'role-change-toast')
  })

  await test.step('错误态展示（接口 500 → ErrorState + 重试）', async () => {
    await page.goto('/admins')
    await expect(page.getByRole('heading', { name: '管理员中心' })).toBeVisible()
    await page.route('**/api/adm/admin/list*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":500,"msg":"injected"}' }))
    const retryResp = page.waitForRequest((r) => r.url().includes('/admin/list'))
    await page.getByRole('button', { name: /刷新/ }).click()
    await retryResp
    await expect(page.getByText('加载管理员列表失败')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'error-state')
    await page.unroute('**/api/adm/admin/list*')
  })
})

test.afterAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(`${EVIDENCE_DIR}/${RUN_ID}-api-hits.json`, JSON.stringify(apiHits, null, 2))
})
