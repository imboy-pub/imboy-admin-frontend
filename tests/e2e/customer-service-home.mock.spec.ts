import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * 在线客服首页（平台运营面，CS-03/CS-ADM-02）全 mock 合同用例。
 *
 * 历史（V1.2 过期用例整改，PR-W2-C05）：本 spec 原断言「在线客服已启用 /
 * IMBoy / 默认工作区 · 2 位客服可接待 · 2 个网站接入」旧版首页文案；
 * 页面已演进为「在线客服坐席」跨企业坐席分页表（CustomerServiceHomePage.tsx
 * + CsStatsPanel），旧文案在 src 中零命中。现按当前合同改写：
 *   - 坐席表按 GET /api/adm/customer-service/seats 投影逐行渲染；
 *   - org 过滤缺省「全部企业」，统计面板显式空态（org 维度查看提示）；
 *   - 旧菜单（客服开通 / Widget 接入）不在侧边栏合同内，不得出现。
 */

const ORG_ID = '114022088375011328'

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
    // 跨企业坐席分页（CS-03 平台运营面合同：seats + next_after_id 键集分页）
    if (path === '/customer-service/seats') {
      await fulfill(route, {
        seats: [
          {
            organization_id: ORG_ID, organization_name: 'IMBoy', display_name: '一号客服',
            business_identity_id: '114022088375011401', function_key: 'customer_service',
            enabled: true, max_concurrent: 3, active_count: 0, workspace_id: '114022088375011329',
          },
          {
            organization_id: ORG_ID, organization_name: 'IMBoy', display_name: '二号客服',
            business_identity_id: '114022088375011402', function_key: 'customer_service',
            enabled: true, max_concurrent: 3, active_count: 1, workspace_id: '114022088375011329',
          },
        ],
        next_after_id: null,
      })
      return
    }
    await fulfill(route, {})
  })
}

test('在线客服坐席首页渲染跨企业坐席表与统计空态并隐藏旧菜单', async ({ page }) => {
  await mockCustomerService(page)
  await page.goto('/customer-service')

  await expect(page.getByRole('heading', { name: '在线客服坐席', level: 1 })).toBeVisible()

  // 统计面板：org 过滤缺省「全部企业」→ 显式空态（不伪装数据）
  await expect(page.getByText('统计按企业维度查看')).toBeVisible()

  // 坐席表（全部企业的客服坐席）：逐行投影渲染（DataTable 桌面+移动双 DOM，文本断言取 first）
  await expect(page.getByText('全部企业的客服坐席')).toBeVisible()
  await expect(page.getByText('一号客服').first()).toBeVisible()
  await expect(page.getByText('二号客服').first()).toBeVisible()
  await expect(page.getByText('114022088375011401').first()).toBeVisible()

  // 侧边栏合同：现役菜单可见，旧菜单不得回归
  await expect(page.getByRole('link', { name: '在线客服', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '坐席工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '客服开通', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Widget 接入', exact: true })).toHaveCount(0)

  await page.screenshot({ path: 'test-results/customer-service-home.png', fullPage: true })
})

test('在线客服坐席首页在手机宽度下无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCustomerService(page)
  await page.goto('/customer-service')
  await expect(page.getByRole('heading', { name: '在线客服坐席', level: 1 })).toBeVisible()
  // 手机宽度下桌面表格 DOM 隐藏、移动 DOM 可见——按可见性过滤再断言
  await expect(page.getByText('一号客服').filter({ visible: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await page.screenshot({ path: 'test-results/customer-service-home-mobile.png', fullPage: true })
})
