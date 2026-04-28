/**
 * Inline mirror tests for private pure functions in MessageListPage.tsx:
 *   parsePayload, escapeRegExp, formatPrimitive, isRecord
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// Mirrors
// ---------------------------------------------------------------------------

function parsePayload(payload: string): { display: string; isJson: boolean; parsed: unknown } {
  if (!payload) return { display: '-', isJson: false, parsed: null }
  try {
    const parsed = JSON.parse(payload) as unknown
    return { display: JSON.stringify(parsed, null, 2), isJson: true, parsed }
  } catch {
    return { display: payload, isJson: false, parsed: payload }
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  if (value === null) return 'null'
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------------------
// parsePayload
// ---------------------------------------------------------------------------

describe('parsePayload', () => {
  it('returns placeholder for empty string', () => {
    const result = parsePayload('')
    expect(result.display).toBe('-')
    expect(result.isJson).toBe(false)
    expect(result.parsed).toBeNull()
  })

  it('parses valid JSON object', () => {
    const result = parsePayload('{"key":"value"}')
    expect(result.isJson).toBe(true)
    expect((result.parsed as Record<string, unknown>).key).toBe('value')
    expect(result.display).toContain('"key"')
  })

  it('parses valid JSON array', () => {
    const result = parsePayload('[1,2,3]')
    expect(result.isJson).toBe(true)
    expect(Array.isArray(result.parsed)).toBe(true)
  })

  it('returns raw string for invalid JSON', () => {
    const result = parsePayload('not json {')
    expect(result.isJson).toBe(false)
    expect(result.display).toBe('not json {')
    expect(result.parsed).toBe('not json {')
  })

  it('formats JSON with indentation in display', () => {
    const result = parsePayload('{"a":1}')
    expect(result.display).toContain('\n')
  })
})

// ---------------------------------------------------------------------------
// escapeRegExp
// ---------------------------------------------------------------------------

describe('escapeRegExp', () => {
  it('escapes regex special characters', () => {
    const escaped = escapeRegExp('.*+?^${}()|[]\\')
    // Use in a regex without throwing
    expect(() => new RegExp(escaped)).not.toThrow()
  })

  it('leaves plain text unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
  })

  it('escapes dot character', () => {
    expect(escapeRegExp('a.b')).toBe('a\\.b')
  })

  it('escapes parentheses', () => {
    expect(escapeRegExp('(test)')).toBe('\\(test\\)')
  })

  it('escapes square brackets', () => {
    expect(escapeRegExp('[0-9]')).toBe('\\[0-9\\]')
  })
})

// ---------------------------------------------------------------------------
// formatPrimitive
// ---------------------------------------------------------------------------

describe('formatPrimitive', () => {
  it('wraps string in double quotes', () => {
    expect(formatPrimitive('hello')).toBe('"hello"')
  })

  it('returns "null" for null', () => {
    expect(formatPrimitive(null)).toBe('null')
  })

  it('converts number to string', () => {
    expect(formatPrimitive(42)).toBe('42')
    expect(formatPrimitive(3.14)).toBe('3.14')
  })

  it('converts boolean to string', () => {
    expect(formatPrimitive(true)).toBe('true')
    expect(formatPrimitive(false)).toBe('false')
  })

  it('converts undefined to string', () => {
    expect(formatPrimitive(undefined)).toBe('undefined')
  })
})

// ---------------------------------------------------------------------------
// highlightText split logic (pure text extraction — no JSX rendering)
// ---------------------------------------------------------------------------

function escapeRegExpLocal(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightTextParts(text: string, keyword: string): string[] {
  const target = keyword.trim()
  if (!target) return [text]
  const escaped = escapeRegExpLocal(target)
  const regex = new RegExp(`(${escaped})`, 'gi')
  return text.split(regex)
}

describe('highlightText — split logic', () => {
  it('returns [text] when keyword is empty', () => {
    expect(highlightTextParts('hello world', '')).toEqual(['hello world'])
  })

  it('returns [text] when keyword is whitespace only', () => {
    expect(highlightTextParts('hello world', '   ')).toEqual(['hello world'])
  })

  it('splits on matching keyword (case-insensitive)', () => {
    const parts = highlightTextParts('Hello World', 'world')
    // split on capturing group produces: ['Hello ', 'World', '']
    expect(parts).toContain('World')
  })

  it('returns all 3 segments for inner match', () => {
    const parts = highlightTextParts('abc match def', 'match')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('abc ')
    expect(parts[1]).toBe('match')
    expect(parts[2]).toBe(' def')
  })

  it('handles multiple matches', () => {
    const parts = highlightTextParts('a b a b', 'a')
    // captures: ['', 'a', ' b ', 'a', ' b']
    expect(parts.filter((p) => p.toLowerCase() === 'a')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// isRecord
// ---------------------------------------------------------------------------

describe('isRecord', () => {
  it('returns true for plain object', () => {
    expect(isRecord({ key: 'value' })).toBe(true)
  })

  it('returns true for empty object', () => {
    expect(isRecord({})).toBe(true)
  })

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('returns false for array', () => {
    expect(isRecord([])).toBe(false)
    expect(isRecord([1, 2, 3])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(true)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false)
  })
})
