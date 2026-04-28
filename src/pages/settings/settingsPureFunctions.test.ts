/**
 * Inline mirror tests for private pure functions scattered across settings/auth pages:
 *   PushTokenListPage:    truncateToken
 *   SettingsHomePage:     roleLabel
 *   MutedUsersPage:       formatRemaining
 *   FeatureConfigPage:    isDependencyBlocked
 *   LoginPage:            normalizeNextRoute
 *   RolePermissionPage:   parsePermissionKeys
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// truncateToken (PushTokenListPage.tsx)
// ---------------------------------------------------------------------------

function truncateToken(token: string, maxLen = 20): string {
  if (token.length <= maxLen) return token
  return `${token.slice(0, maxLen)}...`
}

describe('truncateToken', () => {
  it('returns full token when length <= maxLen', () => {
    expect(truncateToken('short', 20)).toBe('short')
  })

  it('returns full token when exactly maxLen', () => {
    expect(truncateToken('12345678901234567890', 20)).toBe('12345678901234567890')
  })

  it('truncates and appends ellipsis when length > maxLen', () => {
    const result = truncateToken('123456789012345678901234', 20)
    expect(result).toBe('12345678901234567890...')
  })

  it('uses custom maxLen', () => {
    const result = truncateToken('hello world', 5)
    expect(result).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncateToken('', 10)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// roleLabel (SettingsHomePage.tsx)
// ---------------------------------------------------------------------------

function roleLabel(roleId?: number): string {
  switch (roleId) {
    case 1: return '超级管理员'
    case 2: return '运营管理员'
    case 3: return '审计管理员'
    default: return `角色 #${roleId ?? 0}`
  }
}

describe('roleLabel', () => {
  it('returns "超级管理员" for role 1', () => {
    expect(roleLabel(1)).toBe('超级管理员')
  })

  it('returns "运营管理员" for role 2', () => {
    expect(roleLabel(2)).toBe('运营管理员')
  })

  it('returns "审计管理员" for role 3', () => {
    expect(roleLabel(3)).toBe('审计管理员')
  })

  it('returns generic label for unknown role id', () => {
    expect(roleLabel(5)).toBe('角色 #5')
    expect(roleLabel(99)).toBe('角色 #99')
  })

  it('returns "角色 #0" when roleId is undefined', () => {
    expect(roleLabel(undefined)).toBe('角色 #0')
  })
})

// ---------------------------------------------------------------------------
// formatRemaining (MutedUsersPage.tsx)
// ---------------------------------------------------------------------------

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '已到期'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) return `${hours} 小时 ${remainMinutes} 分钟`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days} 天 ${remainHours} 小时`
}

describe('formatRemaining', () => {
  it('returns "已到期" for 0 seconds', () => {
    expect(formatRemaining(0)).toBe('已到期')
  })

  it('returns "已到期" for negative seconds', () => {
    expect(formatRemaining(-100)).toBe('已到期')
  })

  it('formats small duration in minutes', () => {
    expect(formatRemaining(30)).toBe('1 分钟')
    expect(formatRemaining(90)).toBe('2 分钟')
    expect(formatRemaining(3540)).toBe('59 分钟')
  })

  it('formats duration of exactly 1 hour', () => {
    const result = formatRemaining(3600)
    expect(result).toBe('1 小时 0 分钟')
  })

  it('formats duration in hours and minutes', () => {
    expect(formatRemaining(5400)).toBe('1 小时 30 分钟')  // 90 min
  })

  it('formats duration of exactly 1 day', () => {
    const result = formatRemaining(86400)
    expect(result).toBe('1 天 0 小时')
  })

  it('formats duration in days and hours', () => {
    const result = formatRemaining(90000)  // 25 hours
    expect(result).toBe('1 天 1 小时')
  })
})

// ---------------------------------------------------------------------------
// isDependencyBlocked (FeatureConfigPage.tsx)
// ---------------------------------------------------------------------------

type FeatureDisplay = {
  name: string
  label: string
  description?: string
  dependencies?: string[]
  group?: string
}

type FeatureFlags = Record<string, boolean>

function isDependencyBlocked(feature: FeatureDisplay, featureFlags: FeatureFlags): boolean {
  if (!feature.dependencies || feature.dependencies.length === 0) return false
  return feature.dependencies.some((dep) => !featureFlags[dep])
}

describe('isDependencyBlocked', () => {
  it('returns false when feature has no dependencies', () => {
    const feature: FeatureDisplay = { name: 'channel', label: '频道', dependencies: [] }
    expect(isDependencyBlocked(feature, {})).toBe(false)
  })

  it('returns false when all dependencies are enabled', () => {
    const feature: FeatureDisplay = { name: 'channel_invitation', label: '邀请', dependencies: ['channel'] }
    expect(isDependencyBlocked(feature, { channel: true })).toBe(false)
  })

  it('returns true when a dependency is disabled (false)', () => {
    const feature: FeatureDisplay = { name: 'channel_invitation', label: '邀请', dependencies: ['channel'] }
    expect(isDependencyBlocked(feature, { channel: false })).toBe(true)
  })

  it('returns true when a dependency is missing from flags (falsy)', () => {
    const feature: FeatureDisplay = { name: 'group_task', label: '任务', dependencies: ['group'] }
    expect(isDependencyBlocked(feature, {})).toBe(true)
  })

  it('returns true when any one of multiple dependencies is blocked', () => {
    const feature: FeatureDisplay = { name: 'x', label: 'X', dependencies: ['a', 'b'] }
    expect(isDependencyBlocked(feature, { a: true, b: false })).toBe(true)
  })

  it('returns false when dependencies is undefined', () => {
    const feature: FeatureDisplay = { name: 'x', label: 'X' }
    expect(isDependencyBlocked(feature, {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeNextRoute (LoginPage.tsx)
// ---------------------------------------------------------------------------

const KNOWN_FRONTEND_ROUTES = new Set([
  '/dashboard', '/users', '/groups', '/channels', '/moments', '/analytics',
  '/reports', '/feedback', '/announcements', '/messages', '/logout-applications',
  '/logs', '/settings', '/admins', '/roles',
])

const ROUTE_ALIASES: Record<string, string> = {
  '/': '/dashboard',
  '/login': '/dashboard',
  '/setup': '/dashboard',
}

function normalizeNextRoute(rawNext?: string): string {
  if (!rawNext || typeof rawNext !== 'string') return '/dashboard'
  const trimmed = rawNext.trim()
  if (!trimmed) return '/dashboard'

  let path = trimmed
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return '/dashboard'
    }
  }

  if (!path.startsWith('/')) path = `/${path}`

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) path = path.slice(0, queryIndex)
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) path = path.slice(0, hashIndex)
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  if (ROUTE_ALIASES[path]) return ROUTE_ALIASES[path]

  if (path.startsWith('/adm/passport')) return '/dashboard'

  if (path.startsWith('/adm/')) {
    const directPath = path.replace('/adm', '') || '/dashboard'
    if (KNOWN_FRONTEND_ROUTES.has(directPath)) return directPath
    return '/dashboard'
  }

  if (KNOWN_FRONTEND_ROUTES.has(path)) return path

  return '/dashboard'
}

describe('normalizeNextRoute', () => {
  it('returns /dashboard for undefined', () => {
    expect(normalizeNextRoute(undefined)).toBe('/dashboard')
  })

  it('returns /dashboard for empty string', () => {
    expect(normalizeNextRoute('')).toBe('/dashboard')
  })

  it('returns /dashboard for whitespace', () => {
    expect(normalizeNextRoute('   ')).toBe('/dashboard')
  })

  it('returns /dashboard for alias "/"', () => {
    expect(normalizeNextRoute('/')).toBe('/dashboard')
  })

  it('returns /dashboard for alias "/login"', () => {
    expect(normalizeNextRoute('/login')).toBe('/dashboard')
  })

  it('returns known route as-is', () => {
    expect(normalizeNextRoute('/users')).toBe('/users')
    expect(normalizeNextRoute('/groups')).toBe('/groups')
  })

  it('strips query string', () => {
    expect(normalizeNextRoute('/users?page=1')).toBe('/users')
  })

  it('strips hash', () => {
    expect(normalizeNextRoute('/dashboard#top')).toBe('/dashboard')
  })

  it('strips trailing slash', () => {
    expect(normalizeNextRoute('/users/')).toBe('/users')
  })

  it('extracts pathname from http URL', () => {
    expect(normalizeNextRoute('http://example.com/users')).toBe('/users')
  })

  it('maps /adm/ prefix to frontend path', () => {
    expect(normalizeNextRoute('/adm/users')).toBe('/users')
  })

  it('returns /dashboard for /adm/ path not in known routes', () => {
    expect(normalizeNextRoute('/adm/unknown_path')).toBe('/dashboard')
  })

  it('returns /dashboard for unknown route', () => {
    expect(normalizeNextRoute('/not/a/known/route')).toBe('/dashboard')
  })

  it('prepends slash for path missing it', () => {
    expect(normalizeNextRoute('dashboard')).toBe('/dashboard')
  })
})

// ---------------------------------------------------------------------------
// parsePermissionKeys (RolePermissionPage.tsx)
// ---------------------------------------------------------------------------

function parsePermissionKeys(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  )
}

describe('parsePermissionKeys', () => {
  it('parses newline-separated keys', () => {
    const result = parsePermissionKeys('users:read\ngroups:read\nlogs:view')
    expect(result).toEqual(['users:read', 'groups:read', 'logs:view'])
  })

  it('parses comma-separated keys', () => {
    const result = parsePermissionKeys('users:read,groups:read')
    expect(result).toContain('users:read')
    expect(result).toContain('groups:read')
  })

  it('deduplicates keys', () => {
    const result = parsePermissionKeys('users:read\nusers:read\ngroups:read')
    expect(result).toHaveLength(2)
  })

  it('trims whitespace from keys', () => {
    const result = parsePermissionKeys('  users:read  ,  groups:read  ')
    expect(result).toContain('users:read')
    expect(result).toContain('groups:read')
  })

  it('returns empty array for empty string', () => {
    expect(parsePermissionKeys('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parsePermissionKeys('   \n   ')).toEqual([])
  })

  it('handles mixed delimiters', () => {
    const result = parsePermissionKeys('a:b;c:d e:f')
    expect(result).toContain('a:b')
    expect(result).toContain('c:d')
    expect(result).toContain('e:f')
  })
})
