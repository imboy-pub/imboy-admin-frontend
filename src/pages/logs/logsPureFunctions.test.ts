/**
 * Inline mirror tests for private pure functions in misc page files:
 *   AuditLogPage:          toTimestamp, prettyJson
 *   UserCollectManagePage: toKindLabel, buildInfoPreview
 *   UserTagManagePage:     toSceneLabel
 *   ChannelListPage:       avatarInitial, shouldBlockChannelAvatar
 *   ReportCenterPage:      normalizeTargetType
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// toTimestamp — AuditLogPage.tsx
// ---------------------------------------------------------------------------

function toTimestamp(value: unknown): number {
  if (value === null || value === undefined) return 0

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    if (value > 1e12) return value
    if (value > 1e9) return value * 1000
    return value
  }

  if (value instanceof Date) {
    const ts = value.getTime()
    return Number.isNaN(ts) ? 0 : ts
  }

  const raw = String(value).trim()
  if (!raw) return 0

  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return 0
    if (n > 1e12) return n
    if (n > 1e9) return n * 1000
    return n
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const ts = new Date(normalized).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

describe('toTimestamp', () => {
  it('returns 0 for null', () => {
    expect(toTimestamp(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(toTimestamp(undefined)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(toTimestamp(Infinity)).toBe(0)
  })

  it('returns milliseconds-level timestamp unchanged', () => {
    const ms = 1714000000000
    expect(toTimestamp(ms)).toBe(ms)
  })

  it('converts seconds-level timestamp to milliseconds', () => {
    expect(toTimestamp(1714000000)).toBe(1714000000 * 1000)
  })

  it('returns small number unchanged (< 1e9)', () => {
    expect(toTimestamp(100)).toBe(100)
  })

  it('converts valid Date to timestamp', () => {
    const d = new Date('2024-01-15T00:00:00Z')
    expect(toTimestamp(d)).toBe(d.getTime())
  })

  it('returns 0 for invalid Date', () => {
    expect(toTimestamp(new Date('invalid'))).toBe(0)
  })

  it('parses millisecond digit string', () => {
    expect(toTimestamp('1714000000000')).toBe(1714000000000)
  })

  it('parses seconds digit string', () => {
    expect(toTimestamp('1714000000')).toBe(1714000000 * 1000)
  })

  it('parses ISO date string', () => {
    const result = toTimestamp('2024-01-15T00:00:00Z')
    expect(result).toBeGreaterThan(0)
  })

  it('parses date-time string with space separator', () => {
    const result = toTimestamp('2024-01-15 00:00:00')
    expect(result).toBeGreaterThan(0)
  })

  it('returns 0 for invalid date string', () => {
    expect(toTimestamp('not-a-date')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(toTimestamp('')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// prettyJson — AuditLogPage.tsx
// ---------------------------------------------------------------------------

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

describe('prettyJson', () => {
  it('formats object with indentation', () => {
    const result = prettyJson({ key: 'value' })
    expect(result).toContain('\n')
    expect(result).toContain('"key"')
  })

  it('formats array', () => {
    const result = prettyJson([1, 2, 3])
    expect(result).toContain('1')
  })

  it('handles primitives', () => {
    expect(prettyJson('hello')).toBe('"hello"')
    expect(prettyJson(42)).toBe('42')
    expect(prettyJson(null)).toBe('null')
  })
})

// ---------------------------------------------------------------------------
// toKindLabel — UserCollectManagePage.tsx
// ---------------------------------------------------------------------------

const COLLECT_KIND_OPTIONS = [
  { value: 1, label: '群组' },
  { value: 2, label: '频道' },
  { value: 3, label: '朋友圈' },
]

function toKindLabel(kind: number): string {
  const matched = COLLECT_KIND_OPTIONS.find((item) => item.value === kind)
  return matched ? `${matched.label}(${kind})` : `未知(${kind})`
}

describe('toKindLabel', () => {
  it('returns label with kind for known kind', () => {
    expect(toKindLabel(1)).toBe('群组(1)')
    expect(toKindLabel(2)).toBe('频道(2)')
  })

  it('returns "未知(n)" for unknown kind', () => {
    expect(toKindLabel(99)).toBe('未知(99)')
    expect(toKindLabel(0)).toBe('未知(0)')
  })
})

// ---------------------------------------------------------------------------
// buildInfoPreview — UserCollectManagePage.tsx
// ---------------------------------------------------------------------------

function buildInfoPreview(info?: Record<string, unknown>): string {
  if (!info || typeof info !== 'object') return '-'
  const raw = JSON.stringify(info)
  if (raw.length <= 80) return raw
  return `${raw.slice(0, 80)}...`
}

describe('buildInfoPreview', () => {
  it('returns "-" for undefined', () => {
    expect(buildInfoPreview(undefined)).toBe('-')
  })

  it('returns JSON string for short object', () => {
    const result = buildInfoPreview({ id: '123' })
    expect(result).toContain('"id"')
    expect(result).not.toContain('...')
  })

  it('truncates long JSON to 80 chars + ellipsis', () => {
    const longObj: Record<string, unknown> = {}
    for (let i = 0; i < 20; i++) {
      longObj[`key_${i}`] = `value_${i}`
    }
    const result = buildInfoPreview(longObj)
    expect(result.endsWith('...')).toBe(true)
    // Actual length includes the '...' suffix (3 chars) + 80 chars content
    expect(result.length).toBe(83)
  })
})

// ---------------------------------------------------------------------------
// toSceneLabel — UserTagManagePage.tsx
// ---------------------------------------------------------------------------

function toSceneLabel(scene: number | string): string {
  if (scene === 1 || scene === '1') return '收藏'
  if (scene === 2 || scene === '2') return '好友'
  return '-'
}

describe('toSceneLabel', () => {
  it('returns "收藏" for scene 1', () => {
    expect(toSceneLabel(1)).toBe('收藏')
    expect(toSceneLabel('1')).toBe('收藏')
  })

  it('returns "好友" for scene 2', () => {
    expect(toSceneLabel(2)).toBe('好友')
    expect(toSceneLabel('2')).toBe('好友')
  })

  it('returns "-" for unknown scene', () => {
    expect(toSceneLabel(3)).toBe('-')
    expect(toSceneLabel('other')).toBe('-')
    expect(toSceneLabel(0)).toBe('-')
  })
})

// ---------------------------------------------------------------------------
// avatarInitial — ChannelListPage.tsx
// ---------------------------------------------------------------------------

function avatarInitial(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0) return '?'
  return normalized.charAt(0).toUpperCase()
}

describe('avatarInitial', () => {
  it('returns first character uppercase for regular name', () => {
    expect(avatarInitial('alice')).toBe('A')
    expect(avatarInitial('Bob')).toBe('B')
  })

  it('returns "?" for empty string', () => {
    expect(avatarInitial('')).toBe('?')
  })

  it('returns "?" for whitespace-only string', () => {
    expect(avatarInitial('   ')).toBe('?')
  })

  it('trims whitespace before taking first char', () => {
    expect(avatarInitial('  test')).toBe('T')
  })

  it('handles Chinese characters', () => {
    expect(avatarInitial('频道名')).toBe('频')
  })
})

// ---------------------------------------------------------------------------
// shouldBlockChannelAvatar — ChannelListPage.tsx
// ---------------------------------------------------------------------------

const BLOCKED_CHANNEL_AVATAR_HOSTS = new Set([
  'example.com',
  'blocked.example.org',
])

function shouldBlockChannelAvatar(url: string): boolean {
  try {
    const normalized = url.startsWith('//') ? `https:${url}` : url
    const parsed = new URL(normalized, 'https://imboy.local')
    return BLOCKED_CHANNEL_AVATAR_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

describe('shouldBlockChannelAvatar', () => {
  it('blocks URL matching blocked host', () => {
    expect(shouldBlockChannelAvatar('https://example.com/avatar.jpg')).toBe(true)
  })

  it('does not block URL with allowed host', () => {
    expect(shouldBlockChannelAvatar('https://cdn.imboy.com/avatar.jpg')).toBe(false)
  })

  it('handles protocol-relative URL', () => {
    expect(shouldBlockChannelAvatar('//example.com/img.jpg')).toBe(true)
  })

  it('returns false for invalid URL', () => {
    expect(shouldBlockChannelAvatar('not a url %%')).toBe(false)
  })

  it('matches blocked host case-insensitively', () => {
    expect(shouldBlockChannelAvatar('https://EXAMPLE.COM/img.jpg')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// normalizeTargetType — ReportCenterPage.tsx
// ---------------------------------------------------------------------------

type ReportTargetType = 'moment' | 'user' | 'group' | 'channel' | 'default'

function normalizeTargetType(raw: string | null): ReportTargetType {
  if (raw === 'group' || raw === 'channel' || raw === 'user' || raw === 'moment') return raw
  return 'moment'
}

describe('normalizeTargetType', () => {
  it('returns "group" for "group"', () => {
    expect(normalizeTargetType('group')).toBe('group')
  })

  it('returns "channel" for "channel"', () => {
    expect(normalizeTargetType('channel')).toBe('channel')
  })

  it('returns "user" for "user"', () => {
    expect(normalizeTargetType('user')).toBe('user')
  })

  it('returns "moment" for "moment"', () => {
    expect(normalizeTargetType('moment')).toBe('moment')
  })

  it('returns "moment" for null', () => {
    expect(normalizeTargetType(null)).toBe('moment')
  })

  it('returns "moment" for unknown string', () => {
    expect(normalizeTargetType('unknown')).toBe('moment')
    expect(normalizeTargetType('')).toBe('moment')
  })
})
