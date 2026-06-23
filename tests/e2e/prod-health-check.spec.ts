/**
 * 生产环境全面健康检查 E2E 测试
 * Production health check: login + all pages audit
 * 运行方式:
 *   PLAYWRIGHT_DISABLE_WEBSERVER=1 IMBOY_ADMIN_E2E_BASE_URL=https://prodadm.imboy.pub \
 *   IMBOY_ADMIN_E2E_ACCOUNT=admin IMBOY_ADMIN_E2E_PASSWORD="Admin123!" \
 *   npx playwright test tests/e2e/prod-health-check.spec.ts --headed
 */
import { expect, Page, test } from '@playwright/test'

const BASE = process.env.IMBOY_ADMIN_E2E_BASE_URL || 'https://prodadm.imboy.pub'
const ACCOUNT = process.env.IMBOY_ADMIN_E2E_ACCOUNT || 'admin'
const PASSWORD = process.env.IMBOY_ADMIN_E2E_PASSWORD || 'Admin123!'
// 生产环境没有测试验证码，由 IMBOY_ADMIN_E2E_CAPTCHA 环境变量传入真实值
// 备选: 使用已知的固定验证码（仅 local/dev/test 环境有效）
const CAPTCHA = process.env.IMBOY_ADMIN_E2E_CAPTCHA || '1234'
// 是否为生产环境（生产不可绕过验证码）
const IS_PROD = BASE.includes('prodadm') || BASE.includes('prod')

// 收集所有检查结果
const results: Array<{ page: string; status: 'OK' | 'ERROR' | 'WARN'; description: string }> = []
const apiIssues: Array<{ url: string; status: number; method: string }> = []
const jsErrors: Array<{ page: string; error: string }> = []

function record(pagePath: string, status: 'OK' | 'ERROR' | 'WARN', description: string) {
  results.push({ page: pagePath, status, description })
  console.log(`[${status}] ${pagePath} — ${description}`)
}

/**
 * 登录并返回已认证的 page
 */
async function loginToProd(page: Page): Promise<boolean> {
  // 监听 API 错误
  page.on('response', (resp) => {
    const url = resp.url()
    if (url.includes('/api/adm/') && resp.status() >= 400) {
      apiIssues.push({ url, status: resp.status(), method: resp.request().method() })
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      jsErrors.push({ page: page.url(), error: msg.text() })
    }
  })

  // 先访问根页面（SPA 会重定向到 /login）
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 })

  // 等待登录表单出现
  const accountField = page.getByLabel('账号').or(page.locator('input[placeholder*="账号"]')).first()
  const passwordField = page.getByLabel('密码').or(page.locator('input[type="password"]')).first()
  const captchaField = page.getByLabel('验证码').or(page.locator('input[placeholder*="验证码"]')).first()

  try {
    await expect(accountField).toBeVisible({ timeout: 15_000 })
  } catch {
    console.log('登录页面未出现账号字段，当前 URL:', page.url())
    await page.screenshot({ path: '/tmp/prod-check-login-page.png' })
    return false
  }

  // 截图验证码（生产环境下需要人工识别）
  await page.screenshot({ path: '/tmp/prod-check-captcha.png', fullPage: false })

  await accountField.fill(ACCOUNT)
  await passwordField.fill(PASSWORD)

  // 填入验证码
  const captchaVisible = await captchaField.isVisible().catch(() => false)
  if (captchaVisible) {
    await captchaField.fill(CAPTCHA)
    console.log(`已填入验证码: ${CAPTCHA} (生产环境若不匹配将失败)`)
  }

  const loginBtn = page.getByRole('button', { name: '登录' })
  await loginBtn.click()

  // 等待跳转到 dashboard
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
    return true
  } catch {
    // 截图当前状态帮助调试
    await page.screenshot({ path: '/tmp/prod-check-login-failed.png' })
    const toastMsg = await page.locator('[data-sonner-toast]').first().textContent().catch(() => '')
    const bodyText = await page.locator('body').innerText().catch(() => '').then(t => t.slice(0, 200))
    console.error(`登录失败，URL: ${page.url()}, Toast: ${toastMsg}, Body: ${bodyText}`)
    return false
  }
}

/**
 * 检查单个页面
 */
async function checkPage(
  page: Page,
  path: string,
  options: {
    expectText?: string[]
    expectTable?: boolean
    expectNoLoading?: boolean
    apiEndpoints?: string[]
  } = {}
): Promise<void> {
  const url = `${BASE}/adm${path}`
  const pagePath = path

  // 收集本页的 API 响应
  const pageApiIssues: string[] = []
  const responseListener = (resp: import('@playwright/test').Response) => {
    const rUrl = resp.url()
    if (rUrl.includes('/api/adm/') && resp.status() >= 400) {
      pageApiIssues.push(`${resp.request().method()} ${rUrl} → ${resp.status()}`)
    }
  }
  page.on('response', responseListener)

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const httpStatus = response?.status() ?? 0

    if (httpStatus >= 400) {
      record(pagePath, 'ERROR', `HTTP ${httpStatus}`)
      return
    }

    // 等待 React 渲染完成（最多 10s）
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})

    // 检查是否重定向到登录页（token 失效）
    if (page.url().includes('login') || page.url().includes('passport')) {
      record(pagePath, 'ERROR', '未认证，跳转到登录页')
      return
    }

    // 检查无限 Loading
    const loadingVisible = await page.locator('[class*="loading"], [class*="spinner"], .ant-spin-spinning').first().isVisible().catch(() => false)

    // 检查空白页
    const bodyText = await page.locator('body').innerText().catch(() => '')
    if (bodyText.trim().length < 20) {
      record(pagePath, 'ERROR', '页面内容为空（疑似白屏）')
      return
    }

    // 检查期望文本
    const missingTexts: string[] = []
    for (const text of options.expectText ?? []) {
      const found = await page.getByText(text, { exact: false }).first().isVisible({ timeout: 3_000 }).catch(() => false)
      if (!found) missingTexts.push(text)
    }

    // 检查表格是否有内容或空状态
    let tableStatus = ''
    if (options.expectTable) {
      const tableRows = page.locator('table tbody tr, [class*="table"] [class*="row"]')
      const rowCount = await tableRows.count().catch(() => 0)
      const emptyState = await page.locator('[class*="empty"], [class*="no-data"], text="暂无数据"').first().isVisible().catch(() => false)
      if (rowCount > 0) {
        tableStatus = `表格有 ${rowCount} 行数据`
      } else if (emptyState) {
        tableStatus = '空状态（正常）'
      } else if (rowCount === 0) {
        tableStatus = '表格无数据（可能异常）'
      }
    }

    // 汇总状态
    const issues: string[] = []
    if (loadingVisible) issues.push('仍在 Loading')
    if (missingTexts.length > 0) issues.push(`缺少文本: ${missingTexts.join(', ')}`)
    if (pageApiIssues.length > 0) issues.push(`API 错误: ${pageApiIssues.join('; ')}`)

    if (issues.length > 0) {
      record(pagePath, 'ERROR', issues.join(' | '))
    } else {
      const desc = [tableStatus, '页面正常加载'].filter(Boolean).join(' — ')
      record(pagePath, 'OK', desc)
    }

    // 截图保存
    await page.screenshot({
      path: `/tmp/prod-check${path.replace(/\//g, '-')}.png`,
      fullPage: false,
    }).catch(() => {})
  } catch (err) {
    record(pagePath, 'ERROR', `异常: ${String(err).slice(0, 120)}`)
  } finally {
    page.off('response', responseListener)
  }
}

// ========== 测试套件 ==========

test.describe.configure({ mode: 'serial' })

test('01 登录生产管理后台', async ({ page }) => {
  // 先检查登录页验证码 API
  const captchaResp = await page.request.get(`${BASE}/api/adm/passport/captcha`).catch(() => null)
  if (captchaResp) {
    console.log(`验证码 API 状态: ${captchaResp.status()}`)
    if (captchaResp.status() === 200) {
      record('/passport/captcha', 'OK', `验证码 API 正常 (${captchaResp.status()})`)
    } else {
      record('/passport/captcha', 'ERROR', `验证码 API 异常 (${captchaResp.status()})`)
    }
  }

  const success = await loginToProd(page)
  expect(success, '登录应成功').toBe(true)
  record('/passport/login', 'OK', '登录成功，已跳转 dashboard')

  // 保存截图
  await page.screenshot({ path: '/tmp/prod-check-login-success.png' })
})

test('02 仪表盘 /dashboard', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/dashboard', {
    expectText: ['仪表盘'],
  })
})

test('03 用户列表 /users', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/users', {
    expectText: ['用户'],
    expectTable: true,
  })
})

test('04 消息管理 /messages', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/messages', {
    expectText: ['消息'],
    expectTable: true,
  })
})

test('05 群组列表 /groups', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/groups', {
    expectText: ['群'],
    expectTable: true,
  })
})

test('06 用户反馈 /feedback', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/feedback', {
    expectText: ['反馈'],
    expectTable: true,
  })
})

test('07 公告管理 /announcements', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/announcements', {
    expectTable: true,
  })
})

test('08 注销申请 /logout-applications', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/logout-applications', {
    expectTable: true,
  })
})

test('09 操作日志 /logs', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/logs', {
    expectTable: true,
  })
})

test('10 存储管理 /storage', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/storage', {})
})

test('11 系统配置 /settings/config', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/settings/config', {})
})

test('12 DDL 配置 /settings/ddl', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/settings/ddl', {})
})

test('13 版本管理 /settings/app-version', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/settings/app-version', {
    expectTable: true,
  })
})

test('14 Push Token /settings/push-token', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/settings/push-token', {})
})

test('15 插件管理 /plugin-management', async ({ page }) => {
  await loginToProd(page)
  await checkPage(page, '/plugin-management', {})
})

test('16 汇总报告', async () => {
  console.log('\n\n========== 生产环境检查汇总报告 ==========')
  for (const r of results) {
    const icon = r.status === 'OK' ? '✓' : r.status === 'WARN' ? '△' : '✗'
    console.log(`${icon} [${r.status}] ${r.page.padEnd(30)} ${r.description}`)
  }

  if (apiIssues.length > 0) {
    console.log('\n--- API 问题清单 ---')
    for (const issue of apiIssues) {
      console.log(`  ${issue.method} ${issue.url} → ${issue.status}`)
    }
  }

  if (jsErrors.length > 0) {
    console.log('\n--- JS 控制台错误 ---')
    for (const err of jsErrors) {
      console.log(`  [${err.page}] ${err.error}`)
    }
  }

  const errors = results.filter((r) => r.status === 'ERROR')
  console.log(`\n结果：${results.length} 页检查，${errors.length} 个问题`)
  console.log('截图保存在 /tmp/prod-check-*.png')
  console.log('===========================================\n')
})
