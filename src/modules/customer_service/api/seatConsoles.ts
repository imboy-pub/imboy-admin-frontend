/**
 * 客服坐席工作台（seat console）管理面 API（SC-FE）。
 *
 * 计划契约（后端 SC-BE 并行实现，接口冻结）：
 *   GET  /customer-service/seat-consoles?organization_id&workspace_id     (read)
 *        → payload list（0..N；active console = status==='active' 的那一行）
 *   POST /customer-service/seat-consoles                                  (write)
 *        body {organization_id, workspace_id, allowed_origins: string[]}
 *        → payload {seat_console}（同工作区已有 active → 409）
 *   PUT  /customer-service/seat-consoles/:id                              (write)
 *        body {organization_id, workspace_id, allowed_origins}
 *        （id 只在路径；allowed_origins 变更不影响 public id / 嵌入代码）
 *   POST /customer-service/seat-consoles/:id/revoke                       (write)
 *        body {organization_id, workspace_id}
 *
 * 纪律：TSID 全程 string（EntityId，绝不 Number() 回转）；管理接口必须显式
 * 携带 organization_id + workspace_id（缺省客户端 fail-closed 直接抛错）；
 * 出站投影经 seatConsolesPure.toSeatConsole 白名单 + 敏感键熔断。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { toSeatConsole, toSeatConsoleList, type SeatConsole } from './seatConsolesPure'

const SEAT_CONSOLES_BASE = '/customer-service/seat-consoles'

export type SeatConsoleScope = {
  organizationId: EntityId
  workspaceId: EntityId
}

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) throw new Error(`缺少必填 ID：${label}`)
  return id
}

/** 单体 payload 提取：容忍 {seat_console}/{console}/裸对象三种包装（fail-closed 投影兜底）。 */
function consoleFromPayload(payload: unknown): SeatConsole | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if ('seat_console' in record) return toSeatConsole(record.seat_console)
  if ('console' in record) return toSeatConsole(record.console)
  return toSeatConsole(record)
}

/** GET console 列表（必须显式租户条件；active 判定交给调用方按 status 过滤）。 */
export async function listSeatConsoles(scope: SeatConsoleScope): Promise<SeatConsole[]> {
  const response = await client.get<ApiResponse<unknown>>(SEAT_CONSOLES_BASE, {
    params: {
      organization_id: requireNonEmptyId(scope.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
    },
  })
  return toSeatConsoleList(requireApiPayload(response.data, 'GET seat consoles'))
}

/** POST 创建 console（每工作区至多一个 active；冲突由后端 409 表达）。 */
export async function createSeatConsole(
  input: SeatConsoleScope & { allowedOrigins: string[] }
): Promise<SeatConsole> {
  const response = await client.post<ApiResponse<unknown>>(SEAT_CONSOLES_BASE, {
    organization_id: requireNonEmptyId(input.organizationId, 'organization_id'),
    workspace_id: requireNonEmptyId(input.workspaceId, 'workspace_id'),
    allowed_origins: input.allowedOrigins,
  })
  const payload = requireApiPayload(response.data, 'POST seat consoles')
  const seatConsole = consoleFromPayload(payload)
  if (seatConsole === null) throw new Error('创建 seat console 响应形状非法')
  return seatConsole
}

/** PUT 更新 console 的 allowed_origins（id 只在路径；public id / 嵌入代码不变）。 */
export async function updateSeatConsole(
  seatConsoleId: EntityId,
  input: SeatConsoleScope & { allowedOrigins: string[] }
): Promise<SeatConsole | null> {
  const response = await client.put<ApiResponse<unknown>>(
    `${SEAT_CONSOLES_BASE}/${encodeURIComponent(requireNonEmptyId(seatConsoleId, 'seat_console_id'))}`,
    {
      organization_id: requireNonEmptyId(input.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(input.workspaceId, 'workspace_id'),
      allowed_origins: input.allowedOrigins,
    }
  )
  const payload = requireApiPayload(response.data, 'PUT seat consoles')
  return consoleFromPayload(payload)
}

/** POST 撤销 console（status → revoked；新加载返回 404，不影响已登录坐席会话）。 */
export async function revokeSeatConsole(
  seatConsoleId: EntityId,
  scope: SeatConsoleScope
): Promise<SeatConsole | null> {
  const response = await client.post<ApiResponse<unknown>>(
    `${SEAT_CONSOLES_BASE}/${encodeURIComponent(requireNonEmptyId(seatConsoleId, 'seat_console_id'))}/revoke`,
    {
      organization_id: requireNonEmptyId(scope.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
    }
  )
  const payload = requireApiPayload(response.data, 'POST seat console revoke')
  return consoleFromPayload(payload)
}
