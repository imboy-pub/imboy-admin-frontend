import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSidebarMenuConfig } from '@/services/api/adminConfig'
import { getMyRbacProfilePayload } from '@/services/api/rbac'
import { useAuthStore } from '@/stores/authStore'

type UseAdminPermissionOptions = {
  permission?: string | string[]
  roles?: number[]
  enabled?: boolean
  /**
   * 敏感写操作（删除、封禁、批量处置、授权变更等）。
   *
   * 默认的角色级降级是 fail-open：/rbac/me 不可用时按角色放行，避免细粒度
   * 权限服务抖动就把管理员全部锁在门外。但敏感写操作必须反过来——权限数据
   * 拿不到就一律拒绝：宁可挡住合法操作，也不能在权限未知时放行破坏性动作。
   */
  sensitive?: boolean
}

function normalizeRoleIds(value: unknown): number[] {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  )
}

export function useAdminPermission(options: UseAdminPermissionOptions = {}) {
  const { permission, roles } = options
  const gateEnabled = options.enabled !== false
  const isSensitive = options.sensitive === true
  const normalizedPermissions = (Array.isArray(permission) ? permission : [permission])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
  const hasPermissionConstraint = normalizedPermissions.length > 0
  const hasRoleConstraint = Array.isArray(roles) && roles.length > 0

  const currentRoleValue = useAuthStore((state) => state.admin?.role_id)
  const currentRoleIds = useMemo(() => normalizeRoleIds(currentRoleValue), [currentRoleValue])

  const shouldResolvePermission = gateEnabled && (hasPermissionConstraint || hasRoleConstraint)

  const { data: rbacProfile, isLoading: rbacLoading, isError: rbacError } = useQuery({
    queryKey: ['rbac', 'me', 'permission-gate'],
    queryFn: () => getMyRbacProfilePayload(),
    enabled: shouldResolvePermission,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: sidebarConfig, isLoading: configLoading } = useQuery({
    queryKey: ['admin-config', 'sidebar', 'permission-gate'],
    queryFn: () => fetchSidebarMenuConfig(),
    enabled: shouldResolvePermission,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const profileRoleIds = useMemo(() => {
    if (!rbacProfile) return []
    if (Array.isArray(rbacProfile.role_ids) && rbacProfile.role_ids.length > 0) {
      return normalizeRoleIds(rbacProfile.role_ids)
    }
    return normalizeRoleIds(rbacProfile.role_id)
  }, [rbacProfile])

  const effectiveRoleIds = profileRoleIds.length > 0 ? profileRoleIds : currentRoleIds
  const roleAllowed = !hasRoleConstraint || effectiveRoleIds.some((roleId) => roles?.includes(roleId) ?? false)

  const roleTemplatePermissions = useMemo(() => {
    if (effectiveRoleIds.length === 0) return undefined
    const roleList = sidebarConfig?.rbac?.roles || []
    const permissions = roleList
      .filter((item) => effectiveRoleIds.includes(item.id))
      .flatMap((item) => item.permissions || [])
    if (permissions.length === 0) return undefined
    return new Set(permissions)
  }, [effectiveRoleIds, sidebarConfig?.rbac?.roles])

  const permissionAllowed = useMemo(() => {
    if (!hasPermissionConstraint) return true

    const rbacPermissions = rbacProfile?.permissions || []
    if (rbacPermissions.length > 0) {
      const permissionSet = new Set(rbacPermissions)
      return normalizedPermissions.some((item) => permissionSet.has(item))
    }

    if (roleTemplatePermissions) {
      return normalizedPermissions.some((item) => roleTemplatePermissions.has(item))
    }

    // 安全设计说明：
    // 仅当权限数据已完成加载（rbacLoading/configLoading 均为 false）但确实没有
    // 细粒度权限配置时，才降级为角色级别放行（fail-open by design）。
    // 加载中时（rbacLoading || configLoading 为 true）返回 false，
    // 避免在数据到来之前意外开放访问。
    if (rbacLoading || configLoading) return false

    // 敏感写操作 fail-closed：权限数据不可用时一律拒绝，不降级到角色级放行。
    if (isSensitive) {
      console.warn(
        '[SECURITY] RBAC endpoint unavailable; denying sensitive action. Ensure /rbac/me is reachable in production.'
      )
      return false
    }

    // 非敏感操作维持角色级降级（fail-open by design）：
    // /rbac/me 抖动不应把管理员整个锁在门外。
    console.warn('[SECURITY] RBAC endpoint unavailable, falling back to role-level access. Ensure /rbac/me is reachable in production.')
    // 生产部署必须确保 /rbac/me 端点可用，否则细粒度权限形同虚设
    return roleAllowed
  }, [
    hasPermissionConstraint,
    normalizedPermissions,
    rbacProfile?.permissions,
    roleTemplatePermissions,
    rbacLoading,
    configLoading,
    roleAllowed,
    isSensitive,
  ])

  // 时序修复：authStore persist rehydrate 尚未完成（currentRoleIds 为空）而
  // /rbac/me profile 也未落地时，必须视为「加载中」等待，而不是用空角色集
  // 判定无权限（曾导致登录后前几次导航被间歇性误跳 /forbidden）。
  // 查询确定失败（rbacError）后不再等待，走下方角色级降级/fail-closed 分支。
  const waitingForRoleResolution =
    hasRoleConstraint &&
    effectiveRoleIds.length === 0 &&
    shouldResolvePermission &&
    !rbacError &&
    (!rbacProfile || rbacLoading || configLoading)

  // 时序修复：rbac profile（权威权限源）尚未返回且查询仍在途时，一律等待，
  // 不允许用先到的 sidebar 角色模板提前做否定判定——静态模板权限集不完整
  // （曾导致 sidebar 先到 + /rbac/me 后到的竞态被间歇性误跳 /forbidden）。
  // 查询确定失败（rbacError）后不再等待，走角色级降级 / fail-closed 分支。
  const waitingForPermissionResolution =
    hasPermissionConstraint &&
    !rbacProfile &&
    shouldResolvePermission &&
    !rbacError &&
    (rbacLoading || configLoading)

  const loading =
    waitingForRoleResolution || waitingForPermissionResolution

  return {
    allowed: roleAllowed && permissionAllowed,
    loading,
  }
}
