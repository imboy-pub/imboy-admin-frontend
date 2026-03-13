import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSidebarMenuConfig } from '@/services/api/adminConfig'
import { getMyRbacProfilePayload } from '@/services/api/rbac'
import { useAuthStore } from '@/stores/authStore'

type UseAdminPermissionOptions = {
  permission?: string | string[]
  roles?: number[]
  enabled?: boolean
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
  const normalizedPermissions = (Array.isArray(permission) ? permission : [permission])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
  const hasPermissionConstraint = normalizedPermissions.length > 0
  const hasRoleConstraint = Array.isArray(roles) && roles.length > 0

  const currentRoleValue = useAuthStore((state) => state.admin?.role_id)
  const currentRoleIds = useMemo(() => normalizeRoleIds(currentRoleValue), [currentRoleValue])

  const shouldResolvePermission = gateEnabled && (hasPermissionConstraint || hasRoleConstraint)

  const { data: rbacProfile, isLoading: rbacLoading } = useQuery({
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
  const roleAllowed = !hasRoleConstraint || effectiveRoleIds.some((roleId) => roles!.includes(roleId))

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

    return roleAllowed
  }, [
    hasPermissionConstraint,
    normalizedPermissions,
    rbacProfile?.permissions,
    roleTemplatePermissions,
    roleAllowed,
  ])

  const waitingForRoleResolution =
    hasRoleConstraint &&
    effectiveRoleIds.length === 0 &&
    shouldResolvePermission &&
    (rbacLoading || configLoading)

  const waitingForPermissionResolution =
    hasPermissionConstraint &&
    !rbacProfile &&
    !roleTemplatePermissions &&
    shouldResolvePermission &&
    (rbacLoading || configLoading)

  const loading =
    waitingForRoleResolution || waitingForPermissionResolution

  return {
    allowed: roleAllowed && permissionAllowed,
    loading,
  }
}
