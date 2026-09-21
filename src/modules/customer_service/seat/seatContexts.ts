/**
 * SEAT-01：GET /api/v1/cs/me/seat-contexts 读取与投影。
 *
 * 后端投影（BE-S01a cs_seat_app:seat_contexts）：每 Org 一行
 * {organization_id, organization_name, workspaces:[{id,name}],
 *  business_identity_id, seat_enabled, capabilities}；外层 {contexts, user_id}。
 * 客户端不手填 TSID（合同），全部字段经 toEntityId 收敛为 string；
 * 任一必需字段非法 → 整体抛 invalid_response（fail-closed，SEAT-01-A04/A05）。
 * DF-7 例外：未开坐席组织行的 business_identity_id=null 容忍为 null 投影
 * （organization_id 非法仍整体拒绝）；A04 过滤语义不变。
 */
import { seatInvalidResponse } from './errors'
import type { SeatApiClient } from './seatApiClient'
import { isRecord, nonEmptyString, toEntityId } from './tsid'
import { SEAT_CAPABILITIES, type SeatCapability, type SeatContext, type SeatContextsResult } from './types'

const KNOWN_CAPABILITIES: readonly string[] = SEAT_CAPABILITIES

function toCapabilities(value: unknown): SeatCapability[] {
  if (!Array.isArray(value)) throw seatInvalidResponse('seat-contexts capabilities is not an array')
  const out: SeatCapability[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !KNOWN_CAPABILITIES.includes(item)) {
      // 未知能力键 fail-closed 丢弃（不猜测、不放大权限）。
      continue
    }
    out.push(item as SeatCapability)
  }
  return out
}

function toWorkspaces(value: unknown): SeatContext['workspaces'] {
  if (!Array.isArray(value)) throw seatInvalidResponse('seat-contexts workspaces is not an array')
  const out: SeatContext['workspaces'] = []
  for (const row of value) {
    if (!isRecord(row)) throw seatInvalidResponse('seat-contexts workspace row is not an object')
    const id = toEntityId(row.id)
    if (id === null || !nonEmptyString(row.name)) {
      throw seatInvalidResponse('seat-contexts workspace row shape is invalid')
    }
    out.push({ id, name: row.name })
  }
  return out
}

function toContextRow(row: unknown): SeatContext {
  if (!isRecord(row)) throw seatInvalidResponse('seat-contexts row is not an object')
  const organizationId = toEntityId(row.organization_id)
  if (organizationId === null) {
    throw seatInvalidResponse('seat-contexts row TSID shape is invalid')
  }
  // DF-7：后端按 organization_member 逐组织发行——未开坐席的组织行
  // business_identity_id 线缆上是 null（cs_seat_app:context_row 投影），
  // 容忍为 null 投影，不得整体 invalid_response（否则多组织用户工作台恒不可用）。
  // 非 null 但非法 TSID 仍 fail-closed；A04 过滤语义（seatEnabled && workspaces>0）
  // 不变——seatless 行 seat_enabled=false 自然被剔除。
  const rawIdentity = row.business_identity_id
  const businessIdentityId = rawIdentity === null ? null : toEntityId(rawIdentity)
  if (rawIdentity !== null && businessIdentityId === null) {
    throw seatInvalidResponse('seat-contexts row TSID shape is invalid')
  }
  if (!nonEmptyString(row.organization_name)) {
    throw seatInvalidResponse('seat-contexts organization_name is missing')
  }
  const seatEnabled = row.seat_enabled === true
  return {
    organizationId,
    organizationName: row.organization_name,
    workspaces: toWorkspaces(row.workspaces),
    businessIdentityId,
    // A04 fail-closed：非 true 一律按 false；capabilities 空集。
    seatEnabled,
    capabilities: seatEnabled ? toCapabilities(row.capabilities) : [],
  }
}

/** 后端 payload → 强类型投影（形状非法整体失败，不做部分采纳）。 */
export function toSeatContexts(payload: unknown): SeatContextsResult {
  if (!isRecord(payload)) throw seatInvalidResponse('seat-contexts payload is not an object')
  const userId = toEntityId(payload.user_id)
  if (userId === null) throw seatInvalidResponse('seat-contexts user_id is not a TSID')
  if (!Array.isArray(payload.contexts)) throw seatInvalidResponse('seat-contexts contexts is not an array')
  return { userId, contexts: payload.contexts.map(toContextRow) }
}

/** 读取当前坐席上下文清单（登录成功后第一跳）。 */
export async function fetchSeatContexts(client: SeatApiClient): Promise<SeatContextsResult> {
  const payload = await client.request('/cs/me/seat-contexts')
  return toSeatContexts(payload)
}

/**
 * A04 fail-closed 选路：只有 seat_enabled 且至少一个 workspace 的组织才是
 * 可用坐席上下文；disabled/无 assignment（workspaces 空）的行被剔除。
 */
export function selectActiveSeatContexts(result: SeatContextsResult): SeatContext[] {
  return result.contexts.filter((ctx) => ctx.seatEnabled && ctx.workspaces.length > 0)
}
