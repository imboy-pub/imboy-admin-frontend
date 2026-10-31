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

  // ── J27.d（plan §9）：2^53−1/2^53/2^53+1/BIGINT 上界原始文本局部解码 ──
  // 禁止以 JS number 字面量构造大整数 fixture：9007199254740993 字面量在源码
  // 阶段就已是 9007199254740992，9223372036854775807 字面量近似为 ...776e18。
  // wire 文本必须以字符串合成，模拟「后端下发原始字节」。
  describe('J27.d: 安全整数保留 number，不安全整数转 string，十进制逐字符不变', () => {
    // 期望十进制序列一律以字符串声明（raw source of truth）
    const ID_BOUNDARIES = [
      ['safe', '9007199254740991'], // 2^53 - 1（Number.MAX_SAFE_INTEGER）
      ['boundary', '9007199254740992'], // 2^53：虽能精确表示，已不属于安全整数
      ['unsafe', '9007199254740993'], // 2^53 + 1
      ['int64max', '9223372036854775807'], // 2^63 - 1（PG BIGINT 上界）
    ] as const

    function expectDigitsCharByChar(actual: unknown, expected: string) {
      expect(typeof actual).toBe(BigInt(expected) <= BigInt(Number.MAX_SAFE_INTEGER) ? 'number' : 'string')
      const text = String(actual)
      expect(text).toMatch(/^[0-9]+$/)
      expect(text.length).toBe(expected.length)
      for (let i = 0; i < expected.length; i += 1) {
        expect(text[i]).toBe(expected[i])
      }
    }

    it('keeps wire integer literals decimal-identical at 2^53-1, 2^53, 2^53+1 and 2^63-1', () => {
      const wire = `{${ID_BOUNDARIES.map(([key, digits]) => `"${key}":${digits}`).join(',')}}`
      const result = safeParseBigIntJson(wire) as Record<string, unknown>
      for (const [key, digits] of ID_BOUNDARIES) {
        expectDigitsCharByChar(result[key], digits)
      }
    })

    it('keeps nested IDs inside arrays and objects decimal-identical', () => {
      const wire = `{"payload":{"list":[${ID_BOUNDARIES.map(([, digits]) => `{"id":${digits}}`).join(',')}]}}`
      const result = safeParseBigIntJson(wire) as {
        payload: { list: Array<{ id: unknown }> }
      }
      ID_BOUNDARIES.forEach(([, digits], index) => {
        expectDigitsCharByChar(result.payload.list[index].id, digits)
      })
    })
  })

  // ── J27.e（plan §9）：长数字字符串、时间/金额、小数、Xid 保持原义 ──────────
  // 此处只证明通用 JSON 解析/序列化不误伤；J27.e 的真实 ID 校验拒绝需在 ID 校验层另验。
  describe('J27.e: 非 ID 数值/字符串局部解析与序列化往返保持原义', () => {
    it('keeps non-ID values intact through parsing and JSON serialization', () => {
      // 长数字字符串（>19 位，超出 BIGINT 表达域）：引号内整体原样，不二次加引号、不截断
      // 时间：16 位微秒时间戳在安全整数范围内，保持 number；不在此验证时间单位转换
      // 金额：15 位分值精确可表示，保持 number；小数整体透传
      // Xid：字母数字混合字符串标识，非纯数字 ID，原样保留
      const json =
        '{"long_digit_text":"123456789012345678901234567890",' +
        '"created_at":1785000000000000,' +
        '"amount_fen":999999999999999,' +
        '"ratio":0.6180339887498949,' +
        '"xid":"imboy_7h3k9x2a1b"}'
      const result = safeParseBigIntJson(json) as Record<string, unknown>

      expect(result.long_digit_text).toBe('123456789012345678901234567890')
      expect(result.created_at).toBe(1785000000000000)
      expect(typeof result.created_at).toBe('number')
      expect(result.amount_fen).toBe(999999999999999)
      expect(result.ratio).toBe(0.6180339887498949)
      expect(result.xid).toBe('imboy_7h3k9x2a1b')
      const serialized = JSON.stringify(result)
      expect(serialized).toBe(json)
      expect(safeParseBigIntJson(serialized)).toEqual(result)
    })
  })
})
