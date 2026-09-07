/**
 * 批次W2R3 回归：工作区归档/恢复闭环（后端 f019e2c6 修复 archived_by FK 23503 后）
 * 对应台账 tests/auto_test/workspaces/WorkspaceListPage.md「归档工作区」「恢复已归档工作区」两行。
 * 前置：种子工作区 AT-WS-*（/tmp/at_seed_result.env）为 active；只对该种子行写操作，测完恢复 active。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const WS_NAME = process.env.AT_WS_NAME || 'AT-WS-20260830210132'

function dialogButton(page: Page, name: string) {
  return page.getByRole('alertdialog').getByRole('button', { name, exact: true })
}

test('W2R3 回归：归档→恢复闭环（后端 archived_by NULL 修复生效）', async ({ page }) => {
  test.setTimeout(240_000)
  const hits: { url: string; status: number; method: string }[] = []
  page.on('response', (res: Response) => {
    if (res.url().includes('/api/adm/workspace/')) {
      hits.push({ url: res.url().replace(/^.*\/api\/adm/, ''), status: res.status(), method: res.request().method() })
    }
  })

  await test.step('登录并定位种子工作区', async () => {
    await loginAsAdmin(page, requireAdminCredentials())
    const listResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/list'), { timeout: 20_000 })
    await page.goto('/workspaces')
    expect((await listResp).status()).toBeLessThan(300)
    await expect(page.getByRole('heading', { name: '工作区管理' })).toBeVisible()
    const searchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 15_000 })
    await page.getByPlaceholder('搜索工作区名称...').fill(WS_NAME)
    await page.getByRole('button', { name: '搜索' }).click()
    expect((await searchResp).status()).toBeLessThan(300)
    await expect(page.getByRole('cell', { name: WS_NAME, exact: false }).first()).toBeVisible()
  })

  const seedRow = () => page.getByRole('row', { name: new RegExp(WS_NAME) }).first()

  await test.step('归档：确认弹窗 → archive 2xx + toast + 已归档徽标', async () => {
    await expect(seedRow().getByTitle('归档工作区')).toBeVisible()
    const archiveResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/archive'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 20_000 })
    await seedRow().getByTitle('归档工作区').click()
    await expect(page.getByText('确认归档工作区')).toBeVisible()
    await dialogButton(page, '归档').click()
    const ar = await archiveResp
    expect(ar.status(), 'workspace/archive 必须 2xx').toBeLessThan(300)
    const body = await ar.text().catch(() => '')
    expect(body, 'archive 业务 code 必须 0（FK 修复生效）').toMatch(/"code"\s*:\s*0/)
    await expect(page.getByText('工作区已归档（读保留，业务写被拒绝）').first()).toBeVisible({ timeout: 1_000 })
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-archive-toast.png' })
    expect((await refetchResp).status(), '归档后列表必须失效重拉').toBeLessThan(300)
    await expect(seedRow().getByText('已归档')).toBeVisible({ timeout: 10_000 })
    await expect(seedRow().getByTitle('恢复工作区')).toBeVisible()
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-archived-badge.png' })
  })

  await test.step('恢复：确认弹窗 → restore 2xx + toast + 终态正常', async () => {
    const restoreResp = page.waitForResponse((r) => r.url().includes('/api/adm/workspace/restore'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse(
      (r) => r.url().includes('/api/adm/workspace/list') && r.url().includes(`keyword=${WS_NAME}`), { timeout: 20_000 })
    await seedRow().getByTitle('恢复工作区').click()
    await expect(page.getByText('确认恢复工作区')).toBeVisible()
    await dialogButton(page, '恢复').click()
    expect((await restoreResp).status(), 'workspace/restore 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('工作区已恢复').first()).toBeVisible({ timeout: 1_000 })
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-restore-toast.png' })
    expect((await refetchResp).status(), '恢复后列表必须失效重拉').toBeLessThan(300)
    await expect(seedRow().getByText('正常')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'tests/auto_test/evidence/workspaces/w2r3-restored-active.png' })
  })
})
