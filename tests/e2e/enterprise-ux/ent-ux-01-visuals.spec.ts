/**
 * ENT-UX-01 补差视觉门：真实 Chromium 渲染 12 张截图 + 44px 触达测量。
 *
 * - 3 页面（/login、/organizations、/customer-service）× 2 视口
 *   （desktop 1280x800 / mobile 390x844）× 2 主题（light/dark）= 12 张；
 * - 每张截图前程序化断言无水平溢出（scrollingElement.scrollWidth <=
 *   viewport.width）；主题经 localStorage `imboy_admin_theme` + html.dark
 *   双通道注入（登录页无 ThemeToggle，init script 直接落 class）；
 * - 数据 API 全部 page.route fixture（UX 截图非集成门；登录态经
 *   zustand persist localStorage 模拟）；
 * - touch targets：枚举全部可见可交互元素（button/a/input/select/
 *   summary/[role=button]），getBoundingClientRect 实测宽高，>=44px 达标；
 * - 每个组合用全新 browser context（登录态/主题零交叉残留）。
 *
 * 输出目录：process.env.ENT_UX01_OUT_DIR（默认 test-results/ent-ux-01/）。
 */
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ORG_ID = '114022088375011328'
const ORG_ID2 = '114022088375011330'
const ORG_ID3 = '114022088375011344'
const WS_ID = '114022088375011329'

const OUT_DIR = process.env.ENT_UX01_OUT_DIR || 'test-results/ent-ux-01'
const PNG_DIR = path.join(OUT_DIR, 'screenshots')

const PAGES = [
  { id: 'login', path: '/login', ready: 'button[type="submit"]', withAuth: false },
  { id: 'orgs', path: '/organizations', ready: '[data-testid="org-create-entry"]', withAuth: true },
  { id: 'cs-home', path: '/customer-service', ready: '[data-page="customer-service-home"] button:has-text("添加客服坐席")', withAuth: true },
] as const

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'mobile', width: 390, height: 844 },
] as const

const THEMES = ['light', 'dark'] as const

function success(payload: unknown) {
  return { code: 0, msg: 'ok', payload }
}

async function fulfill(route: Route, payload: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(success(payload)) })
}

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** 数据 API fixture：权限/组织/坐席/登录元数据 + 兜底空信封。 */
async function mockAdmApi(page: Page) {
  await page.route('**/api/adm/**', async (route) => {
    const method = route.request().method()
    const pathName = new URL(route.request().url()).pathname.replace('/api/adm', '')
    if (method === 'POST') {
      await fulfill(route, {})
      return
    }
    switch (pathName) {
      case '/current':
        await fulfill(route, {
          id: '1', account: 'admin', nickname: 'Admin', avatar: null,
          status: 1, role_id: '1', role_ids: ['1'], created_at: '', updated_at: '',
        })
        return
      case '/rbac/me':
        await fulfill(route, {
          role_id: '1', role_ids: ['1'],
          permissions: ['organizations:read', 'organizations:write', 'customer_service:read', 'customer_service:write'],
          menu_paths: ['/organizations', '/customer-service'],
        })
        return
      case '/admin/config/sidebar':
        await fulfill(route, {
          items: [{
            label: '企业管理', icon: 'Building2', children: [
              { path: '/organizations', icon: 'Building2', label: '组织治理', roles: [1], permission: 'organizations:read' },
              { path: '/customer-service', icon: 'Headphones', label: '在线客服', roles: [1], permission: 'customer_service:read' },
            ],
          }],
          rbac: { roles: [{ id: 1, name: 'admin', description: '', permissions: ['organizations:read', 'organizations:write', 'customer_service:read', 'customer_service:write'] }] },
        })
        return
      case '/organizations':
        await fulfill(route, {
          list: [
            { id: ORG_ID, name: 'IMBoy 科技', owner_id: '7700487999999999999', owner_nickname: 'alice', owner_account: 'alice@imboy.pub', status: 'active', member_count: 12, workspace_count: 3, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
            { id: ORG_ID2, name: '星辰传媒', owner_id: '7700487999999999888', owner_nickname: 'bob', owner_account: 'bob@imboy.pub', status: 'archived', member_count: 4, workspace_count: 1, created_at: '2026-07-15T08:30:00Z', updated_at: '2026-08-20T09:00:00Z' },
            { id: ORG_ID3, name: '远山设计工作室', owner_id: '7700487999999999777', owner_nickname: 'carol', owner_account: 'carol@imboy.pub', status: 'active', member_count: 7, workspace_count: 2, created_at: '2026-09-02T14:20:00Z', updated_at: '2026-09-10T11:00:00Z' },
          ],
          page: 1, size: 10, total: 3, total_page: 1,
        })
        return
      case '/customer-service/seats':
        await fulfill(route, {
          seats: [
            { organization_id: ORG_ID, organization_name: 'IMBoy 科技', display_name: '客服小张', business_identity_id: '114022088375011401', function_key: 'customer_service', enabled: true, max_concurrent: 3, active_count: 1, workspace_id: WS_ID },
            { organization_id: ORG_ID, organization_name: 'IMBoy 科技', display_name: '客服小李', business_identity_id: '114022088375011402', function_key: 'customer_service', enabled: false, max_concurrent: 5, active_count: 0, workspace_id: WS_ID },
            { organization_id: ORG_ID3, organization_name: '远山设计工作室', display_name: null, business_identity_id: '114022088375011403', function_key: 'customer_service', enabled: true, max_concurrent: 2, active_count: 2, workspace_id: WS_ID },
          ],
          next_after_id: null,
        })
        return
      case '/passport/meta':
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(success({ csrf_token: 'fixture-csrf', public_key: 'fixture-public-key', system_name: 'IMBoy 管理后台' })) })
        return
      case '/setup/status':
        await fulfill(route, { initialized: true })
        return
      default:
        if (pathName.startsWith('/passport/captcha')) {
          await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG })
          return
        }
        await fulfill(route, {})
    }
  })
  await page.route('**/brand', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', payload: {} }) })
  })
}

/** 登录态（zustand persist）+ 主题（localStorage + html.dark）双通道注入。
 *  init script 运行时 documentElement 可能尚未解析（登录页无 ThemeToggle，
 *  useTheme 不会补救），故 class 落地延迟到 DOM 可用时刻。 */
async function initState(context: BrowserContext, theme: string, withAuth: boolean) {
  await context.addInitScript(({ theme, withAuth }) => {
    const isDark = theme === 'dark'
    window.localStorage.setItem('imboy_admin_theme', theme)
    const applyDarkClass = () => {
      document.documentElement.classList.toggle('dark', isDark)
    }
    if (document.documentElement) {
      applyDarkClass()
    } else {
      document.addEventListener('readystatechange', () => {
        if (document.documentElement) applyDarkClass()
      })
    }
    if (withAuth) {
      window.localStorage.setItem('imboy-admin-auth', JSON.stringify({
        state: {
          admin: {
            id: '1', account: 'admin', nickname: 'Admin', avatar: null, role_id: '1',
            login_count: 0, last_login_ip: '', last_login_at: '', status: 1, created_at: '',
          },
          isAuthenticated: true,
        },
        version: 0,
      }))
    }
  }, { theme, withAuth })
}

/** 单组合（页面 × 视口 × 主题）全新 context：零交叉残留。 */
async function openPage(browser: import('@playwright/test').Browser, target: (typeof PAGES)[number], vp: (typeof VIEWPORTS)[number], theme: string) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  await initState(context, theme, target.withAuth)
  const page = await context.newPage()
  await mockAdmApi(page)
  await page.goto(target.path)
  await page.waitForSelector(target.ready, { timeout: 15_000 })
  await page.waitForTimeout(600)
  return { context, page }
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement
    return el ? el.scrollWidth - el.clientWidth : 0
  })
  expect(overflow, `${label} 出现水平溢出`).toBeLessThanOrEqual(0)
}

/** 主题真实生效断言：html.dark class + --background 变量换挡（含无
 *  ThemeToggle 的登录页——init script 直落 class，CSS 变量随之切换）。 */
async function assertThemeApplied(page: Page, theme: string, label: string) {
  const state = await page.evaluate(() => ({
    hasDarkClass: document.documentElement.classList.contains('dark'),
    background: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
  }))
  if (theme === 'dark') {
    expect(state.hasDarkClass, `${label} html.dark 未生效`).toBe(true)
    expect(state.background, `${label} --background 未换挡`).toContain('4.9%')
  } else {
    expect(state.hasDarkClass, `${label} 不应残留 dark class`).toBe(false)
    expect(state.background, `${label} --background 应为浅色基线`).toContain('100%')
  }
}

test.describe('ENT-UX-01 visuals', () => {
  test('3 页面 × 2 视口 × 2 主题 = 12 张截图（零水平溢出）', async ({ browser }) => {
    mkdirSync(PNG_DIR, { recursive: true })
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        for (const target of PAGES) {
          const { context, page } = await openPage(browser, target, vp, theme)
          const label = `${target.id}-${vp.id}-${theme}`
          await assertNoHorizontalOverflow(page, label)
          await assertThemeApplied(page, theme, label)
          await page.screenshot({ path: path.join(PNG_DIR, `${label}.png`), fullPage: true })
          await context.close()
        }
      }
    }
  })
})

type TargetRow = {
  page: string
  viewport: string
  description: string
  selector: string
  width: number
  height: number
  pass: boolean
}

test.describe('ENT-UX-01 touch targets', () => {
  test('可交互元素 getBoundingClientRect 实测 >=44px', async ({ browser }) => {
    const rows: TargetRow[] = []
    for (const vp of VIEWPORTS) {
      for (const target of PAGES) {
        const { context, page } = await openPage(browser, target, vp, 'light')
        const measured = await page.$$eval(
          'button, a, input, select, summary, [role="button"]',
          (nodes) =>
            nodes
              .filter((node) => {
                const style = window.getComputedStyle(node)
                if (style.display === 'none' || style.visibility === 'hidden') return false
                const rect = node.getBoundingClientRect()
                return rect.width > 0 && rect.height > 0
              })
              .map((node) => {
                const el = node as HTMLElement
                const rect = el.getBoundingClientRect()
                const describe =
                  el.getAttribute('aria-label') ||
                  el.getAttribute('data-testid') ||
                  el.getAttribute('placeholder') ||
                  (el.textContent || '').trim().slice(0, 24) ||
                  el.tagName.toLowerCase()
                const selector = [
                  el.tagName.toLowerCase(),
                  el.id ? `#${el.id}` : '',
                  el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : '',
                ].join('')
                return {
                  description: describe,
                  selector,
                  width: Math.round(rect.width * 100) / 100,
                  height: Math.round(rect.height * 100) / 100,
                }
              })
        )
        for (const m of measured) {
          rows.push({
            page: target.id,
            viewport: vp.id,
            description: m.description,
            selector: m.selector,
            width: m.width,
            height: m.height,
            pass: m.width >= 44 && m.height >= 44,
          })
        }
        await context.close()
      }
    }
    const failures = rows.filter((row) => !row.pass)
    writeFileSync(path.join(OUT_DIR, 'touch_targets.json'), JSON.stringify({
      threshold: 44,
      total: rows.length,
      passed: rows.length - failures.length,
      failed: failures.length,
      rows,
    }, null, 2))
    expect(
      failures,
      `触达不达标元素 ${failures.length} 个：\n${failures.map((f) => `${f.page}/${f.viewport} ${f.selector} (${f.description}) ${f.width}x${f.height}`).join('\n')}`
    ).toEqual([])
  })
})
