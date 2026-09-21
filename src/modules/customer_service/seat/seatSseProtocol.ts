/**
 * SEAT-01：§3.6 冻结 SSE 合同的 Seat 侧纯消费层（信封解析 / event_id 去重）。
 *
 * 合同真源（计划 §3.6 SSE Event Contract，SSE-EVENT-CONTRACT-V1）：
 * - wire：`id: <event_id>`、`event: <type>`、`data: <envelope-json>`；
 * - type 六种：queue.changed | session.changed | message.appended |
 *   assignment.changed | seat.changed | resync.required；
 * - envelope 字段：event_id / type / organization_id / workspace_id /
 *   resource_type / resource_id / resource_version / occurred_at / reason；
 * - at-least-once 投递 → 客户端按 event_id 去重；事件只触发权威刷新，
 *   payload 不是业务真源（不携带正文/附件 URL/token）；
 * - heartbeat 是 SSE 注释行（不占 event_id），解析层忽略。
 */

export const SEAT_SSE_EVENT_TYPES = [
  'queue.changed',
  'session.changed',
  'message.appended',
  'assignment.changed',
  'seat.changed',
  'resync.required',
] as const

export const SEAT_SSE_RESOURCE_TYPES = [
  'queue',
  'session',
  'conversation',
  'message',
  'assignment',
  'seat',
] as const

export const SEAT_SSE_REASONS = ['created', 'updated', 'revoked', 'expired', 'unknown'] as const

export type SeatSseEventType = (typeof SEAT_SSE_EVENT_TYPES)[number]
export type SeatSseResourceType = (typeof SEAT_SSE_RESOURCE_TYPES)[number]
export type SeatSseReason = (typeof SEAT_SSE_REASONS)[number]

/** §3.6 冻结信封（逐字段 fail-closed 校验后投影，TSID 全 string）。 */
export type SeatSseEnvelope = {
  eventId: string
  type: SeatSseEventType
  organizationId: string
  workspaceId: string
  resourceType: SeatSseResourceType
  resourceId: string | null
  resourceVersion: number
  occurredAt: string
  reason: SeatSseReason
}

/** 严格解析 §3.6 信封：任一字段缺失/越界返回 null（不猜测、不部分采纳）。 */
export function parseSeatSseEnvelope(data: string): SeatSseEnvelope | null {
  let raw: unknown
  try {
    raw = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const eventId = record.event_id
  const type = record.type
  const resourceType = record.resource_type
  const reason = record.reason
  if (typeof eventId !== 'string' || eventId.length === 0) return null
  if (typeof type !== 'string' || type.length === 0) return null
  if (typeof record.organization_id !== 'string' || record.organization_id.length === 0) return null
  if (typeof record.workspace_id !== 'string' || record.workspace_id.length === 0) return null
  if (typeof record.occurred_at !== 'string' || record.occurred_at.length === 0) return null
  if (typeof record.resource_version !== 'number' || !Number.isSafeInteger(record.resource_version)) return null
  if (record.resource_id === null) {
    // 合法：resource_id 允许为 null
  } else if (typeof record.resource_id !== 'string' || record.resource_id.length === 0) {
    return null
  }
  if (typeof resourceType !== 'string' || resourceType.length === 0) return null
  if (typeof reason !== 'string' || reason.length === 0) return null
  // 枚举成员校验（includes 不收窄，逐个显式判定后收窄为字面量类型）。
  const typeLiterals: readonly string[] = SEAT_SSE_EVENT_TYPES
  const resourceLiterals: readonly string[] = SEAT_SSE_RESOURCE_TYPES
  const reasonLiterals: readonly string[] = SEAT_SSE_REASONS
  if (!typeLiterals.includes(type) || !resourceLiterals.includes(resourceType) || !reasonLiterals.includes(reason)) {
    return null
  }
  return {
    eventId,
    type: type as SeatSseEventType,
    organizationId: record.organization_id,
    workspaceId: record.workspace_id,
    resourceType: resourceType as SeatSseResourceType,
    resourceId: record.resource_id as string | null,
    resourceVersion: record.resource_version,
    occurredAt: record.occurred_at,
    reason: reason as SeatSseReason,
  }
}

/**
 * event_id 去重器（at-least-once 投递语义）。容量有界（FIFO 淘汰），
 * resync.required 时调用 reset() 清空（游标清空后旧 id 允许再次出现）。
 */
export class SeatSseEventIdDeduper {
  private readonly capacity: number
  private seen: Set<string>

  constructor(capacity = 1024) {
    this.capacity = capacity > 0 ? capacity : 1024
    this.seen = new Set()
  }

  /** 返回 true = 重复事件（调用方应跳过，不触发权威刷新）。 */
  isDuplicate(eventId: string): boolean {
    if (this.seen.has(eventId)) return true
    this.seen.add(eventId)
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next()
      if (oldest.done !== true) this.seen.delete(oldest.value)
    }
    return false
  }

  /** resync.required → 清空（游标清空后旧 id 允许再次出现）。 */
  reset(): void {
    this.seen = new Set()
  }

  get size(): number {
    return this.seen.size
  }
}

export type SeatSseEvent = { id: string | null; event: string; data: string }

/** 解析单个 SSE 块（以空行分隔）；`: heartbeat` 注释行返回 null。 */
export function parseSeatSseBlock(raw: string): { event: SeatSseEvent; retryMs: number | null } | null {
  let eventName = 'message'
  const dataLines: string[] = []
  let id: string | null = null
  let retryMs: number | null = null
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') dataLines.push(value)
    else if (field === 'id') id = value
    else if (field === 'retry') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) retryMs = parsed
    }
  }
  if (dataLines.length === 0 && id === null && retryMs === null) return null
  return { event: { id, event: eventName, data: dataLines.join('\n') }, retryMs }
}

/** 有状态解析器：把任意切分的 chunk 组装成完整事件（保持残余 buffer）。 */
export function createSeatSseParser(): { push: (_chunk: string) => { events: SeatSseEvent[]; retryMs: number | null } } {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      const events: SeatSseEvent[] = []
      let retryMs: number | null = null
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1) {
        const parsed = parseSeatSseBlock(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
        if (parsed !== null) {
          events.push(parsed.event)
          if (parsed.retryMs !== null) retryMs = parsed.retryMs
        }
        separator = buffer.indexOf('\n\n')
      }
      return { events, retryMs }
    },
  }
}
