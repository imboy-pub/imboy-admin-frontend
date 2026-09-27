/**
 * FE-W01：§3.6 冻结 SSE 合同的客户端消费层（信封解析 / event_id 去重 / resync）。
 *
 * 合同真源：contracts/sse-event-contract.json（SSE-EVENT-CONTRACT-V1）：
 * - envelope 字段：event_id / type / organization_id / workspace_id /
 *   resource_type / resource_id / resource_version / occurred_at / reason；
 * - type 六种：queue.changed | session.changed | message.appended |
 *   assignment.changed | seat.changed | resync.required；
 * - at-least-once 投递 → 客户端按 event_id 去重；
 * - resync.required → 清空游标并全量权威刷新（payload 不是业务真源）；
 * - 事件只触发权威刷新（history/list/detail），payload 不入业务状态。
 *
 * 兼容性：widget 面 endpoint（cs_widget_handler）当前投递 `state`/`message`
 * 两种帧（state_data/message_data 投影）。本层把它们作为第二类输入一并
 * 分类（widget-state / widget-message），语义收敛到同一权威刷新通道；
 * §3.6 信封帧出现时优先按信封消费。
 */

export const SSE_EVENT_TYPES = [
  'queue.changed',
  'session.changed',
  'message.appended',
  'assignment.changed',
  'seat.changed',
  'resync.required',
] as const

export const SSE_RESOURCE_TYPES = ['queue', 'session', 'conversation', 'message', 'assignment', 'seat'] as const

export const SSE_REASONS = ['created', 'updated', 'revoked', 'expired', 'unknown'] as const

export type SseEventType = (typeof SSE_EVENT_TYPES)[number]
export type SseResourceType = (typeof SSE_RESOURCE_TYPES)[number]
export type SseReason = (typeof SSE_REASONS)[number]

/** §3.6 冻结信封（逐字段 fail-closed 校验后投影）。 */
export type SseEnvelope = {
  eventId: string
  type: SseEventType
  organizationId: string
  workspaceId: string
  resourceType: SseResourceType
  resourceId: string | null
  resourceVersion: number
  occurredAt: string
  reason: SseReason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 严格解析 §3.6 信封：任一字段缺失/越界返回 null（不猜测、不部分采纳）。 */
export function parseSseEnvelope(data: string): SseEnvelope | null {
  let raw: unknown
  try {
    raw = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (!isRecord(raw)) return null
  const eventId = raw.event_id
  const type = raw.type
  const resourceType = raw.resource_type
  const reason = raw.reason
  if (!nonEmptyString(eventId) || !nonEmptyString(type)) return null
  if (!nonEmptyString(raw.organization_id) || !nonEmptyString(raw.workspace_id)) return null
  if (typeof raw.resource_version !== 'number' || !Number.isSafeInteger(raw.resource_version)) return null
  if (!nonEmptyString(raw.occurred_at)) return null
  const resourceId = raw.resource_id === null ? null : nonEmptyString(raw.resource_id) ? raw.resource_id : undefined
  if (resourceId === undefined) return null
  if (!nonEmptyString(resourceType) || !nonEmptyString(reason)) return null
  // 枚举成员校验（includes 不收窄，逐个显式判定后收窄为字面量类型）。
  const typeLiterals: readonly string[] = SSE_EVENT_TYPES
  const resourceLiterals: readonly string[] = SSE_RESOURCE_TYPES
  const reasonLiterals: readonly string[] = SSE_REASONS
  if (!typeLiterals.includes(type) || !resourceLiterals.includes(resourceType) || !reasonLiterals.includes(reason)) {
    return null
  }
  return {
    eventId,
    type: type as SseEventType,
    organizationId: raw.organization_id,
    workspaceId: raw.workspace_id,
    resourceType: resourceType as SseResourceType,
    resourceId,
    resourceVersion: raw.resource_version,
    occurredAt: raw.occurred_at,
    reason: reason as SseReason,
  }
}

/**
 * event_id 去重器（at-least-once 投递语义）。容量有界（FIFO 淘汰），
 * resync.required 时调用 reset() 清空（游标清空后旧 id 允许再次出现）。
 */
export class SseEventIdDeduper {
  private readonly capacity: number
  private seen: Set<string>

  constructor(capacity = 1024) {
    this.capacity = capacity > 0 ? capacity : 1024
    this.seen = new Set()
  }

  /** 返回 true = 重复事件（调用方应跳过）。 */
  isDuplicate(eventId: string): boolean {
    if (this.seen.has(eventId)) return true
    this.seen.add(eventId)
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next()
      if (oldest.done !== true) this.seen.delete(oldest.value)
    }
    return false
  }

  reset(): void {
    this.seen = new Set()
  }

  get size(): number {
    return this.seen.size
  }
}

export type SseFrameInput = { id: string | null; event: string; data: string }

export type ClassifiedSseFrame =
  | { kind: 'envelope'; envelope: SseEnvelope }
  /** widget 面状态帧：data = {resource:'cs.session', session_id, status}；
   * CP-CON-04：可选 agents_online（安全整数；0 → false、>0 → true；
   * 缺键/非法 → undefined = 本次帧不携带，不更新既有判定）。 */
  | { kind: 'widget-state'; status: string; agentsOnline?: boolean }
  /** widget 面消息帧：data = 消息行投影（内容触发权威刷新，不入业务真源）。 */
  | { kind: 'widget-message'; messageId: string | null }
  | { kind: 'ignore' }

/**
 * 帧分类：§3.6 信封优先；否则按 widget 面既有 state/message 帧识别；
 * 其余（keep-alive 已在解析层剔除、未知形状）一律 ignore。
 */
export function classifySseFrame(frame: SseFrameInput): ClassifiedSseFrame {
  const envelope = parseSseEnvelope(frame.data)
  if (envelope !== null) return { kind: 'envelope', envelope }
  if (frame.event === 'state') {
    try {
      const data = JSON.parse(frame.data) as { status?: unknown; agents_online?: unknown } | null
      if (data !== null && typeof data === 'object' && typeof data.status === 'string' && data.status.length > 0) {
        // CP-CON-04：可选 agents_online 三态投影（undefined = 帧不携带，不更新）。
        const rawAgents = data.agents_online
        const agentsOnline =
          typeof rawAgents === 'number' && Number.isSafeInteger(rawAgents) && rawAgents >= 0
            ? rawAgents > 0
            : undefined
        return { kind: 'widget-state', status: data.status, agentsOnline }
      }
    } catch {
      return { kind: 'ignore' }
    }
    return { kind: 'ignore' }
  }
  if (frame.event === 'message') {
    try {
      const data = JSON.parse(frame.data) as { id?: unknown } | null
      if (data !== null && typeof data === 'object' && nonEmptyString(data.id)) {
        return { kind: 'widget-message', messageId: data.id }
      }
      return { kind: 'widget-message', messageId: null }
    } catch {
      // 非 JSON 载荷的消息帧视为垃圾帧（不触发权威刷新）。
      return { kind: 'ignore' }
    }
  }
  return { kind: 'ignore' }
}
