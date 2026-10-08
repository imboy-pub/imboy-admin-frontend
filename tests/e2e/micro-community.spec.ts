import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './support/adminAuth'

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing isolated micro-community test configuration: ${name}`)
  return value
}

// Required isolated live fixtures. No network interception or mocked business data.
test('real binding and independent essence round trip', async ({ page }) => {
  const channelId = requiredConfig('IMBOY_MC_CHANNEL_ID')
  const groupId = requiredConfig('IMBOY_MC_EMPTY_GROUP_ID')
  const messageId = requiredConfig('IMBOY_MC_MESSAGE_ID')
  expect(channelId, 'required isolated micro-community channel').toBeTruthy()
  expect(groupId, 'required owner-only empty private invitation group').toBeTruthy()
  expect(messageId, 'required channel message').toBeTruthy()
  const credentials = {
    account: requiredConfig('IMBOY_MC_ADMIN_ACCOUNT'),
    password: requiredConfig('IMBOY_MC_ADMIN_PASSWORD'),
  }
  await loginAsAdmin(page, credentials)
  await page.goto(`/channels/${channelId}`)
  await expect(page.getByText('当前讨论群：未绑定', { exact: true })).toBeVisible()
  await page.getByLabel('选择讨论群').selectOption(groupId!)
  await page.getByText('保存讨论群', { exact: true }).click()
  await page.getByText('确认保存', { exact: true }).click()
  await expect(page.getByText(`当前讨论群：${groupId}`, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(`当前讨论群：${groupId}`, { exact: true })).toBeVisible()
  await page.goto(`/channels/${channelId}/messages`)
  const row = page.getByRole('row').filter({ hasText: messageId! })
  const oldPin = await row.getByTitle(/置顶消息|取消置顶/).getAttribute('title')
  await row.getByRole('button', { name: '设为精华', exact: true }).click()
  await expect(row.getByRole('button', { name: '取消精华', exact: true })).toBeVisible()
  await expect(row.getByTitle(oldPin!)).toBeVisible()
  await page.reload()
  await expect(row.getByRole('button', { name: '取消精华', exact: true })).toBeVisible()
  await row.getByRole('button', { name: '取消精华', exact: true }).click()
  await expect(row.getByRole('button', { name: '设为精华', exact: true })).toBeVisible()
  await page.goto(`/channels/${channelId}`)
  await page.getByLabel('选择讨论群').selectOption('')
  await page.getByText('保存讨论群', { exact: true }).click()
  await page.getByText('确认保存', { exact: true }).click()
  await expect(page.getByText('当前讨论群：未绑定', { exact: true })).toBeVisible()
})
