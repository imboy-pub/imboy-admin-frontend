/**
 * Inline mirror tests for private pure functions in misc pages:
 *   ComplianceKeyPage:  isValidPemFormat
 *   RolePermissionPage: normalizeRoleIds (page-level variant)
 *   ReportCenterPage:   isNonMomentTargetType
 *   ChannelDetailPage:  toFormData
 *   FeedbackListPage:   getSlaInfo (uses Date.now — tested with fixed time)
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// isValidPemFormat — ComplianceKeyPage.tsx
// ---------------------------------------------------------------------------

function isValidPemFormat(value: string): boolean {
  const trimmed = value.trim()
  return /^-----BEGIN [A-Z ]+-----/.test(trimmed) && /-----END [A-Z ]+-----\s*$/.test(trimmed)
}

describe('isValidPemFormat', () => {
  it('returns true for valid PEM public key', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq...\n-----END PUBLIC KEY-----'
    expect(isValidPemFormat(pem)).toBe(true)
  })

  it('returns true for valid RSA PRIVATE KEY', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\ndata...\n-----END RSA PRIVATE KEY-----'
    expect(isValidPemFormat(pem)).toBe(true)
  })

  it('returns true with trailing whitespace/newline', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\ndata\n-----END PUBLIC KEY-----\n'
    expect(isValidPemFormat(pem)).toBe(true)
  })

  it('returns false for missing BEGIN header', () => {
    const pem = 'some data\n-----END PUBLIC KEY-----'
    expect(isValidPemFormat(pem)).toBe(false)
  })

  it('returns false for missing END footer', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\nsome data'
    expect(isValidPemFormat(pem)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidPemFormat('')).toBe(false)
  })

  it('returns false for plain text', () => {
    expect(isValidPemFormat('just some random text')).toBe(false)
  })

  it('trims surrounding whitespace before validation', () => {
    const pem = '  -----BEGIN PUBLIC KEY-----\ndata\n-----END PUBLIC KEY-----  '
    expect(isValidPemFormat(pem)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// normalizeRoleIds (page-level) — RolePermissionPage.tsx
// ---------------------------------------------------------------------------

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

describe('normalizeRoleIds (RolePermissionPage)', () => {
  it('wraps single numeric string', () => {
    expect(normalizeRoleIds('3')).toEqual([3])
  })

  it('wraps single number', () => {
    expect(normalizeRoleIds(5)).toEqual([5])
  })

  it('deduplicates mixed array', () => {
    expect(normalizeRoleIds([1, '2', 2, 3])).toEqual([1, 2, 3])
  })

  it('filters non-positive values', () => {
    expect(normalizeRoleIds([0, -1, 1, 2])).toEqual([1, 2])
  })

  it('filters non-numeric strings', () => {
    expect(normalizeRoleIds(['admin', '1', 'mod'])).toEqual([1])
  })

  it('returns empty for empty array', () => {
    expect(normalizeRoleIds([])).toEqual([])
  })

  it('returns empty for undefined', () => {
    expect(normalizeRoleIds(undefined)).toEqual([])
  })

  it('returns empty for null', () => {
    expect(normalizeRoleIds(null)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isNonMomentTargetType — ReportCenterPage.tsx
// ---------------------------------------------------------------------------

type ReportTargetType = 'moment' | 'user' | 'group' | 'channel' | 'default'

function isNonMomentTargetType(
  targetType: ReportTargetType
): targetType is Exclude<ReportTargetType, 'moment'> {
  return targetType !== 'moment'
}

describe('isNonMomentTargetType', () => {
  it('returns false for "moment"', () => {
    expect(isNonMomentTargetType('moment')).toBe(false)
  })

  it('returns true for "group"', () => {
    expect(isNonMomentTargetType('group')).toBe(true)
  })

  it('returns true for "channel"', () => {
    expect(isNonMomentTargetType('channel')).toBe(true)
  })

  it('returns true for "user"', () => {
    expect(isNonMomentTargetType('user')).toBe(true)
  })

  it('returns true for "default"', () => {
    expect(isNonMomentTargetType('default')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// toFormData — ChannelDetailPage.tsx
// ---------------------------------------------------------------------------

type ChannelForm = {
  name: string
  custom_id: string
  type: number
  status: number
  avatar: string
  description: string
}

function toFormData(channel: {
  name: string
  custom_id: string | null
  type: number
  status: number
  avatar: string | null
  description: string | null
}): ChannelForm {
  return {
    name: channel.name || '',
    custom_id: channel.custom_id || '',
    type: channel.type,
    status: channel.status,
    avatar: channel.avatar || '',
    description: channel.description || '',
  }
}

describe('toFormData (ChannelDetailPage)', () => {
  it('maps all non-null fields directly', () => {
    const channel = {
      name: 'test channel',
      custom_id: 'ch001',
      type: 1,
      status: 1,
      avatar: 'https://cdn.example.com/avatar.jpg',
      description: 'A test channel',
    }
    const result = toFormData(channel)
    expect(result.name).toBe('test channel')
    expect(result.custom_id).toBe('ch001')
    expect(result.type).toBe(1)
    expect(result.status).toBe(1)
    expect(result.avatar).toBe('https://cdn.example.com/avatar.jpg')
    expect(result.description).toBe('A test channel')
  })

  it('converts null fields to empty strings', () => {
    const channel = {
      name: 'channel',
      custom_id: null,
      type: 2,
      status: 0,
      avatar: null,
      description: null,
    }
    const result = toFormData(channel)
    expect(result.custom_id).toBe('')
    expect(result.avatar).toBe('')
    expect(result.description).toBe('')
  })

  it('uses empty string fallback for empty name', () => {
    const channel = {
      name: '',
      custom_id: null,
      type: 1,
      status: 1,
      avatar: null,
      description: null,
    }
    expect(toFormData(channel).name).toBe('')
  })

  it('preserves numeric type and status', () => {
    const channel = {
      name: 'ch',
      custom_id: null,
      type: 3,
      status: 2,
      avatar: null,
      description: null,
    }
    const result = toFormData(channel)
    expect(result.type).toBe(3)
    expect(result.status).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// getSlaInfo — FeedbackListPage.tsx
// (Uses Date.now; tests use a fixed created_at timestamp)
// ---------------------------------------------------------------------------

type Feedback = {
  id: string
  status: number
  created_at?: unknown
  [key: string]: unknown
}

// Inline mirrors of parseDateTime and formatDuration (same logic as FeedbackListPage)
function parseDateTime(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return raw
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const normalizedTs = raw > 1_000_000_000_000 ? raw : raw * 1000
    const parsed = new Date(normalizedTs)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}小时${minutes}分`
  return `${minutes}分`
}

function getSlaInfo(
  feedback: Feedback | null,
  slaHours: number,
  nowMs = Date.now()
): { label: string; className: string } {
  if (!feedback) {
    return { label: 'SLA 计算中', className: 'bg-slate-100 text-slate-700' }
  }

  if (feedback.status !== 1) {
    return { label: '已处理，SLA 已达成', className: 'bg-slate-100 text-slate-700' }
  }

  const createdAt = parseDateTime(feedback.created_at)
  if (!createdAt) {
    return { label: '无法计算 SLA（时间格式异常）', className: 'bg-slate-100 text-slate-700' }
  }

  const deadlineTs = createdAt.getTime() + slaHours * 60 * 60 * 1000
  const remainingMs = deadlineTs - nowMs

  if (remainingMs <= 0) {
    return {
      label: `SLA 已超时 ${formatDuration(Math.abs(remainingMs))}`,
      className: 'bg-red-100 text-red-700',
    }
  }

  const warningThresholdMs = 2 * 60 * 60 * 1000
  if (remainingMs <= warningThresholdMs) {
    return {
      label: `SLA 剩余 ${formatDuration(remainingMs)}`,
      className: 'bg-amber-100 text-amber-700',
    }
  }

  return {
    label: `SLA 剩余 ${formatDuration(remainingMs)}`,
    className: 'bg-green-100 text-green-700',
  }
}

describe('getSlaInfo', () => {
  const NOW = new Date('2024-06-01T12:00:00Z').getTime()

  it('returns "SLA 计算中" for null feedback', () => {
    const result = getSlaInfo(null, 24, NOW)
    expect(result.label).toBe('SLA 计算中')
    expect(result.className).toContain('slate')
  })

  it('returns "已处理" when status !== 1', () => {
    const fb: Feedback = { id: '1', status: 2, created_at: '2024-06-01T00:00:00Z' }
    const result = getSlaInfo(fb, 24, NOW)
    expect(result.label).toBe('已处理，SLA 已达成')
  })

  it('returns format error when created_at is invalid', () => {
    const fb: Feedback = { id: '1', status: 1, created_at: 'not-a-date' }
    const result = getSlaInfo(fb, 24, NOW)
    expect(result.label).toContain('时间格式异常')
  })

  it('returns timeout label in red when deadline has passed', () => {
    // created 48h before NOW, 24h SLA → overdue by 24h
    const createdAt = new Date(NOW - 48 * 60 * 60 * 1000).toISOString()
    const fb: Feedback = { id: '1', status: 1, created_at: createdAt }
    const result = getSlaInfo(fb, 24, NOW)
    expect(result.label).toContain('SLA 已超时')
    expect(result.className).toContain('red')
  })

  it('returns warning label in amber when within 2h of deadline', () => {
    // created 22.5h before NOW, 24h SLA → 1.5h remaining (within 2h warning)
    const createdAt = new Date(NOW - 22.5 * 60 * 60 * 1000).toISOString()
    const fb: Feedback = { id: '1', status: 1, created_at: createdAt }
    const result = getSlaInfo(fb, 24, NOW)
    expect(result.label).toContain('SLA 剩余')
    expect(result.className).toContain('amber')
  })

  it('returns safe label in green when plenty of time remains', () => {
    // created 2h before NOW, 24h SLA → 22h remaining
    const createdAt = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()
    const fb: Feedback = { id: '1', status: 1, created_at: createdAt }
    const result = getSlaInfo(fb, 24, NOW)
    expect(result.label).toContain('SLA 剩余')
    expect(result.className).toContain('green')
  })
})
