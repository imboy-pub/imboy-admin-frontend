import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export interface AppVersion {
  id: EntityId
  version: string
  platform: string // 'ios' | 'android' | 'windows' | 'mac'
  download_url: string
  force_update: boolean
  description: string
  status: number
  created_at: string
  updated_at: string
}

export interface VersionListParams {
  page?: number
  size?: number
  platform?: string
}

export interface VersionSaveParams {
  id?: EntityId
  version: string
  platform: string
  download_url: string
  force_update: boolean
  description: string
}

/**
 * @deprecated Prefer `getVersionListPayload` to consume typed payload directly.
 */
export async function getVersionList(params: VersionListParams): Promise<ApiResponse<PaginatedResponse<AppVersion>>> {
  const response = await client.get('/app_version/index', { params })
  return response.data
}

export async function getVersionListPayload(params: VersionListParams): Promise<PaginatedResponse<AppVersion>> {
  return requireApiPayload(await getVersionList(params), '/app_version/index')
}

export async function saveVersion(data: VersionSaveParams): Promise<ApiResponse<AppVersion>> {
  // Backend reads `vsn` (not `version`) and `type` (not `platform`).
  // force_update: backend checks ec_cnv:to_integer(ForceUpdate) =:= 1; send 1/2 explicitly.
  const payload = {
    id: data.id,
    vsn: data.version,
    type: data.platform,
    download_url: data.download_url,
    force_update: data.force_update ? 1 : 2,
    description: data.description,
  }
  const response = await client.post('/app_version/save', payload)
  return response.data
}

export async function deleteVersion(id: EntityId): Promise<ApiResponse<Record<string, never>>> {
  // Backend delete/3 only handles DELETE method; POST returns empty response.
  const response = await client.delete('/app_version/delete', { data: { id } })
  return response.data
}
