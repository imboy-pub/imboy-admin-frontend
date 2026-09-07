/**
 * 批次W2R3 回归：detail 契约修复点聚焦验证（后端 0304979 修 4 个渲染 bug 后）
 * 覆盖 W2R1 首测发现、且在长 spec 中被会话互踢中断未回归到的两个页面：
 *   - ProjectDetailPage 频道 Tab：channel_id→id / linked_at→创建时间 映射，React key 错误消除
 *   - WorkspaceDetailPage：Owner 昵称 / 资源计数四卡 / 工作区成员清单（嵌套形状归一）
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const WS_ID = process.env.AT_WS_ID || '109901865994684416'
const PROJECT_ID = process.env.AT_PROJECT_ID || '109901866229565440'
const CHANNEL_ID = process.env.AT_CHANNEL_ID || '109901866059696128'

test('W2R3 回归：pdetail 频道 Tab 字段映射', async ({ page }) => {
  test.setTimeout(180_000)
  const keyErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('key')) keyErrors.push(msg.text())
  })

  await loginAsAdmin(page, requireAdminCredentials())
  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText('任务状态分布').first()).toBeVisible()

  await page.getByRole('tab', { name: /频道/ }).first().click()
  await page.waitForResponse((r) => r.url().includes('/api/adm/project/channels'), { timeout: 20_000 })
  await page.waitForTimeout(500)

  // 修复前：频道 ID 列空、订阅数恒 0、创建时间恒 —、React key console error
  const idCell = page.getByText(CHANNEL_ID, { exact: true }).first()
  await expect(idCell, '频道 ID 列应显示 channel_id 映射值').toBeVisible()
  await expect(page.getByText('Announcements', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-pdetail-channels-fixed.png' })
  expect(keyErrors, '不应再有 React key console error').toHaveLength(0)
})

test('W2R3 回归：wdetail Owner/计数/成员契约修复', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAsAdmin(page, requireAdminCredentials())
  const detailResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/detail'), { timeout: 20_000 })
  await page.goto(`/workspaces/${WS_ID}`)
  expect((await detailResp).status()).toBeLessThan(300)
  await expect(page.getByRole('heading', { name: /AT-WS-/ })).toBeVisible()

  // 修复前：主 Owner 显示「— uid」
  await expect(page.getByText('走查AT甲', { exact: true }).first()).toBeVisible()

  // 修复前：资源计数四卡全 0（实际 1/1/1/2）
  const stats = page.locator('.grid').filter({ has: page.getByText('项目数', { exact: true }) }).first()
  await expect(stats.getByText('项目数', { exact: true })).toBeVisible()
  await expect(stats.getByText('1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('工作区成员数', { exact: true })).toBeVisible()
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-wdetail-stats-fixed.png' })

  // 修复前：恒显「暂无工作区成员」（实际 2 成员）
  await expect(page.getByText('暂无工作区成员')).toHaveCount(0)
  await expect(page.getByText('走查AT甲', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('走查AT乙', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Owner', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-wdetail-members-fixed.png', fullPage: true })
})
