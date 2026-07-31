import { describe, expect, it } from 'bun:test'
import { safeParseBigIntJson } from './safeParseBigIntJson'

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
    // 小数整体透传，由标准 JSON.parse 处理
    expect(typeof result.value).toBe('number')
  })

  // ── 回归：字符串内部的长数字（原正则实现会在此抛错，表现为整页白屏）──────

  it('does not corrupt long digits inside string values', () => {
    // 审计日志正文 / 消息内容 / 用户反馈里出现 TSID 是常态。
    // 旧实现：后顾与前瞻都含 \s，此处会被改写成 "备注 "1234567890123456", 完"
    const json = '{"remark":"备注 1838294017982464000, 完"}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.remark).toBe('备注 1838294017982464000, 完')
  })

  it('does not corrupt long digits at string boundaries', () => {
    const json = '{"a":"1838294017982464000","b":" 1838294017982464000 ","c":"[1838294017982464000]"}'
    const result = safeParseBigIntJson(json) as Record<string, string>
    expect(result.a).toBe('1838294017982464000')
    expect(result.b).toBe(' 1838294017982464000 ')
    expect(result.c).toBe('[1838294017982464000]')
  })

  it('handles escaped quotes inside strings without losing track of context', () => {
    // \" 不能被误判为字符串结束，否则后续结构判断整体错位
    const json = '{"msg":"他说 \\"订单 1838294017982464000 已支付\\"","id":1838294017982464001}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.msg).toBe('他说 "订单 1838294017982464000 已支付"')
    expect(result.id).toBe('1838294017982464001')
  })

  it('handles a backslash immediately before the closing quote', () => {
    const json = '{"path":"C:\\\\tmp\\\\","id":1838294017982464000}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.path).toBe('C:\\tmp\\')
    expect(result.id).toBe('1838294017982464000')
  })

  // ── 回归：位数判据误伤合法数值 ────────────────────────────────────────

  it('keeps 16-digit microsecond timestamps as numbers', () => {
    // 1785000000000000 是 16 位但 < MAX_SAFE_INTEGER，精确可表示。
    // 旧实现按「≥16 位」一刀切会转成 string，下游 new Date(number) 失效。
    const json = '{"created_at":1785000000000000}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.created_at).toBe(1785000000000000)
    expect(typeof result.created_at).toBe('number')
  })

  it('converts exactly at the safe-integer boundary', () => {
    // MAX_SAFE_INTEGER = 9007199254740991 精确可表示；+1 起丢精度
    const json = '{"safe":9007199254740991,"unsafe":9007199254740993}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result.safe).toBe(9007199254740991)
    expect(result.unsafe).toBe('9007199254740993')
  })

  it('does not convert exponent notation', () => {
    const json = '{"v":1.8e19,"w":-2E20}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(typeof result.v).toBe('number')
    expect(typeof result.w).toBe('number')
  })

  it('handles keys that look like large numbers', () => {
    const json = '{"1838294017982464000":1838294017982464001}'
    const result = safeParseBigIntJson(json) as Record<string, unknown>
    expect(result['1838294017982464000']).toBe('1838294017982464001')
  })
})
