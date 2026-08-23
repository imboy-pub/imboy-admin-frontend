/**
 * H11 复现：/rbac/me 404 一次后 sessionStorage 标记 imboy_admin_rbac_endpoint_unavailable，
 * 整个浏览器会话内 getMyRbacProfilePayload 直接 throw（不再发请求）。
 * useAdminPermission 注释承诺 fail-open by design（"rbac/me 抖动不应把管理员锁在门外"），
 * 本测试验证：rbac profile 拿不到 + sidebar 模板含目标权限 + 角色匹配时，allowed 必须为 true。
 * 实测（2026-08-15 浏览器）：标记存在时 /channels 持续跳 /forbidden —— 与设计意图相悖。
 */
import '../test/setupDom'
import { describe, it, expect, beforeEach, afterAll, spyOn, mock } from 'bun:test'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactElement } from 'react'
import { useAdminPermission } from './useAdminPermission'
import { useAuthStore } from '@/stores/authStore'
import * as realRbacModule from '@/services/api/rbac'
import * as realAdminConfigModule from '@/services/api/adminConfig'

// 在下方 mock.module 生效前快照真实导出：bun 会就地改写模块命名空间，
// 直接保存命名空间引用拿到的是改写后的 mock；展开拷贝的是当时的函数引用。
const realRbacExports = { ...realRbacModule }
const realAdminConfigExports = { ...realAdminConfigModule }

// 模拟 sessionStorage 标记后的行为：getMyRbacProfilePayload 永远 throw
mock.module('@/services/api/rbac', () => ({
  getMyRbacProfilePayload: async () => {
    throw new Error('RBAC endpoint unavailable')
  },
}))

// sidebar 模板正常返回（role 1 含 channels:read，与真实 /sidebar-menu.json 一致）。
// 每个用例可覆盖 sidebarFetcher 控制时序（慢加载场景见第 2 个用例）。
let sidebarFetcher: () => Promise<unknown> = async () => ({
  rbac: {
    roles: [
      {
        id: 1,
        name: 'super_admin',
        description: '',
        permissions: ['dashboard:view', 'channels:read', 'channels:update'],
      },
    ],
  },
})
mock.module('@/services/api/adminConfig', () => ({
  fetchSidebarMenuConfig: () => sidebarFetcher(),
}))

// bun:test 的 mock.module 对整个测试进程永久生效（无内建 unmock）。bun 单进程
// 连跑全部测试文件时，本文件的模块 mock 会污染后续文件（如 services/api 下
// 对真实实现的单测，表现为 fetch 类用例批量 5s 超时）。afterAll 把模块注册表
// 恢复为真实实现（本文件顶部 import 已在 mock 生效前捕获真实模块对象）。
afterAll(() => {
  mock.module('@/services/api/rbac', () => realRbacExports)
  mock.module('@/services/api/adminConfig', () => realAdminConfigExports)
})

describe('useAdminPermission — rbac 404 会话标记后的 fail-open 承诺', () => {
  beforeEach(() => {
    spyOn(console, 'warn').mockImplementation(() => {})
    useAuthStore.setState({
      admin: {
        id: '106791271148029952',
        account: 'e2e_admin',
        nickname: 'e2e_admin',
        avatar: '',
        role_id: [1],
        status: 1,
        created_at: 0,
        last_login_at: 0,
        last_login_ip: '',
        login_count: 0,
      },
      isAuthenticated: true,
    })
  })

  it('rbac profile 抛错 + sidebar 模板含权限 + 角色匹配 → allowed 应为 true（fail-open）', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactElement }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () => useAdminPermission({ permission: 'channels:read', roles: ['1', '2'] }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // fail-open by design：rbac 拿不到时按角色级（role 1 ∈ [1,2]）+ sidebar 模板放行
    expect(result.current.allowed).toBe(true)
  })

  it('中间态：rbac 已快速失败 + sidebar 模板仍在加载 → loading 必须为 true（不得用 false 锁门）', async () => {
    // 浏览器实测（2026-08-15）：sessionStorage 标记使 rbac query 几乎同步 error，
    // 而 sidebar 模板（remote 404 → fallback 静态文件）仍在途。此时
    // permissionAllowed 走「加载中 return false」，若 loading 同时被误判为 false，
    // PermissionRoute 直接 Navigate 到 /forbidden 且不再恢复。
    let resolveSidebar: (_value: unknown) => void = () => {}
    sidebarFetcher = () =>
      new Promise((resolve) => {
        resolveSidebar = resolve
      })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactElement }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () => useAdminPermission({ permission: 'channels:read', roles: ['1', '2'] }),
      { wrapper }
    )

    // rbac 已 error、sidebar 未决：必须仍处于 loading（渲染「校验访问权限...」）。
    // 等 120ms 确保 rbac query 已确定失败（不再停留在首帧 in-flight 的 loading=true）
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(result.current.loading).toBe(true)
    expect(result.current.allowed).toBe(false) // 判定未定，但不允许已判死

    // sidebar 模板到达后 → 放行
    resolveSidebar({
      rbac: {
        roles: [
          { id: 1, name: 'super_admin', description: '', permissions: ['channels:read'] },
        ],
      },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.allowed).toBe(true)
  })
})
