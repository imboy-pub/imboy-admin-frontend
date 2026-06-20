/**
 * 货币工具函数
 *
 * 金额统一以"分"（整数）存储和传输，展示时转为"元"。
 */

/**
 * 将分转换为带¥前缀的元字符串。
 *
 * @example
 * fenToYuan(5999) => "¥59.99"
 * fenToYuan(0)    => "¥0.00"
 * fenToYuan(100)  => "¥1.00"
 */
export function fenToYuan(fen: number | string | undefined | null): string {
  const num = Number(fen)
  if (!Number.isFinite(num)) return '-'
  return `¥${(num / 100).toFixed(2)}`
}

/**
 * 将元字符串解析为分（整数）。
 * 用于表单输入：用户填元，提交时转分。
 *
 * @example
 * yuanToFen(59.99) => 5999
 * yuanToFen('1')   => 100
 */
export function yuanToFen(yuan: number | string): number {
  const num = Number(yuan)
  if (!Number.isFinite(num)) return 0
  return Math.round(parseFloat((num * 100).toPrecision(12)))
}
