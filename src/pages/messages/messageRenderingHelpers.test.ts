/**
 * CONTRACT-02 regression: parsePayload must not lose precision on embedded
 * 64-bit TSID (e.g. S2C e2ee_key_changed_ack payload.uid), unlike bare JSON.parse.
 */
import { describe, expect, it } from 'bun:test'
import { parsePayload } from './messageRenderingHelpers'

describe('parsePayload — CONTRACT-02 big TSID safety', () => {
  it('keeps a 19-digit uid as string, not a lossy number', () => {
    const payload = '{"status":"acknowledged","uid":9007199254740993123}'
    const result = parsePayload(payload)
    expect(result.isJson).toBe(true)
    const parsed = result.parsed as Record<string, unknown>
    expect(parsed.uid).toBe('9007199254740993123')
  })

  it('still parses ordinary small-number JSON normally', () => {
    const result = parsePayload('{"count":42}')
    expect(result.isJson).toBe(true)
    expect((result.parsed as Record<string, unknown>).count).toBe(42)
  })

  it('returns placeholder for empty string', () => {
    const result = parsePayload('')
    expect(result.display).toBe('-')
    expect(result.isJson).toBe(false)
  })

  it('returns raw string for invalid JSON', () => {
    const result = parsePayload('not json {')
    expect(result.isJson).toBe(false)
    expect(result.display).toBe('not json {')
  })
})
