/**
 * Unit tests for Header.tsx pure logic functions:
 *   parseQuickJump — regex-based entity routing
 *   entityToCommandItem — search result to command item
 */
import { describe, expect, it } from 'bun:test'

// --- Type mirrors ---
type CommandItem = {
  key: string
  label: string
  path: string
  keywords: string[]
  group?: string
}

type EntitySearchResult = {
  id: string | number
  type: string
  name: string
}

// --- Inlined private functions ---

function parseQuickJump(keyword: string): CommandItem | null {
  const matched = keyword.trim().match(/^(user|group|channel|moment)\s+([a-zA-Z0-9_-]+)$/i)
  if (!matched) return null

  const entity = matched[1].toLowerCase()
  const entityId = matched[2]

  const mapping: Record<string, { label: string; pathPrefix: string }> = {
    user: { label: '用户详情', pathPrefix: '/users/' },
    group: { label: '群组详情', pathPrefix: '/groups/' },
    channel: { label: '频道详情', pathPrefix: '/channels/' },
    moment: { label: '动态详情', pathPrefix: '/moments/' },
  }

  const target = mapping[entity]
  if (!target) return null

  return {
    key: `quick:${entity}:${entityId}`,
    label: `打开 ${target.label} ${entityId}`,
    path: `${target.pathPrefix}${entityId}`,
    keywords: [entity, entityId],
  }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  group: '群组',
  channel: '频道',
}

function entityToCommandItem(result: EntitySearchResult): CommandItem {
  const pathMap: Record<string, string> = {
    user: `/users/${result.id}`,
    group: `/groups/${result.id}`,
    channel: `/channels/${result.id}`,
  }
  return {
    key: `entity:${result.type}:${result.id}`,
    label: result.name,
    path: pathMap[result.type] || '/',
    keywords: [result.type, String(result.id), result.name],
    group: ENTITY_TYPE_LABELS[result.type],
  }
}

// --- Tests ---

describe('parseQuickJump', () => {
  it('parses "user 123" correctly', () => {
    const result = parseQuickJump('user 123')
    expect(result?.path).toBe('/users/123')
    expect(result?.label).toBe('打开 用户详情 123')
    expect(result?.key).toBe('quick:user:123')
  })

  it('parses "group abc" correctly', () => {
    const result = parseQuickJump('group abc')
    expect(result?.path).toBe('/groups/abc')
    expect(result?.label).toContain('群组详情')
  })

  it('parses "channel ch-001" correctly', () => {
    const result = parseQuickJump('channel ch-001')
    expect(result?.path).toBe('/channels/ch-001')
  })

  it('parses "moment mom_123" correctly', () => {
    const result = parseQuickJump('moment mom_123')
    expect(result?.path).toBe('/moments/mom_123')
  })

  it('is case-insensitive for entity type', () => {
    const result = parseQuickJump('USER 100')
    expect(result?.path).toBe('/users/100')
  })

  it('trims leading/trailing whitespace', () => {
    const result = parseQuickJump('  user 200  ')
    expect(result?.path).toBe('/users/200')
  })

  it('returns null for unknown entity type', () => {
    expect(parseQuickJump('admin 5')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(parseQuickJump('user')).toBeNull()
    expect(parseQuickJump('')).toBeNull()
    expect(parseQuickJump('hello world foo')).toBeNull()
  })

  it('returns null for id with spaces', () => {
    expect(parseQuickJump('user 1 2')).toBeNull()
  })

  it('includes entity and id in keywords', () => {
    const result = parseQuickJump('user 999')
    expect(result?.keywords).toContain('user')
    expect(result?.keywords).toContain('999')
  })
})

describe('entityToCommandItem', () => {
  it('maps user entity to /users/:id', () => {
    const item = entityToCommandItem({ id: '42', type: 'user', name: 'Alice' })
    expect(item.path).toBe('/users/42')
    expect(item.group).toBe('用户')
  })

  it('maps group entity to /groups/:id', () => {
    const item = entityToCommandItem({ id: '7', type: 'group', name: 'Dev Team' })
    expect(item.path).toBe('/groups/7')
    expect(item.group).toBe('群组')
  })

  it('maps channel entity to /channels/:id', () => {
    const item = entityToCommandItem({ id: 'ch-1', type: 'channel', name: 'News' })
    expect(item.path).toBe('/channels/ch-1')
    expect(item.group).toBe('频道')
  })

  it('falls back to "/" for unknown entity type', () => {
    const item = entityToCommandItem({ id: '1', type: 'unknown', name: 'Test' })
    expect(item.path).toBe('/')
  })

  it('sets label from result.name', () => {
    const item = entityToCommandItem({ id: '1', type: 'user', name: 'Bob' })
    expect(item.label).toBe('Bob')
  })

  it('includes type and id in keywords', () => {
    const item = entityToCommandItem({ id: '5', type: 'group', name: 'Test Group' })
    expect(item.keywords).toContain('group')
    expect(item.keywords).toContain('5')
    expect(item.keywords).toContain('Test Group')
  })

  it('handles numeric id', () => {
    const item = entityToCommandItem({ id: 42, type: 'user', name: 'Charlie' })
    expect(item.path).toBe('/users/42')
    expect(item.keywords).toContain('42')
  })
})
