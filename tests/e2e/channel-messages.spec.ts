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

test('频道消息治理页可对固定消息执行置顶', async ({ page }) => {
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
    await expect(page.getByText('消息已置顶')).toBeVisible()
  } else {
    await expect(unpinButton).toBeVisible()
  }

  await expect(row.getByTitle('取消置顶')).toBeVisible()
  await expect(row).toContainText('是')
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
