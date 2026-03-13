import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { ManagedMessage, MessageListParams } from '@/types/message'
import { requireApiPayload } from './responseAdapter'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/adm'

/**
 * @deprecated Prefer `getMessageListPayload` to consume typed payload directly.
 */
export async function getMessageList(
  params: MessageListParams
): Promise<ApiResponse<PaginatedResponse<ManagedMessage>>> {
  const response = await client.get('/message/list', { params })
  return response.data
}

export async function getMessageListPayload(
  params: MessageListParams
): Promise<PaginatedResponse<ManagedMessage>> {
  return requireApiPayload(await getMessageList(params), '/message/list')
}

/**
 * @deprecated Prefer `getMessageDetailPayload` to consume typed payload directly.
 */
export async function getMessageDetail(
  msgId: string,
  msgScope: MessageListParams['msg_scope'] = 'all'
): Promise<ApiResponse<ManagedMessage>> {
  const response = await client.get('/message/detail', {
    params: { msg_id: msgId, msg_scope: msgScope },
  })
  return response.data
}

export async function getMessageDetailPayload(
  msgId: string,
  msgScope: MessageListParams['msg_scope'] = 'all'
): Promise<ManagedMessage> {
  return requireApiPayload(await getMessageDetail(msgId, msgScope), '/message/detail')
}

export async function exportMessageCsvBlob(params: MessageListParams): Promise<Blob> {
  const searchParams = new URLSearchParams()
  const entries = Object.entries(params) as Array<[string, unknown]>
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }

  const url = `${BASE_URL}/message/export?${searchParams.toString()}`
  const resp = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/csv',
    },
  })

  if (!resp.ok) {
    throw new Error(`导出失败（HTTP ${resp.status}）`)
  }

  return await resp.blob()
}
