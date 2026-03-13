import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

export interface DDL {
  id: number
  ddl: string
  down_ddl: string
  old_vsn: number
  new_vsn: number
  status: number
  created_at: string
  updated_at: string
}

export interface DDLListParams {
  page?: number
  size?: number
  ajax?: number
}

export interface DDLSaveParams {
  id?: number
  ddl: string
  down_ddl: string
  old_vsn: number
  new_vsn: number
  status: number
}

/**
 * 获取 DDL 配置列表
 * @deprecated Prefer `getDDLListPayload` to consume typed payload directly.
 */
export async function getDDLList(params: DDLListParams): Promise<ApiResponse<PaginatedResponse<DDL>>> {
  const response = await client.get('/app_ddl/index', {
    params: { ajax: 1, ...params },
  })
  return response.data
}

export async function getDDLListPayload(params: DDLListParams): Promise<PaginatedResponse<DDL>> {
  return requireApiPayload(await getDDLList(params), '/app_ddl/index')
}

/**
 * 保存 DDL 配置
 */
export async function saveDDL(data: DDLSaveParams): Promise<ApiResponse<DDL>> {
  const response = await client.post('/app_ddl/save', data)
  return response.data
}

/**
 * 删除 DDL 配置
 */
export async function deleteDDL(id: number): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete('/app_ddl/delete', {
    data: { id },
  })
  return response.data
}
