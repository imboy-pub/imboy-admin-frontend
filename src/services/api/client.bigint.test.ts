import { describe, expect, it } from 'bun:test'

// Re-implement the function here for isolated testing since it's not exported from client.ts
function safeParseBigIntJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return JSON.parse(text)
  }

  const safeText = trimmed.replace(
    /(?<=[:,\[\s])(-?\d{16,})(?=[,\]\}\s])/g,
    '"$1"'
  )

  return JSON.parse(safeText)
}

describe('safeParseBigIntJson', () => {
  it('converts large integers (>=16 digits) to strings', () => {
    const json = '{"id":1838294017982464000,"name":"test"}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.id).toBe('1838294017982464000')
    expect(result.name).toBe('test')
  })

  it('does not convert small integers', () => {
    const json = '{"id":12345,"count":999999999999999}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.id).toBe(12345)
    expect(result.count).toBe(999999999999999)
  })

  it('does not touch strings that are already quoted', () => {
    const json = '{"id":"1838294017982464000","name":"test"}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.id).toBe('1838294017982464000')
  })

  it('handles arrays with large integers', () => {
    const json = '[1838294017982464000, 1838294017982464001]'
    const result = safeParseBigIntJson(json) as string[]
    expect(result[0]).toBe('1838294017982464000')
    expect(result[1]).toBe('1838294017982464001')
  })

  it('handles nested objects', () => {
    const json = '{"payload":{"items":[{"id":1838294017982464000,"uid":9223372036854775807}]}}'
    const result = safeParseBigIntJson(json) as {
      payload: { items: Array<{ id: string; uid: string }> }
    }
    expect(result.payload.items[0].id).toBe('1838294017982464000')
    expect(result.payload.items[0].uid).toBe('9223372036854775807')
  })

  it('returns non-JSON text via JSON.parse (which throws)', () => {
    expect(() => safeParseBigIntJson('not json')).toThrow()
  })

  it('handles negative large integers', () => {
    const json = '{"id":-1838294017982464000}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.id).toBe('-1838294017982464000')
  })

  it('does not convert decimals', () => {
    const json = '{"value":1838294017982464.5}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    // Decimals won't match the integer-only regex, standard JSON.parse handles them
    expect(typeof result.value).toBe('number')
  })
})
