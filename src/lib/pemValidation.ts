const PEM_MAX_LENGTH = 8192
const PEM_PATTERN = /^-----BEGIN ([A-Z ]+)-----[\s\S]+-----END \1-----\s*$/

/** 校验字符串是否为合法 PEM 格式（含最大长度防护）。 */
export function isValidPemFormat(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > PEM_MAX_LENGTH) return false
  return PEM_PATTERN.test(trimmed)
}
