/**
 * ENT-INT-01（M3 Enterprise UX 真实浏览器门）：J-ENT-01/02。
 *
 * 真实拓扑（零 mock route）：
 *   - admin dev :8906（vite proxy → 真实 Cowboy :19802，imboy integration 候选）；
 *   - 平台 admin 会话（adm_user_id + adm_user_sig cookie——adm_session_ds
 *     生产同款签发，种子 escript 直种 role 1 super_admin）；
 *   - 数据族（部门树/企业群/个人群/企业频道）直种 scratch PG。
 *
 * 覆盖：
 *   J-ENT-01 组织列表/详情/成员/部门——真实 Backend filter 数据渲染；
 *   J-ENT-02 企业群/频道——preset=enterprise 服务端强制 scope=workspace：
 *     企业群可见、个人群零可见（URL 等价与权限由服务端谓词裁决）。
 *   J-ENT-03/04（Flutter 真机）进 DEVICE-01/02，本门不冒充。
 */
import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:8906'
const ORG1 = process.env.ENTINT01_ORG1 ?? ''

const GROUP_ENT = 'ENTINT01 EnterpriseGroup'
const GROUP_PERSONAL = 'ENTINT01 PersonalGroup'
const CHANNEL = 'ENTINT01 EnterpriseChannel'

// 种子签发的平台 admin 会话（role 1 super_admin；scratch 合成身份）。
// 种子会话经环境注入（ENTINT01_*，见 RUN evidence/ENT-INT-01/internal/seed2.env；
// scratch 合成 super_admin，生产同款 adm_session_ds 签发——仓库零凭据）。
const ADM_COOKIES = [
  { name: 'adm_user_id', value: process.env.ENTINT01_ADM_ID ?? '' },
  { name: 'adm_user_sig', value: process.env.ENTINT01_ADM_SIG ?? '' },
]

test.use({ baseURL: BASE })

test.beforeEach(async ({ context }) => {
  await context.addCookies(
    ADM_COOKIES.map((c) => ({
      ...c,
      domain: '127.0.0.1',
      path: '/',
    })),
  )
})

test.describe('ENT-INT-01 real backend enterprise gate (J-ENT-01/02)', () => {
  test('J-ENT-01a 组织列表与详情（真实 filter 数据）', async ({ page }) => {
    await page.goto('/organizations')
    // 列表真实渲染两个 int02 种子组织。
    await expect(page.getByText(/int02-org1-/).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/int02-org2-/).first()).toBeVisible()
    // URL 等价：直达详情路由（refresh 语义）渲染同一组织事实。
    await page.goto(`/organizations/${ORG1}`)
    await expect(page.getByText(/int02-org1-/).first()).toBeVisible({ timeout: 30_000 })
  })

  test('J-ENT-01b 成员与部门页（真实成员/部门树渲染）', async ({ page }) => {
    await page.goto(`/organizations/${ORG1}/members`)
    // org1 成员：owner O + A + B（int02 种子；account int02-<uid>）。
    await expect(page.getByText(/int02-94213488575060/).first()).toBeVisible({ timeout: 30_000 })
    await page.goto(`/organizations/${ORG1}/departments`)
    // 部门树两级（产品部/工程部/前端组——种子直种）。
    await expect(page.getByText('产品部').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('工程部').first()).toBeVisible()
    await expect(page.getByText('前端组').first()).toBeVisible()
  })

  test('J-ENT-02a 企业群过滤：企业群可见、个人群服务端零可见', async ({ page }) => {
    await page.goto('/groups?preset=enterprise')
    await expect(page.getByText(GROUP_ENT).first()).toBeVisible({ timeout: 30_000 })
    // adm_enterprise_filter 恒定强制 scope='workspace'——个人群（无
    // workspace）不存在客户端隐藏之外的可见路径。
    await expect(page.getByText(GROUP_PERSONAL)).toHaveCount(0)
  })

  test('J-ENT-02b 企业频道页（真实频道渲染 + URL 等价）', async ({ page }) => {
    await page.goto('/channels?preset=enterprise')
    await expect(page.getByText(CHANNEL).first()).toBeVisible({ timeout: 30_000 })
    // URL 等价：preset 与非 preset 均由服务端谓词裁决（同一频道事实）。
    await page.goto('/channels')
    await expect(page.getByText(CHANNEL).first()).toBeVisible({ timeout: 30_000 })
  })

  test('负例：无 admin 会话的页面请求走登录门（API fail-closed）', async ({ browser }) => {
    const anon = await browser.newContext({ baseURL: BASE })
    const page = await anon.newPage()
    const api = await page.request.get('/api/adm/organizations?page=1&limit=2')
    expect([401, 403]).toContain(api.status())
    await anon.close()
  })
})
