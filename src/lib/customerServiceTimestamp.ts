import { isNumericInstantShape, parseApiInstantMs } from './apiInstant'

/**
 * CS message created_at is Unix seconds; older responses use RFC3339.
 * R08-AD.0：解析全部经 apiInstant.ts 同一底层实现（无第二套 parser）。
 * 数字 / 纯数字字符串按秒归一输出规范 ISO；严格 RFC3339（带 offset）原样
 * 返回（历史响应的既有合同）；非法 / 缺失返回 null，不回填 now。
 */
export function customerServiceTimestamp(value: unknown): string | null {
  if (!isNumericInstantShape(value)) {
    // RFC3339 形状：底层已做严格校验，通过即原样保留（含 offset 与小数秒）。
    return parseApiInstantMs(value, 'seconds') === null
      ? null
      : (value as string)
  }
  const ms = parseApiInstantMs(value, 'seconds')
  return ms === null ? null : new Date(ms).toISOString()
}
