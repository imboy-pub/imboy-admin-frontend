// MCP 治理 API — roadmap T3.5（管理员审批 MCP 客户端 + 按 scope/tool 授权 + 审计）
//
// 后端 /api/adm/mcp/* 端点已就绪（adm_mcp_handler + mcp_governance_logic）。
// 响应遵循 ApiResponse<T> 信封：{ code, msg, payload }；code=0 为成功。
// 分页 payload 为后端 { total, page, size, list }，经 requireApiPayload 归一化为
// PaginatedResponse<T>（list→items，补 total_pages）。
// TSID 字段（client_id / owner_uid / audit id）以 JSON integer 返回，client.ts 的
// safeParseBigIntJson 在解析阶段转 string。
//
// 端点契约（统一 baseURL `/api/adm`）：
//   GET  /mcp/clients            ?page,size,status,keyword    -> PaginatedResponse<McpClient>
//   POST /mcp/clients/approve    {client_id}                  -> {client_id,status}
//   POST /mcp/clients/reject     {client_id,reason?}          -> {client_id,status}
//   POST /mcp/clients/revoke     {client_id,reason?}          -> {client_id,status}
//   GET  /mcp/clients/grants     ?client_id                   -> McpClientGrants
//   GET  /mcp/audit              ?page,size,client_id,action  -> PaginatedResponse<McpAuditEntry>
// 权限：mcp_clients:read（读），mcp_clients:approve（审批/拒绝/撤销）。

import client from './client'
import { requireApiPayload } from './responseAdapter'
import { PaginatedResponse } from '@/types/api'
import { EntityId } from '@/types/common'

export type McpClientStatus = 'pending' | 'approved' | 'revoked'
export type McpAuditAction = 'approve' | 'reject' | 'revoke' | 'tool_call'

export interface McpClient {
  client_id: EntityId
  name: string
  description?: string
  status: McpClientStatus
  owner_uid?: EntityId
  created_at: number
  approved_at?: number
}

export interface McpToolGrant {
  name: string
  description?: string
  enabled: boolean
}

export interface McpScopeGrant {
  scope: string
  description?: string
  enabled: boolean
}

export interface McpClientGrants {
  client_id: EntityId
  tools: McpToolGrant[]
  scopes: McpScopeGrant[]
}

export interface McpAuditEntry {
  id: EntityId
  client_id: EntityId
  client_name?: string
  action: McpAuditAction
  tool?: string
  actor?: string
  detail?: string
  created_at: number
}

export interface McpClientListParams {
  page: number
  size: number
  status?: McpClientStatus
  keyword?: string
}

export interface McpAuditListParams {
  page: number
  size: number
  client_id?: EntityId
  action?: McpAuditAction
}

type StatusResult = { client_id: EntityId; status: McpClientStatus }

export async function listClients(params: McpClientListParams): Promise<PaginatedResponse<McpClient>> {
  const response = await client.get('/mcp/clients', { params })
  return requireApiPayload(response.data, '/mcp/clients')
}

export async function approveClient(clientId: EntityId): Promise<StatusResult> {
  const response = await client.post('/mcp/clients/approve', { client_id: clientId })
  return requireApiPayload(response.data, '/mcp/clients/approve')
}

export async function rejectClient(clientId: EntityId, reason?: string): Promise<StatusResult> {
  const response = await client.post('/mcp/clients/reject', { client_id: clientId, reason: reason || '' })
  return requireApiPayload(response.data, '/mcp/clients/reject')
}

export async function revokeClient(clientId: EntityId, reason?: string): Promise<StatusResult> {
  const response = await client.post('/mcp/clients/revoke', { client_id: clientId, reason: reason || '' })
  return requireApiPayload(response.data, '/mcp/clients/revoke')
}

export async function getClientGrants(clientId: EntityId): Promise<McpClientGrants> {
  const response = await client.get('/mcp/clients/grants', { params: { client_id: clientId } })
  return requireApiPayload(response.data, '/mcp/clients/grants')
}

export async function listAudit(params: McpAuditListParams): Promise<PaginatedResponse<McpAuditEntry>> {
  const response = await client.get('/mcp/audit', { params })
  return requireApiPayload(response.data, '/mcp/audit')
}
