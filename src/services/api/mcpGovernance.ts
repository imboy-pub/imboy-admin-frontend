// MCP 治理 API — roadmap T3.5（管理员审批 MCP 客户端 + 按 scope/tool 授权 + 审计）
//
// ⚠️ 后端 /api/adm/mcp/* 端点目前【完全不存在】（无表、无 handler）。
// 本文件用 mock 数据驱动前端页面，不真连后端。待后端实现后，把每个函数体内的
// mock 逻辑替换为对应的 `client.get/post`（契约见下），删掉 mock store 即可。
//
// ============================================================================
// 预期后端 REST 契约（给后端实现 T3.5 的输入）—— 统一 baseURL `/api/adm`
// 所有响应遵循 ApiResponse<T> 信封：{ code, msg, payload }；code=0 为成功。
// TSID 字段（client_id / owner_uid / audit id）以 JSON integer 返回，前端 safeParseBigIntJson 转 string。
// ----------------------------------------------------------------------------
// 1) GET  /api/adm/mcp/clients
//    query: { page:int=1, size:int=10, status?:'pending'|'approved'|'revoked', keyword?:string }
//    payload: PaginatedResponse<McpClient>
//
// 2) POST /api/adm/mcp/clients/approve
//    body: { client_id: EntityId }
//    payload: { client_id: EntityId, status: 'approved' }
//    权限: mcp_clients:approve（需后端 adm_acl 新增该权限码）
//
// 3) POST /api/adm/mcp/clients/reject
//    body: { client_id: EntityId, reason?: string }
//    payload: { client_id: EntityId, status: 'revoked' }
//    权限: mcp_clients:approve
//
// 4) POST /api/adm/mcp/clients/revoke   （对已审批客户端撤销授权）
//    body: { client_id: EntityId, reason?: string }
//    payload: { client_id: EntityId, status: 'revoked' }
//    权限: mcp_clients:approve
//
// 5) GET  /api/adm/mcp/clients/:client_id/grants
//    payload: McpClientGrants  —— 该客户端被授予的 tool / scope 列表
//
// 6) GET  /api/adm/mcp/audit
//    query: { page:int=1, size:int=10, client_id?:EntityId, action?:McpAuditAction }
//    payload: PaginatedResponse<McpAuditEntry>  —— 审批 + tool 调用审计流水
// ============================================================================

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

// ---------------------------------------------------------------------------
// ponytail: 纯前端 mock store，供页面独立渲染。后端 T3.5 落地后整块删除，
// 各函数改调 client.get/post。审批/拒绝/撤销会就地改状态，让列表刷新可见。
// ---------------------------------------------------------------------------
const MOCK_DELAY_MS = 240

const now = Date.now()
const day = 86_400_000

let mockClients: McpClient[] = [
  {
    client_id: '7350010000000000001',
    name: 'Claude Desktop',
    description: 'Anthropic 官方桌面客户端，请求接入 IM 消息与联系人只读能力',
    status: 'pending',
    owner_uid: '52278',
    created_at: now - 2 * 60 * 60 * 1000,
  },
  {
    client_id: '7350010000000000002',
    name: 'Cursor IDE',
    description: '开发者 IDE 集成，用于在编辑器内查询群任务',
    status: 'pending',
    owner_uid: '53314',
    created_at: now - 5 * 60 * 60 * 1000,
  },
  {
    client_id: '7350010000000000003',
    name: '内部运营 Bot',
    description: '运营团队自动化脚本，已获授权发送公告',
    status: 'approved',
    owner_uid: '52278',
    created_at: now - 6 * day,
    approved_at: now - 5 * day,
  },
  {
    client_id: '7350010000000000004',
    name: '第三方 CRM 连接器',
    description: '外部 CRM 同步好友关系，因合规问题已被撤销',
    status: 'revoked',
    owner_uid: '53314',
    created_at: now - 20 * day,
    approved_at: now - 18 * day,
  },
]

const mockGrants: Record<string, McpClientGrants> = {
  '7350010000000000001': {
    client_id: '7350010000000000001',
    tools: [
      { name: 'list_conversations', description: '列出会话', enabled: true },
      { name: 'read_message', description: '读取单条消息', enabled: true },
      { name: 'send_message', description: '发送消息', enabled: false },
    ],
    scopes: [
      { scope: 'im:message:read', description: '读取消息', enabled: true },
      { scope: 'im:contact:read', description: '读取联系人', enabled: true },
      { scope: 'im:message:write', description: '发送消息', enabled: false },
    ],
  },
  '7350010000000000003': {
    client_id: '7350010000000000003',
    tools: [
      { name: 'publish_announcement', description: '发布公告', enabled: true },
      { name: 'list_groups', description: '列出群组', enabled: true },
    ],
    scopes: [
      { scope: 'im:announcement:write', description: '发布公告', enabled: true },
      { scope: 'im:group:read', description: '读取群组', enabled: true },
    ],
  },
}

let mockAudit: McpAuditEntry[] = [
  { id: '9000000000000000001', client_id: '7350010000000000003', client_name: '内部运营 Bot', action: 'tool_call', tool: 'publish_announcement', actor: 'client', detail: '发布系统公告 #128', created_at: now - 30 * 60 * 1000 },
  { id: '9000000000000000002', client_id: '7350010000000000003', client_name: '内部运营 Bot', action: 'tool_call', tool: 'list_groups', actor: 'client', detail: '拉取 42 个群组', created_at: now - 2 * 60 * 60 * 1000 },
  { id: '9000000000000000003', client_id: '7350010000000000004', client_name: '第三方 CRM 连接器', action: 'revoke', actor: 'admin#96792392237320192', detail: '合规审查未通过，撤销全部授权', created_at: now - 3 * day },
  { id: '9000000000000000004', client_id: '7350010000000000003', client_name: '内部运营 Bot', action: 'approve', actor: 'admin#96792392237320192', detail: '审批通过，授予公告发布权限', created_at: now - 5 * day },
]

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS))
}

function paginate<T>(rows: T[], page: number, size: number): PaginatedResponse<T> {
  const total = rows.length
  const start = (page - 1) * size
  return {
    items: rows.slice(start, start + size),
    page,
    size,
    total,
    total_pages: Math.max(1, Math.ceil(total / size)),
  }
}

export async function listClients(params: McpClientListParams): Promise<PaginatedResponse<McpClient>> {
  // 真实实现: return requireApiPayload((await client.get('/mcp/clients', { params })).data, '/mcp/clients')
  const keyword = params.keyword?.trim().toLowerCase()
  const rows = mockClients.filter((c) => {
    if (params.status && c.status !== params.status) return false
    if (keyword && !`${c.name} ${c.description ?? ''}`.toLowerCase().includes(keyword)) return false
    return true
  })
  return delay(paginate(rows, params.page, params.size))
}

function setClientStatus(clientId: EntityId, status: McpClientStatus): { client_id: EntityId; status: McpClientStatus } {
  mockClients = mockClients.map((c) =>
    c.client_id === clientId
      ? { ...c, status, approved_at: status === 'approved' ? Date.now() : c.approved_at }
      : c
  )
  return { client_id: clientId, status }
}

function pushAudit(entry: Omit<McpAuditEntry, 'id' | 'created_at'>): void {
  const client = mockClients.find((c) => c.client_id === entry.client_id)
  mockAudit = [
    { ...entry, client_name: entry.client_name ?? client?.name, id: `9${Date.now()}`, created_at: Date.now() },
    ...mockAudit,
  ]
}

export async function approveClient(clientId: EntityId): Promise<{ client_id: EntityId; status: McpClientStatus }> {
  // 真实实现: return requireApiPayload((await client.post('/mcp/clients/approve', { client_id: clientId })).data, ...)
  const result = setClientStatus(clientId, 'approved')
  pushAudit({ client_id: clientId, action: 'approve', actor: 'admin', detail: '审批通过（mock）' })
  return delay(result)
}

export async function rejectClient(clientId: EntityId, reason?: string): Promise<{ client_id: EntityId; status: McpClientStatus }> {
  const result = setClientStatus(clientId, 'revoked')
  pushAudit({ client_id: clientId, action: 'reject', actor: 'admin', detail: reason || '拒绝接入（mock）' })
  return delay(result)
}

export async function revokeClient(clientId: EntityId, reason?: string): Promise<{ client_id: EntityId; status: McpClientStatus }> {
  const result = setClientStatus(clientId, 'revoked')
  pushAudit({ client_id: clientId, action: 'revoke', actor: 'admin', detail: reason || '撤销授权（mock）' })
  return delay(result)
}

export async function getClientGrants(clientId: EntityId): Promise<McpClientGrants> {
  // 真实实现: return requireApiPayload((await client.get(`/mcp/clients/${clientId}/grants`)).data, ...)
  return delay(mockGrants[clientId] ?? { client_id: clientId, tools: [], scopes: [] })
}

export async function listAudit(params: McpAuditListParams): Promise<PaginatedResponse<McpAuditEntry>> {
  const rows = mockAudit.filter((a) => {
    if (params.client_id && a.client_id !== params.client_id) return false
    if (params.action && a.action !== params.action) return false
    return true
  })
  return delay(paginate(rows, params.page, params.size))
}
