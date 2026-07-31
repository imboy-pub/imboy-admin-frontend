/**
 * TSID 安全防护: 将 JSON 文本中会丢失精度的整数字面量转为字符串。
 *
 * 后端 TSID 为 64 位 BIGINT (最大 19 位十进制)，如果后端以 JSON number 而非
 * string 形式返回，标准 JSON.parse 会静默丢精度。此函数在解析前把这类大整数
 * 加上引号，确保前端始终以 string 接收。
 *
 * ## 为什么不用正则
 *
 * 原实现是 `/(?<=[:,[\s])(-?\d{16,})(?=[,\]}\s])/g`。它的后顾与前瞻都包含
 * `\s`，因此**字符串值内部**的长数字同样会被加引号：
 *
 *   {"a":"备注 1234567890123456, 完"}
 *     -> {"a":"备注 "1234567890123456", 完"}   // JSON.parse 抛错
 *
 * 而审计日志正文、消息内容、用户反馈里出现 TSID 是常态。抛错后
 * services/api/client.ts 会 catch 并返回原始字符串，随后被判定为 HTML 放行，
 * 最终 requireApiPayload 抛 "Missing payload" —— 表现为整页白屏。
 *
 * 正则无法表达「当前位置是否在字符串字面量内」，故改用带状态的线性扫描。
 *
 * ## 为什么判据是 isSafeInteger 而非位数
 *
 * 原实现用「≥16 位」近似。但 Number.MAX_SAFE_INTEGER = 9007199254740991 本身
 * 就是 16 位，于是 16 位的微秒时间戳（如 1785000000000000）会被无差别转成
 * string，下游 new Date(number) 与算术全部失效。改为直接判断该字面量能否被
 * 双精度精确表示 —— 只在真会丢精度时才加引号。
 */

const QUOTE = '"'
const ESCAPE = '\\'

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

/**
 * 判断整数字面量是否会在 JSON.parse 中丢失精度。
 * 超长字面量 Number() 会给出 Infinity 或近似值，isSafeInteger 均返回 false。
 */
function losesPrecision(literal: string): boolean {
  return !Number.isSafeInteger(Number(literal))
}

/**
 * 线性扫描 JSON 文本，只对**结构区**（字符串字面量之外）的整数加引号。
 */
function quoteUnsafeIntegers(json: string): string {
  let out = ''
  let i = 0
  let inString = false

  while (i < json.length) {
    const ch = json[i]

    if (inString) {
      out += ch
      if (ch === ESCAPE) {
        // 转义序列整体透传，防止 \" 被误判为字符串结束
        i += 1
        if (i < json.length) out += json[i]
      } else if (ch === QUOTE) {
        inString = false
      }
      i += 1
      continue
    }

    if (ch === QUOTE) {
      inString = true
      out += ch
      i += 1
      continue
    }

    if (ch === '-' || isDigit(ch)) {
      const start = i
      if (json[i] === '-') i += 1

      let intDigits = 0
      while (isDigit(json[i])) {
        i += 1
        intDigits += 1
      }

      // 小数与科学计数法整体透传：它们本就不是 TSID，且不能加引号
      let isInteger = true
      if (json[i] === '.') {
        isInteger = false
        i += 1
        while (isDigit(json[i])) i += 1
      }
      if (json[i] === 'e' || json[i] === 'E') {
        isInteger = false
        i += 1
        if (json[i] === '+' || json[i] === '-') i += 1
        while (isDigit(json[i])) i += 1
      }

      const literal = json.slice(start, i)
      const shouldQuote = isInteger && intDigits > 0 && losesPrecision(literal)
      out += shouldQuote ? `${QUOTE}${literal}${QUOTE}` : literal
      continue
    }

    out += ch
    i += 1
  }

  return out
}

export function safeParseBigIntJson(text: string): unknown {
  // 仅处理看起来像 JSON 对象/数组的文本
  const trimmed = text.trim()
  if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return JSON.parse(text)
  }

  return JSON.parse(quoteUnsafeIntegers(trimmed))
}
