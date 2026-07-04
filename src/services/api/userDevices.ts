import client from '@/services/api/client'
import { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

/**
 * 强制指定用户在所有设备上下线（结束全部登录会话）。
 * 后端仅提供此管理端能力：POST /adm/user/force_logout?uid=<uid>。
 * 逐设备列表与单设备踢出后端暂无对应 /adm 端点，待后端补齐后再开放。
 */
export async function forceLogoutUser(
  userId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/force_logout', null, {
    params: { uid: userId },
  })
  return response.data
}
