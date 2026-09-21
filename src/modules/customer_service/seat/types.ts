/**
 * SEAT-01：Web 坐席域共享类型（与 Admin/Widget 域严格隔离）。
 *
 * 合同真源：
 * - GET /api/v1/cs/me/seat-contexts（BE-S01a，cs_seat_app:seat_contexts 投影）：
 *   每行 {organization_id, organization_name, workspaces:[{id,name}],
 *   business_identity_id, seat_enabled, capabilities}；其中未开坐席的
 *   organization_member 行 business_identity_id=null、seat_enabled=false
 *   （DF-7：客户端容忍 null 投影，A04 过滤语义不变）；
 * - TSID 线缆上是 JSON integer，本模块一律收敛为 EntityId string（SEAT-01-A05）；
 * - capabilities 冻结镜像：conversation.read/write、message.write、asset.read/write
 *   （seat_enabled=false 时为空数组——fail-closed，SEAT-01-A04）。
 */
import type { EntityId } from '@/types/common'

export type { EntityId }

/** 坐席能力冻结集（与后端 cs_seat_app:seat_capabilities/1 逐字对齐）。 */
export const SEAT_CAPABILITIES = [
  'conversation.read',
  'conversation.write',
  'message.write',
  'asset.read',
  'asset.write',
] as const

export type SeatCapability = (typeof SEAT_CAPABILITIES)[number]

export type SeatWorkspaceRef = {
  id: EntityId
  name: string
}

/** seat-contexts 单行投影（字段全部 TSID string）。 */
export type SeatContext = {
  organizationId: EntityId
  organizationName: string
  workspaces: SeatWorkspaceRef[]
  /**
   * DF-7：后端按 organization_member 逐组织发行，未开坐席的组织行此键为
   * null（seat_enabled=false）；启用坐席的行非 null（坐席 PK = identity）。
   */
  businessIdentityId: EntityId | null
  seatEnabled: boolean
  capabilities: SeatCapability[]
}

/** GET /api/v1/cs/me/seat-contexts 的整体投影。 */
export type SeatContextsResult = {
  userId: EntityId
  contexts: SeatContext[]
}

/**
 * 会话终结原因：
 * - expired/cancelled：QR 会话终结（SEAT-01-A02）；
 * - unauthorized：401/凭证失效 → 清会话回登录（A02/A04 fail-closed）；
 * - forbidden：非成员/无 assignment/seat disabled/缺 permission（A04）；
 * - logout：坐席主动退出。
 */
export type SeatSessionEndReason =
  | 'expired'
  | 'cancelled'
  | 'unauthorized'
  | 'forbidden'
  | 'logout'
