import client from './client'
import { ApiResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

export interface OverviewStats {
  total_users: number
  today_users: number
  total_groups: number
  today_groups: number
  online_users: number
  online_devices: number
  today_messages: number
  today_c2c: number
  today_c2g: number
}

export interface DailyCount {
  date: string
  count: number
}

export interface UserStats {
  daily_new: DailyCount[]
  active_users: number
  banned_users: number
  deleted_users: number
}

export interface MessageStats {
  daily_c2c: DailyCount[]
  daily_c2g: DailyCount[]
}

export interface GroupStats {
  daily_new: DailyCount[]
  public_groups: number
  private_groups: number
}

/**
 * @deprecated Prefer `getOverviewStatsPayload` to consume typed payload directly.
 */
export async function getOverviewStats(): Promise<ApiResponse<OverviewStats>> {
  const response = await client.get('/stats/overview')
  return response.data
}

export async function getOverviewStatsPayload(): Promise<OverviewStats> {
  return requireApiPayload(await getOverviewStats(), '/stats/overview')
}

/**
 * @deprecated Prefer `getUserStatsPayload` to consume typed payload directly.
 */
export async function getUserStats(days = 7): Promise<ApiResponse<UserStats>> {
  const response = await client.get('/stats/user', { params: { days } })
  return response.data
}

export async function getUserStatsPayload(days = 7): Promise<UserStats> {
  return requireApiPayload(await getUserStats(days), '/stats/user')
}

/**
 * @deprecated Prefer `getMessageStatsPayload` to consume typed payload directly.
 */
export async function getMessageStats(days = 7): Promise<ApiResponse<MessageStats>> {
  const response = await client.get('/stats/message', { params: { days } })
  return response.data
}

export async function getMessageStatsPayload(days = 7): Promise<MessageStats> {
  return requireApiPayload(await getMessageStats(days), '/stats/message')
}

/**
 * @deprecated Prefer `getGroupStatsPayload` to consume typed payload directly.
 */
export async function getGroupStats(days = 7): Promise<ApiResponse<GroupStats>> {
  const response = await client.get('/stats/group', { params: { days } })
  return response.data
}

export async function getGroupStatsPayload(days = 7): Promise<GroupStats> {
  return requireApiPayload(await getGroupStats(days), '/stats/group')
}
