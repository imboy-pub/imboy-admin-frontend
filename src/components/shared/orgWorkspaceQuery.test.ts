/**
 * orgWorkspaceQuery codec 单元测试（EADM-06 / A6）。
 * 纯函数，无后端、无网络依赖；覆盖解析/序列化/安全降级/round-trip 幂等/
 * 不污染其他参数。
 */
import { describe, expect, it } from 'bun:test'
import {
  parseOrgWorkspaceQuery,
  serializeOrgWorkspaceQuery,
  isTsidLike,
} from './orgWorkspaceQuery'

describe('isTsidLike', () => {
  it('accepts valid TSID shapes', () => {
    expect(isTsidLike('1234567890')).toBe(true)
    expect(isTsidLike('org_AbC-123')).toBe(true)
    expect(isTsidLike('01AN4Z07BY79KA1307SR9X4MV')).toBe(true) // Crockford base32
  })

  it('rejects empty / non-string / malformed', () => {
    expect(isTsidLike('')).toBe(false)
    expect(isTsidLike('   ')).toBe(false)
    expect(isTsidLike(null)).toBe(false)
    expect(isTsidLike(undefined)).toBe(false)
    expect(isTsidLike(123)).toBe(false)
    expect(isTsidLike('has space')).toBe(false)
    expect(isTsidLike('bad<tag>')).toBe(false)
    expect(isTsidLike('quote"x')).toBe(false)
    expect(isTsidLike('a'.repeat(65))).toBe(false) // 超长
  })
})

describe('parseOrgWorkspaceQuery', () => {
  it('returns nulls for empty/missing params (no throw, no undefined)', () => {
    expect(parseOrgWorkspaceQuery('')).toEqual({ org: null, ws: null })
    expect(parseOrgWorkspaceQuery('?foo=bar')).toEqual({ org: null, ws: null })
    expect(parseOrgWorkspaceQuery('?')).toEqual({ org: null, ws: null })
  })

  it('handles leading ? and decodes values', () => {
    expect(parseOrgWorkspaceQuery('?org=abc&ws=def')).toEqual({
      org: 'abc',
      ws: 'def',
    })
  })

  it('accepts a URLSearchParams input without mutating it', () => {
    const sp = new URLSearchParams('?org=xyz&ws=uvw&keep=1')
    const result = parseOrgWorkspaceQuery(sp)
    expect(result).toEqual({ org: 'xyz', ws: 'uvw' })
    // 调用方对象未被修改
    expect(sp.get('org')).toBe('xyz')
    expect(sp.get('keep')).toBe('1')
  })

  it('safely degrades empty / malformed values to null', () => {
    expect(parseOrgWorkspaceQuery('?org=&ws=')).toEqual({ org: null, ws: null })
    expect(parseOrgWorkspaceQuery('?org=   &ws=ok')).toEqual({ org: null, ws: 'ok' })
    expect(parseOrgWorkspaceQuery('?org=bad%20space')).toEqual({ org: null, ws: null })
    expect(parseOrgWorkspaceQuery('?org=weird<x>')).toEqual({ org: null, ws: null })
  })
})

describe('serializeOrgWorkspaceQuery', () => {
  it('omits null/empty/invalid params (never writes undefined or empty)', () => {
    expect(serializeOrgWorkspaceQuery({ org: null, ws: null })).toBe('')
    expect(serializeOrgWorkspaceQuery({ org: '', ws: '   ' })).toBe('')
    expect(serializeOrgWorkspaceQuery({ org: 'bad space' })).toBe('')
  })

  it('writes valid values', () => {
    expect(serializeOrgWorkspaceQuery({ org: 'abc', ws: 'def' })).toBe('org=abc&ws=def')
    expect(serializeOrgWorkspaceQuery({ org: 'abc' })).toBe('org=abc')
    expect(serializeOrgWorkspaceQuery({ ws: 'def' })).toBe('ws=def')
  })

  it('preserves other query params from base string', () => {
    const out = serializeOrgWorkspaceQuery({ org: 'abc', ws: 'def' }, '?page=2&tab=x')
    const parsed = new URLSearchParams(out)
    expect(parsed.get('org')).toBe('abc')
    expect(parsed.get('ws')).toBe('def')
    expect(parsed.get('page')).toBe('2')
    expect(parsed.get('tab')).toBe('x')
  })

  it('does not mutate a URLSearchParams base', () => {
    const base = new URLSearchParams('?page=2&org=old')
    const out = serializeOrgWorkspaceQuery({ org: 'new', ws: 'w' }, base)
    expect(base.get('org')).toBe('old') // 原对象未被改
    const parsed = new URLSearchParams(out)
    expect(parsed.get('org')).toBe('new')
    expect(parsed.get('page')).toBe('2')
  })

  it('replaces only org/ws when base already had them', () => {
    const out = serializeOrgWorkspaceQuery(
      { org: 'new', ws: null },
      '?org=old&ws=old&keep=1'
    )
    const parsed = new URLSearchParams(out)
    expect(parsed.get('org')).toBe('new')
    expect(parsed.get('ws')).toBe(null)
    expect(parsed.get('keep')).toBe('1')
  })
})

describe('round-trip idempotence', () => {
  const cases: Array<{ org: string | null; ws: string | null }> = [
    { org: null, ws: null },
    { org: 'abc', ws: null },
    { org: null, ws: 'def' },
    { org: 'abc', ws: 'def' },
  ]

  for (const seed of cases) {
    it(`round-trips for ${JSON.stringify(seed)}`, () => {
      const s1 = serializeOrgWorkspaceQuery(seed)
      const p1 = parseOrgWorkspaceQuery(s1)
      const s2 = serializeOrgWorkspaceQuery(p1)
      const p2 = parseOrgWorkspaceQuery(s2)
      expect(p1).toEqual(seed)
      expect(s2).toBe(s1)
      expect(p2).toEqual(p1)
    })
  }

  it('round-trips while preserving unrelated params', () => {
    const base = '?page=3&q=hello'
    const s1 = serializeOrgWorkspaceQuery({ org: 'abc', ws: 'def' }, base)
    const p1 = parseOrgWorkspaceQuery(s1)
    const s2 = serializeOrgWorkspaceQuery(p1, base)
    const p2 = parseOrgWorkspaceQuery(s2)
    expect(s2).toBe(s1)
    expect(p2).toEqual(p1)
  })

  it('degrades then round-trips: invalid input never re-enters the URL', () => {
    const s1 = serializeOrgWorkspaceQuery({ org: 'bad space', ws: 'weird<' })
    expect(s1).toBe('') // 全部降级为 null
    const p1 = parseOrgWorkspaceQuery(s1)
    expect(p1).toEqual({ org: null, ws: null })
  })
})
