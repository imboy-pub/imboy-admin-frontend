import { expect, test } from '@playwright/test'
/**
 * P0-5 首启初始化向导 E2E
 *
 * 测试策略：
 *   - 使用 Playwright route 拦截 mock 后端 /api/adm/setup/status 与 /api/adm/setup/init，
 *     让测试在无真实后端依赖下稳定运行。
 *   - 真实 docker PG 链路的 E2E 由后端 EUnit + adm_setup_logic_tests 覆盖。
 *
 * 覆盖场景：
 *   1. 首次访问 /login 时系统未初始化 → 自动跳转 /setup
 *   2. /setup 表单校验：账号、密码、昵称、密码确认
 *   3. 提交成功 → 跳转 /login
 *   4. 已初始化状态访问 /setup → 自动跳转 /login（防重入）
 */
const SETUP_STATUS_URL = '**/api/adm/setup/status'
const SETUP_INIT_URL = '**/api/adm/setup/init'
function mockStatus(initialized: boolean) {
  return async (route: import('@playwright/test').Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: { initialized },
      }),
    })
  }
}
test.describe('P0-5 首启初始化向导', () => {
  test('未初始化时访问 /login 自动跳转 /setup', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(false))
    await page.goto('/login')
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: '首启初始化向导' })).toBeVisible()
    await expect(page.getByLabel('账号（手机号或邮箱）')).toBeVisible()
    await expect(page.getByLabel('昵称')).toBeVisible()
    await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
    await expect(page.getByLabel('确认密码')).toBeVisible()
  })
  test('表单校验：非法账号与弱密码', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(false))
    await page.goto('/setup')
    // 非法账号 + 弱密码
    await page.getByLabel('账号（手机号或邮箱）').fill('not-valid')
    await page.getByLabel('昵称').fill('Ops')
    await page.getByLabel('密码', { exact: true }).fill('short')
    await page.getByLabel('确认密码').fill('short')
    await page.getByRole('button', { name: '创建超级管理员' }).click()
    await expect(page.getByText('请输入有效的手机号或邮箱')).toBeVisible()
    await expect(page.getByText('密码至少 8 位')).toBeVisible()
  })
  test('密码必须同时包含字母和数字', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(false))
    await page.goto('/setup')
    await page.getByLabel('账号（手机号或邮箱）').fill('admin@example.com')
    await page.getByLabel('昵称').fill('Ops')
    await page.getByLabel('密码', { exact: true }).fill('alphabetsonly')
    await page.getByLabel('确认密码').fill('alphabetsonly')
    await page.getByRole('button', { name: '创建超级管理员' }).click()
    await expect(page.getByText('密码必须包含数字')).toBeVisible()
  })
  test('两次密码不一致时报错', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(false))
    await page.goto('/setup')
    await page.getByLabel('账号（手机号或邮箱）').fill('13800138000')
    await page.getByLabel('昵称').fill('Ops')
    await page.getByLabel('密码', { exact: true }).fill('StrongPass123')
    await page.getByLabel('确认密码').fill('StrongPass124')
    await page.getByRole('button', { name: '创建超级管理员' }).click()
    await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
  })
  test('提交成功后跳转 /login', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(false))
    await page.route(SETUP_INIT_URL, async (route) => {
      expect(route.request().method()).toBe('POST')
      const body = route.request().postDataJSON() as {
        account: string
        password: string
        nickname: string
      }
      expect(body.account).toBe('admin@example.com')
      expect(body.nickname).toBe('Ops')
      // SetupPage 提交前用 encryptLoginPassword 做 RSA 加密，密码不以明文出网
      expect(typeof body.password).toBe('string')
      expect(body.password.length).toBeGreaterThan(0)
      expect(body.password).not.toBe('StrongPass123')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          msg: '初始化成功',
          payload: { id: '1' },
        }),
      })
    })
    await page.goto('/setup')
    await page.getByLabel('账号（手机号或邮箱）').fill('admin@example.com')
    await page.getByLabel('昵称').fill('Ops')
    await page.getByLabel('密码', { exact: true }).fill('StrongPass123')
    await page.getByLabel('确认密码').fill('StrongPass123')
    await page.getByRole('button', { name: '创建超级管理员' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
  test('已初始化时访问 /setup 自动跳转 /login', async ({ page }) => {
    await page.route(SETUP_STATUS_URL, mockStatus(true))
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/login$/)
  })
})
