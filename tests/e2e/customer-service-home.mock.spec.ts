import { expect, test, type Page, type Route } from '@playwright/test'

const ORG_ID = '114022088375011328'
const WS_ID = '114022088375011329'

function success(payload: unknown) {
  return { code: 0, msg: 'ok', payload }
}

async function fulfill(route: Route, payload: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(success(payload)) })
}

async function mockCustomerService(page: Page) {
  await page.route('**/api/adm/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/adm', '')
    if (path === '/current') {
      await fulfill(route, {
        id: '1', account: 'admin', nickname: 'Admin', avatar: null,
        status: 1, role_id: '1', role_ids: ['1'], created_at: '', updated_at: '',
      })
      return
    }
    if (path === '/rbac/me') {
      await fulfill(route, {
        role_id: '1', role_ids: ['1'],
        permissions: ['customer_service:read', 'customer_service:write'],
        menu_paths: ['/customer-service', '/customer-service/workspace'],
      })
      return
    }
    if (path === '/admin/config/sidebar') {
      await fulfill(route, {
        items: [{
          label: '企业管理', icon: 'Building2', children: [
            { path: '/customer-service', icon: 'Headphones', label: '在线客服', roles: [1], permission: 'customer_service:read' },
            { path: '/customer-service/workspace', icon: 'MonitorSmartphone', label: '坐席工作台', roles: [1], permission: 'customer_service:read' },
          ],
        }],
        rbac: { roles: [{ id: 1, name: 'admin', description: '', permissions: ['customer_service:read', 'customer_service:write'] }] },
      })
      return
    }
    if (path === '/organizations') {
      await fulfill(route, { list: [{ id: ORG_ID, name: 'IMBoy', status: 'active' }], page: 1, size: 50, total: 1, total_page: 1 })
      return
    }
    if (path === `/organizations/${ORG_ID}/workspaces`) {
      await fulfill(route, { list: [{ id: WS_ID, name: '默认工作区', organization_id: ORG_ID, status: 'active' }], page: 1, size: 50, total: 1, total_page: 1 })
      return
    }
    if (path === `/organizations/${ORG_ID}/members`) {
      await fulfill(route, { list: [], page: 1, size: 50, total: 0, total_page: 0 })
      return
    }
    if (path === `/customer-service/organizations/${ORG_ID}/seats`) {
      await fulfill(route, [
        { organization_id: ORG_ID, business_identity_id: '114022088375011401', function_key: 'customer_service', enabled: true, max_concurrent: 3, active_count: 0, version: 1 },
        { organization_id: ORG_ID, business_identity_id: '114022088375011402', function_key: 'customer_service', enabled: true, max_concurrent: 3, active_count: 1, version: 1 },
      ])
      return
    }
    if (path === '/customer-service/widget-installations') {
      await fulfill(route, { installations: [
        { id: '114032045847742460', organization_id: ORG_ID, display_name: 'IMBoy 官网客服', public_widget_id: '114032045847742464', allowed_origins: ['https://www.imboy.pub'], branding: {}, consent_version: 'v1', status: 'active' },
        { id: '114030271711676410', organization_id: ORG_ID, display_name: 'IMBoy 在线咨询', public_widget_id: '114030271711676416', allowed_origins: ['https://www.imboy.pub'], branding: {}, consent_version: 'v1', status: 'active' },
      ] })
      return
    }
    if (path === `/customer-service/organizations/${ORG_ID}/sessions`) {
      await fulfill(route, { sessions: [], next_after_id: null })
      return
    }
    await fulfill(route, {})
  })
}

test('在线客服首页自动进入已启用状态并隐藏旧菜单', async ({ page }) => {
  await mockCustomerService(page)
  await page.goto('/customer-service')

  await expect(page.getByRole('heading', { name: '在线客服', level: 1 })).toBeVisible()
  await expect(page.getByText('在线客服已启用')).toBeVisible()
  await expect(page.getByText('IMBoy / 默认工作区 · 2 位客服可接待 · 2 个网站接入')).toBeVisible()
  await expect(page.getByText('https://www.imboy.pub').first()).toBeVisible()
  await expect(page.getByRole('link', { name: '在线客服', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '坐席工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '客服开通', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Widget 接入', exact: true })).toHaveCount(0)

  await page.screenshot({ path: 'test-results/customer-service-home.png', fullPage: true })
})

test('在线客服首页在手机宽度下无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCustomerService(page)
  await page.goto('/customer-service')
  await expect(page.getByText('在线客服已启用')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await page.screenshot({ path: 'test-results/customer-service-home-mobile.png', fullPage: true })
})
