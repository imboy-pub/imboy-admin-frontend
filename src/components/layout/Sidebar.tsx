import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UsersRound,
  MessageSquare,
  UserMinus,
  Radio,
  MessageCircle,
  Settings,
  Shield,
  KeyRound,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Star,
  Circle,
  Camera,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMyRbacProfilePayload, RbacProfile } from '@/services/api/rbac'
import { useAuthStore } from '@/stores/authStore'
import { fetchSidebarMenuConfig, type MenuConfigItem, type SidebarMenuConfig } from '@/services/api/adminConfig'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { featureKeyForAdminPath, isAdminFeatureEnabled, type FeatureFlags } from '@/services/api/features'

type SidebarMenuItem = {
  key: string
  path?: string
  label: string
  icon: LucideIcon
  roles?: Array<number | string>
  permission?: string
  children?: SidebarMenuItem[]
}

const SIDEBAR_FAVORITES_KEY = 'imboy_admin_sidebar_favorites'
const LEGACY_MOMENT_COMPAT_PERMISSION = 'messages:read'
const LEGACY_REPORT_COMPAT_PERMISSIONS = new Set([
  'moments:read',
  'moments:delete',
  'moments:report:read',
  'moments:report:handle',
  'reports:read',
  'reports:handle',
])

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UsersRound,
  MessageSquare,
  UserMinus,
  Radio,
  MessageCircle,
  Settings,
  Shield,
  KeyRound,
  FileText,
  Camera,
}

const defaultConfig: SidebarMenuConfig = {
  title: 'Imboy Admin',
  items: [
    { path: '/dashboard', icon: 'LayoutDashboard', label: '仪表盘', roles: [1, 2, 3], permission: 'dashboard:view' },
    {
      label: '运营中心',
      icon: 'Users',
      children: [
        { path: '/users', icon: 'Users', label: '用户管理', roles: [1, 2], permission: 'users:read' },
        { path: '/groups', icon: 'UsersRound', label: '群组管理', roles: [1, 2], permission: 'groups:read' },
        { path: '/channels', icon: 'Radio', label: '频道管理', roles: [1, 2], permission: 'channels:read' },
        { path: '/moments', icon: 'Camera', label: '朋友圈管理', roles: [1, 2], permission: 'moments:read' },
      ],
    },
    {
      label: '治理中心',
      icon: 'FileText',
      children: [
        { path: '/reports', icon: 'FileText', label: '举报中心', roles: [1, 2], permission: 'reports:read' },
        { path: '/feedback', icon: 'MessageCircle', label: '反馈处理', roles: [1, 2], permission: 'feedback:read' },
      ],
    },
    {
      label: '审计中心',
      icon: 'FileText',
      children: [
        { path: '/groups/context', icon: 'UsersRound', label: '群上下文入口', roles: [1, 2, 3] },
        { path: '/messages', icon: 'MessageSquare', label: '消息管理', roles: [1, 2, 3], permission: 'messages:read' },
        { path: '/logout-applications', icon: 'UserMinus', label: '注销申请', roles: [1, 2, 3], permission: 'logout_applications:read' },
        { path: '/logs', icon: 'FileText', label: '日志审计', roles: [1, 3], permission: 'logs:view' },
      ],
    },
    {
      label: '系统配置',
      icon: 'Settings',
      children: [
        { path: '/settings', icon: 'Settings', label: '系统设置', roles: [1], permission: 'settings:view' },
        { path: '/admins', icon: 'Shield', label: '管理员', roles: [1], permission: 'admins:read' },
        { path: '/roles', icon: 'KeyRound', label: '角色权限', roles: [1, 3], permission: 'roles:view' },
      ],
    },
  ],
}

function normalizeRoleId(value: unknown): number | undefined {
  const roleId = Number(value)
  if (!Number.isFinite(roleId) || roleId <= 0) return undefined
  return roleId
}

function fallbackRbacProfile(roleId?: number): RbacProfile | undefined {
  const normalizedRoleId = normalizeRoleId(roleId)
  if (!normalizedRoleId) return undefined
  return {
    role_id: normalizedRoleId,
    role_name: 'fallback',
    permissions: [],
    menu_paths: [],
  }
}

function toSidebarMenuItems(configItems?: MenuConfigItem[], parentKey = 'menu', seenPaths = new Set<string>()): SidebarMenuItem[] {
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

function filterByRbac(items: SidebarMenuItem[], profile?: RbacProfile): SidebarMenuItem[] {
  if (!profile) return items

  const roleId = normalizeRoleId(profile.role_id)
  const allowedPaths = new Set(profile.menu_paths || [])
  const hasPathRule = allowedPaths.size > 0
  const permissions = new Set(profile.permissions || [])
  const hasLegacyMomentCompat = permissions.has(LEGACY_MOMENT_COMPAT_PERMISSION)

  const hasPermissionAccess = (permission?: string): boolean => {
    if (!permission || permissions.size === 0) return true
    if (permissions.has(permission)) return true
    if (permission === 'reports:read' && permissions.has('moments:report:read')) return true
    if (permission === 'reports:handle' && permissions.has('moments:report:handle')) return true
    if (hasLegacyMomentCompat && LEGACY_REPORT_COMPAT_PERMISSIONS.has(permission)) return true
    return false
  }

  const hasPathAccess = (path?: string): boolean => {
    if (!path || !hasPathRule) return true
    if (allowedPaths.has(path)) return true
    if (path === '/reports' && (allowedPaths.has('/moments/reports') || allowedPaths.has('/moments'))) {
      return true
    }
    if (path === '/moments/reports' && allowedPaths.has('/reports')) {
      return true
    }
    if (path === '/moments' && allowedPaths.has('/reports')) {
      return true
    }
    if (hasLegacyMomentCompat && path === '/reports') return true
    if (hasLegacyMomentCompat && path.startsWith('/moments')) return true
    return false
  }

  const walk = (nodes: SidebarMenuItem[]): SidebarMenuItem[] => {
    return nodes
      .map((item) => {
        const itemRoles = Array.isArray(item.roles)
          ? item.roles.map((value) => Number(value)).filter((value) => Number.isFinite(value))
          : []

        const roleAllowed = !(itemRoles.length > 0 && roleId && !itemRoles.includes(roleId))
        const permissionAllowed = hasPermissionAccess(item.permission)
        const pathAllowed = hasPathAccess(item.path)
        const selfAllowed = roleAllowed && permissionAllowed && pathAllowed
        const filteredChildren = item.children ? walk(item.children) : []

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


function filterByFeatures(items: SidebarMenuItem[], featureFlags?: FeatureFlags | null): SidebarMenuItem[] {
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

function pickSafeMenuSource(configItems?: MenuConfigItem[]): MenuConfigItem[] {  if (Array.isArray(configItems) && configItems.length > 0) {
    return configItems
  }
  return defaultConfig.items || []
}


function ensureRenderableMenu(
  items: SidebarMenuItem[],
  profile?: RbacProfile,
  featureFlags?: FeatureFlags | null
): SidebarMenuItem[] {
  if (items.length > 0) return items
  return filterByFeatures(
    filterByRbac(toSidebarMenuItems(defaultConfig.items), profile),
    featureFlags
  )
}
function removeFavoriteLeaves(items: SidebarMenuItem[], favoriteSet: Set<string>): SidebarMenuItem[] {
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

export function Sidebar() {
  const location = useLocation()
  const currentRoleId = useAuthStore((state) => state.admin?.role_id)
  const { data: featureFlags } = useAdminFeatures()
  const [collapsed, setCollapsed] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [title, setTitle] = useState(defaultConfig.title || 'Imboy Admin')
  const [menuItems, setMenuItems] = useState<SidebarMenuItem[]>(toSidebarMenuItems(defaultConfig.items))
  const [expandedKeys, setExpandedKeys] = useState<string[]>(collectParentKeys(toSidebarMenuItems(defaultConfig.items)))
  const [favoritePaths, setFavoritePaths] = useState<string[]>(readFavoritePaths)

  useEffect(() => {
    let cancelled = false

    const loadMenuConfig = async () => {
      let profile: RbacProfile | undefined
      try {
        profile = await getMyRbacProfilePayload()
      } catch {
        profile = fallbackRbacProfile(currentRoleId)
      }

      try {
        const data = await fetchSidebarMenuConfig()
        if (cancelled) return
        const sourceItems = pickSafeMenuSource(data.items)
        const normalizedItems = toSidebarMenuItems(sourceItems)

        const filteredItems = ensureRenderableMenu(
          filterByFeatures(filterByRbac(normalizedItems, profile), featureFlags),
          profile,
          featureFlags
        )
        setTitle(data.title || defaultConfig.title || 'Imboy Admin')
        setMenuItems(filteredItems)
        setExpandedKeys(collectParentKeys(filteredItems))
      } catch {
        if (cancelled) return

        const fallbackItems = ensureRenderableMenu(
          filterByFeatures(
            filterByRbac(toSidebarMenuItems(defaultConfig.items), profile),
            featureFlags
          ),
          profile,
          featureFlags
        )
        setTitle(defaultConfig.title || 'Imboy Admin')
        setMenuItems(fallbackItems)
        setExpandedKeys(collectParentKeys(fallbackItems))
      }
    }

    loadMenuConfig()
    return () => {
      cancelled = true
    }
  }, [currentRoleId, featureFlags])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify(favoritePaths))
    } catch {
      // Ignore storage write failures (privacy mode / quota) to avoid breaking sidebar rendering.
    }
  }, [favoritePaths])

  const normalizedKeyword = keyword.trim().toLowerCase()
  const roleBasedFallbackProfile = useMemo(
    () => fallbackRbacProfile(normalizeRoleId(currentRoleId)),
    [currentRoleId]
  )

  const filteredItems = useMemo(() => {
    if (!normalizedKeyword) return menuItems
    return filterByKeyword(menuItems, normalizedKeyword)
  }, [menuItems, normalizedKeyword])

  const effectiveExpandedKeys = useMemo(() => {
    const keys = collectParentKeys(menuItems)
    const keep = expandedKeys.filter((key) => keys.includes(key))
    const active = keys.filter((key) => {
      const node = findNodeByKey(menuItems, key)
      return node ? isNodeActive(node, location.pathname) : false
    })
    return Array.from(new Set([...keep, ...active]))
  }, [expandedKeys, location.pathname, menuItems])

  const displayItems = useMemo(() => {
    if (filteredItems.length > 0) return filteredItems

    const fallback = ensureRenderableMenu(
      filterByFeatures(
        filterByRbac(toSidebarMenuItems(defaultConfig.items), roleBasedFallbackProfile),
        featureFlags
      ),
      roleBasedFallbackProfile,
      featureFlags
    )
    return normalizedKeyword ? filterByKeyword(fallback, normalizedKeyword) : fallback
  }, [filteredItems, normalizedKeyword, roleBasedFallbackProfile, featureFlags])

  const flatFilteredItems = useMemo(() => flattenLeafItems(displayItems), [displayItems])

  const favoriteItems = useMemo(() => {
    if (favoritePaths.length === 0) return []
    const favoriteSet = new Set(favoritePaths)
    return flatFilteredItems.filter((item) => item.path && favoriteSet.has(item.path))
  }, [flatFilteredItems, favoritePaths])

  const favoriteSet = useMemo(() => new Set(favoritePaths), [favoritePaths])
  const treeItems = useMemo(() => {
    if (favoriteItems.length === 0) return displayItems
    const deduped = removeFavoriteLeaves(displayItems, favoriteSet)
    return deduped.length > 0 ? deduped : displayItems
  }, [displayItems, favoriteItems.length, favoriteSet])

  const toggleFavorite = (path: string) => {
    setFavoritePaths((current) => {
      if (current.includes(path)) {
        return current.filter((item) => item !== path)
      }
      return [...current, path]
    })
  }

  const renderLeafMenuItem = (item: SidebarMenuItem, level = 0) => {
    if (!item.path) return null
    const isFavorite = favoritePaths.includes(item.path)
    const indentStyle = !collapsed && level > 0 ? { paddingLeft: `${12 + level * 12}px` } : undefined

    return (
      <NavLink
        key={item.key}
        to={item.path}
        style={indentStyle}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
            collapsed && 'justify-center'
          )
        }
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!collapsed && (
          <button
            type="button"
            className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-foreground"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleFavorite(item.path!)
            }}
            aria-label={isFavorite ? '取消收藏' : '收藏菜单'}
            title={isFavorite ? '取消收藏' : '收藏菜单'}
          >
            <Star className={cn('h-4 w-4', isFavorite && 'fill-current text-amber-500')} />
          </button>
        )}
      </NavLink>
    )
  }

  const toggleGroup = (key: string) => {
    setExpandedKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key)
      }
      return [...current, key]
    })
  }

  const renderTreeItem = (item: SidebarMenuItem, level: number): ReactNode => {
    if (!item.children || item.children.length === 0) {
      return renderLeafMenuItem(item, level)
    }

    if (collapsed) return null

    const childNodes = item.children
      .map((child) => renderTreeItem(child, level + 1))
      .filter(Boolean)

    if (!item.path && childNodes.length === 0) return null
    const isOpen = effectiveExpandedKeys.includes(item.key)
    const active = isNodeActive(item, location.pathname)
    const indentStyle = level > 0 ? { paddingLeft: `${12 + level * 12}px` } : undefined

    return (
      <div key={item.key} className="space-y-1">
        <button
          type="button"
          style={indentStyle}
          onClick={() => toggleGroup(item.key)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            active && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : 'rotate-0')}
          />
        </button>

        {isOpen && (
          <div className="space-y-1">
            {item.path && renderLeafMenuItem(item, level + 1)}
            {childNodes}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-sidebar-background transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && <span className="text-xl font-bold text-sidebar-primary">{title}</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="rounded p-1.5 hover:bg-sidebar-accent">
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/60" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索菜单"
              className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-background pl-8 pr-2 text-sm outline-none focus:border-sidebar-primary"
            />
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-2 overflow-y-auto p-2">
        {!collapsed && favoriteItems.length > 0 && (
          <section className="space-y-1">
            <div className="px-2 text-xs font-medium text-sidebar-foreground/60">收藏</div>
            {favoriteItems.map((item) => renderLeafMenuItem(item, 0))}
          </section>
        )}

        {!collapsed && favoriteItems.length > 0 && displayItems.length > 0 && <div className="border-t border-sidebar-border" />}

        {collapsed ? (
          <section className="space-y-1">
            {flatFilteredItems.map((item) => renderLeafMenuItem(item, 0))}
          </section>
        ) : (
          <section className="space-y-1">
            {treeItems.map((item) => renderTreeItem(item, 0))}
          </section>
        )}

        {!collapsed && flatFilteredItems.length === 0 && (
          <div className="px-2 py-4 text-sm text-sidebar-foreground/60">未找到匹配菜单</div>
        )}
      </nav>
    </aside>
  )
}
