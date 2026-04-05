import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function buildRunScopedName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`
}

function getAdminRow(page: Page, account: string): Locator {
  return page.locator('tbody tr').filter({
    has: page.locator(`[data-admin-account="${account}"]`),
  }).first()
}

async function resolveAssignableRoleName(
  roleSelect: Locator,
  currentRoleName: string,
  preferredRoleName?: string,
): Promise<string> {
  let resolved = ''

  await expect.poll(async () => {
    const optionLabels = await roleSelect.locator('option').evaluateAll((nodes) =>
      nodes
        .map((node) => node.textContent?.trim() || '')
        .filter((label) => label.length > 0),
    )

    if (preferredRoleName && preferredRoleName !== currentRoleName && optionLabels.includes(preferredRoleName)) {
      resolved = preferredRoleName
      return resolved
    }

    resolved = optionLabels.find((label) => label !== currentRoleName) || ''
    return resolved
  }, {
    message: '等待可用于重新分配的目标角色出现在下拉框中',
  }).not.toBe('')

  return resolved
}

test('超级管理员可创建管理员并重新分配角色', async ({ page }) => {
  const credentials = requireAdminCredentials('super')
  const account = buildRunScopedName(readEnv('IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX') || 'pw_e2e_admin')
  const password = readEnv('IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD') || 'Passw0rd!'
  const initialRoleName = readEnv('IMBOY_ADMIN_E2E_CREATE_ADMIN_ROLE_NAME') || '运营管理员'
  const targetRoleName = readEnv('IMBOY_ADMIN_E2E_ASSIGN_ROLE_NAME') || '审计管理员'

  await loginAsAdmin(page, credentials)
  await page.goto('/admins')

  await expect(page.getByRole('heading', { name: '管理员中心' })).toBeVisible()
  await page.getByRole('button', { name: '新增管理员' }).click()
  const adminDrawer = page.locator('aside').filter({
    hasText: '创建后台管理员账号并分配初始角色',
  }).first()
  await expect(adminDrawer).toBeVisible()

  await adminDrawer.getByPlaceholder('请输入管理员账号').fill(account)
  await adminDrawer.getByPlaceholder('至少 6 位').fill(password)
  await adminDrawer.locator('select').filter({ has: page.getByRole('option', { name: initialRoleName }) }).first()
    .selectOption({ label: initialRoleName })
  await adminDrawer.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByText('管理员创建成功')).toBeVisible()
  await page.getByPlaceholder('搜索账号 / 昵称').fill(account)
  await page.getByRole('button', { name: '搜索' }).click()

  const row = getAdminRow(page, account)
  const roleSelect = row.getByRole('combobox')

  await expect(row).toBeVisible()
  const currentRoleName = await roleSelect.evaluate((node) => {
    const select = node as HTMLSelectElement
    return select.selectedOptions[0]?.textContent?.trim() || ''
  })
  const resolvedTargetRoleName = await resolveAssignableRoleName(roleSelect, currentRoleName, targetRoleName)

  await roleSelect.selectOption({ label: resolvedTargetRoleName })
  await expect(page.getByText('管理员角色已更新')).toBeVisible()
  await expect
    .poll(async () => roleSelect.evaluate((node) => {
      const select = node as HTMLSelectElement
      return select.selectedOptions[0]?.textContent?.trim() || ''
    }))
    .toBe(resolvedTargetRoleName)
})

test('超级管理员可创建角色并保存权限', async ({ page }) => {
  const credentials = requireAdminCredentials('super')
  const roleName = buildRunScopedName(readEnv('IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX') || 'pw_e2e_role')
  const roleDescription = readEnv('IMBOY_ADMIN_E2E_NEW_ROLE_DESCRIPTION') || 'Playwright E2E created role'
  const permissionKey = readEnv('IMBOY_ADMIN_E2E_ROLE_PERMISSION_KEY') || 'reports:read'

  await loginAsAdmin(page, credentials)
  await page.goto('/roles')

  await expect(page.getByRole('heading', { name: '角色权限' })).toBeVisible()
  await page.getByRole('button', { name: '新增角色' }).click()
  const roleDrawer = page.locator('aside').filter({
    hasText: '创建新角色并设置初始权限集合',
  }).first()
  await expect(roleDrawer).toBeVisible()

  await roleDrawer.getByPlaceholder('例如：内容巡检管理员').fill(roleName)
  await roleDrawer.getByPlaceholder('可选').fill(roleDescription)
  await roleDrawer.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByText('角色创建成功')).toBeVisible()

  const roleCard = page.locator(`[data-role-name="${roleName}"]`).first()
  await expect(roleCard).toBeVisible()
  await roleCard.getByRole('button', { name: '编辑权限' }).click()

  await page.getByPlaceholder('搜索权限名 / 模块 / 路径 / 键名').fill(permissionKey)
  const permissionItem = page.locator(`[data-permission-key="${permissionKey}"]`).first()
  const permissionCheckbox = permissionItem.locator('input[type="checkbox"]').first()

  await expect(permissionItem).toBeVisible()
  await permissionCheckbox.check()
  await expect(page.getByText('有未保存变更')).toBeVisible()
  await page.getByRole('button', { name: '保存权限' }).click()

  await expect(page.getByText('角色权限已保存')).toBeVisible()
  await expect(permissionCheckbox).toBeChecked()
  await expect(page.getByText('已同步')).toBeVisible()
})
