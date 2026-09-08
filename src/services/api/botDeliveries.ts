import client from './client'
import { requireApiPayload } from './responseAdapter'
import { PaginatedResponse } from '@/types/api'

export interface BotDelivery {
  delivery_id: string
  bot_id: string
  event_type: string
  correlation_id: string
  attempt_count: number
  status: string
}

export async function listDeadDeliveries(page = 1): Promise<PaginatedResponse<BotDelivery>> {
  const response = await client.get('/bot/deliveries', { params: { page } })
  return requireApiPayload(response.data, '/bot/deliveries')
}

export async function replayDeadDelivery(deliveryId: string): Promise<{ delivery_id: string }> {
  const response = await client.post('/bot/deliveries/replay', { delivery_id: deliveryId })
  return requireApiPayload(response.data, '/bot/deliveries/replay')
}
