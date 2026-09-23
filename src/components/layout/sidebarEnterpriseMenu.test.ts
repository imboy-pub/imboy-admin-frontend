/**
 * EADM-03：企业管理菜单的 presentation / route mapping 守护。
 * 仅断言合同 C1 的冻结事实，不依赖远端配置；远端配置下发时走 Sidebar 运行时合并。
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defaultConfig, iconMap, type SidebarMenuItem } from './sidebarSchema'

// 后端 adm_admin_handler:default_sidebar_config/0 权威声明（C1 冻结表）
const BACKEND_ENTERPRISE_LEAVES: Array<{
  path: string
  label: string
  permission: string
  roles: number[]
  icon: string
}> = [
  // §13.1 目标菜单（9 叶子）；企业群/企业频道 path 携带 preset=enterprise
  //（仅 UI 状态；服务端 adm_enterprise_filter 强制 scope=workspace）。
  { path: '/organizations', label: '组织治理', permission: 'organizations:read', roles: [1, 2, 3], icon: 'Building2' },
  { path: '/workspaces', label: '工作区', permission: 'workspaces:read', roles: [1, 2], icon: 'Building2' },
  { path: '/projects', label: '企业项目', permission: 'workspaces:read', roles: [1, 2], icon: 'FolderKanban' },
  { path: '/groups?preset=enterprise', label: '企业群', permission: 'groups:read', roles: [1, 2], icon: 'UsersRound' },
  { path: '/channels?preset=enterprise', label: '企业频道', permission: 'channels:read', roles: [1, 2], icon: 'Radio' },
  { path: '/customer-service', label: '客服坐席', permission: 'customer_service:read', roles: [1, 2], icon: 'Headphones' },
  { path: '/enterprise/applications', label: '应用与集成', permission: 'enterprise_business:read', roles: [1, 2], icon: 'ShieldCheck' },
  { path: '/enterprise-business/offboarding', label: '离岗交接', permission: 'enterprise_business:read', roles: [1, 2], icon: 'ListChecks' },
  { path: '/enterprise-business', label: '企业审计/业务数据', permission: 'enterprise_business:read', roles: [1, 2], icon: 'BarChart3' },
]

function normalizeRoles(roles?: Array<number | string>): number[] {
  if (!Array.isArray(roles)) return []
  return roles
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b)
}

function contractKey(path: string, permission: string, roles: number[]): string {
  return `${path}|${permission}|${roles.join(',')}`
}

function findEnterpriseGroup(): SidebarMenuItem | undefined {
  return defaultConfig.items.find((item) => item.label === '企业管理')
}

function collectLeaves(items: SidebarMenuItem[]): SidebarMenuItem[] {
  return items.flatMap((item) => {
    const self = item.path ? [item] : []
    const children = item.children ? collectLeaves(item.children) : []
    return [...self, ...children]
  })
}

describe('EADM-03 企业管理菜单合同 (C1)', () => {
  it('顶级组名为「企业管理」且包含 9 个叶子', () => {
    const group = findEnterpriseGroup()
    expect(group, '企业管理 group should exist').toBeDefined()
    expect(group!.children, '企业管理 group should have children').toBeDefined()
    expect(group!.children!).toHaveLength(9)
  })

  it('坐席工作台已移出企业管理组（独立 Seat JWT 域，仅保留 /customer-service）', () => {
    const group = findEnterpriseGroup()
    const paths = collectLeaves(group!.children!).map((leaf) => leaf.path)
    expect(paths).not.toContain('/customer-service/workspace')
    expect(paths).toContain('/customer-service')
  })

  it('叶子集合与后端声明双向匹配 (path + permission + roles)', () => {
    const group = findEnterpriseGroup()
    const leaves = collectLeaves(group!.children!)

    const backendSet = new Set(
      BACKEND_ENTERPRISE_LEAVES.map((leaf) =>
        contractKey(leaf.path, leaf.permission, normalizeRoles(leaf.roles)),
      ),
    )
    const frontendSet = new Set(
      leaves.map((leaf) =>
        contractKey(leaf.path!, leaf.permission!, normalizeRoles(leaf.roles)),
      ),
    )

    // 后端 → 前端：每个后端声明都能在前端找到
    for (const key of backendSet) {
      expect(frontendSet.has(key), `前端缺失后端声明: ${key}`).toBe(true)
    }
    // 前端 → 后端：前端没有超出后端声明的菜单
    for (const key of frontendSet) {
      expect(backendSet.has(key), `前端存在合同外声明: ${key}`).toBe(true)
    }
  })

  it('每个叶子 role 与后端数字形态一致', () => {
    const group = findEnterpriseGroup()
    const leaves = collectLeaves(group!.children!)
    for (const leaf of BACKEND_ENTERPRISE_LEAVES) {
      const match = leaves.find((l) => l.path === leaf.path)
      expect(match, `叶子 ${leaf.path} 应存在`).toBeDefined()
      expect(normalizeRoles(match!.roles)).toEqual(normalizeRoles(leaf.roles))
    }
  })

  it('iconMap 能解析后端下发的图标名', () => {
    for (const leaf of BACKEND_ENTERPRISE_LEAVES) {
      expect(iconMap[leaf.icon], `iconMap 缺失后端图标: ${leaf.icon}`).toBeDefined()
    }
  })
})

describe('EADM-03 禁止项守护 (C1 尾注)', () => {
  const FORBIDDEN_PATHS = [
    '/enterprise-overview',
    '/applications',
    '/credentials',
    '/grants',
  ]

  it('schema 中不存在完整版计划域路径', () => {
    const allLeaves = collectLeaves(defaultConfig.items)
    const present = allLeaves.map((l) => l.path)
    for (const forbidden of FORBIDDEN_PATHS) {
      expect(present).not.toContain(forbidden)
    }
  })
})

describe('EADM-03 Seat Auth 域守卫', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const appSource = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf-8')

  it('/customer-service/workspace 在 Admin 认证壳之外（独立 Seat JWT/二维码域）', () => {
    const workspaceRouteIdx = appSource.indexOf('<Route path="/customer-service/workspace"')
    const adminShellIdx = appSource.indexOf('<Route element={<ProtectedRoute />}>')

    expect(workspaceRouteIdx, 'workspace 路由应已声明').toBeGreaterThan(-1)
    expect(adminShellIdx, 'Admin 认证壳应已声明').toBeGreaterThan(-1)
    // workspace 路由声明位置必须早于 Admin 壳开启位置 → 位于壳外（<Routes> 顶层）
    expect(workspaceRouteIdx).toBeLessThan(adminShellIdx)
    // workspace 路由不应出现在 AdminLayout 包裹块内
    expect(appSource.indexOf('<Route element={<AdminLayout />}>')).toBeGreaterThan(workspaceRouteIdx)
  })
})
