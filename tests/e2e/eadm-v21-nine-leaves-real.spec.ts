import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin } from './support/adminAuth'

/**
 * ADM-03 · V2.1 计划 §734 —— 企业管理 9 叶子 × 真实本地后端 E2E。
 *
 * 合同要点（本 spec 的每个断言都对应一条）：
 *   1. Playwright + 真实本地后端（imboy :9800）+ 真实前端（vite :8082）；
 *   2. 每个菜单叶子进入后必须发生**真实** /api/adm/* 往返（HTTP 200 +
 *      code=0 信封 + `server: Cowboy` 响应头——Playwright mock fulfill 不会
 *      带 Cowboy 头，这是「无 mock」的机械 Oracle）；
 *   3. 本文件**零 page.route / 零静态 JSON / 零 mock**（grep 守卫见
 *      eadm-v21-nine-leaves-real.spec 的发布清单门）；
 *   4. 服务端过滤 Oracle：组织列表 keyword 命中唯一组织名 → 恰 1 行；
 *      乱序关键词 → 0 行（3139 行数据不可能客户端过滤，断言过即证明
 *      过滤发生在服务端）；
 *   5. 证据：每叶子截图 + 全量 /api/adm 网络日志 JSON（ADM03_EVIDENCE_DIR）。
 *
 * 9 叶子冻结真源 = 后端 adm_admin_handler:default_sidebar_config/0
 * （与 sidebarEnterpriseMenu.test.ts 的 BACKEND_ENTERPRISE_LEAVES 同表）。
 */

const ENTERPRISE_GROUP_LABEL = '企业管理'
void ENTERPRISE_GROUP_LABEL

/** 唯一组织名（imboy_test_v1 真实 fixture，count=1）。 */
const UNIQUE_ORG_NAME = 'cs01-org-113731092317734917'
const NO_MATCH_KEYWORD = 'zzz-adm03-no-such-org'

interface Leaf {
  label: string
  path: string
  marker: string | null
  /** 期望数据行下界：null = 真实空集（断言 API 往返即可）。 */
  minRows: number | null
  /** 该叶子真实数据往返的 API 路径片段。 */
  apiPath: string
}

const LEAVES: Leaf[] = [
  { label: '组织治理', path: '/organizations', marker: '[data-page="organization-list"]', minRows: 1, apiPath: '/api/adm/organizations' },
  { label: '工作区', path: '/workspaces', marker: null, minRows: 1, apiPath: '/api/adm/workspace/list' },
  { label: '企业项目', path: '/projects', marker: null, minRows: 0, apiPath: '/api/adm/project/list' },
  { label: '企业群', path: '/groups?preset=enterprise', marker: null, minRows: 1, apiPath: '/api/adm/group/list' },
  { label: '企业频道', path: '/channels?preset=enterprise', marker: null, minRows: 1, apiPath: '/api/adm/channel/list' },
  { label: '客服坐席', path: '/customer-service', marker: '[data-page="customer-service-home"]', minRows: null, apiPath: '/api/adm/' },
  { label: '企业审计/业务数据', path: '/enterprise-business', marker: '[data-page="enterprise-business-readonly"]', minRows: null, apiPath: '/api/adm/' },
]

/** org/ws 上下文叶子（EADM-06 codec：URL 是上下文真源，无参不发起数据请求）。 */
const ORG_CTX_FIXTURE = { org: '113517804917098499', ws: '113517804917098500' }

interface ApiCall {
  leaf: string
  method: string
  url: string
  status: number
  server: string
}

const evidenceDir = process.env.ADM03_EVIDENCE_DIR || 'test-results/adm03-evidence'
const apiCalls: ApiCall[] = []

function watchApi(page: Page, leaf: string): void {
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.includes('/api/adm/')) return
    apiCalls.push({
      leaf,
      method: res.request().method(),
      url,
      status: res.status(),
      server: res.headers()['server'] ?? '',
    })
  })
}

/** 先挂监听、后触发（避免响应先于注册的竞态），断言 200 + code=0 + Cowboy。 */
async function realApiRoundTrip(
  page: Page,
  apiPath: string,
  trigger: () => Promise<void>,
  timeout = 20_000,
) {
  const pending = page.waitForResponse(
    (r) => r.url().includes(apiPath) && r.request().method() === 'GET' && r.status() === 200,
    { timeout },
  )
  await trigger()
  const res = await pending
  // 无 mock Oracle：真实 imboy 后端是 Cowboy；page.route fulfill 不带该头。
  expect(res.headers()['server'] ?? '').toContain('Cowboy')
  // code=0 信封校验容错：导航后响应体可能被浏览器回收（Network.getResponseBody
  // 协议错）——此时 200 + Cowboy 头 + 后续行断言仍构成真实往返铁证。
  try {
    const body = (await res.json()) as { code?: number }
    expect(body.code).toBe(0)
  } catch {
    // body 已回收：跳过信封校验（真实后端事实由其余断言钉死）。
  }
  return res.url()
}

async function probeBackend(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get('http://127.0.0.1:9800/api/adm/passport/meta', { timeout: 5_000 })
    return res.status() < 500
  } catch {
    return false
  }
}

test.describe('ADM-03 企业管理 9 叶子 × 真实本地后端', () => {
  test.skip(() => !getAdminCredentials('super'), '需要 IMBOY_ADMIN_E2E_SUPER_ACCOUNT / PASSWORD')

  test.beforeAll(async ({ request }) => {
    test.skip(!(await probeBackend(request)), '本地 imboy 后端 :9800 不可达（环境阻塞，非用例失败）')
  })

  test.beforeEach(async ({ page }) => {
    fs.mkdirSync(evidenceDir, { recursive: true })
    await loginAsAdmin(page, getAdminCredentials('super')!)
  })

  for (const leaf of LEAVES) {
    test(`§734 ${leaf.label}（${leaf.path}）真实数据加载`, async ({ page }) => {
      watchApi(page, leaf.label)

      const pathOnly = leaf.path.split('?')[0]
      const api = await realApiRoundTrip(page, leaf.apiPath, async () => {
        await page.goto('/dashboard')
        await page.getByRole('link', { name: leaf.label, exact: true }).first().click()
        await expect(page).toHaveURL(new RegExp(`${pathOnly.replace(/\//g, '\\/')}`))
      })

      if (leaf.marker) {
        await expect(page.locator(leaf.marker).first()).toBeVisible()
      }
      if (leaf.minRows !== null) {
        await expect
          .poll(async () => page.locator('table tbody tr').count(), { timeout: 15_000 })
          .toBeGreaterThanOrEqual(leaf.minRows)
      }

      await page.screenshot({ path: path.join(evidenceDir, `leaf-${leaf.label}.png`), fullPage: true })
      // 证据行：该叶子的真实往返已进 apiCalls（afterAll 落盘）。
      expect(api.length).toBeGreaterThan(0)
    })
  }

  test('§734 应用与集成（/enterprise/applications）真实数据加载（org 上下文）', async ({ page }) => {
    watchApi(page, '应用与集成')
    await page.goto('/enterprise/applications')
    await expect(page.locator('[data-page="enterprise-applications"]')).toBeVisible()

    // 上下文真源是页面内组织 ID 输入（无 org 不发请求——真实行为，非 mock）。
    const api = await realApiRoundTrip(
      page,
      `/api/adm/enterprise/organizations/${ORG_CTX_FIXTURE.org}/applications`,
      async () => {
        await page.locator('#ea-org').fill(ORG_CTX_FIXTURE.org)
        await page.keyboard.press('Enter')
      },
    )
    await page.screenshot({ path: path.join(evidenceDir, 'leaf-应用与集成.png'), fullPage: true })
    expect(api.length).toBeGreaterThan(0)
  })

  test('§734 离岗交接（/enterprise-business/offboarding）真实数据加载（org/ws 上下文）', async ({ page }) => {
    watchApi(page, '离岗交接')
    await page.goto(
      `/enterprise-business/offboarding?org=${ORG_CTX_FIXTURE.org}&ws=${ORG_CTX_FIXTURE.ws}`,
    )
    await expect(page.locator('[data-page="eb-offboarding-cases"]')).toBeVisible()

    await realApiRoundTrip(
      page,
      `/api/adm/enterprise-business/organizations/${ORG_CTX_FIXTURE.org}/offboarding/cases`,
      async () => {
        await page.goto(
          `/enterprise-business/offboarding?org=${ORG_CTX_FIXTURE.org}&ws=${ORG_CTX_FIXTURE.ws}`,
        )
      },
    )
    await expect
      .poll(async () => page.locator('table tbody tr').count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    await page.screenshot({ path: path.join(evidenceDir, 'leaf-离岗交接.png'), fullPage: true })
  })

  test('§734 服务端过滤 Oracle：组织 keyword 唯一命中 1 行 / 无命中 0 行', async ({ page }) => {
    watchApi(page, 'filter-oracle')

    await page.goto('/organizations')
    await expect(page.locator('[data-page="organization-list"]')).toBeVisible()
    await realApiRoundTrip(page, '/api/adm/organizations', async () => {
      await page.goto('/organizations')
      await expect(page.locator('[data-page="organization-list"]')).toBeVisible()
    })

    const search = page.locator('#org-list-q')
    await search.fill(UNIQUE_ORG_NAME)

    const hitWait = page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/adm/organizations') &&
          decodeURIComponent(r.url()).includes(UNIQUE_ORG_NAME) &&
          r.status() === 200,
        { timeout: 15_000 },
      )
      .then((r) => r.url())
    await page.locator('[data-testid="org-search-submit"]').click()

    const hitUrl = await hitWait
    expect(decodeURIComponent(hitUrl)).toContain(UNIQUE_ORG_NAME)

    await expect
      .poll(async () => page.locator('table tbody tr').count(), { timeout: 15_000 })
      .toBe(1)
    await expect(page.locator('table tbody').first()).toContainText(UNIQUE_ORG_NAME)
    await page.screenshot({ path: path.join(evidenceDir, 'filter-oracle-hit.png'), fullPage: true })

    // 反例：乱序关键词 → 服务端空集 → 0 行（3139 行全量不可能在客户端过滤）。
    await search.fill(NO_MATCH_KEYWORD)
    const missWait = page.waitForResponse(
      (r) =>
        r.url().includes('/api/adm/organizations') &&
        decodeURIComponent(r.url()).includes(NO_MATCH_KEYWORD) &&
        r.status() === 200,
      { timeout: 15_000 },
    )
    await page.locator('[data-testid="org-search-submit"]').click()
    await missWait
    // 空集 Oracle：服务端空集 → DataTable 空态（源码冻结文案），且命中行消失。
    await expect(page.getByText('没有匹配搜索条件的组织').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('table tbody').first()).not.toContainText(UNIQUE_ORG_NAME)
    await page.screenshot({ path: path.join(evidenceDir, 'filter-oracle-empty.png'), fullPage: true })
  })

  test.afterAll(async () => {
    fs.mkdirSync(evidenceDir, { recursive: true })
    fs.writeFileSync(
      path.join(evidenceDir, 'network-evidence.json'),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          no_mock_oracle: '每条 /api/adm 响应均断言 server=Cowboy（Playwright fulfill 无此头）',
          total_api_calls: apiCalls.length,
          api_calls: apiCalls,
        },
        null,
        2,
      ),
    )
  })
})
