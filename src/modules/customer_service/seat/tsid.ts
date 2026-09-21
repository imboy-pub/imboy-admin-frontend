/**
 * SEAT-01：Seat 域 TSID 传输与解析工具。
 *
 * 合同（SEAT-01-A05）：后端 TSID 为 64 位 BIGINT，线缆上是 JSON integer；
 * 前端一律以 EntityId string 持有。所有 Seat 域 JSON 解析必须经
 * parseSeatJson（复用全局 safeParseBigIntJson 的精度保护线性扫描），
 * 任何 TSID 形状字段必须经 toEntityId 收敛，非法形状返回 null（fail-closed）。
 */
import { safeParseBigIntJson } from '@/lib/safeParseBigIntJson'
import type { EntityId } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * 带精度保护的 JSON 解析：把会丢失精度的整数字面量转为 string 后再 parse，
 * 响应中的 TSID 到达本模块时已是 string。
 */
export function parseSeatJson(text: string): unknown {
  return safeParseBigIntJson(text)
}

/**
 * 线缆 TSID（JSON integer 或 string）→ EntityId string。
 * 仅接受正整数字符串（拒绝 0/负数）或安全正整数；其余形状返回 null（不猜测）。
 */
export function toEntityId(value: unknown): EntityId | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed) || /^0+$/.test(trimmed)) return null
    return trimmed
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }
  return null
}
