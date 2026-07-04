import { useEffect, useState } from 'react'

/**
 * 返回在 `delay` 毫秒内保持稳定的防抖值。
 * 用于把逐字符输入（如 UID/keyword）延迟后再驱动查询，避免每次击键都发请求。
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
