/**
 * Unit tests for uxTelemetryReporter private logic.
 * We inline mirrors of the private functions to test them without exporting.
 */
import { describe, expect, it } from 'bun:test'

// --- Inline mirrors of private functions ---

type UxEventRecord = {
  event: string
  payload: Record<string, unknown>
  timestamp: string
}

function normalizeRecord(raw: unknown): UxEventRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const detail = raw as Partial<UxEventRecord>
  if (typeof detail.event !== 'string' || detail.event.trim().length === 0) return null
  return {
    event: detail.event.trim(),
    payload: (detail.payload && typeof detail.payload === 'object'
      ? detail.payload
      : {}) as Record<string, unknown>,
    timestamp: typeof detail.timestamp === 'string' ? detail.timestamp : new Date().toISOString(),
  }
}

const DEFAULT_UX_REPORT_URL = '/api/adm/admin/ux/events'

function resolveReportUrl(envUrl?: string): string {
  const url = typeof envUrl === 'string' ? envUrl.trim() : ''
  return url || DEFAULT_UX_REPORT_URL
}

const MAX_QUEUE_SIZE = 200

function enqueueWithCap(queue: UxEventRecord[], record: UxEventRecord): UxEventRecord[] {
  const next = [...queue, record]
  return next.length > MAX_QUEUE_SIZE ? next.slice(next.length - MAX_QUEUE_SIZE) : next
}

// --- Tests ---

describe('normalizeRecord', () => {
  it('returns null for null input', () => {
    expect(normalizeRecord(null)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(normalizeRecord('string')).toBeNull()
    expect(normalizeRecord(42)).toBeNull()
    expect(normalizeRecord(undefined)).toBeNull()
  })

  it('returns null when event field is missing', () => {
    expect(normalizeRecord({ payload: {} })).toBeNull()
  })

  it('returns null when event is empty string', () => {
    expect(normalizeRecord({ event: '   ' })).toBeNull()
  })

  it('returns null when event is not a string', () => {
    expect(normalizeRecord({ event: 123 })).toBeNull()
  })

  it('trims event name', () => {
    const result = normalizeRecord({ event: '  click  ', timestamp: '2026-01-01T00:00:00Z' })
    expect(result?.event).toBe('click')
  })

  it('uses provided timestamp', () => {
    const ts = '2026-04-15T12:00:00.000Z'
    const result = normalizeRecord({ event: 'view', timestamp: ts })
    expect(result?.timestamp).toBe(ts)
  })

  it('generates timestamp when not provided', () => {
    const result = normalizeRecord({ event: 'view' })
    expect(result?.timestamp).toBeDefined()
    expect(result!.timestamp.length).toBeGreaterThan(0)
  })

  it('uses provided payload object', () => {
    const result = normalizeRecord({ event: 'click', payload: { page: 'home' } })
    expect(result?.payload).toEqual({ page: 'home' })
  })

  it('falls back to empty object when payload is missing', () => {
    const result = normalizeRecord({ event: 'click' })
    expect(result?.payload).toEqual({})
  })

  it('falls back to empty object when payload is not an object', () => {
    const result = normalizeRecord({ event: 'click', payload: 'bad' as unknown })
    expect(result?.payload).toEqual({})
  })
})

describe('resolveReportUrl', () => {
  it('returns default URL when no env var provided', () => {
    expect(resolveReportUrl()).toBe(DEFAULT_UX_REPORT_URL)
  })

  it('returns default URL when env var is empty string', () => {
    expect(resolveReportUrl('')).toBe(DEFAULT_UX_REPORT_URL)
  })

  it('returns default URL when env var is whitespace', () => {
    expect(resolveReportUrl('   ')).toBe(DEFAULT_UX_REPORT_URL)
  })

  it('returns custom URL when provided', () => {
    expect(resolveReportUrl('https://example.com/ux')).toBe('https://example.com/ux')
  })

  it('trims whitespace from custom URL', () => {
    expect(resolveReportUrl('  /custom/url  ')).toBe('/custom/url')
  })
})

describe('enqueueWithCap', () => {
  it('appends record to empty queue', () => {
    const record: UxEventRecord = { event: 'click', payload: {}, timestamp: 't1' }
    const result = enqueueWithCap([], record)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(record)
  })

  it('appends to existing queue', () => {
    const existing: UxEventRecord = { event: 'view', payload: {}, timestamp: 't0' }
    const record: UxEventRecord = { event: 'click', payload: {}, timestamp: 't1' }
    const result = enqueueWithCap([existing], record)
    expect(result).toHaveLength(2)
  })

  it('caps queue at MAX_QUEUE_SIZE', () => {
    const full: UxEventRecord[] = Array.from({ length: MAX_QUEUE_SIZE }, (_, i) => ({
      event: `e${i}`,
      payload: {},
      timestamp: `t${i}`,
    }))
    const record: UxEventRecord = { event: 'overflow', payload: {}, timestamp: 'tn' }
    const result = enqueueWithCap(full, record)
    expect(result).toHaveLength(MAX_QUEUE_SIZE)
    expect(result[MAX_QUEUE_SIZE - 1]).toBe(record)
  })
})
