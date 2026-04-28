import { describe, expect, it } from 'bun:test'
import { formatDate, formatOptionalDate, truncate } from './utils'

describe('formatDate', () => {
  it('formats a Date object to zh-CN locale string', () => {
    const date = new Date('2026-04-15T08:30:00')
    const result = formatDate(date)
    expect(result).toContain('2026')
    expect(result).toContain('04')
    expect(result).toContain('15')
  })

  it('formats an ISO string', () => {
    const result = formatDate('2026-01-01T00:00:00')
    expect(result).toContain('2026')
    expect(result).toContain('01')
  })

  it('formats a Unix timestamp (milliseconds)', () => {
    // 2026-04-15 00:00:00 UTC
    const ts = new Date('2026-04-15T00:00:00Z').getTime()
    const result = formatDate(ts)
    expect(result).toContain('2026')
  })
})

describe('formatOptionalDate', () => {
  it('returns "-" for null', () => {
    expect(formatOptionalDate(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatOptionalDate(undefined)).toBe('-')
  })

  it('returns "-" for empty string', () => {
    expect(formatOptionalDate('')).toBe('-')
  })

  it('returns the original value for invalid date strings', () => {
    const invalid = 'not-a-date'
    expect(formatOptionalDate(invalid)).toBe(invalid)
  })

  it('formats a valid date string', () => {
    const result = formatOptionalDate('2026-03-10T12:00:00')
    expect(result).toContain('2026')
    expect(result).toContain('03')
    expect(result).toContain('10')
  })
})

describe('truncate', () => {
  it('returns the original string when shorter than limit', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('returns the original string when equal to limit', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('truncates and appends ellipsis when longer than limit', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('')
  })

  it('handles limit of 0', () => {
    expect(truncate('hello', 0)).toBe('...')
  })
})
