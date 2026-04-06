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

interface UserStats {
  daily_new: DailyCount[]
  active_users: number
  banned_users: number
  deleted_users: number
}

interface MessageStats {
  daily_c2c: DailyCount[]
  daily_c2g: DailyCount[]
}

interface GroupStats {
  daily_new: DailyCount[]
  public_groups: number
  private_groups: number
}

async function getOverviewStats(): Promise<ApiResponse<OverviewStats>> {
  const response = await client.get('/stats/overview')
  return response.data
}

export async function getOverviewStatsPayload(): Promise<OverviewStats> {
  return requireApiPayload(await getOverviewStats(), '/stats/overview')
}

async function getUserStats(days = 7): Promise<ApiResponse<UserStats>> {
  const response = await client.get('/stats/user', { params: { days } })
  return response.data
}

export async function getUserStatsPayload(days = 7): Promise<UserStats> {
  return requireApiPayload(await getUserStats(days), '/stats/user')
}

async function getMessageStats(days = 7): Promise<ApiResponse<MessageStats>> {
  const response = await client.get('/stats/message', { params: { days } })
  return response.data
}

export async function getMessageStatsPayload(days = 7): Promise<MessageStats> {
  return requireApiPayload(await getMessageStats(days), '/stats/message')
}

async function getGroupStats(days = 7): Promise<ApiResponse<GroupStats>> {
  const response = await client.get('/stats/group', { params: { days } })
  return response.data
}

export async function getGroupStatsPayload(days = 7): Promise<GroupStats> {
  return requireApiPayload(await getGroupStats(days), '/stats/group')
}

export interface RankingItem {
  id: number | string
  nickname?: string
  account?: string
  name?: string
  title?: string
  metric: number
}

interface RankingStats {
  list: RankingItem[]
}

async function getRankingStats(
  type = 'user',
  metric = 'message',
  limit = 10,
): Promise<ApiResponse<RankingStats>> {
  const response = await client.get('/stats/ranking', { params: { type, metric, limit } })
  return response.data
}

export async function getRankingStatsPayload(
  type = 'user',
  metric = 'message',
  limit = 10,
): Promise<RankingStats> {
  return requireApiPayload(await getRankingStats(type, metric, limit), '/stats/ranking')
}
