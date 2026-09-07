/**
 * 批次W2R2 复验：PluginManagementPage 5 个待修复 bug 的修复验证
 * 对应台账 tests/auto_test/plugin_management/PluginManagementPage.md：
 *   ① 安装路径标注「可选」实为后端必填 → 前端标注对齐 + 必填校验
 *   ② installed 态无启用入口 → 启用按钮条件加 installed（后端 installed→enable）
 *   ③ 禁用不可达（enabled 不可达连带）→ 随 ② 恢复 enabled 态后验证禁用
 *   ④⑤ 后端 failed 态未映射前端 error → normalizePluginState 归一，
 *      重置/强制卸载入口恢复（failed 态经 plugin_gate_probe.escript 注入）
 * 前置：escript tests/auto_test/scripts/plugin_gate_probe.escript gate-on
 * 测后：gate-off 恢复门禁默认关闭。
 */
import { expect, test, type Page, type Response } from '@playwright/test'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { loginAsAdmin, requireAdminCredentials } from '../support/adminAuth'

const EVIDENCE_DIR = 'tests/auto_test/evidence/plugin_management'
const RUN_ID = `w2r2fix-${Date.now()}`

type ApiHit = { url: string; status: number; method: string }
const apiHits: ApiHit[] = []
let mark = 0

function probe(args: string): string {
  return execSync(`escript tests/auto_test/scripts/plugin_gate_probe.escript ${args}`, { encoding: 'utf8' }).trim()
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: `${EVIDENCE_DIR}/${RUN_ID}-${name}.png` })
}

function hitsSince(pattern: RegExp): ApiHit[] {
  return apiHits.slice(mark).filter((h) => pattern.test(h.url))
}

function trackApi(page: Page) {
  page.on('response', (res: Response) => {
    const url = res.url()
    if (url.includes('/api/adm/plugin/')) {
      apiHits.push({ url: url.replace(/^.*\/api\/adm/, ''), status: res.status(), method: res.request().method() })
    }
  })
}

/** 确认类弹窗（ConfirmDialog = Radix AlertDialog）内按钮 */
function dialogButton(page: Page, name: string) {
  return page.getByRole('alertdialog').getByRole('button', { name, exact: true })
}

/** 定位插件卡片 */
function pluginCard(page: Page, name: string) {
  return page.locator('.grid .group, .grid > div').filter({ has: page.getByText(name, { exact: true }) }).first()
}

test('W2R2 复验：PluginManagementPage 5 项修复', async ({ page }) => {
  test.setTimeout(420_000)
  trackApi(page)

  await test.step('前置：清理可能残留的 lifecycle（保证 spec 可重跑）', async () => {
    for (const name of ['location', 'channel', 'group_collab', 'moment']) {
      try {
        console.log(`[probe] ${probe(`cleanup ${name}`)}`)
      } catch { /* 无 lifecycle 时 probe 以非零退出，忽略 */ }
    }
  })

  await test.step('登录并进入插件管理', async () => {
    await loginAsAdmin(page, requireAdminCredentials())
    const listResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await page.goto('/plugins')
    expect((await listResp).status()).toBeLessThan(300)
    await expect(page.getByRole('heading', { name: '插件管理' })).toBeVisible()
  })

  await test.step('② 前置：installed 态卡片出现启用按钮（修复前缺失）', async () => {
    const card = pluginCard(page, 'channel')
    await expect(card).toBeVisible()
    await expect(card.getByText('已安装')).toBeVisible()
    await expect(card.getByRole('button', { name: /启用/ })).toBeVisible()
    await shot(page, 'installed-enable-entry')
  })

  await test.step('① 安装弹窗：路径必填标注 + 空路径前端拦截（不发请求）', async () => {
    await page.getByRole('button', { name: /安装插件/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // 标注与契约对齐：无「（可选）」字样
    await expect(dialog.getByText('插件路径', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/可选/)).toHaveCount(0)
    await shot(page, 'install-dialog-path-required-label')

    // 空路径提交 → 前端拦截 toast，无网络请求
    mark = apiHits.length
    await page.getByLabel('插件名称').fill('location')
    await dialog.getByRole('button', { name: '安装', exact: true }).click()
    await expect(page.getByText('请填写插件路径').first()).toBeVisible({ timeout: 3_000 })
    await shot(page, 'install-path-validation-toast')
    expect(hitsSince(/\/plugin\/install/), '前端校验拦截后不应发安装请求').toHaveLength(0)
  })

  await test.step('① 安装正路径：name+path → install 2xx + toast + 列表刷新', async () => {
    mark = apiHits.length
    const installResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/install'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await page.getByLabel('插件路径').fill('priv/plugins/location')
    await page.getByRole('dialog').getByRole('button', { name: '安装', exact: true }).click()
    expect((await installResp).status(), 'plugin/install 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件安装成功').first()).toBeVisible({ timeout: 3_000 }).catch(async (e) => {
      const irBody = await installResp.text().catch(() => '(gone)')
      console.log(`[dbg] url=${page.url()} installBody=${irBody.slice(0, 200)} recentHits=${JSON.stringify(apiHits.slice(-6))}`)
      await page.screenshot({ path: `${EVIDENCE_DIR}/${RUN_ID}-debug-install-no-toast.png` })
      throw e
    })
    await shot(page, 'install-success-toast')
    expect((await refetchResp).status(), '安装后列表必须失效重拉').toBeLessThan(300)
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  await test.step('② installed 态启用：enable 2xx + toast + 徽标已启用', async () => {
    const card = pluginCard(page, 'location')
    mark = apiHits.length
    const enableResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/enable'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await card.getByRole('button', { name: /启用/ }).click()
    expect((await enableResp).status(), 'plugin/enable 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件已启用').first()).toBeVisible({ timeout: 3_000 })
    await shot(page, 'enable-toast')
    expect((await refetchResp).status(), '启用后列表必须失效重拉').toBeLessThan(300)
    await expect(card.getByText('已启用')).toBeVisible({ timeout: 10_000 })
  })

  await test.step('③ enabled 态禁用：确认弹窗 → disable 2xx + toast + 徽标已禁用', async () => {
    const card = pluginCard(page, 'location')
    await expect(card.getByRole('button', { name: /禁用/ })).toBeVisible()
    mark = apiHits.length
    const disableResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/disable'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await card.getByRole('button', { name: /禁用/ }).click()
    await expect(page.getByText('确认禁用插件')).toBeVisible()
    await dialogButton(page, '禁用').click()
    expect((await disableResp).status(), 'plugin/disable 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件已禁用').first()).toBeVisible({ timeout: 3_000 })
    await shot(page, 'disable-toast')
    expect((await refetchResp).status(), '禁用后列表必须失效重拉').toBeLessThan(300)
    await expect(card.getByText('已禁用')).toBeVisible({ timeout: 10_000 })
  })

  await test.step('清理 location：卸载（确认弹窗 → 2xx + toast，回 installed）', async () => {
    const card = pluginCard(page, 'location')
    mark = apiHits.length
    const uninstallResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/uninstall'), { timeout: 20_000 })
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await card.getByRole('button', { name: '卸载', exact: true }).click()
    await expect(page.getByText('确认卸载插件')).toBeVisible()
    await dialogButton(page, '卸载').click()
    expect((await uninstallResp).status(), 'plugin/uninstall 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件已卸载').first()).toBeVisible({ timeout: 3_000 })
    expect((await refetchResp).status()).toBeLessThan(300)
    await expect(card.getByText('已安装')).toBeVisible({ timeout: 10_000 })
  })

  await test.step('④⑤ 前置：安装并启用 location 建 lifecycle（channel/group_collab 的 install/enable 被后端拒绝）', async () => {
    await page.getByRole('button', { name: /安装插件/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    mark = apiHits.length
    const installResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/install'), { timeout: 20_000 })
    const refetch1 = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await page.getByLabel('插件名称').fill('location')
    await page.getByLabel('插件路径').fill('priv/plugins/location')
    await dialog.getByRole('button', { name: '安装', exact: true }).click()
    expect((await installResp).status(), 'location 安装必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件安装成功').first()).toBeVisible({ timeout: 3_000 })
    await refetch1
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const card = pluginCard(page, 'location')
    const enableResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/enable'), { timeout: 20_000 })
    const refetch2 = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await card.getByRole('button', { name: /启用/ }).click()
    expect((await enableResp).status()).toBeLessThan(300)
    await expect(page.getByText('插件已启用').first()).toBeVisible({ timeout: 3_000 })
    await refetch2
    await expect(card.getByText('已启用')).toBeVisible({ timeout: 10_000 })
  })

  await test.step('④⑤ failed 态映射：注入失败 → 错误徽标 + 重置/强制卸载入口出现', async () => {
    const out = probe('fail location')
    console.log(`[probe] ${out}`)
    expect(out).toContain('injected')
    mark = apiHits.length
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await page.getByRole('button', { name: '刷新' }).click()
    expect((await refetchResp).status()).toBeLessThan(300)
    const card = pluginCard(page, 'location')
    await expect(card.getByText('错误')).toBeVisible({ timeout: 10_000 })
    await expect(card.getByRole('button', { name: /重置/ })).toBeVisible()
    await expect(card.getByRole('button', { name: /强制卸载/ })).toBeVisible()
    await shot(page, 'failed-state-mapped-error')
  })

  await test.step('⑤ 重置：确认弹窗 → reset 2xx + toast', async () => {
    const card = pluginCard(page, 'location')
    mark = apiHits.length
    const resetResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/reset'), { timeout: 20_000 })
    await card.getByRole('button', { name: /重置/ }).click()
    await expect(page.getByText('确认重置插件')).toBeVisible()
    await dialogButton(page, '重置').click()
    expect((await resetResp).status(), 'plugin/reset 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件已重置').first()).toBeVisible({ timeout: 3_000 })
    await shot(page, 'reset-toast')
    // 重置后离开 error 态（unknown），重置/强制卸载入口消失
    await expect(card.getByRole('button', { name: /重置/ })).not.toBeVisible({ timeout: 10_000 })
  })

  await test.step('④ 强制卸载：再注入失败 → 强制卸载 2xx + toast + 回 installed', async () => {
    const out = probe('fail location')
    expect(out).toContain('injected')
    const refetchResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/list'), { timeout: 20_000 })
    await page.getByRole('button', { name: '刷新' }).click()
    await refetchResp
    const card = pluginCard(page, 'location')
    await expect(card.getByText('错误')).toBeVisible({ timeout: 10_000 })
    mark = apiHits.length
    const fuResp = page.waitForResponse((r) => r.url().includes('/api/adm/plugin/force_uninstall'), { timeout: 20_000 })
    await card.getByRole('button', { name: /强制卸载/ }).click()
    await expect(page.getByText('确认强制卸载插件')).toBeVisible()
    await dialogButton(page, '强制卸载').click()
    expect((await fuResp).status(), 'plugin/force_uninstall 必须 2xx').toBeLessThan(300)
    await expect(page.getByText('插件已强制卸载').first()).toBeVisible({ timeout: 3_000 })
    await shot(page, 'force-uninstall-toast')
    await expect(card.getByText('已安装')).toBeVisible({ timeout: 10_000 })
  })
})

test.afterAll(() => {
  // 门禁恢复默认关闭（W2R2 会话测后同款处理）
  try {
    console.log(`[probe] ${execSync('escript tests/auto_test/scripts/plugin_gate_probe.escript gate-off', { encoding: 'utf8' }).trim()}`)
  } catch { /* 后端不可达时不阻塞收尾 */ }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(`${EVIDENCE_DIR}/${RUN_ID}-api-hits.json`, JSON.stringify(apiHits, null, 2))
})
