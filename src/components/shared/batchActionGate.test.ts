import { describe, expect, test } from 'bun:test'

/**
 * BatchActionBar 权限判定的 fail-closed 语义（C0-GOV-01）。
 *
 * 复刻 BatchActionBar.tsx `visibleActions` 中的判定表达式：RBAC 不可达时
 * grantedPermissions 为空集，此前会无条件放行，等于批量删除/封禁对所有
 * 登录管理员开放。riskLevel='high' 的破坏性操作必须 fail-closed。
 *
 * 这里直接测判定规则本身而不渲染组件：规则是安全语义的核心，
 * 用渲染断言反而会被 UI 结构变化掩盖。
 */
type RiskLevel = 'low' | 'medium' | 'high'

function permissionAllowed(params: {
  permission?: string
  riskLevel?: RiskLevel
  grantedPermissions: Set<string>
}): boolean {
  const permission = params.permission?.trim()
  const hasPermissionRequirement = Boolean(permission)
  const isHighRisk = params.riskLevel === 'high'
  return (
    !hasPermissionRequirement ||
    (params.grantedPermissions.size === 0 && !isHighRisk) ||
    (permission != null && params.grantedPermissions.has(permission))
  )
}

const EMPTY = new Set<string>()

describe('RBAC 不可用（权限集为空）', () => {
  test('高风险批量操作必须被拒绝', () => {
    expect(
      permissionAllowed({
        permission: 'user:delete',
        riskLevel: 'high',
        grantedPermissions: EMPTY,
      })
    ).toBe(false)
  })

  test('低/中风险操作维持角色级降级放行，避免权限服务抖动锁死管理台', () => {
    for (const riskLevel of ['low', 'medium', undefined] as const) {
      expect(
        permissionAllowed({
          permission: 'user:export',
          riskLevel,
          grantedPermissions: EMPTY,
        })
      ).toBe(true)
    }
  })

  test('无权限约束的操作不受影响', () => {
    expect(
      permissionAllowed({ riskLevel: 'high', grantedPermissions: EMPTY })
    ).toBe(true)
  })
})

describe('RBAC 可用（权限集非空）', () => {
  test('高风险操作持有对应权限才放行', () => {
    expect(
      permissionAllowed({
        permission: 'user:delete',
        riskLevel: 'high',
        grantedPermissions: new Set(['user:delete']),
      })
    ).toBe(true)
  })

  test('高风险操作缺对应权限被拒绝', () => {
    expect(
      permissionAllowed({
        permission: 'user:delete',
        riskLevel: 'high',
        grantedPermissions: new Set(['user:read']),
      })
    ).toBe(false)
  })

  test('低风险操作同样按权限判定', () => {
    expect(
      permissionAllowed({
        permission: 'user:export',
        riskLevel: 'low',
        grantedPermissions: new Set(['user:read']),
      })
    ).toBe(false)
  })
})
