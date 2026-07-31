import { describe, expect, it } from 'bun:test'
import { normalizeEndpoint, resolveEndpoint } from './endpointCandidates'

/**
 * 原测试覆盖的是 buildEndpointCandidates / isEndpointUnavailable /
 * tryWithFallback / tryPutWithPostFallback —— 运行时端点探测机制。
 * 该机制已整体移除（判据在结构上不可能正确，且误判会重放写请求），
 * 详见 endpointCandidates.ts 顶部说明。
 *
 * 现在只剩「环境变量覆盖 + 默认值」的纯解析。
 */

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

  it('trims surrounding whitespace', () => {
    expect(normalizeEndpoint('  /admin/list  ')).toBe('/admin/list')
  })
})

describe('resolveEndpoint', () => {
  it('falls back to the default when env is not a string', () => {
    expect(resolveEndpoint(undefined, '/role/list')).toBe('/role/list')
    expect(resolveEndpoint(null, '/role/list')).toBe('/role/list')
    expect(resolveEndpoint(123, '/role/list')).toBe('/role/list')
  })

  it('falls back to the default when env is blank', () => {
    expect(resolveEndpoint('', '/role/list')).toBe('/role/list')
    expect(resolveEndpoint('   ', '/role/list')).toBe('/role/list')
    expect(resolveEndpoint(',,', '/role/list')).toBe('/role/list')
  })

  it('uses the env override', () => {
    expect(resolveEndpoint('/custom/role/list', '/role/list')).toBe('/custom/role/list')
  })

  it('normalizes the env override', () => {
    expect(resolveEndpoint('custom/role/list', '/role/list')).toBe('/custom/role/list')
    expect(resolveEndpoint('  /custom/role/list  ', '/role/list')).toBe('/custom/role/list')
  })

  it('takes only the first entry of a legacy comma-separated list', () => {
    // 旧 .env 里 VITE_*_ENDPOINT 可能是候选列表；保留解析以免直接失效，
    // 但只取首项 —— 不再逐个尝试。
    expect(resolveEndpoint('/a,/b,/c', '/role/list')).toBe('/a')
  })

  it('skips leading empty entries in a legacy list', () => {
    expect(resolveEndpoint(', ,/b', '/role/list')).toBe('/b')
  })

  it('normalizes the default when it lacks a slash', () => {
    expect(resolveEndpoint(undefined, 'role/list')).toBe('/role/list')
  })
})
