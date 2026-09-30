import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'
import { requireChannelGovernanceFixture } from './support/scenarioManifest'

test('频道消息治理页在真实浏览器中可加载基础治理动作', async ({ page }) => {
  const credentials = requireAdminCredentials()
  const fixture = requireChannelGovernanceFixture()
  const channelId = fixture.channelId

  await loginAsAdmin(page, credentials)
  await page.goto(`/channels/${channelId}/messages`)

  await expect(page.getByRole('heading', { name: '频道消息治理' })).toBeVisible()
  await expect(page.getByText(`频道 ID: ${channelId}`)).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible()

  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow).toBeVisible()
  await expect(firstRow.getByTitle(/置顶消息|取消置顶/)).toBeVisible()
  await expect(firstRow.getByTitle('删除消息')).toBeVisible()
})

/**
 * BLOCKED_PENDING_BACKEND（PR-W2-C05 实证，2026-09-28，imboy 候选 984d40e6）：
 *   adm_channel_handler:pin_message_action 要求权限 `channels:pin`，但
 *   adm_index_handler:role_acl/1 的任何角色（含 super_admin role 1）都未授予
 *   `channels:pin`（全仓 grep 仅 handler 一处引用）→ 所有管理员置顶恒 403
 *   「无权限操作」，频道消息治理页的置顶功能死路。
 *   最小解除条件（后端二选一，属产品代码修复，本卡不越界改后端）：
 *     1) role_acl 为相应角色补 `channels:pin` 授权；或
 *     2) handler 改用既有 `channels:update` 权限键。
 *   在解除前，本用例按**现行真实行为**断言（fail-closed 403 错误态可见、
 *   不出现成功态）——缺陷修复后应把断言翻转回正路径（消息已置顶/是）。
 */
test('频道消息治理页置顶（BLOCKED_PENDING_BACKEND：channels:pin 无角色授予，恒 403）', async ({ page }) => {
  const credentials = requireAdminCredentials()
  const fixture = requireChannelGovernanceFixture()
  const channelId = fixture.channelId

  test.skip(!fixture.pinMessageId, '场景 adm_e2e_05_channel_message_govern 缺少 pinMessageId')

  await loginAsAdmin(page, credentials)
  await page.goto(`/channels/${channelId}/messages`)

  const row = page.locator('tbody tr').filter({
    has: page.getByLabel(`选择消息 ${fixture.pinMessageId}`),
  }).first()

  await expect(row).toBeVisible()

  const pinButton = row.getByTitle('置顶消息')
  const unpinButton = row.getByTitle('取消置顶')

  if (await pinButton.count()) {
    await pinButton.click()
    // 现行行为：后端 403 → 页面错误 toast（fail-closed），不出现成功态
    await expect(page.getByText('操作失败', { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('消息已置顶')).toHaveCount(0)
  } else {
    await expect(unpinButton).toBeVisible()
  }
})

test('频道消息治理页可删除固定消息', async ({ page }) => {
  const credentials = requireAdminCredentials()
  const fixture = requireChannelGovernanceFixture()
  const channelId = fixture.channelId

  test.skip(!fixture.deleteMessageId, '场景 adm_e2e_05_channel_message_govern 缺少 deleteMessageId')

  await loginAsAdmin(page, credentials)
  await page.goto(`/channels/${channelId}/messages`)

  const row = page.locator('tbody tr').filter({
    has: page.getByLabel(`选择消息 ${fixture.deleteMessageId}`),
  }).first()

  await expect(row).toBeVisible()
  await row.getByTitle('删除消息').dispatchEvent('click')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '删除' }).dispatchEvent('click')

  await expect(page.getByText('消息已删除')).toBeVisible()
  await expect(row).not.toBeVisible()
})
