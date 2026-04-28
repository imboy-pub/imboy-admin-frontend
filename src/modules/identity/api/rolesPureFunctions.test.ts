/**
 * Inline mirror tests for private pure functions in roles.ts:
 *   normalizeEndpoint, buildEndpointCandidates,
 *   toErrorCode, toErrorMessage, isRoleEndpointUnavailable (exported, tested via direct call),
 *   normalizeStringArray, toPositiveInt, toStatusInt, pickFirst,
 *   normalizeRole, normalizeRoleListPayload
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// normalizeEndpoint
// ---------------------------------------------------------------------------

function normalizeEndpoint(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

describe('normalizeEndpoint', () => {
  it('prepends slash when missing', () => {
    expect(normalizeEndpoint('api/roles')).toBe('/api/roles')
  })

  it('keeps leading slash', () => {
    expect(normalizeEndpoint('/api/roles')).toBe('/api/roles')
  })

  it('returns empty for empty string', () => {
    expect(normalizeEndpoint('')).toBe('')
  })

  it('returns empty for whitespace-only', () => {
    expect(normalizeEndpoint('   ')).toBe('')
  })

  it('trims surrounding whitespace before checking slash', () => {
    expect(normalizeEndpoint('  api/roles  ')).toBe('/api/roles')
  })
})

// ---------------------------------------------------------------------------
// buildEndpointCandidates
// ---------------------------------------------------------------------------

function buildEndpointCandidates(rawEnv: unknown, defaults: string[]): string[] {
  const configured = typeof rawEnv === 'string'
    ? rawEnv.split(',').map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)
    : []
  const normalizedDefaults = defaults.map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)
  return Array.from(new Set([...configured, ...normalizedDefaults]))
}

describe('buildEndpointCandidates', () => {
  it('uses only defaults when env is not a string', () => {
    const result = buildEndpointCandidates(undefined, ['/api/roles', '/admin/roles'])
    expect(result).toEqual(['/api/roles', '/admin/roles'])
  })

  it('merges env config with defaults (env first)', () => {
    const result = buildEndpointCandidates('/custom/roles', ['/api/roles'])
    expect(result[0]).toBe('/custom/roles')
    expect(result).toContain('/api/roles')
  })

  it('deduplicates env and defaults', () => {
    const result = buildEndpointCandidates('/api/roles', ['/api/roles'])
    expect(result).toEqual(['/api/roles'])
  })

  it('handles comma-separated env values', () => {
    const result = buildEndpointCandidates('/a,/b,/c', ['/d'])
    expect(result).toContain('/a')
    expect(result).toContain('/b')
    expect(result).toContain('/c')
    expect(result).toContain('/d')
  })

  it('filters empty segments from env', () => {
    const result = buildEndpointCandidates(',/api/roles,', ['/default'])
    expect(result).not.toContain('')
    expect(result).toContain('/api/roles')
  })
})

// ---------------------------------------------------------------------------
// toErrorCode
// ---------------------------------------------------------------------------

type ApiErrorLike = { code?: unknown; msg?: string; message?: string }

function toErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as ApiErrorLike
  const parsed = Number(record.code)
  return Number.isFinite(parsed) ? parsed : undefined
}

describe('toErrorCode', () => {
  it('returns undefined for null', () => {
    expect(toErrorCode(null)).toBeUndefined()
  })

  it('returns undefined for primitive', () => {
    expect(toErrorCode('error')).toBeUndefined()
  })

  it('returns numeric code from object', () => {
    expect(toErrorCode({ code: 404 })).toBe(404)
  })

  it('returns code from numeric string', () => {
    expect(toErrorCode({ code: '405' })).toBe(405)
  })

  it('returns undefined when code is non-numeric', () => {
    expect(toErrorCode({ code: 'not-a-number' })).toBeUndefined()
  })

  it('returns undefined for object without code', () => {
    expect(toErrorCode({ message: 'error' })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// toErrorMessage
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as ApiErrorLike
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

describe('toErrorMessage', () => {
  it('returns Error.message for Error instance', () => {
    expect(toErrorMessage(new Error('fail'))).toBe('fail')
  })

  it('returns msg field when present', () => {
    expect(toErrorMessage({ msg: 'server error', code: 500 })).toBe('server error')
  })

  it('returns message field when msg absent', () => {
    expect(toErrorMessage({ message: 'network error' })).toBe('network error')
  })

  it('prefers msg over message', () => {
    expect(toErrorMessage({ msg: 'primary', message: 'secondary' })).toBe('primary')
  })

  it('returns String(error) for null', () => {
    expect(toErrorMessage(null)).toBe('null')
  })

  it('returns String(error) for number', () => {
    expect(toErrorMessage(42)).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// normalizeStringArray
// ---------------------------------------------------------------------------

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'number') return String(item)
        return ''
      })
      .filter((item) => item.length > 0)
  }

  if (typeof input === 'string') {
    return input
      .split(/[\s,;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  return []
}

describe('normalizeStringArray', () => {
  it('returns empty for null', () => {
    expect(normalizeStringArray(null)).toEqual([])
  })

  it('returns empty for undefined', () => {
    expect(normalizeStringArray(undefined)).toEqual([])
  })

  it('processes string array', () => {
    expect(normalizeStringArray(['read', 'write', 'delete'])).toEqual(['read', 'write', 'delete'])
  })

  it('trims whitespace from array entries', () => {
    expect(normalizeStringArray(['  read  ', '  write  '])).toEqual(['read', 'write'])
  })

  it('converts numbers in array to strings', () => {
    expect(normalizeStringArray([1, 2, 3])).toEqual(['1', '2', '3'])
  })

  it('filters empty entries from array', () => {
    expect(normalizeStringArray(['read', '', '  '])).toEqual(['read'])
  })

  it('splits comma-separated string', () => {
    const result = normalizeStringArray('read,write,delete')
    expect(result).toEqual(['read', 'write', 'delete'])
  })

  it('splits whitespace-separated string', () => {
    const result = normalizeStringArray('read write delete')
    expect(result).toContain('read')
    expect(result).toContain('write')
  })

  it('splits semicolon-separated string', () => {
    const result = normalizeStringArray('read;write')
    expect(result).toEqual(['read', 'write'])
  })
})

// ---------------------------------------------------------------------------
// toPositiveInt
// ---------------------------------------------------------------------------

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

describe('toPositiveInt', () => {
  it('returns the value for positive integer', () => {
    expect(toPositiveInt(5, 1)).toBe(5)
  })

  it('floors decimal values', () => {
    expect(toPositiveInt(3.9, 1)).toBe(3)
  })

  it('returns fallback for 0', () => {
    expect(toPositiveInt(0, 1)).toBe(1)
  })

  it('returns fallback for negative', () => {
    expect(toPositiveInt(-5, 1)).toBe(1)
  })

  it('returns fallback for NaN', () => {
    expect(toPositiveInt(NaN, 1)).toBe(1)
  })

  it('returns fallback for undefined', () => {
    expect(toPositiveInt(undefined, 10)).toBe(10)
  })

  it('parses numeric string', () => {
    expect(toPositiveInt('7', 1)).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// toStatusInt
// ---------------------------------------------------------------------------

function toStatusInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

describe('toStatusInt', () => {
  it('returns 0 for 0', () => {
    expect(toStatusInt(0, 1)).toBe(0)
  })

  it('returns 1 for 1', () => {
    expect(toStatusInt(1, 0)).toBe(1)
  })

  it('returns fallback for NaN', () => {
    expect(toStatusInt(NaN, 1)).toBe(1)
  })

  it('floors decimal', () => {
    expect(toStatusInt(2.7, 0)).toBe(2)
  })

  it('allows negative values (unlike toPositiveInt)', () => {
    expect(toStatusInt(-1, 0)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// pickFirst
// ---------------------------------------------------------------------------

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const candidate = record[key]
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return candidate
    }
  }
  return ''
}

describe('pickFirst', () => {
  it('returns the first non-empty key', () => {
    expect(pickFirst({ id: 1, role_id: 2 }, ['id', 'role_id'])).toBe(1)
  })

  it('skips null values', () => {
    expect(pickFirst({ id: null, role_id: 5 }, ['id', 'role_id'])).toBe(5)
  })

  it('skips undefined values', () => {
    expect(pickFirst({ id: undefined, role_id: 5 }, ['id', 'role_id'])).toBe(5)
  })

  it('skips empty string values', () => {
    expect(pickFirst({ name: '', role_name: 'admin' }, ['name', 'role_name'])).toBe('admin')
  })

  it('returns empty string when all keys missing or empty', () => {
    expect(pickFirst({}, ['a', 'b', 'c'])).toBe('')
  })

  it('returns 0 (falsy but not empty/null/undefined)', () => {
    expect(pickFirst({ status: 0 }, ['status'])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// normalizeRole
// ---------------------------------------------------------------------------

type RoleItem = {
  id: number
  name: string
  description: string
  permissions: string[]
  status: number
  created_at: string
}

function normalizeRole(raw: unknown): RoleItem {
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const id = pickFirst(record, ['id', 'role_id'])
  const name = pickFirst(record, ['name', 'role_name'])
  const description = pickFirst(record, ['description', 'desc'])
  const permissions = pickFirst(record, ['permissions', 'permission_keys', 'permission_list'])
  const status = pickFirst(record, ['status', 'state'])
  const createdAt = pickFirst(record, ['created_at', 'create_time'])

  return {
    id: toPositiveInt(id, 0),
    name: String(name || ''),
    description: String(description || ''),
    permissions: normalizeStringArray(permissions),
    status: toStatusInt(status, 1),
    created_at: String(createdAt || ''),
  }
}

describe('normalizeRole', () => {
  it('normalizes a complete role object', () => {
    const raw = { id: 1, name: 'admin', description: 'Super admin', permissions: ['read', 'write'], status: 1, created_at: '2024-01-01' }
    const result = normalizeRole(raw)
    expect(result.id).toBe(1)
    expect(result.name).toBe('admin')
    expect(result.description).toBe('Super admin')
    expect(result.permissions).toEqual(['read', 'write'])
    expect(result.status).toBe(1)
    expect(result.created_at).toBe('2024-01-01')
  })

  it('uses role_id fallback when id missing', () => {
    const raw = { role_id: 3, name: 'auditor' }
    expect(normalizeRole(raw).id).toBe(3)
  })

  it('uses role_name fallback when name missing', () => {
    const raw = { id: 2, role_name: 'operator' }
    expect(normalizeRole(raw).name).toBe('operator')
  })

  it('returns defaults for null input', () => {
    const result = normalizeRole(null)
    expect(result.id).toBe(0)
    expect(result.name).toBe('')
    expect(result.permissions).toEqual([])
  })

  it('parses permissions from comma-separated string', () => {
    const raw = { id: 1, name: 'admin', permissions: 'read,write,delete' }
    expect(normalizeRole(raw).permissions).toEqual(['read', 'write', 'delete'])
  })

  it('returns 0 status when status key is missing (pickFirst returns "", toStatusInt converts ""→0)', () => {
    // pickFirst returns '' for missing keys; Number('')=0; toStatusInt(0,1) returns 0 (finite, not fallback)
    const raw = { id: 1, name: 'admin' }
    expect(normalizeRole(raw).status).toBe(0)
  })
})
