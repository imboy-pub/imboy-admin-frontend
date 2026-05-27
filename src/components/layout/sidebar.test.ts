/**
 * Inline mirror tests for pure functions in components/layout/sidebarFilters.ts:
 *   normalizeRoleId, toSidebarMenuItems, flattenLeafItems, collectParentKeys,
 *   findNodeByKey, isNodeActive, filterByKeyword, filterByRbac, filterByFeatures,
 *   pickSafeMenuSource, removeFavoriteLeaves, readFavoritePaths
 */
import '../../test/setupDom'
import { describe, expect, it, afterEach } from 'bun:test'

// ---------------------------------------------------------------------------
// Type helpers (mirrored from Sidebar.tsx)
// ---------------------------------------------------------------------------

type SidebarMenuItem = {
  key: string
  path?: string
  label: string
  icon: string
  roles?: Array<number | string>
  permission?: string
  children?: SidebarMenuItem[]
}

type MenuConfigItem = {
  path?: string
  label?: string
  icon?: string
  roles?: Array<number | string>
  permission?: string
  enabled?: boolean
  children?: MenuConfigItem[]
}

type FeatureFlags = Record<string, boolean>

// ---------------------------------------------------------------------------
// Constants + mirrors
// ---------------------------------------------------------------------------

const SIDEBAR_FAVORITES_KEY = 'imboy_admin_sidebar_favorites'

const iconMap: Record<string, string> = {
  LayoutDashboard: 'LayoutDashboard',
  Users: 'Users',
  Settings: 'Settings',
}

const defaultConfigItems: MenuConfigItem[] = [
  { path: '/dashboard', icon: 'LayoutDashboard', label: '仪表盘', roles: [1, 2, 3] },
]

function normalizeRoleId(value: unknown): number | undefined {
  const v = Array.isArray(value) ? value[0] : value
  const roleId = Number(v)
  if (!Number.isFinite(roleId) || roleId <= 0) return undefined
  return roleId
}

function toSidebarMenuItems(
  configItems?: MenuConfigItem[],
  parentKey = 'menu',
  seenPaths = new Set<string>()
): SidebarMenuItem[] {
  if (!Array.isArray(configItems)) return []

  const mapped = configItems
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => {
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (!label) return null

      let path = typeof item.path === 'string' ? item.path.trim() : undefined
      if (path && seenPaths.has(path)) path = undefined
      if (path) seenPaths.add(path)

      const key = path ? `path:${path}` : `${parentKey}.${index}`
      const children = toSidebarMenuItems(item.children, key, seenPaths)
      if (!path && children.length === 0) return null

      const result: SidebarMenuItem = { key, label, icon: iconMap[item.icon || ''] || 'Circle' }
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

function flattenLeafItems(items: SidebarMenuItem[]): SidebarMenuItem[] {
  return items.flatMap((item) => {
    const self = item.path ? [item] : []
    const children = item.children ? flattenLeafItems(item.children) : []
    return [...self, ...children]
  })
}

function collectParentKeys(items: SidebarMenuItem[]): string[] {
  return items.flatMap((item) => {
    if (!item.children || item.children.length === 0) return []
    return [item.key, ...collectParentKeys(item.children)]
  })
}

function findNodeByKey(items: SidebarMenuItem[], key: string): SidebarMenuItem | undefined {
  for (const item of items) {
    if (item.key === key) return item
    if (item.children) {
      const matched = findNodeByKey(item.children, key)
      if (matched) return matched
    }
  }
  return undefined
}

function isNodeActive(item: SidebarMenuItem, pathname: string): boolean {
  if (item.path === pathname) return true
  if (!item.children || item.children.length === 0) return false
  return item.children.some((child) => isNodeActive(child, pathname))
}

function filterByKeyword(items: SidebarMenuItem[], keyword: string): SidebarMenuItem[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return items
  return items
    .map((item) => {
      const selfMatch =
        item.label.toLowerCase().includes(normalized) ||
        (item.path ? item.path.toLowerCase().includes(normalized) : false)
      if (!item.children || item.children.length === 0) return selfMatch ? item : null
      if (selfMatch) return item
      const filteredChildren = filterByKeyword(item.children, normalized)
      if (filteredChildren.length === 0) return null
      return { ...item, children: filteredChildren }
    })
    .filter((item): item is SidebarMenuItem => item !== null)
}

function filterByRbac(items: SidebarMenuItem[], roleId?: number): SidebarMenuItem[] {
  if (roleId === undefined) return items

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const itemRoles = Array.isArray(item.roles)
          ? item.roles.map((v) => Number(v)).filter((v) => Number.isFinite(v))
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

function filterByFeatures(items: SidebarMenuItem[], featureFlags?: FeatureFlags | null): SidebarMenuItem[] {
  if (!featureFlags || Object.keys(featureFlags).length === 0) return items

  const featureKeyForPath = (path?: string): string | undefined => {
    if (!path) return undefined
    const segment = path.split('/').filter(Boolean)[0]
    return segment ? `admin_${segment}` : undefined
  }

  const isEnabled = (flags: FeatureFlags, key?: string): boolean => {
    if (!key) return true
    const val = flags[key]
    return val === undefined || val === true
  }

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const filteredChildren = item.children ? walk(item.children) : []
        const featureKey = featureKeyForPath(item.path)
        const selfAllowed = isEnabled(featureFlags, featureKey)

        if (filteredChildren.length > 0) {
          if (selfAllowed) return { ...item, children: filteredChildren }
          return { ...item, path: undefined, children: filteredChildren }
        }
        if (selfAllowed && item.path) return { ...item, children: undefined }
        return null
      })
      .filter((item): item is SidebarMenuItem => item !== null)
  }

  const filtered = walk(items)
  if (filtered.length > 0) return filtered

  const fallback = flattenLeafItems(items).find((item) => item.path === '/dashboard')
  return fallback ? [{ ...fallback, children: undefined }] : []
}

function pickSafeMenuSource(configItems?: MenuConfigItem[]): MenuConfigItem[] {
  if (Array.isArray(configItems) && configItems.length > 0) return configItems
  return defaultConfigItems
}

function removeFavoriteLeaves(items: SidebarMenuItem[], favoriteSet: Set<string>): SidebarMenuItem[] {
  return items
    .map((item) => {
      const nextChildren = item.children ? removeFavoriteLeaves(item.children, favoriteSet) : []
      const keepPath = Boolean(item.path && !favoriteSet.has(item.path))
      if (nextChildren.length > 0) {
        if (keepPath) return { ...item, children: nextChildren }
        return { ...item, path: undefined, children: nextChildren }
      }
      if (keepPath) return { ...item, children: undefined }
      return null
    })
    .filter((item): item is SidebarMenuItem => item !== null)
}

function readFavoritePaths(): string[] {
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

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeItem(key: string, path: string, label = 'Label', children?: SidebarMenuItem[]): SidebarMenuItem {
  const item: SidebarMenuItem = { key, path, label, icon: 'Circle' }
  if (children) item.children = children
  return item
}

// ---------------------------------------------------------------------------
// normalizeRoleId
// ---------------------------------------------------------------------------

describe('normalizeRoleId', () => {
  it('returns the role id for positive integer', () => {
    expect(normalizeRoleId(1)).toBe(1)
    expect(normalizeRoleId(3)).toBe(3)
  })

  it('returns undefined for 0', () => {
    expect(normalizeRoleId(0)).toBeUndefined()
  })

  it('returns undefined for negative number', () => {
    expect(normalizeRoleId(-1)).toBeUndefined()
  })

  it('returns undefined for null/undefined', () => {
    expect(normalizeRoleId(null)).toBeUndefined()
    expect(normalizeRoleId(undefined)).toBeUndefined()
  })

  it('parses numeric string', () => {
    expect(normalizeRoleId('2')).toBe(2)
  })

  it('returns undefined for non-numeric string', () => {
    expect(normalizeRoleId('abc')).toBeUndefined()
  })
})


// ---------------------------------------------------------------------------
// toSidebarMenuItems
// ---------------------------------------------------------------------------

describe('toSidebarMenuItems', () => {
  it('returns empty array for non-array input', () => {
    expect(toSidebarMenuItems(undefined)).toEqual([])
  })

  it('maps path items to SidebarMenuItems', () => {
    const items = toSidebarMenuItems([{ path: '/dashboard', label: '仪表盘', icon: 'LayoutDashboard' }])
    expect(items).toHaveLength(1)
    expect(items[0].path).toBe('/dashboard')
    expect(items[0].key).toBe('path:/dashboard')
    expect(items[0].label).toBe('仪表盘')
  })

  it('filters out items with no label', () => {
    const items = toSidebarMenuItems([{ path: '/x', label: '' }])
    expect(items).toHaveLength(0)
  })

  it('filters out items with enabled=false', () => {
    const items = toSidebarMenuItems([
      { path: '/a', label: 'A', enabled: false },
      { path: '/b', label: 'B' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].path).toBe('/b')
  })

  it('deduplicates paths (second occurrence gets no path)', () => {
    const items = toSidebarMenuItems([
      { path: '/dup', label: 'First' },
      { path: '/dup', label: 'Second' },
    ])
    expect(items.filter((i) => i.path === '/dup')).toHaveLength(1)
  })

  it('builds nested children', () => {
    const config: MenuConfigItem[] = [
      { label: 'Parent', children: [{ path: '/child', label: 'Child', icon: 'Users' }] },
    ]
    const items = toSidebarMenuItems(config)
    expect(items).toHaveLength(1)
    expect(items[0].children).toHaveLength(1)
    expect(items[0].children![0].path).toBe('/child')
  })

  it('falls back to Circle icon for unknown icon name', () => {
    const items = toSidebarMenuItems([{ path: '/x', label: 'X', icon: 'UnknownIcon' }])
    expect(items[0].icon).toBe('Circle')
  })
})

// ---------------------------------------------------------------------------
// flattenLeafItems
// ---------------------------------------------------------------------------

describe('flattenLeafItems', () => {
  it('returns flat array for leaf-only list', () => {
    expect(flattenLeafItems([makeItem('k1', '/a'), makeItem('k2', '/b')])).toHaveLength(2)
  })

  it('recursively collects children', () => {
    const parent: SidebarMenuItem = { key: 'p', label: 'P', icon: 'X', children: [makeItem('c', '/child')] }
    const result = flattenLeafItems([parent])
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/child')
  })

  it('excludes non-path parents', () => {
    const parent: SidebarMenuItem = { key: 'p', label: 'P', icon: 'X', children: [makeItem('c', '/c')] }
    const result = flattenLeafItems([parent])
    expect(result.every((i) => i.path !== undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// collectParentKeys
// ---------------------------------------------------------------------------

describe('collectParentKeys', () => {
  it('returns empty for leaf-only list', () => {
    expect(collectParentKeys([makeItem('k', '/x')])).toEqual([])
  })

  it('collects parent key for items with children', () => {
    const parent: SidebarMenuItem = { key: 'parent', label: 'P', icon: 'X', children: [makeItem('c', '/c')] }
    expect(collectParentKeys([parent])).toContain('parent')
  })
})

// ---------------------------------------------------------------------------
// findNodeByKey
// ---------------------------------------------------------------------------

describe('findNodeByKey', () => {
  it('finds a top-level item by key', () => {
    const items = [makeItem('k1', '/a'), makeItem('k2', '/b')]
    expect(findNodeByKey(items, 'k2')?.path).toBe('/b')
  })

  it('finds a nested item by key', () => {
    const child = makeItem('child-key', '/nested')
    const parent: SidebarMenuItem = { key: 'parent', label: 'P', icon: 'X', children: [child] }
    expect(findNodeByKey([parent], 'child-key')?.path).toBe('/nested')
  })

  it('returns undefined for unknown key', () => {
    expect(findNodeByKey([makeItem('k', '/x')], 'missing')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// isNodeActive
// ---------------------------------------------------------------------------

describe('isNodeActive', () => {
  it('returns true when item.path matches pathname', () => {
    expect(isNodeActive(makeItem('k', '/dashboard'), '/dashboard')).toBe(true)
  })

  it('returns false for different path', () => {
    expect(isNodeActive(makeItem('k', '/users'), '/dashboard')).toBe(false)
  })

  it('returns true when child matches pathname', () => {
    const parent: SidebarMenuItem = { key: 'p', label: 'P', icon: 'X', children: [makeItem('c', '/users')] }
    expect(isNodeActive(parent, '/users')).toBe(true)
  })

  it('returns false for leaf with no path match and no children', () => {
    const item: SidebarMenuItem = { key: 'k', label: 'L', icon: 'X' }
    expect(isNodeActive(item, '/somewhere')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterByKeyword
// ---------------------------------------------------------------------------

describe('filterByKeyword', () => {
  it('returns all items for empty keyword', () => {
    const items = [makeItem('k1', '/a', '用户管理'), makeItem('k2', '/b', '群组管理')]
    expect(filterByKeyword(items, '')).toHaveLength(2)
  })

  it('returns items matching label (case-insensitive)', () => {
    const items = [makeItem('k1', '/users', 'User List'), makeItem('k2', '/groups', 'Groups')]
    const result = filterByKeyword(items, 'user')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/users')
  })

  it('returns items matching path', () => {
    const items = [makeItem('k1', '/admin/users', 'Admin')]
    expect(filterByKeyword(items, '/admin')).toHaveLength(1)
  })

  it('filters in children matching the keyword', () => {
    const children = [makeItem('c1', '/settings', '系统设置')]
    const parent: SidebarMenuItem = { key: 'p', label: 'Other', icon: 'X', children }
    const result = filterByKeyword([parent], '设置')
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
  })

  it('excludes nodes with no keyword matches', () => {
    const items = [makeItem('k1', '/x', 'Alpha'), makeItem('k2', '/y', 'Beta')]
    expect(filterByKeyword(items, 'gamma')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// filterByRbac
// ---------------------------------------------------------------------------

describe('filterByRbac', () => {
  it('returns all items when no roleId provided', () => {
    expect(filterByRbac([makeItem('k', '/x', 'X')], undefined)).toHaveLength(1)
  })

  it('filters out items not in allowed role list', () => {
    const item: SidebarMenuItem = { key: 'k', path: '/admin', label: 'Admin', icon: 'X', roles: [1] }
    expect(filterByRbac([item], 2).some((i) => i.path === '/admin')).toBe(false)
  })

  it('allows items for matching role', () => {
    const item: SidebarMenuItem = { key: 'k', path: '/users', label: 'Users', icon: 'X', roles: [1, 2] }
    expect(filterByRbac([item], 2)).toHaveLength(1)
  })

  it('allows items with no roles restriction', () => {
    const item: SidebarMenuItem = { key: 'k', path: '/dashboard', label: 'Dash', icon: 'X' }
    expect(filterByRbac([item], 3)).toHaveLength(1)
  })

  it('falls back to dashboard when all items filtered out', () => {
    const dashboard: SidebarMenuItem = { key: 'd', path: '/dashboard', label: 'Dash', icon: 'X', roles: [1] }
    const other: SidebarMenuItem = { key: 'o', path: '/other', label: 'Other', icon: 'X', roles: [1] }
    const result = filterByRbac([dashboard, other], 2)
    expect(result.some((i) => i.path === '/dashboard')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// filterByFeatures
// ---------------------------------------------------------------------------

describe('filterByFeatures', () => {
  it('returns all items when featureFlags is null', () => {
    expect(filterByFeatures([makeItem('k', '/x', 'X')], null)).toHaveLength(1)
  })

  it('returns all items when featureFlags is empty object', () => {
    expect(filterByFeatures([makeItem('k', '/x', 'X')], {})).toHaveLength(1)
  })

  it('excludes path when feature flag is false', () => {
    const items = [makeItem('k', '/groups', 'Groups')]
    expect(filterByFeatures(items, { admin_groups: false }).some((i) => i.path === '/groups')).toBe(false)
  })

  it('keeps path when feature flag is true', () => {
    const items = [makeItem('k', '/groups', 'Groups')]
    expect(filterByFeatures(items, { admin_groups: true })).toHaveLength(1)
  })

  it('keeps path when feature key is not present in flags', () => {
    const items = [makeItem('k', '/analytics', 'Analytics')]
    expect(filterByFeatures(items, { admin_groups: false })).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// pickSafeMenuSource
// ---------------------------------------------------------------------------

describe('pickSafeMenuSource', () => {
  it('returns provided items when array is non-empty', () => {
    const items: MenuConfigItem[] = [{ path: '/x', label: 'X' }]
    expect(pickSafeMenuSource(items)).toBe(items)
  })

  it('returns defaultConfigItems for empty array', () => {
    expect(pickSafeMenuSource([])).toBe(defaultConfigItems)
  })

  it('returns defaultConfigItems for undefined', () => {
    expect(pickSafeMenuSource(undefined)).toBe(defaultConfigItems)
  })
})

// ---------------------------------------------------------------------------
// removeFavoriteLeaves
// ---------------------------------------------------------------------------

describe('removeFavoriteLeaves', () => {
  it('removes item whose path is in favoriteSet', () => {
    const result = removeFavoriteLeaves([makeItem('k', '/dashboard', 'Dash')], new Set(['/dashboard']))
    expect(result).toHaveLength(0)
  })

  it('keeps item whose path is NOT in favoriteSet', () => {
    const result = removeFavoriteLeaves([makeItem('k', '/users', 'Users')], new Set(['/dashboard']))
    expect(result).toHaveLength(1)
  })

  it('recursively removes favorite children', () => {
    const children = [makeItem('c', '/child', 'Child')]
    const parent: SidebarMenuItem = { key: 'p', label: 'P', icon: 'X', children }
    const result = removeFavoriteLeaves([parent], new Set(['/child']))
    expect(result).toHaveLength(0)
  })

  it('keeps parent when some children remain', () => {
    const children = [makeItem('c1', '/fav', 'Fav'), makeItem('c2', '/keep', 'Keep')]
    const parent: SidebarMenuItem = { key: 'p', label: 'P', icon: 'X', children }
    const result = removeFavoriteLeaves([parent], new Set(['/fav']))
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].path).toBe('/keep')
  })
})

// ---------------------------------------------------------------------------
// readFavoritePaths
// ---------------------------------------------------------------------------

afterEach(() => {
  localStorage.removeItem(SIDEBAR_FAVORITES_KEY)
})

describe('readFavoritePaths', () => {
  it('returns empty array when key is absent', () => {
    expect(readFavoritePaths()).toEqual([])
  })

  it('returns stored paths when valid JSON array', () => {
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify(['/dashboard', '/users']))
    expect(readFavoritePaths()).toEqual(['/dashboard', '/users'])
  })

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, 'not-json{{{')
    expect(readFavoritePaths()).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify({ key: 'val' }))
    expect(readFavoritePaths()).toEqual([])
  })

  it('filters out non-string entries', () => {
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify(['/dashboard', 42, null]))
    expect(readFavoritePaths()).toEqual(['/dashboard'])
  })
})
