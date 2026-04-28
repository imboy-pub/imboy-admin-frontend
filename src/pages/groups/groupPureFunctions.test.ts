/**
 * Inline mirror tests for private pure functions in group/feedback/storage pages:
 *   GroupGovernanceLogPage:  normalizeTimestamp, summarizeExtra
 *   GroupScheduleManagePage: normalizeTimestamp (different signature)
 *   FeedbackListPage:        parseDateTime, formatDuration, parseTemplateEditorValue, getWorkflowSourceLabel
 *   StorageOverviewPage:     mimeGroup
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// normalizeTimestamp — GroupGovernanceLogPage.tsx
// ---------------------------------------------------------------------------

function normalizeTimestamp(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  if (/^\d+$/.test(normalized)) return normalized

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

describe('normalizeTimestamp (GovernanceLog)', () => {
  it('returns undefined for empty string', () => {
    expect(normalizeTimestamp('')).toBeUndefined()
  })

  it('returns undefined for whitespace', () => {
    expect(normalizeTimestamp('   ')).toBeUndefined()
  })

  it('returns pure digit string as-is', () => {
    expect(normalizeTimestamp('1714000000')).toBe('1714000000')
  })

  it('returns ISO string for valid date string', () => {
    const result = normalizeTimestamp('2024-01-15T10:00:00Z')
    expect(result).toBe('2024-01-15T10:00:00.000Z')
  })

  it('returns undefined for invalid date string', () => {
    expect(normalizeTimestamp('not-a-date')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// summarizeExtra — GroupGovernanceLogPage.tsx
// ---------------------------------------------------------------------------

function summarizeExtra(extra?: Record<string, unknown>): string {
  if (!extra || typeof extra !== 'object') return '-'
  const entries = Object.entries(extra)
  if (entries.length === 0) return '-'
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(' | ')
}

describe('summarizeExtra', () => {
  it('returns "-" for undefined', () => {
    expect(summarizeExtra(undefined)).toBe('-')
  })

  it('returns "-" for empty object', () => {
    expect(summarizeExtra({})).toBe('-')
  })

  it('formats key:value pairs', () => {
    expect(summarizeExtra({ action: 'ban', reason: 'spam' })).toBe('action:ban | reason:spam')
  })

  it('limits to first 3 entries', () => {
    const extra = { a: '1', b: '2', c: '3', d: '4', e: '5' }
    const result = summarizeExtra(extra)
    const parts = result.split(' | ')
    expect(parts).toHaveLength(3)
  })

  it('converts non-string values to string', () => {
    const result = summarizeExtra({ count: 42, active: true })
    expect(result).toContain('count:42')
    expect(result).toContain('active:true')
  })
})

// ---------------------------------------------------------------------------
// parseDateTime — FeedbackListPage.tsx
// ---------------------------------------------------------------------------

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
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
    const parsed = new Date(normalized)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const candidate =
      record.datetime ?? record.dateTime ?? record.time ?? record.timestamp ??
      record.value ?? record.created_at ?? record.createdAt
    if (candidate !== undefined) return parseDateTime(candidate)
  }

  return null
}

describe('parseDateTime', () => {
  it('returns null for null', () => {
    expect(parseDateTime(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseDateTime(undefined)).toBeNull()
  })

  it('returns Date for valid Date instance', () => {
    const d = new Date('2024-01-15')
    expect(parseDateTime(d)).toBe(d)
  })

  it('returns null for invalid Date instance', () => {
    expect(parseDateTime(new Date('invalid'))).toBeNull()
  })

  it('converts seconds-level unix timestamp', () => {
    const result = parseDateTime(1714000000)
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBeGreaterThan(2020)
  })

  it('converts milliseconds-level unix timestamp', () => {
    const result = parseDateTime(1714000000000)
    expect(result).not.toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(parseDateTime(Infinity)).toBeNull()
  })

  it('parses ISO date string', () => {
    const result = parseDateTime('2024-01-15T10:00:00Z')
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2024)
  })

  it('replaces space with T in date string', () => {
    const result = parseDateTime('2024-01-15 10:00:00')
    expect(result).not.toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDateTime('')).toBeNull()
  })

  it('returns null for invalid string', () => {
    expect(parseDateTime('not-a-date')).toBeNull()
  })

  it('extracts date from object with created_at key', () => {
    const result = parseDateTime({ created_at: '2024-06-01T00:00:00Z' })
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2024)
  })

  it('extracts date from object with timestamp key', () => {
    const result = parseDateTime({ timestamp: 1714000000 })
    expect(result).not.toBeNull()
  })

  it('returns null when object has no recognized date key', () => {
    expect(parseDateTime({ foo: 'bar' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// formatDuration — FeedbackListPage.tsx
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}小时${minutes}分`
  return `${minutes}分`
}

describe('formatDuration', () => {
  it('formats sub-hour duration in minutes', () => {
    expect(formatDuration(30 * 60 * 1000)).toBe('30分')
  })

  it('formats exactly 1 hour', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe('1小时0分')
  })

  it('formats 1.5 hours', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1小时30分')
  })

  it('handles 0 ms', () => {
    expect(formatDuration(0)).toBe('0分')
  })

  it('handles negative ms as 0', () => {
    expect(formatDuration(-1000)).toBe('0分')
  })
})

// ---------------------------------------------------------------------------
// parseTemplateEditorValue — FeedbackListPage.tsx
// ---------------------------------------------------------------------------

function parseTemplateEditorValue(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 20)
}

describe('parseTemplateEditorValue', () => {
  it('splits on newlines', () => {
    const result = parseTemplateEditorValue('感谢您的反馈\n我们已收到您的问题')
    expect(result).toHaveLength(2)
  })

  it('deduplicates entries', () => {
    const result = parseTemplateEditorValue('hello\nhello\nworld')
    expect(result).toHaveLength(2)
  })

  it('trims whitespace', () => {
    const result = parseTemplateEditorValue('  hello  \n  world  ')
    expect(result[0]).toBe('hello')
  })

  it('filters empty lines', () => {
    const result = parseTemplateEditorValue('hello\n\n\nworld')
    expect(result).toHaveLength(2)
  })

  it('limits to 20 entries', () => {
    const raw = Array.from({ length: 30 }, (_, i) => `template ${i}`).join('\n')
    expect(parseTemplateEditorValue(raw)).toHaveLength(20)
  })

  it('returns empty array for empty input', () => {
    expect(parseTemplateEditorValue('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getWorkflowSourceLabel — FeedbackListPage.tsx
// ---------------------------------------------------------------------------

function getWorkflowSourceLabel(source: 'backend' | 'local' | 'default'): string {
  if (source === 'backend') return '后端配置'
  if (source === 'local') return '本地配置'
  return '系统默认'
}

describe('getWorkflowSourceLabel', () => {
  it('returns "后端配置" for backend', () => {
    expect(getWorkflowSourceLabel('backend')).toBe('后端配置')
  })

  it('returns "本地配置" for local', () => {
    expect(getWorkflowSourceLabel('local')).toBe('本地配置')
  })

  it('returns "系统默认" for default', () => {
    expect(getWorkflowSourceLabel('default')).toBe('系统默认')
  })
})

// ---------------------------------------------------------------------------
// mimeGroup — StorageOverviewPage.tsx
// ---------------------------------------------------------------------------

function mimeGroup(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (
    mimeType.startsWith('text/') ||
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('sheet')
  ) {
    return 'document'
  }
  return 'other'
}

describe('mimeGroup', () => {
  it('returns "image" for image/* types', () => {
    expect(mimeGroup('image/jpeg')).toBe('image')
    expect(mimeGroup('image/png')).toBe('image')
    expect(mimeGroup('image/webp')).toBe('image')
  })

  it('returns "video" for video/* types', () => {
    expect(mimeGroup('video/mp4')).toBe('video')
    expect(mimeGroup('video/webm')).toBe('video')
  })

  it('returns "document" for text/* types', () => {
    expect(mimeGroup('text/plain')).toBe('document')
    expect(mimeGroup('text/csv')).toBe('document')
  })

  it('returns "document" for pdf MIME type', () => {
    expect(mimeGroup('application/pdf')).toBe('document')
  })

  it('returns "document" for office document types', () => {
    expect(mimeGroup('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document')
    expect(mimeGroup('application/vnd.ms-excel.sheet.macroEnabled.12')).toBe('document')
  })

  it('returns "other" for unknown types', () => {
    expect(mimeGroup('application/octet-stream')).toBe('other')
    expect(mimeGroup('application/zip')).toBe('other')
  })
})
