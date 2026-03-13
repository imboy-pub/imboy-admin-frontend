import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { LogoutApplication, LogoutApplicationListParams } from '@/types/logoutApplication'
import { requireApiPayload } from './responseAdapter'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/adm'

/**
 * @deprecated Prefer `getLogoutApplicationListPayload` to consume typed payload directly.
 */
export async function getLogoutApplicationList(
  params: LogoutApplicationListParams
): Promise<ApiResponse<PaginatedResponse<LogoutApplication>>> {
  const response = await client.get('/user/logout_apply/list', { params })
  return response.data
}

export async function getLogoutApplicationListPayload(
  params: LogoutApplicationListParams
): Promise<PaginatedResponse<LogoutApplication>> {
  return requireApiPayload(await getLogoutApplicationList(params), '/user/logout_apply/list')
}

export async function exportLogoutApplicationCsvBlob(params: LogoutApplicationListParams): Promise<Blob> {
  const searchParams = new URLSearchParams()
  const entries = Object.entries(params) as Array<[string, unknown]>
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }

  const url = `${BASE_URL}/user/logout_apply/export?${searchParams.toString()}`
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
