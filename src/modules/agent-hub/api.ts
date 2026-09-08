import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'

export interface AiHubSignals {
  mcpPending: number
  deadDeliveries: number
  bots: number
}

/** MCP 治理：待批 client 数（status=pending） */
export async function fetchMcpPending(): Promise<number> {
  const res = await client.get('/mcp/clients', { params: { page: 1, size: 1, status: 'pending' } })
  const payload = requireApiPayload(res.data, '/mcp/clients') as { total?: number }
  return Number(payload.total ?? 0)
}

/** 出站交付死信数 */
export async function fetchDeadDeliveries(): Promise<number> {
  const res = await client.get('/bot/deliveries', { params: { page: 1 } })
  const payload = requireApiPayload(res.data, '/bot/deliveries') as { total?: number }
  return Number(payload.total ?? 0)
}

/** Bot 总数 */
export async function fetchBotCount(): Promise<number> {
  const res = await client.get('/bot/list', { params: { page: 1, size: 1 } })
  const payload = requireApiPayload(res.data, '/bot/list') as { total?: number }
  return Number(payload.total ?? 0)
}

/** 创建 MCP client（secret 仅本次响应返回，A02） */
export async function createMcpClient(ownerUid: number, name: string, description = '') {
  const res = await client.post('/mcp/clients/create', {
    owner_uid: ownerUid, name, description,
  })
  return requireApiPayload(res.data, '/mcp/clients/create') as {
    client_id: string
    client_key: string
    secret: string
    credential_prefix: string
    status: string
  }
}

/** 死信重放（delivery_id 不变） */
export async function replayDeadDelivery(deliveryId: string) {
  const res = await client.post('/bot/deliveries/replay', { delivery_id: deliveryId })
  return requireApiPayload(res.data, '/bot/deliveries/replay') as { delivery_id: string }
}
