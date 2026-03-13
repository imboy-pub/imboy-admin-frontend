import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

export interface AppVersion {
  id: number
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
  id?: number
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
  const response = await client.post('/app_version/save', data)
  return response.data
}

export async function deleteVersion(id: number): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/app_version/delete', { id })
  return response.data
}
