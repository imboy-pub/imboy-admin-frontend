import { NavLink, useLocation } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { fetchSidebarMenuConfig } from '@/services/api/adminConfig'
import { useAdminFeatures, useAdminEntries } from '@/hooks/useAdminFeatures'
import { useSidebarBadges } from '@/hooks/useSidebarBadges'
import {
  defaultConfig,
  SIDEBAR_FAVORITES_KEY,
  type SidebarMenuItem,
} from './sidebarSchema'
import {
  collectParentKeys,
  ensureRenderableMenu,
  filterByAdminEntries,
  filterByFeatures,
  filterByKeyword,
  filterByRbac,
  findNodeByKey,
  flattenLeafItems,
  isNodeActive,
  normalizeRoleId,
  pickSafeMenuSource,
  readFavoritePaths,
  removeFavoriteLeaves,
  toSidebarMenuItems,
} from './sidebarFilters'


export function Sidebar() {
  const location = useLocation()
  const currentRoleId = useAuthStore((state) => state.admin?.role_id)
  const { data: featureFlags } = useAdminFeatures()
  const { data: adminEntries } = useAdminEntries()
  const { pendingReports, pendingFeedback } = useSidebarBadges()
  const badges: Record<string, number> = {
    '/reports': pendingReports,
    '/feedback': pendingFeedback,
  }
  const [collapsed, setCollapsed] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [title, setTitle] = useState(defaultConfig.title || 'Imboy Admin')
  const [menuItems, setMenuItems] = useState<SidebarMenuItem[]>(toSidebarMenuItems(defaultConfig.items))
  const [expandedKeys, setExpandedKeys] = useState<string[]>(collectParentKeys(toSidebarMenuItems(defaultConfig.items)))
  const [favoritePaths, setFavoritePaths] = useState<string[]>(readFavoritePaths)

  useEffect(() => {
    let cancelled = false
    const roleId = normalizeRoleId(currentRoleId)

    const loadMenuConfig = async () => {
      try {
        const data = await fetchSidebarMenuConfig()
        if (cancelled) return
        const normalizedItems = toSidebarMenuItems(pickSafeMenuSource(data.items))
        const filteredItems = ensureRenderableMenu(
          filterByAdminEntries(
            filterByFeatures(filterByRbac(normalizedItems, roleId), featureFlags),
            adminEntries
          ),
          roleId,
          featureFlags,
          adminEntries
        )
        setTitle(data.title || defaultConfig.title || 'Imboy Admin')
        setMenuItems(filteredItems)
        setExpandedKeys(collectParentKeys(filteredItems))
      } catch {
        if (cancelled) return
        const fallbackItems = ensureRenderableMenu(
          filterByAdminEntries(
            filterByFeatures(filterByRbac(toSidebarMenuItems(defaultConfig.items), roleId), featureFlags),
            adminEntries
          ),
          roleId,
          featureFlags,
          adminEntries
        )
        setTitle(defaultConfig.title || 'Imboy Admin')
        setMenuItems(fallbackItems)
        setExpandedKeys(collectParentKeys(fallbackItems))
      }
    }

    loadMenuConfig()
    return () => { cancelled = true }
  }, [currentRoleId, featureFlags, adminEntries])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify(favoritePaths))
    } catch {
      // Ignore storage write failures (privacy mode / quota) to avoid breaking sidebar rendering.
    }
  }, [favoritePaths])

  const normalizedKeyword = keyword.trim().toLowerCase()
  const roleId = useMemo(() => normalizeRoleId(currentRoleId), [currentRoleId])

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
      filterByFeatures(filterByRbac(toSidebarMenuItems(defaultConfig.items), roleId), featureFlags),
      roleId,
      featureFlags
    )
    return normalizedKeyword ? filterByKeyword(fallback, normalizedKeyword) : fallback
  }, [filteredItems, normalizedKeyword, roleId, featureFlags])

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
    const badgeCount = badges[item.path] ?? 0

    return (
      <NavLink
        key={item.key}
        to={item.path}
        style={indentStyle}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
            collapsed && 'justify-center'
          )
        }
      >
        <div className="relative">
          <item.icon className="h-5 w-5 shrink-0" />
          {badgeCount > 0 && collapsed && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </div>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!collapsed && badgeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
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
