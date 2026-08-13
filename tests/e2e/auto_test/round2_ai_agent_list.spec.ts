/**
 * auto_test 批次2：ai_agent/AiAgentListPage 首测
 * 对应 tests/auto_test/ai_agent/AiAgentListPage.md 的 9 个功能点
 * 证据输出到 tests/auto_test/evidence/ai_agent/
 *
 * 设计同批次1：单页面单登录 + test.step 串联。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import fs from 'node:fs'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const EVIDENCE_DIR = 'tests/auto_test/evidence/ai_agent'
const RUN_ID = `batch2-${Date.now()}`

type ApiHit = { url: string; status: number; method: string; body?: string }
const apiHits: ApiHit[] = []
let mark = 0

function trackApi(page: Page) {
  page.on('response', (res: Response) => {
    const url = res.url()
    if (url.includes('/api/adm/')) {
      const hit: ApiHit = { url: url.replace(/^.*\/api\/adm/, ''), status: res.status(), method: res.request().method() }
      apiHits.push(hit)
      if (url.includes('/ai_agent/')) {
        res.text().then((t) => { hit.body = t.slice(0, 400) }).catch(() => {})
      }
    }
  })
}

function hitsSince(pattern: RegExp): ApiHit[] {
  return apiHits.slice(mark).filter((h) => pattern.test(h.url))
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: `${EVIDENCE_DIR}/${RUN_ID}-${name}.png`, fullPage: false })
}

/** 等列表区域就绪（staleTime 内返回本页可能不发新请求，等 UI 而非网络） */
async function expectListReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'AI 助手管理' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
}

test('批次2 AiAgentListPage 全量首测', async ({ page }) => {
  test.setTimeout(300_000)
  trackApi(page)

  await test.step('路由直达与权限守卫：未登录跳 /login', async () => {
    await page.goto('/ai-agents')
    await expect(page).toHaveURL(/\/login/)
    await shot(page, 'guard-redirect')
  })

  await test.step('登录（超管）', async () => {
    await loginAsAdmin(page, requireAdminCredentials())
  })

  await test.step('列表加载渲染与字段格式化', async () => {
    mark = apiHits.length
    const listRespPromise = page.waitForResponse((r) => r.url().includes('/ai_agent/list'), { timeout: 15_000 })
    await page.goto('/ai-agents')
    await expectListReady(page)
    const resp = await listRespPromise
    expect(resp.status(), 'ai_agent/list 必须 2xx').toBeLessThan(300)
    await shot(page, 'list-render')
  })

  await test.step('分类筛选（250ms 防抖）与清空重置', async () => {
    mark = apiHits.length
    const filterResp = page.waitForResponse(
      (r) => r.url().includes('/ai_agent/list') && r.url().includes('category='), { timeout: 15_000 })
    await page.getByTestId('category-filter').fill('不存在的分类xyz')
    expect((await filterResp).status(), '筛选请求必须 2xx').toBeLessThan(300)
    await shot(page, 'filter-category')

    // 重置清空筛选；staleTime 内未必重新请求，等 UI 状态而非网络
    await page.getByRole('button', { name: '重置' }).click()
    await expect(page.getByTestId('category-filter')).toHaveValue('')
    await expect(page.getByRole('table')).toBeVisible()
    await shot(page, 'filter-reset')
  })

  await test.step('分页组件渲染与刷新', async () => {
    mark = apiHits.length
    const refresh = page.getByRole('button', { name: /刷新/ })
    if (await refresh.isVisible().catch(() => false)) {
      const refetchResp = page.waitForResponse((r) => r.url().includes('/ai_agent/list'), { timeout: 15_000 })
      await refresh.click()
      expect((await refetchResp).status(), '刷新必须 2xx').toBeLessThan(300)
    }
    await shot(page, 'pagination')
  })

  let createdNickname = ''

  await test.step('新建助手：校验提示 + 创建成功刷新列表', async () => {
    mark = apiHits.length
    await page.getByRole('button', { name: '新建助手' }).click()
    await expect(page.getByText('新建 AI 助手')).toBeVisible()
    await shot(page, 'create-dialog-open')

    // 校验：provider 为空应提示且不发请求
    await page.locator('#f_nickname').fill('校验测试')
    await page.locator('#f_provider').fill('')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('provider 不能为空')).toBeVisible()
    expect(hitsSince(/\/ai_agent\/(create|update)/), '校验失败不应发请求').toHaveLength(0)

    // 正常创建
    createdNickname = `pw_e2e_b2_${Math.floor(Date.now() / 1000) % 100000}`
    const createRespPromise = page.waitForResponse((r) => r.url().includes('/ai_agent/create'), { timeout: 15_000 })
    const listRespPromise = page.waitForResponse((r) => r.url().includes('/ai_agent/list'), { timeout: 15_000 })
    await page.locator('#f_nickname').fill(createdNickname)
    await page.locator('#f_provider').fill('qianfan')
    await page.getByRole('button', { name: '保存' }).click()
    expect((await createRespPromise).status(), 'ai_agent/create 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('AI 助手已创建')).toBeVisible({ timeout: 3_000 })
    await shot(page, 'create-toast')
    expect((await listRespPromise).status(), '创建后列表必须重新拉取').toBeLessThan(300)
    await expect(page.locator('table').getByText(createdNickname).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, 'create-row-visible')
  })

  await test.step('编辑助手：拉详情 + 更新成功', async () => {
    mark = apiHits.length
    const row = page.getByRole('row', { name: new RegExp(createdNickname) }).first()
    const detailResp = page.waitForResponse((r) => r.url().includes('/ai_agent/detail'), { timeout: 15_000 })
    await row.getByRole('button', { name: '编辑' }).click()
    expect((await detailResp).status(), 'ai_agent/detail 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('编辑 AI 助手')).toBeVisible()
    await shot(page, 'edit-dialog-open')

    createdNickname = `${createdNickname}e`
    const updateResp = page.waitForResponse((r) => r.url().includes('/ai_agent/update'), { timeout: 15_000 })
    const listResp = page.waitForResponse((r) => r.url().includes('/ai_agent/list'), { timeout: 15_000 })
    await page.locator('#f_nickname').fill(createdNickname)
    await page.getByRole('button', { name: '保存' }).click()
    expect((await updateResp).status(), 'ai_agent/update 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('AI 助手已更新')).toBeVisible({ timeout: 3_000 })
    await listResp
    await expect(page.locator('table').getByText(createdNickname).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, 'edit-row-visible')
  })

  await test.step('UID 复制 toast', async () => {
    mark = apiHits.length
    const row = page.getByRole('row', { name: new RegExp(createdNickname) }).first()
    await row.locator('button').filter({ has: page.locator('svg') }).first().click()
    await expect(page.getByText('UID 已复制')).toBeVisible({ timeout: 3_000 })
    await shot(page, 'uid-copy-toast')
  })

  await test.step('停用/启用：二次确认弹窗（取消不发请求，确认发请求）', async () => {
    mark = apiHits.length
    const row = page.getByRole('row', { name: new RegExp(createdNickname) }).first()
    await row.getByRole('button', { name: '停用' }).click()
    await expect(page.getByText('停用 AI 助手')).toBeVisible()
    await shot(page, 'status-confirm-dialog')
    await page.getByRole('button', { name: '取消' }).click()
    expect(hitsSince(/\/ai_agent\/set_status/), '取消不应发请求').toHaveLength(0)

    const statusResp = page.waitForResponse((r) => r.url().includes('/ai_agent/set_status'), { timeout: 15_000 })
    const listResp = page.waitForResponse((r) => r.url().includes('/ai_agent/list'), { timeout: 15_000 })
    await row.getByRole('button', { name: '停用' }).click()
    await page.getByRole('button', { name: '确认' }).click()
    expect((await statusResp).status(), 'set_status 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('状态已更新')).toBeVisible({ timeout: 3_000 })
    await shot(page, 'status-toast')
    await listResp
    await expect(row.getByText('停用').first()).toBeVisible({ timeout: 10_000 })

    // 恢复启用，不留下停用状态
    const enableResp = page.waitForResponse((r) => r.url().includes('/ai_agent/set_status'), { timeout: 15_000 })
    await row.getByRole('button', { name: '启用' }).click()
    await page.getByRole('button', { name: '确认' }).click()
    expect((await enableResp).status(), '重新启用必须 2xx').toBeLessThan(300)
    await shot(page, 'status-restore')
  })

  await test.step('错误态展示（接口 500 → ErrorState + 重试）', async () => {
    await page.goto('/ai-agents')
    await expectListReady(page)
    await page.route('**/api/adm/ai_agent/list*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":500,"msg":"injected"}' }))
    const retryResp = page.waitForRequest((r) => r.url().includes('/ai_agent/list'))
    await page.getByRole('button', { name: /刷新/ }).click()
    await retryResp
    await expect(page.getByText('加载 AI 助手列表失败')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /重试/ })).toBeVisible()
    await shot(page, 'error-state')
    await page.unroute('**/api/adm/ai_agent/list*')
  })
})

test.afterAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(`${EVIDENCE_DIR}/${RUN_ID}-api-hits.json`, JSON.stringify(apiHits, null, 2))
})
