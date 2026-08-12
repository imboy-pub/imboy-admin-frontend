import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

/**
 * 设备记录。字段对齐后端 user_device_logic:page/3 返回的分页项：
 * device_id / device_name / device_type / device_vsn / last_active_at / online。
 */
interface UserDevice {
  device_id: string
  device_name: string
  device_type: string
  device_vsn: string
  last_active_at: string
  online: boolean
}

interface UserDevicePage {
  list: UserDevice[]
  total: number
  page: number
  size: number
}

/** 列出指定用户的设备（GET /adm/user/devices?user_id=<uid>）。 */
async function listUserDevices(
  userId: EntityId
): Promise<ApiResponse<UserDevicePage>> {
  const response = await client.get('/user/devices', {
    params: { user_id: userId },
  })
  return response.data
}

/** 取分页 payload，失败抛错。 */
export async function listUserDevicesPayload(
  userId: EntityId
): Promise<UserDevicePage> {
  return requireApiPayload(await listUserDevices(userId), '/user/devices')
}

/** 踢出单个设备会话（POST /adm/user/device/kick {user_id, did}）。 */
export async function kickDevice(
  userId: EntityId,
  did: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/device/kick', {
    user_id: userId,
    did,
  })
  return response.data
}

/**
 * 强制指定用户在所有设备上下线（POST /adm/user/force_logout?uid=<uid>）。
 * 后端无单独 kick-all 端点，全部下线复用 force_logout。
 */
export async function forceLogoutUser(
  userId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/force_logout', null, {
    params: { uid: userId },
  })
  return response.data
}
