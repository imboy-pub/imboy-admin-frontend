import { Circle } from 'lucide-react'
import type { MenuConfigItem } from '@/services/api/adminConfig'
import { featureKeyForAdminPath, isAdminFeatureEnabled, adminEntryForPath, isAdminEntryEnabled, type FeatureFlags } from '@/services/api/features'
import {
  defaultConfig,
  iconMap,
  SIDEBAR_FAVORITES_KEY,
  type SidebarMenuItem,
} from './sidebarSchema'

export function normalizeRoleId(value: unknown): number | undefined {
  const v = Array.isArray(value) ? value[0] : value
  const roleId = Number(v)
  if (!Number.isFinite(roleId) || roleId <= 0) return undefined
  return roleId
}

export function toSidebarMenuItems(configItems?: MenuConfigItem[], parentKey = 'menu', seenPaths = new Set<string>()): SidebarMenuItem[] {
  if (!Array.isArray(configItems)) return []

  const mapped: Array<SidebarMenuItem | null> = configItems
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => {
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (!label) return null

      let path = typeof item.path === 'string' ? item.path.trim() : undefined
      if (path && seenPaths.has(path)) {
        path = undefined
      }
      if (path) {
        seenPaths.add(path)
      }

      const key = path ? `path:${path}` : `${parentKey}.${index}`
      const children = toSidebarMenuItems(item.children, key, seenPaths)
      if (!path && children.length === 0) return null

      const result: SidebarMenuItem = {
        key,
        label,
        icon: iconMap[item.icon || ''] || Circle,
      }

      if (path) result.path = path
      if (Array.isArray(item.roles)) result.roles = item.roles
      if (typeof item.permission === 'string' && item.permission.trim().length > 0) {
        result.permission = item.permission.trim()
      }
      if (children.length > 0) result.children = children

      return result
    })

  return mapped.filter((item): item is SidebarMenuItem => item !== null)
}

export function flattenLeafItems(items: SidebarMenuItem[]): SidebarMenuItem[] {
  return items.flatMap((item) => {
    const self = item.path ? [item] : []
    const children = item.children ? flattenLeafItems(item.children) : []
    return [...self, ...children]
  })
}

export function collectParentKeys(items: SidebarMenuItem[]): string[] {
  return items.flatMap((item) => {
    if (!item.children || item.children.length === 0) return []
    return [item.key, ...collectParentKeys(item.children)]
  })
}

export function findNodeByKey(items: SidebarMenuItem[], key: string): SidebarMenuItem | undefined {
  for (const item of items) {
    if (item.key === key) return item
    if (item.children) {
      const matched = findNodeByKey(item.children, key)
      if (matched) return matched
    }
  }
  return undefined
}

export function isNodeActive(item: SidebarMenuItem, pathname: string): boolean {
  if (item.path === pathname) return true
  if (!item.children || item.children.length === 0) return false
  return item.children.some((child) => isNodeActive(child, pathname))
}

export function filterByKeyword(items: SidebarMenuItem[], keyword: string): SidebarMenuItem[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return items

  return items
    .map((item) => {
      const selfMatch =
        item.label.toLowerCase().includes(normalized) ||
        (item.path ? item.path.toLowerCase().includes(normalized) : false)

      if (!item.children || item.children.length === 0) {
        return selfMatch ? item : null
      }

      if (selfMatch) {
        return item
      }

      const filteredChildren = filterByKeyword(item.children, normalized)
      if (filteredChildren.length === 0) return null
      return { ...item, children: filteredChildren }
    })
    .filter((item): item is SidebarMenuItem => item !== null)
}

export function filterByRbac(items: SidebarMenuItem[], roleId?: number): SidebarMenuItem[] {
  if (roleId === undefined) return items

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const itemRoles = Array.isArray(item.roles)
          ? item.roles.map((value) => Number(value)).filter((value) => Number.isFinite(value))
          : []
        const roleAllowed = itemRoles.length === 0 || itemRoles.includes(roleId)
        const filteredChildren = item.children ? walk(item.children) : []

        if (filteredChildren.length > 0) {
          if (roleAllowed) return { ...item, children: filteredChildren }
          return { ...item, path: undefined, children: filteredChildren }
        }
        if (roleAllowed && item.path) return { ...item, children: undefined }
        return null
      })
      .filter((item): item is SidebarMenuItem => item !== null)
  }

  const filtered = walk(items)
  if (filtered.length > 0) return filtered

  const fallback = flattenLeafItems(items).find((item) => item.path === '/dashboard')
  return fallback ? [{ ...fallback, children: undefined }] : []
}

export function filterByFeatures(items: SidebarMenuItem[], featureFlags?: FeatureFlags | null): SidebarMenuItem[] {
  if (!featureFlags || Object.keys(featureFlags).length === 0) {
    return items
  }

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const filteredChildren = item.children ? walk(item.children) : []
        const featureKey = featureKeyForAdminPath(item.path)
        const selfAllowed = isAdminFeatureEnabled(featureFlags, featureKey)

        if (filteredChildren.length > 0) {
          if (selfAllowed) {
            return { ...item, children: filteredChildren }
          }
          return { ...item, path: undefined, children: filteredChildren }
        }

        if (selfAllowed && item.path) {
          return { ...item, children: undefined }
        }

        return null
      })
      .filter((item): item is SidebarMenuItem => item !== null)
  }

  const filtered = walk(items)
  if (filtered.length > 0) return filtered

  const fallback = flattenLeafItems(items).find((item) => item.path === '/dashboard')
  return fallback ? [{ ...fallback, children: undefined }] : []
}

export function filterByAdminEntries(items: SidebarMenuItem[], adminEntries?: string[] | null): SidebarMenuItem[] {
  if (!adminEntries || adminEntries.length === 0) {
    return items
  }

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const filteredChildren = item.children ? walk(item.children) : []
        const entry = adminEntryForPath(item.path)
        const selfAllowed = isAdminEntryEnabled(adminEntries, entry ?? '')

        if (filteredChildren.length > 0) {
          if (selfAllowed) {
            return { ...item, children: filteredChildren }
          }
          return { ...item, path: undefined, children: filteredChildren }
        }

        if (selfAllowed && item.path) {
          return { ...item, children: undefined }
        }

        return null
      })
      .filter((item): item is SidebarMenuItem => item !== null)
  }

  const filtered = walk(items)
  if (filtered.length > 0) return filtered

  const fallback = flattenLeafItems(items).find((item) => item.path === '/dashboard')
  return fallback ? [{ ...fallback, children: undefined }] : []
}

export function pickSafeMenuSource(configItems?: MenuConfigItem[]): MenuConfigItem[] {
  if (Array.isArray(configItems) && configItems.length > 0) {
    return configItems
  }
  return defaultConfig.items || []
}

export function ensureRenderableMenu(
  items: SidebarMenuItem[],
  roleId?: number,
  featureFlags?: FeatureFlags | null,
  adminEntries?: string[] | null
): SidebarMenuItem[] {
  if (items.length > 0) return items
  return filterByAdminEntries(
    filterByFeatures(
      filterByRbac(toSidebarMenuItems(defaultConfig.items), roleId),
      featureFlags
    ),
    adminEntries
  )
}

export function removeFavoriteLeaves(items: SidebarMenuItem[], favoriteSet: Set<string>): SidebarMenuItem[] {
  return items
    .map((item) => {
      const nextChildren = item.children ? removeFavoriteLeaves(item.children, favoriteSet) : []
      const keepPath = Boolean(item.path && !favoriteSet.has(item.path))

      if (nextChildren.length > 0) {
        if (keepPath) {
          return { ...item, children: nextChildren }
        }
        return { ...item, path: undefined, children: nextChildren }
      }

      if (keepPath) {
        return { ...item, children: undefined }
      }

      return null
    })
    .filter((item): item is SidebarMenuItem => item !== null)
}

export function readFavoritePaths(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(SIDEBAR_FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((path) => typeof path === 'string')
  } catch {
    return []
  }
}
