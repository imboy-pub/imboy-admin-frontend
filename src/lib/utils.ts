import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatOptionalDate(value?: string | null): string {
  if (!value) return '-'
  const parsed = /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return formatDate(parsed)
}

export function formatDate(date: Date | string | number): string {
  // 后端 PG timestamptz 编码为 6 位微秒 RFC3339（如 .634314+08:00），
  // Safari 等严格引擎 new Date 不接受超 3 位小数秒 → Invalid Date。
  // 截断到毫秒以跨浏览器兼容；无法解析时兜底 '-' 而非显示 "Invalid Date"。
  const d = new Date(
    typeof date === 'string' ? date.replace(/(\.\d{3})\d+/, '$1') : date,
  )
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

