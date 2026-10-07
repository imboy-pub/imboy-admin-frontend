import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * AC15-ADM-03（EWS-09 口径）—— 企业业务页「附件内容」Tab 专项操作 E2E。
 *
 * EO06-ADMIN-ASSET-PAGES 唯一 PENDING 格的浏览器面收敛：此前仅有 Tab 渲染
 * smoke（enterprise-business.spec.ts 断言输入框可见），授权代理获取的成功/
 * 失败/跨 org/readonly 门从未在真实后端上执行。按现行合同（CS-03）覆盖：
 *
 *   EWS-09-A01 必填门：asset_id / actor_user_id 任一为空 → 零 asset 请求；
 *   EWS-09-A02 成功获取：seed 的真实附件 → meta（Content-Type/字节数）+
 *      blob 下载链接；CS-03-A05 泄漏门（页面源不出现存储地址/object key）；
 *   EWS-09-A03 不存在的 asset_id → 服务端拒绝信封 → ErrorState + 重试入口；
 *   EWS-09-A04 跨 org 附件（OrgB 的 asset 行 + OrgA scope）→ 404/403 拒绝
 *      （服务端谓词裁决，不渲染 meta）；
 *   EWS-09-A05 readonly 账号（无 enterprise_business:read）→「无查看权限」
 *      空态，附件 Tab 不可达。
 *
 * 运行前提（Q12 全量门 / 自建环境时注入，缺失即 skip 而非假绿）：
 *   - imboy 后端实例（隔离库）+ Admin dev server；
 *   - IMBOY_ADMIN_E2E_ACCOUNT / _PASSWORD（有读权限账号）；
 *   - IMBOY_ADMIN_E2E_EADM_ORG_ID / _WS_ID（seed 脚本落库的 org/ws 对）；
 *   - IMBOY_ADMIN_E2E_EB_ASSET_ID（OrgA 内 seed 的 enterprise_asset 行 id，
 *     且该附件在 Garage 有真实对象字节——授权代理流式端点取回真实内容）；
 *   - IMBOY_ADMIN_E2E_EB_ASSET_ACTOR（本 Org 的 Owner/Admin 责任人 user TSID，
 *     后端 ACL 判据）；
 *   - IMBOY_ADMIN_E2E_EB_ASSET_FOREIGN_ID（OrgB 内 seed 的附件行 id——跨 org
 *     负例用）；
 *   - IMBOY_ADMIN_E2E_READONLY_ACCOUNT / _PASSWORD（无 enterprise_business:read
 *     的只读账号）。
 */
const SCOPE_ORG = process.env.IMBOY_ADMIN_E2E_EADM_ORG_ID?.trim() || ''
const SCOPE_WS = process.env.IMBOY_ADMIN_E2E_EADM_WS_ID?.trim() || ''
const ASSET_ID = process.env.IMBOY_ADMIN_E2E_EB_ASSET_ID?.trim() || ''
const ASSET_ACTOR = process.env.IMBOY_ADMIN_E2E_EB_ASSET_ACTOR?.trim() || ''
const ASSET_FOREIGN_ID = process.env.IMBOY_ADMIN_E2E_EB_ASSET_FOREIGN_ID?.trim() || ''
const READONLY_ACCOUNT = process.env.IMBOY_ADMIN_E2E_READONLY_ACCOUNT?.trim() || ''
const READONLY_PASSWORD = process.env.IMBOY_ADMIN_E2E_READONLY_PASSWORD?.trim() || ''

function haveSeedFixture(): boolean {
  return SCOPE_ORG !== '' && SCOPE_WS !== '' && ASSET_ID !== '' && ASSET_ACTOR !== ''
}

/** 打开附件 Tab（scope 就绪后），返回附件卡片 locator。 */
async function openAssetsTab(page: import('@playwright/test').Page) {
  await page.goto(`/enterprise-business?org=${SCOPE_ORG}&ws=${SCOPE_WS}`)
  const probe = page.getByTestId('eb-scope-troubleshooting')
  await expect(probe).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: '附件内容' }).click()
  const card = page.getByTestId('eb-assets')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('附件 ID（asset_id）')).toBeVisible()
  return card
}

test.describe('AC15-ADM-03 企业业务资产页专项（EWS-09）', () => {
  test('EWS-09-A01 必填门：asset_id / actor_user_id 任一为空 → 零 asset 请求', async ({ page }) => {
    test.skip(!haveSeedFixture(), '缺 seed fixture（scope/asset/actor 由 seed 脚本提供）')
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    const card = await openAssetsTab(page)

    // 监听 asset content 请求：本用例内必须零发出。
    let assetRequests = 0
    page.on('request', (req) => {
      if (/\/assets\/.+\/content/.test(req.url())) assetRequests += 1
    })

    await expect(page.getByText('尚未获取附件').first()).toBeVisible()
    // 两个输入框均为空 → 点获取。
    await page.getByRole('button', { name: /获取内容/ }).click()
    // toast 报错（sonner live 区域），页面停留空态且零请求。
    await expect(page.getByText('尚未获取附件').first()).toBeVisible()
    // 只填 asset_id 仍拒绝（actor_user_id 是后端 ACL 必填判据）。
    await page.getByLabel('附件 ID（asset_id）').fill(ASSET_ID)
    await page.getByRole('button', { name: /获取内容/ }).click()
    await expect(page.getByText('尚未获取附件').first()).toBeVisible()
    await page.waitForTimeout(500)
    expect(assetRequests, '必填缺失时不得发出任何 asset content 请求').toBe(0)
    expect(await card.textContent()).not.toContain('附件获取失败')
  })

  test('EWS-09-A02 成功获取：meta + blob 下载链接；页面无存储地址/object key 泄漏', async ({ page }) => {
    test.skip(!haveSeedFixture(), '缺 seed fixture（scope/asset/actor 由 seed 脚本提供）')
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    await openAssetsTab(page)

    await page.getByLabel('附件 ID（asset_id）').fill(ASSET_ID)
    await page.getByLabel(/责任人 user ID/).fill(ASSET_ACTOR)
    await page.getByRole('button', { name: /获取内容/ }).click()

    const meta = page.getByTestId('eb-asset-meta')
    await expect(meta).toBeVisible({ timeout: 30_000 })
    // 真实内容到达：字节数与 Content-Type 均来自真实响应（形态断言，不锁 seed 字面量）。
    await expect(meta).toContainText(/字节/)
    const download = page.getByTestId('eb-asset-download')
    await expect(download).toBeVisible()
    // 下载链接 = 内存副本（blob: URL），不是任何存储 URL。
    await expect(download).toHaveAttribute('href', /^blob:/)
    // CS-03-A05 泄漏门（页面源级）：成功态不出现存储地址/object key/签名串。
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/object[_-]?key|presign|access[_-]?key|[?&]signature=/i)
    const html = await page.content()
    expect(html).not.toMatch(/s3[._-]|garage[_-]?\d|storage\.imboy|\/ AttachDirect\//i)
  })

  test('EWS-09-A03 不存在的 asset_id：服务端拒绝 → ErrorState + 重试入口', async ({ page }) => {
    test.skip(!haveSeedFixture(), '缺 seed fixture（scope/asset/actor 由 seed 脚本提供）')
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    await openAssetsTab(page)

    // 合成一个不存在但形态合法的 TSID（seed 不会种到的远端区间）。
    const missingId = '799999999999999999'
    await page.getByLabel('附件 ID（asset_id）').fill(missingId)
    await page.getByLabel(/责任人 user ID/).fill(ASSET_ACTOR)
    await page.getByRole('button', { name: /获取内容/ }).click()

    await expect(page.getByText(/附件获取失败/).first()).toBeVisible({ timeout: 30_000 })
    // 失败态不渲染半截 meta。
    await expect(page.getByTestId('eb-asset-meta')).toHaveCount(0)
    // 重试入口存在（可解释恢复路径）。
    await expect(page.getByRole('button', { name: /重试/ }).first()).toBeVisible()
  })

  test('EWS-09-A04 跨 org 附件：OrgB 的 asset 行在 OrgA scope 下被服务端拒绝', async ({ page }) => {
    test.skip(!haveSeedFixture() || ASSET_FOREIGN_ID === '', '缺 seed fixture（含 OrgB 外来附件行）')
    const credentials = requireAdminCredentials()
    await loginAsAdmin(page, credentials)
    await openAssetsTab(page)

    await page.getByLabel('附件 ID（asset_id）').fill(ASSET_FOREIGN_ID)
    await page.getByLabel(/责任人 user ID/).fill(ASSET_ACTOR)
    await page.getByRole('button', { name: /获取内容/ }).click()

    // 服务端按 org 谓词裁决：非本 org 附件同 not_found（不渲染 meta、不出现内容）。
    await expect(page.getByText(/附件获取失败/).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('eb-asset-meta')).toHaveCount(0)
  })

  test('EWS-09-A05 readonly 账号：无 enterprise_business:read → 资产 Tab 不可达', async ({ page }) => {
    test.skip(READONLY_ACCOUNT === '' || READONLY_PASSWORD === '', '缺 readonly 账号（IMBOY_ADMIN_E2E_READONLY_ACCOUNT / _PASSWORD）')
    await loginAsAdmin(page, { account: READONLY_ACCOUNT, password: READONLY_PASSWORD })

    await page.goto('/enterprise-business')
    const pageRoot = page.locator('[data-page="enterprise-business-readonly"]')
    await expect(pageRoot).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('无查看权限').first()).toBeVisible()
    // 附件 Tab（乃至整个 Tabs 面）不可达：无 tab 控件、无 asset 卡片。
    await expect(page.getByRole('tab', { name: '附件内容' })).toHaveCount(0)
    await expect(page.getByTestId('eb-assets')).toHaveCount(0)
  })
})
