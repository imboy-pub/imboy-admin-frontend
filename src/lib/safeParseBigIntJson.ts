/**
 * TSID 安全防护: 将 JSON 文本中超出 Number.MAX_SAFE_INTEGER 的纯整数转为字符串。
 *
 * 后端 TSID 为 64 位 BIGINT (最大 19 位十进制)，如果后端偶尔以 JSON number
 * 而非 string 形式返回，标准 JSON.parse 会丢失精度。此函数在解析前将这类
 * 大数字加上引号，确保前端始终以 string 接收。
 *
 * 匹配规则: 独立的 16 位及以上纯数字 (不匹配小数、科学计数法、已在引号内的字符串)。
 */
export function safeParseBigIntJson(text: string): unknown {
  // 仅处理看起来像 JSON 的文本
  const trimmed = text.trim()
  if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return JSON.parse(text)
  }

  // 将 16 位及以上的整数字面量包裹成字符串
  // 负向前瞻/后顾确保不匹配已在引号内的值或小数
  const safeText = trimmed.replace(
    /(?<=[:,[\s])(-?\d{16,})(?=[,\]}\s])/g,
    '"$1"'
  )

  return JSON.parse(safeText)
}
