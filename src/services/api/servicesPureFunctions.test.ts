/**
 * Inline mirror tests for private pure functions in services:
 *   features.ts:              normalizeBoolean, normalizeFeatureFlags
 *   feedbackWorkflowConfig.ts: appendNoCacheStamp, normalizeTemplates, normalizeSlaHours,
 *                               normalizeEditableConfig, unwrapWorkflowConfigPayload
 *   admins.ts:                 normalizeAdmin (key normalization behavior)
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// normalizeBoolean — features.ts
// ---------------------------------------------------------------------------

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return undefined
}

describe('normalizeBoolean', () => {
  it('returns boolean as-is', () => {
    expect(normalizeBoolean(true)).toBe(true)
    expect(normalizeBoolean(false)).toBe(false)
  })

  it('converts non-zero number to true', () => {
    expect(normalizeBoolean(1)).toBe(true)
    expect(normalizeBoolean(42)).toBe(true)
  })

  it('converts 0 to false', () => {
    expect(normalizeBoolean(0)).toBe(false)
  })

  it('parses truthy strings', () => {
    expect(normalizeBoolean('1')).toBe(true)
    expect(normalizeBoolean('true')).toBe(true)
    expect(normalizeBoolean('yes')).toBe(true)
    expect(normalizeBoolean('on')).toBe(true)
  })

  it('parses falsy strings', () => {
    expect(normalizeBoolean('0')).toBe(false)
    expect(normalizeBoolean('false')).toBe(false)
    expect(normalizeBoolean('no')).toBe(false)
    expect(normalizeBoolean('off')).toBe(false)
  })

  it('is case-insensitive for string values', () => {
    expect(normalizeBoolean('TRUE')).toBe(true)
    expect(normalizeBoolean('FALSE')).toBe(false)
  })

  it('returns undefined for null', () => {
    expect(normalizeBoolean(null)).toBeUndefined()
  })

  it('returns undefined for unrecognized string', () => {
    expect(normalizeBoolean('maybe')).toBeUndefined()
  })

  it('returns undefined for object', () => {
    expect(normalizeBoolean({})).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// normalizeFeatureFlags — features.ts
// ---------------------------------------------------------------------------

type FeatureFlags = Record<string, boolean>

function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const normalized: FeatureFlags = {}
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const parsed = normalizeBoolean(value)
    if (parsed !== undefined) {
      normalized[key] = parsed
    }
  })
  return normalized
}

describe('normalizeFeatureFlags', () => {
  it('returns {} for null', () => {
    expect(normalizeFeatureFlags(null)).toEqual({})
  })

  it('returns {} for array', () => {
    expect(normalizeFeatureFlags([])).toEqual({})
  })

  it('returns {} for empty object', () => {
    expect(normalizeFeatureFlags({})).toEqual({})
  })

  it('parses boolean values', () => {
    const result = normalizeFeatureFlags({ chat: true, moments: false })
    expect(result.chat).toBe(true)
    expect(result.moments).toBe(false)
  })

  it('parses string values', () => {
    const result = normalizeFeatureFlags({ groups: '1', channels: '0' })
    expect(result.groups).toBe(true)
    expect(result.channels).toBe(false)
  })

  it('skips keys with unrecognized values', () => {
    const result = normalizeFeatureFlags({ known: true, unknown: null })
    expect(Object.keys(result)).toEqual(['known'])
  })
})

// ---------------------------------------------------------------------------
// appendNoCacheStamp — feedbackWorkflowConfig.ts
// ---------------------------------------------------------------------------

function appendNoCacheStamp(url: string, stamp: number): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${stamp}`
}

describe('appendNoCacheStamp', () => {
  it('appends ?t= when URL has no query string', () => {
    expect(appendNoCacheStamp('/api/config', 12345)).toBe('/api/config?t=12345')
  })

  it('appends &t= when URL already has a query string', () => {
    expect(appendNoCacheStamp('/api/config?v=1', 12345)).toBe('/api/config?v=1&t=12345')
  })

  it('works with full URL', () => {
    const result = appendNoCacheStamp('https://example.com/config', 99)
    expect(result).toBe('https://example.com/config?t=99')
  })
})

// ---------------------------------------------------------------------------
// normalizeTemplates — feedbackWorkflowConfig.ts
// ---------------------------------------------------------------------------

const DEFAULT_REPLY_TEMPLATES = ['感谢您的反馈', '我们已收到您的问题，正在处理中']

function normalizeTemplates(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback]
  }

  const normalized = input
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        if (typeof record.text === 'string') return record.text.trim()
        if (typeof record.label === 'string') return record.label.trim()
        if (typeof record.content === 'string') return record.content.trim()
      }
      return ''
    })
    .filter((item) => item.length > 0)

  if (normalized.length === 0) {
    return [...fallback]
  }

  return Array.from(new Set(normalized)).slice(0, 20)
}

describe('normalizeTemplates', () => {
  it('returns fallback for non-array', () => {
    expect(normalizeTemplates(null, DEFAULT_REPLY_TEMPLATES)).toEqual(DEFAULT_REPLY_TEMPLATES)
  })

  it('returns fallback for empty array', () => {
    expect(normalizeTemplates([], DEFAULT_REPLY_TEMPLATES)).toEqual(DEFAULT_REPLY_TEMPLATES)
  })

  it('processes string array', () => {
    const result = normalizeTemplates(['模板1', '模板2'], DEFAULT_REPLY_TEMPLATES)
    expect(result).toEqual(['模板1', '模板2'])
  })

  it('trims strings', () => {
    expect(normalizeTemplates(['  trimmed  '], DEFAULT_REPLY_TEMPLATES)).toEqual(['trimmed'])
  })

  it('extracts .text from object entries', () => {
    const result = normalizeTemplates([{ text: '文本模板' }], DEFAULT_REPLY_TEMPLATES)
    expect(result).toContain('文本模板')
  })

  it('extracts .label from object entries', () => {
    const result = normalizeTemplates([{ label: '标签模板' }], DEFAULT_REPLY_TEMPLATES)
    expect(result).toContain('标签模板')
  })

  it('deduplicates entries', () => {
    const result = normalizeTemplates(['a', 'b', 'a'], DEFAULT_REPLY_TEMPLATES)
    expect(result).toEqual(['a', 'b'])
  })

  it('limits to 20 entries', () => {
    const input = Array.from({ length: 30 }, (_, i) => `template_${i}`)
    expect(normalizeTemplates(input, DEFAULT_REPLY_TEMPLATES)).toHaveLength(20)
  })
})

// ---------------------------------------------------------------------------
// normalizeSlaHours — feedbackWorkflowConfig.ts
// ---------------------------------------------------------------------------

const MIN_SLA_HOURS = 1
const MAX_SLA_HOURS = 720
const DEFAULT_SLA_HOURS = 24

function normalizeSlaHours(input: unknown, fallback: number): number {
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  const rounded = Math.round(parsed)
  if (rounded < MIN_SLA_HOURS) return MIN_SLA_HOURS
  if (rounded > MAX_SLA_HOURS) return MAX_SLA_HOURS
  return rounded
}

describe('normalizeSlaHours', () => {
  it('returns fallback for NaN string', () => {
    // Note: Number(null)=0 (finite), so null clamps to MIN, not fallback
    expect(normalizeSlaHours('invalid', DEFAULT_SLA_HOURS)).toBe(24)
    expect(normalizeSlaHours(undefined, DEFAULT_SLA_HOURS)).toBe(24)
  })

  it('clamps null (Number(null)=0) to MIN_SLA_HOURS', () => {
    // null is finite 0 → clamps to MIN=1, not fallback
    expect(normalizeSlaHours(null, DEFAULT_SLA_HOURS)).toBe(1)
  })

  it('returns fallback for NaN', () => {
    expect(normalizeSlaHours(NaN, DEFAULT_SLA_HOURS)).toBe(24)
  })

  it('clamps to MIN_SLA_HOURS', () => {
    expect(normalizeSlaHours(0, DEFAULT_SLA_HOURS)).toBe(1)
    expect(normalizeSlaHours(-5, DEFAULT_SLA_HOURS)).toBe(1)
  })

  it('clamps to MAX_SLA_HOURS', () => {
    expect(normalizeSlaHours(1000, DEFAULT_SLA_HOURS)).toBe(720)
  })

  it('rounds to nearest integer', () => {
    expect(normalizeSlaHours(24.6, DEFAULT_SLA_HOURS)).toBe(25)
    expect(normalizeSlaHours(24.4, DEFAULT_SLA_HOURS)).toBe(24)
  })

  it('returns exact value within range', () => {
    expect(normalizeSlaHours(48, DEFAULT_SLA_HOURS)).toBe(48)
  })

  it('parses numeric string', () => {
    expect(normalizeSlaHours('72', DEFAULT_SLA_HOURS)).toBe(72)
  })
})

// ---------------------------------------------------------------------------
// unwrapWorkflowConfigPayload — feedbackWorkflowConfig.ts
// ---------------------------------------------------------------------------

function unwrapWorkflowConfigPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new Error('invalid feedback workflow payload')
  }

  const record = raw as Record<string, unknown>
  if ('payload' in record && 'code' in record) {
    const code = Number(record.code)
    if (Number.isFinite(code) && code !== 0) {
      const message = typeof record.msg === 'string' ? record.msg : 'request failed'
      throw new Error(`feedback workflow config rejected: ${message}`)
    }
    if (record.payload === undefined || record.payload === null) {
      throw new Error('feedback workflow payload is empty')
    }
    return record.payload
  }

  return record
}

describe('unwrapWorkflowConfigPayload', () => {
  it('throws for null', () => {
    expect(() => unwrapWorkflowConfigPayload(null)).toThrow('invalid feedback workflow payload')
  })

  it('throws for non-object', () => {
    expect(() => unwrapWorkflowConfigPayload('raw string')).toThrow()
  })

  it('returns payload from API envelope with code=0', () => {
    const raw = { code: 0, payload: { templates: [] } }
    expect(unwrapWorkflowConfigPayload(raw)).toEqual({ templates: [] })
  })

  it('throws when code is non-zero', () => {
    const raw = { code: 1, msg: 'not authorized', payload: null }
    expect(() => unwrapWorkflowConfigPayload(raw)).toThrow('feedback workflow config rejected: not authorized')
  })

  it('throws when payload is null', () => {
    const raw = { code: 0, payload: null }
    expect(() => unwrapWorkflowConfigPayload(raw)).toThrow('feedback workflow payload is empty')
  })

  it('returns record when payload key is absent (envelope check requires both payload+code keys)', () => {
    // 'payload' in record is false when key is absent entirely — falls through to return record
    const raw = { code: 0 }
    expect(unwrapWorkflowConfigPayload(raw)).toBe(raw)
  })

  it('returns record directly when not an API envelope', () => {
    const raw = { templates: ['hello'], sla_hours: 24 }
    expect(unwrapWorkflowConfigPayload(raw)).toBe(raw)
  })
})

// ---------------------------------------------------------------------------
// normalizeAdmin — admins.ts
// ---------------------------------------------------------------------------

function pickFirstAdmin(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const candidate = record[key]
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return candidate
    }
  }
  return ''
}

function toStatusIntAdmin(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

type Admin = {
  id: string
  account: string
  nickname: string
  avatar: string
  email?: string
  mobile?: string
  role_id: number
  login_count: number
  last_login_ip: string
  last_login_at: string
  status: number
  created_at: string
}

function normalizeAdmin(raw: unknown): Admin {
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const id = pickFirstAdmin(record, ['id', 'admin_id', 'uid'])
  const account = pickFirstAdmin(record, ['account', 'username'])
  const nickname = pickFirstAdmin(record, ['nickname', 'name'])
  const roleId = pickFirstAdmin(record, ['role_id', 'role'])
  const loginCount = pickFirstAdmin(record, ['login_count', 'sign_in_count'])
  const lastLoginIp = pickFirstAdmin(record, ['last_login_ip', 'last_ip'])
  const lastLoginAt = pickFirstAdmin(record, ['last_login_at', 'last_sign_in_at'])
  const createdAt = pickFirstAdmin(record, ['created_at', 'create_time'])
  const status = pickFirstAdmin(record, ['status', 'state'])

  return {
    id: String(id || ''),
    account: String(account || ''),
    nickname: String(nickname || ''),
    avatar: String(record.avatar || ''),
    email: typeof record.email === 'string' ? record.email : undefined,
    mobile: typeof record.mobile === 'string' ? record.mobile : undefined,
    role_id: toStatusIntAdmin(roleId, 0),
    login_count: toStatusIntAdmin(loginCount, 0),
    last_login_ip: String(lastLoginIp || ''),
    last_login_at: String(lastLoginAt || ''),
    status: toStatusIntAdmin(status, 1),
    created_at: String(createdAt || ''),
  }
}

describe('normalizeAdmin', () => {
  it('normalizes a complete admin object', () => {
    const raw = {
      id: 'admin_001',
      account: 'superadmin',
      nickname: '超级管理员',
      avatar: 'https://cdn.example.com/avatar.jpg',
      email: 'admin@example.com',
      mobile: '13800138000',
      role_id: 1,
      login_count: 42,
      last_login_ip: '192.168.1.1',
      last_login_at: '2024-06-01T10:00:00Z',
      status: 1,
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = normalizeAdmin(raw)
    expect(result.id).toBe('admin_001')
    expect(result.account).toBe('superadmin')
    expect(result.nickname).toBe('超级管理员')
    expect(result.role_id).toBe(1)
    expect(result.login_count).toBe(42)
    expect(result.email).toBe('admin@example.com')
    expect(result.mobile).toBe('13800138000')
  })

  it('uses admin_id fallback when id is missing', () => {
    const raw = { admin_id: 'a001', account: 'user' }
    expect(normalizeAdmin(raw).id).toBe('a001')
  })

  it('uses username fallback when account is missing', () => {
    const raw = { id: '1', username: 'user123' }
    expect(normalizeAdmin(raw).account).toBe('user123')
  })

  it('returns empty string for email when not a string', () => {
    const raw = { id: '1', account: 'admin', email: 123 }
    expect(normalizeAdmin(raw).email).toBeUndefined()
  })

  it('returns default values for null input', () => {
    const result = normalizeAdmin(null)
    expect(result.id).toBe('')
    expect(result.account).toBe('')
    expect(result.role_id).toBe(0)
    expect(result.login_count).toBe(0)
  })
})
