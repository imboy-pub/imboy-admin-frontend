import type { EntityId } from '@/types/common'

/**
 * 将未知类型的 ID 字段收紧到 EntityId(string)。
 * 避免 BIGINT TSID 经 Number() 精度丢失。
 */
export function coerceEntityId(value: unknown, fallback: EntityId = ''): EntityId {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}
