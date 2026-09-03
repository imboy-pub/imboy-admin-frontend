import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSidebarMenuConfig } from '@/services/api/adminConfig'
import { getMyRbacProfilePayload } from '@/services/api/rbac'
import { useAuthStore } from '@/stores/authStore'
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'

type UseAdminPermissionOptions = {
  permission?: string | string[]
  roles?: EntityId[]
  enabled?: boolean
  /**
   * 兼容旧调用。所有带 permission 的门现在都统一 fail-closed。
   */
  sensitive?: boolean
}

// ⚠️ TSID 严禁 Number() 回转（>2^53 丢精度），统一走 coerceEntityId
function normalizeRoleIds(value: unknown): EntityId[] {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      values
        .map((item) => coerceEntityId(item))
        .filter((item) => item.length > 0)
    )
  )
}

export function useAdminPermission(options: UseAdminPermissionOptions = {}) {
  const { permission, roles } = options
  const gateEnabled = options.enabled !== false
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
      .filter((item) => effectiveRoleIds.includes(coerceEntityId(item.id)))
      .flatMap((item) => item.permissions || [])
    if (permissions.length === 0) return undefined
    return new Set(permissions)
  }, [effectiveRoleIds, sidebarConfig?.rbac?.roles])

  const permissionAllowed = useMemo(() => {
    if (!hasPermissionConstraint) return true

    const rbacPermissions = rbacProfile?.permissions || []
    if (rbacProfile) {
      const permissionSet = new Set(rbacPermissions)
      return normalizedPermissions.some((item) => permissionSet.has(item))
    }

    if (roleTemplatePermissions) {
      return normalizedPermissions.some((item) => roleTemplatePermissions.has(item))
    }

    // 权限尚未决时拒绝，路由通过 loading 保持等待态。
    if (rbacLoading || configLoading) return false

    // 声明 permission 就必须由 profile 或角色模板明确证明，不能在权限源
    // 不可用时仅凭粗粒度角色放行。
    console.warn('[SECURITY] RBAC permission unavailable; denying permission-gated access.')
    return false
  }, [
    hasPermissionConstraint,
    normalizedPermissions,
    rbacProfile,
    roleTemplatePermissions,
    rbacLoading,
    configLoading,
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
  // rbac 确定失败（rbacError）后不再等待 rbac 本身，但 sidebar 模板仍在加载
  // （configLoading）时必须继续等——模板是权限判定的备用数据源，
  // 模板未到就判死会把管理员锁在 /forbidden
  // （实测：/rbac/me 404 写入 sessionStorage 标记后 rbac 同步快速失败，
  // sidebar fallback 还在途，loading 被误判 false → 永久跳 /forbidden）。
  const waitingForPermissionResolution =
    hasPermissionConstraint &&
    !rbacProfile &&
    shouldResolvePermission &&
    (configLoading || (rbacLoading && !rbacError))

  const loading =
    waitingForRoleResolution || waitingForPermissionResolution

  return {
    allowed: roleAllowed && permissionAllowed,
    loading,
  }
}
