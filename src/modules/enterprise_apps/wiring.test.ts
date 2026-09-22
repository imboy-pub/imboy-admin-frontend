/**
 * FULL-04 接线断言（源码级）：路由 / 侧边栏 / 模块边界 / 认证域边界。
 *
 * 钉住的四件事：
 *  1. 三个新前端路由都挂在 `PermissionRoute`（`enterprise_business:read`）之下，
 *     且 App.tsx 只从模块 barrel 导入（不穿透模块内部）；
 *  2. 侧边栏入口与路由同权限族（UI 可见性 ≠ 安全，但两者不得互相矛盾）；
 *  3. 模块内不出现 OA/Application 凭证族字面量（`ib_int_` / `application_credential`），
 *     即「不把 OA Credential / internal 面的权限转移到 Admin」；
 *  4. 模块 barrel 导出三个页面（App.tsx 的 lazy 导入目标存在）。
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..', '..')
const MODULE_ROOT = join(SRC, 'modules', 'enterprise_apps')

function read(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8')
}

/**
 * 列模块源码（**排除测试文件**）：扫描对象是交付代码，扫描文件自身
 * 必然包含被禁字面量（它就是断言这些字面量的代码）。
 */
function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full))
      continue
    }
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

const APP_ROUTES = [
  { path: '/enterprise/applications', component: 'EnterpriseApplicationsPage' },
  { path: '/enterprise/applications/:id', component: 'EnterpriseApplicationDetailPage' },
  { path: '/enterprise/applications/:id/deliveries', component: 'EnterpriseDeliveriesPage' },
] as const

describe('FULL-04 路由接线', () => {
  const app = read('App.tsx')

  it('三个路由都在册，路径逐字冻结', () => {
    for (const route of APP_ROUTES) {
      expect(app).toContain(`path="${route.path}"`)
    }
  })

  it('每个路由都由 PermissionRoute 包裹，且权限为 enterprise_business:read + roles [1,2]', () => {
    for (const route of APP_ROUTES) {
      const block = app.slice(app.indexOf(`path="${route.path}"`))
      const elementStart = block.indexOf('element={(')
      // 窗口取到该 Route 的闭合（`/>` 会先被自闭合的组件标签命中，故取足够长的窗口）
      const element = block.slice(elementStart, elementStart + 400)
      expect(element).toContain('PermissionRoute')
      expect(element).toContain('permission="enterprise_business:read"')
      expect(element).toContain("roles={['1', '2']}")
      expect(element).toContain(`<${route.component} />`)
      // 受保护路由必须在 ProtectedRoute 段内（Admin Cookie 会话），而非 /login 等免鉴权段
      expect(app.indexOf('path="/enterprise/applications"')).toBeGreaterThan(app.indexOf('<ProtectedRoute />'))
    }
  })

  it('App.tsx 只从模块 barrel 导入（不穿透 @/modules/enterprise_apps/*）', () => {
    expect(app).toContain("import('@/modules/enterprise_apps')")
    expect(app).not.toContain('@/modules/enterprise_apps/')
  })

  it('模块 barrel 导出三个页面（lazy 导入目标存在）', () => {
    const barrel = read('modules/enterprise_apps/public.ts')
    for (const route of APP_ROUTES) {
      expect(barrel).toContain(route.component)
    }
    expect(barrel).toContain("export * from './api'")
  })

  it('侧边栏入口与路由同权限族（roles 1/2 + enterprise_business:read）', () => {
    const sidebar = read('components/layout/sidebarSchema.ts')
    const line = sidebar
      .split('\n')
      .find((row) => row.includes("path: '/enterprise/applications'"))
    expect(line).toBeDefined()
    expect(line!).toContain("permission: 'enterprise_business:read'")
    expect(line!).toContain("roles: ['1', '2']")
    // 图标必须在 iconMap 中登记（否则侧边栏渲染为占位）
    expect(line!).toContain("icon: 'ShieldCheck'")
    expect(sidebar).toContain('ShieldCheck,')
  })
})

describe('FULL-04 认证域边界（Admin 不接管 OA/Application 凭证）', () => {
  const moduleFiles = listSourceFiles(MODULE_ROOT)

  it('模块内不持有任何 Application Credential 实材（只允许 `ib_int_****` 脱敏占位）', () => {
    const offenders: string[] = []
    for (const path of moduleFiles) {
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // `ib_int_` 只允许紧跟 `*`（脱敏占位）；出现真实 id/secret 即违规
      if (/ib_int_(?!\*)/.test(code)) offenders.push(`${path.split('/').pop()}: ib_int_<real>`)
      if (code.includes('application_credential')) offenders.push(`${path.split('/').pop()}: application_credential`)
      if (code.includes('allowed_prefix')) offenders.push(`${path.split('/').pop()}: allowed_prefix`)
    }
    expect(offenders).toEqual([])
  })

  it('模块内不出现 /api/open/v1（永久边界）', () => {
    for (const path of moduleFiles) {
      expect(readFileSync(path, 'utf8')).not.toContain('open/v1')
    }
  })

  it('模块不引入 OA/Seat 认证域（只走既有 Admin client）', () => {
    for (const path of moduleFiles) {
      const code = readFileSync(path, 'utf8')
      expect(code).not.toContain('seatAuthStore')
      expect(code).not.toContain('OaAuth')
      expect(code).not.toContain('oaBridge')
    }
  })

  it('所有 API 调用都走 services/api/client（唯一 Admin 会话客户端）', () => {
    const service = readFileSync(join(MODULE_ROOT, 'api', 'public.ts'), 'utf8')
    expect(service).toContain("import client from '@/services/api/client'")
    for (const path of moduleFiles) {
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(code).not.toContain('axios.create')
      // 词边界：避免误伤 `query.refetch()`（含 `fetch(` 子串）
      expect(/(^|[^A-Za-z0-9_.])fetch\s*\(/.test(code)).toBe(false)
      expect(code).not.toContain('XMLHttpRequest')
    }
  })
})
