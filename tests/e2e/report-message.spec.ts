// R-01 一等消息举报：管理端 message 表面端到端
//
// 数据锚为本地后端 :9800 的存量工单（真机验收产出）：
//   110928722118576128（c2c，E2EE 同意流，excerpt=[加密消息]）
//   110928787606341632（channel）
// 工单被处置/清库后用例自动 skip（对齐 fixture spec 的可重复运行语义）。

import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const C2C_REPORT_ID = '110928722118576128'

test('消息举报面板展示 message 工单与证据弹窗', async ({ page }) => {
  const credentials = requireAdminCredentials()

  await loginAsAdmin(page, credentials)
  await page.goto('/reports?target_type=message')
  await expect(page.getByRole('heading', { name: '举报中心' })).toBeVisible()

  const c2cRow = page
    .locator('tbody tr')
    .filter({ hasText: C2C_REPORT_ID })
    .first()
  // isVisible() 不 auto-wait，行异步加载需显式等待窗口
  const rowReady = await c2cRow
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (!rowReady) {
    test.skip(true, `数据锚工单 ${C2C_REPORT_ID} 已不存在（被处置/清库）`)
    return
  }
  await expect(c2cRow.getByText('单聊消息')).toBeVisible()
  await expect(c2cRow.getByText('E2EE', { exact: true })).toBeVisible()

  // 证据弹窗：仅工单绑定 + E2EE 披露声明 + 举报人同意标记
  await c2cRow.getByTitle('查看工单证据').click()
  await expect(page.getByText('工单证据（仅本工单绑定）')).toBeVisible()
  await expect(
    page.getByText(/以下明文摘录由举报人明确同意后主动披露/)
  ).toBeVisible()
  await expect(page.getByText('已同意')).toBeVisible()
  await expect(page.getByText('[加密消息]')).toBeVisible()
})

test('message 工单不提供按对象浏览入口', async ({ page }) => {
  const credentials = requireAdminCredentials()

  await loginAsAdmin(page, credentials)
  await page.goto('/reports?target_type=message')
  await expect(page.getByRole('heading', { name: '举报中心' })).toBeVisible()

  // R-01 安全设计：消息举报无「查看对象」跳转，只允许工单内证据。
  // 该断言不依赖特定工单（面板无 message 工单时同样成立）。
  await expect(page.getByTitle('查看对象')).toHaveCount(0)
})
