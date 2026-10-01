import { expect, test, type Page } from '@playwright/test'
import { compiledProductFeatures, productFeatureManifestHash, productFeatureSchemaVersion } from '../../src/generated/productFeatures'
import type { EntityId } from '../../src/types/common'

// Browser layout and interaction only: every API is intercepted with synthetic data.
const orgId: EntityId = '8800487111111111111'
const rootId: EntityId = '9007199254740993'
const departments = [
  { id: rootId, parent_id: null, name: '研发与客户交付中心', status: 'active' },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: String(100 + i), parent_id: rootId,
    name: i === 11 ? '广州客户项目交付与技术支持部门的完整长名称' : `项目组 ${i + 1}`,
    status: 'active',
  })),
  { id: '201', parent_id: '111', name: '交付小队', status: 'active' },
  { id: '202', parent_id: '201', name: '质量保障', status: 'active' },
  { id: '301', parent_id: null, name: '历史业务部', status: 'archived' },
].map((row) => ({ ...row, organization_id: orgId, version: 1, created_at: '', updated_at: '' }))

async function mockDirectory(page: Page) {
  const unexpected: string[] = []
  await page.route((url) => url.pathname.startsWith('/api/') || url.pathname === '/brand', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const path = pathname.replace('/api/adm', '')
    let payload: unknown
    if (path === '/current') payload = { id: '1', account: 'synthetic-admin', nickname: '布局测试', status: 1, role_id: '1', role_ids: ['1'] }
    else if (path === '/rbac/me') payload = { role_ids: ['1'], permissions: ['organizations:read', 'organizations:write'], menu_paths: ['/organizations'] }
    else if (path === '/brand') payload = {}
    else if (path === '/stats/license') payload = {}
    else if (path === '/admin/config/features') payload = { manifest_hash: productFeatureManifestHash, manifest_schema_version: productFeatureSchemaVersion, compiled_features: compiledProductFeatures }
    else if (path === '/moment/report/list' || path === '/feedback/index') payload = { items: [], total: 0, page: 1, size: 10 }
    else if (path === '/admin/config/sidebar') payload = { items: [], rbac: { roles: [] } }
    else if (path === `/organizations/${orgId}`) payload = { id: orgId, name: '广州企业示例', owner_id: '1', status: 'active', member_count: 1, workspace_count: 0 }
    else if (path === `/organizations/${orgId}/departments`) payload = departments
    else {
      unexpected.push(path)
      await route.abort()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', payload }) })
  })
  return unexpected
}

for (const scenario of [
  { name: 'desktop', width: 1440, height: 1000, dark: false, largeText: false },
  { name: 'mobile', width: 390, height: 844, dark: false, largeText: false },
  { name: 'dark-large-text', width: 1440, height: 1000, dark: true, largeText: true },
]) {
  test(`组织架构图布局与导航 · ${scenario.name}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const unexpected = await mockDirectory(page)
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.goto(`/organizations/${orgId}/departments`)
    await expect(page.getByTestId('department-tree')).toBeVisible()
    await page.evaluate(({ dark, largeText }) => {
      document.documentElement.classList.toggle('dark', dark)
      if (largeText) document.documentElement.style.fontSize = '32px'
    }, scenario)
    await page.getByRole('button', { name: '架构图', exact: true }).click()
    const chart = page.getByTestId('department-chart')
    await expect(chart).toBeVisible()
    await expect(page.getByTestId('dept-chart-enterprise')).toBeInViewport()
    await expect(chart.locator('[data-department-id]')).toHaveCount(departments.length)
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.width)
    const mainSize = await page.getByRole('main').evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }))
    expect(mainSize.scroll).toBeLessThanOrEqual(mainSize.width)
    const dimensions = await chart.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }))
    expect(dimensions.scroll).toBeGreaterThan(dimensions.width)
    const target = page.getByTestId('dept-chart-node-202')
    await target.scrollIntoViewIfNeeded()
    await expect(target).toBeInViewport()
    await expect(target).toHaveCSS('min-height', scenario.largeText ? '88px' : '44px')
    await target.click()
    await expect(page.getByTestId('dept-detail-path')).toHaveText('研发与客户交付中心 / 广州客户项目交付与技术支持部门的完整长名称 / 交付小队 / 质量保障')
    await page.screenshot({ path: testInfo.outputPath('chart-selected.png'), fullPage: true })
    await page.getByRole('button', { name: '返回企业', exact: true }).click()
    await expect(page.getByTestId('dept-chart-enterprise')).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath('chart.png'), fullPage: true })
    await page.getByRole('button', { name: '目录', exact: true }).click()
    await expect(page.getByTestId('dept-node-202').locator('..').locator('..')).toHaveAttribute('aria-selected', 'true')
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
