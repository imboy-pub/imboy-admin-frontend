/**
 * SEAT-01：Seat 域 TSID 工具与错误分类单测（A05）。
 */
import { describe, expect, it } from 'bun:test'
import { classifySeatError, isSeatApiError, SeatApiError } from './errors'
import { parseSeatJson, toEntityId } from './tsid'

describe('toEntityId（TSID string 收敛）', () => {
  it('接受十进制字符串与安全正整数，统一输出 string', () => {
    expect(toEntityId('1234567890123456789')).toBe('1234567890123456789')
    expect(toEntityId(' 42 ')).toBe('42')
    expect(toEntityId(42)).toBe('42')
  })

  it('拒绝负数/零/非整数/浮点/空串/非数字形状（fail-closed）', () => {
    expect(toEntityId('0')).toBe(null)
    expect(toEntityId('-5')).toBe(null)
    expect(toEntityId('12.5')).toBe(null)
    expect(toEntityId('abc')).toBe(null)
    expect(toEntityId('')).toBe(null)
    expect(toEntityId(1.5)).toBe(null)
    expect(toEntityId(null)).toBe(null)
    expect(toEntityId(undefined)).toBe(null)
    expect(toEntityId({})).toBe(null)
  })

  it('接受超 MAX_SAFE_INTEGER 的整数字符串（TSID 常态）', () => {
    expect(toEntityId('9223372036854775807')).toBe('9223372036854775807')
  })
})

describe('parseSeatJson（TSID 精度保护解析）', () => {
  it('结构区大整数字面量转 string，不丢精度', () => {
    const parsed = parseSeatJson('{"organization_id":9223372036854775807,"n":1}') as Record<string, unknown>
    expect(parsed.organization_id).toBe('9223372036854775807')
    expect(parsed.n).toBe(1)
  })

  it('字符串值内部的数字不受影响', () => {
    const parsed = parseSeatJson('{"note":"单号 1234567890123456789 完"}') as Record<string, unknown>
    expect(parsed.note).toBe('单号 1234567890123456789 完')
  })
})

describe('classifySeatError（错误分类）', () => {
  it('标准码位逐一落位', () => {
    expect(classifySeatError(400, 400, 'x').kind).toBe('validation')
    expect(classifySeatError(401, 401, 'x').kind).toBe('unauthorized')
    expect(classifySeatError(403, 403, 'x').kind).toBe('forbidden')
    expect(classifySeatError(404, 404, 'x').kind).toBe('not_found')
    expect(classifySeatError(409, 409, 'x').kind).toBe('conflict')
    expect(classifySeatError(429, 429, 'x').kind).toBe('rate_limited')
    expect(classifySeatError(500, 500, 'x').kind).toBe('server')
  })

  it('QR 专属码：5201/5203 expired、5202 cancelled、5204 not_scanned', () => {
    expect(classifySeatError(200, 5201, 'x').kind).toBe('qr_expired')
    expect(classifySeatError(200, 5203, 'x').kind).toBe('qr_expired')
    expect(classifySeatError(200, 5202, 'x').kind).toBe('qr_cancelled')
    expect(classifySeatError(200, 5204, 'x').kind).toBe('qr_not_scanned')
  })

  it('code 优先于 HTTP 状态（imboy 信封 HTTP 200 + 业务码）', () => {
    const error = classifySeatError(200, 403, 'denied')
    expect(error.kind).toBe('forbidden')
    expect(error.status).toBe(200)
    expect(error.code).toBe(403)
  })

  it('未知码位：>=500 按 server、其余正数按 validation、null 按 server 兜底', () => {
    expect(classifySeatError(200, 1234, 'x').kind).toBe('server')
    expect(classifySeatError(200, 234, 'x').kind).toBe('validation')
    expect(classifySeatError(null, null, 'x').kind).toBe('server')
  })

  it('SeatApiError 可用 instanceof / 守卫识别', () => {
    const error = classifySeatError(null, 401, 'expired token')
    expect(isSeatApiError(error)).toBe(true)
    expect(error instanceof SeatApiError).toBe(true)
    expect(error instanceof Error).toBe(true)
  })
})
