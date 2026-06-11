import { describe, expect, it } from 'bun:test'
import {
  normalizeEndpoint,
  buildEndpointCandidates,
  isEndpointUnavailable,
  tryWithFallback,
  tryPutWithPostFallback,
} from './endpointCandidates'

describe('normalizeEndpoint', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeEndpoint('')).toBe('')
    expect(normalizeEndpoint('  ')).toBe('')
  })

  it('preserves paths already starting with /', () => {
    expect(normalizeEndpoint('/admin/list')).toBe('/admin/list')
  })

  it('prepends / to paths without leading slash', () => {
    expect(normalizeEndpoint('admin/list')).toBe('/admin/list')
  })

  it('trims whitespace', () => {
    expect(normalizeEndpoint('  /admin/list  ')).toBe('/admin/list')
  })
})

describe('buildEndpointCandidates', () => {
  it('returns only defaults when env is not a string', () => {
    expect(buildEndpointCandidates(undefined, ['/a', '/b'])).toEqual(['/a', '/b'])
    expect(buildEndpointCandidates(null, ['/a'])).toEqual(['/a'])
  })

  it('prepends env-configured endpoints before defaults', () => {
    const result = buildEndpointCandidates('/custom', ['/a', '/b'])
    expect(result[0]).toBe('/custom')
    expect(result).toContain('/a')
  })

  it('deduplicates overlapping configured and default entries', () => {
    const result = buildEndpointCandidates('/a', ['/a', '/b'])
    expect(result.filter((e) => e === '/a').length).toBe(1)
  })

  it('splits comma-separated env values', () => {
    const result = buildEndpointCandidates('/x,/y', ['/z'])
    expect(result).toContain('/x')
    expect(result).toContain('/y')
    expect(result).toContain('/z')
  })
})

describe('isEndpointUnavailable', () => {
  it('returns true for numeric code 404/405/501', () => {
    expect(isEndpointUnavailable({ code: 404 })).toBe(true)
    expect(isEndpointUnavailable({ code: 405 })).toBe(true)
    expect(isEndpointUnavailable({ code: 501 })).toBe(true)
  })

  it('returns true for string code that parses to 404', () => {
    expect(isEndpointUnavailable({ code: '404' })).toBe(true)
  })

  it('returns true for message patterns', () => {
    expect(isEndpointUnavailable({ message: 'endpoint unavailable' })).toBe(true)
    expect(isEndpointUnavailable({ msg: 'not found' })).toBe(true)
    expect(isEndpointUnavailable({ message: 'method not allowed' })).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isEndpointUnavailable({ code: 500, message: 'internal error' })).toBe(false)
    expect(isEndpointUnavailable(new Error('network error'))).toBe(false)
  })

  it('returns false for null/undefined/non-object', () => {
    expect(isEndpointUnavailable(null)).toBe(false)
    expect(isEndpointUnavailable(undefined)).toBe(false)
    expect(isEndpointUnavailable('404')).toBe(false)
  })
})

describe('tryWithFallback', () => {
  it('returns first successful response', async () => {
    const attempt = async (ep: string) => `ok:${ep}`
    const result = await tryWithFallback(['/a', '/b'], attempt)
    expect(result).toBe('ok:/a')
  })

  it('falls back to next endpoint when first is unavailable', async () => {
    let calls = 0
    const attempt = async (ep: string) => {
      calls++
      if (ep === '/a') throw { code: 404 }
      return `ok:${ep}`
    }
    const result = await tryWithFallback(['/a', '/b'], attempt)
    expect(result).toBe('ok:/b')
    expect(calls).toBe(2)
  })

  it('throws immediately for non-unavailable errors', async () => {
    const attempt = async (_ep: string) => { throw new Error('auth error') }
    await expect(tryWithFallback(['/a', '/b'], attempt)).rejects.toThrow('auth error')
  })

  it('throws last error when all candidates are unavailable', async () => {
    const attempt = async (_ep: string) => { throw { code: 404 } }
    await expect(tryWithFallback(['/a', '/b'], attempt)).rejects.toMatchObject({ code: 404 })
  })

  it('throws when endpoint list is empty', async () => {
    const attempt = async (_ep: string) => 'never'
    await expect(tryWithFallback([], attempt)).rejects.toThrow('No endpoint candidates configured')
  })
})

describe('tryPutWithPostFallback', () => {
  it('returns PUT response when PUT succeeds', async () => {
    const result = await tryPutWithPostFallback(
      ['/a'],
      async (ep) => `put:${ep}`,
      async (ep) => `post:${ep}`
    )
    expect(result).toBe('put:/a')
  })

  it('falls back to POST on same endpoint when PUT is unavailable', async () => {
    const result = await tryPutWithPostFallback(
      ['/a'],
      async (_ep) => { throw { code: 405 } },
      async (ep) => `post:${ep}`
    )
    expect(result).toBe('post:/a')
  })

  it('advances to next endpoint when both PUT and POST are unavailable', async () => {
    let calls = 0
    const result = await tryPutWithPostFallback(
      ['/a', '/b'],
      async (_ep) => { throw { code: 405 } },
      async (ep) => {
        calls++
        if (calls === 1) throw { code: 404 }
        return `post:${ep}`
      }
    )
    expect(result).toBe('post:/b')
  })

  it('throws non-unavailable PUT error immediately', async () => {
    await expect(
      tryPutWithPostFallback(
        ['/a'],
        async (_ep) => { throw new Error('server error') },
        async (ep) => `post:${ep}`
      )
    ).rejects.toThrow('server error')
  })
})
