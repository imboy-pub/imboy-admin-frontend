import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export interface UserDevice {
  did: EntityId
  device_name: string
  device_model: string
  os: string
  os_version: string
  app_version: string
  last_active_at: string
  created_at: string
  online: boolean
}

export async function listUserDevices(
  userId: EntityId
): Promise<ApiResponse<UserDevice[]>> {
  const response = await client.get('/user/devices', { params: { user_id: userId } })
  return response.data
}

export async function listUserDevicesPayload(userId: EntityId): Promise<UserDevice[]> {
  return requireApiPayload(await listUserDevices(userId), '/user/devices')
}

export async function kickDevice(
  userId: EntityId,
  did: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/device/kick', { user_id: userId, did })
  return response.data
}

export async function forceLogoutAllDevices(
  userId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/user/device/kick-all', { user_id: userId })
  return response.data
}
