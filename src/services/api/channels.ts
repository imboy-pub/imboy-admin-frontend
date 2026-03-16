// Deprecated compatibility implementation.
// New admin callers should prefer '@/modules/channels/api'; keep this file
// until every legacy page implementation has moved behind the module boundary.
import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

type IdLike = string | number

export interface Channel {
  id: IdLike
  name: string
  type: number
  owner_id: IdLike
  custom_id: string | null
  description: string | null
  avatar: string | null
  subscriber_count: number
  status: number
  created_at: string
  updated_at: string
}

export interface ChannelListParams {
  page?: number
  size?: number
  status?: number
  keyword?: string
}

export interface ChannelSearchParams {
  keyword: string
  limit?: number
}

export interface ChannelUpdateParams {
  name?: string
  type?: number
  status?: number
  custom_id?: string
  description?: string
  avatar?: string
}

export interface ChannelMessage {
  id: IdLike
  channel_id: IdLike
  author_id: IdLike
  author_name: string | null
  content: string
  msg_type: string
  is_pinned: boolean
  view_count: number
  created_at: string
  updated_at: string | null
}

export interface ChannelMessageListParams {
  page?: number
  size?: number
}

export interface ChannelGovernanceListParams {
  page?: number
  size?: number
}

export interface ChannelUserSummary {
  id: IdLike
  account?: string
  nickname?: string
  avatar?: string
  status?: number
}

export interface ChannelSubscriber {
  id: IdLike
  channel_id: IdLike
  user_id: IdLike
  is_pinned: boolean
  unread_count: number
  last_read_at: string | null
  subscribed_at: string
  user?: ChannelUserSummary
}

export interface ChannelAdmin {
  id: IdLike
  channel_id: IdLike
  user_id: IdLike
  role: number
  created_at: string
  user?: ChannelUserSummary
}

export interface ChannelInvitation {
  id: IdLike
  channel_id: IdLike
  inviter_uid: IdLike
  invitee_uid: IdLike
  invitation_code: string | null
  status: number
  message: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string | null
  inviter_user?: ChannelUserSummary
  invitee_user?: ChannelUserSummary
}

export interface ChannelOrder {
  id: IdLike
  channel_id: IdLike
  user_id: IdLike
  order_no: string
  amount: string
  currency: string
  status: number
  payment_method: string | null
  payment_no: string | null
  payment_at: string | null
  subscription_start_at: string | null
  subscription_end_at: string | null
  expires_at: string
  refund_reason: string | null
  refund_at: string | null
  created_at: string
  updated_at: string | null
  user?: ChannelUserSummary
}

export interface ChannelStats {
  channel_id: IdLike
  subscriber_count: number
  total_messages: number
  total_views: number
  total_reactions: number
}

type RawChannel = Channel & {
  creator_uid?: IdLike
}

function normalizeChannel(item: RawChannel): Channel {
  return {
    ...item,
    owner_id: item.owner_id ?? item.creator_uid ?? 0,
  }
}

/**
 * 获取频道列表
 * @deprecated Prefer `getChannelListPayload` to consume typed payload directly.
 */
export async function getChannelList(params: ChannelListParams = { page: 1, size: 10 }): Promise<ApiResponse<PaginatedResponse<Channel>>> {
  const response = await client.get('/channel/list', { params })
  return response.data
}

export async function getChannelListPayload(params: ChannelListParams = { page: 1, size: 10 }): Promise<PaginatedResponse<Channel>> {
  const payload = requireApiPayload(await getChannelList(params), '/channel/list')
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeChannel(item as RawChannel))
    : []
  return { ...payload, items }
}

/**
 * 获取频道详情
 * @deprecated Prefer `getChannelDetailPayload` to consume typed payload directly.
 */
export async function getChannelDetail(channelId: IdLike): Promise<ApiResponse<Channel>> {
  const response = await client.get(`/channel/detail/${channelId}`)
  return response.data
}

export async function getChannelDetailPayload(channelId: IdLike): Promise<Channel> {
  const payload = requireApiPayload(await getChannelDetail(channelId), '/channel/detail')
  return normalizeChannel(payload as RawChannel)
}

/**
 * 搜索频道
 * @deprecated Prefer `searchChannelsPayload` to consume typed payload directly.
 */
export async function searchChannels(params: ChannelSearchParams): Promise<ApiResponse<PaginatedResponse<Channel>>> {
  const response = await client.get('/channel/search', { params })
  return response.data
}

export async function searchChannelsPayload(params: ChannelSearchParams): Promise<PaginatedResponse<Channel>> {
  const payload = requireApiPayload(await searchChannels(params), '/channel/search')
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeChannel(item as RawChannel))
    : []
  return { ...payload, items }
}

/**
 * 更新频道
 */
export async function updateChannel(channelId: IdLike, data: ChannelUpdateParams): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(`/channel/detail/${channelId}`, data)
  return response.data
}

/**
 * 删除频道
 */
export async function deleteChannel(id: IdLike): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete('/channel/delete', {
    data: { id },
  })
  return response.data
}

/**
 * 获取频道消息列表（管理后台）
 */
export async function getChannelMessages(
  channelId: IdLike,
  params: ChannelMessageListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelMessage>>> {
  const response = await client.get(`/channel/detail/${channelId}/messages`, { params })
  return response.data
}

export async function getChannelMessagesPayload(
  channelId: IdLike,
  params: ChannelMessageListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelMessage>> {
  return requireApiPayload(
    await getChannelMessages(channelId, params),
    '/channel/detail/:id/messages'
  )
}

/**
 * 置顶/取消置顶频道消息（管理后台）
 */
export async function pinChannelMessage(
  channelId: IdLike,
  messageId: IdLike,
  pinned: boolean
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(
    `/channel/detail/${channelId}/message/${messageId}/pin`,
    { pinned }
  )
  return response.data
}

/**
 * 删除频道消息（管理后台）
 */
export async function deleteChannelMessage(
  channelId: IdLike,
  messageId: IdLike
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(
    `/channel/detail/${channelId}/message/${messageId}/delete`
  )
  return response.data
}

/**
 * 获取频道订阅者列表（管理后台）
 */
export async function getChannelSubscribers(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelSubscriber>>> {
  const response = await client.get(`/channel/detail/${channelId}/subscribers`, { params })
  return response.data
}

export async function getChannelSubscribersPayload(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelSubscriber>> {
  return requireApiPayload(
    await getChannelSubscribers(channelId, params),
    '/channel/detail/:id/subscribers'
  )
}

/**
 * 移除频道订阅者（管理后台）
 */
export async function removeChannelSubscriber(
  channelId: IdLike,
  userId: IdLike
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(`/channel/detail/${channelId}/subscriber/${userId}`)
  return response.data
}

/**
 * 获取频道管理员列表（管理后台）
 */
export async function getChannelAdmins(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelAdmin>>> {
  const response = await client.get(`/channel/detail/${channelId}/admins`, { params })
  return response.data
}

export async function getChannelAdminsPayload(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelAdmin>> {
  return requireApiPayload(
    await getChannelAdmins(channelId, params),
    '/channel/detail/:id/admins'
  )
}

/**
 * 更新频道管理员角色（管理后台）
 */
export async function updateChannelAdminRole(
  channelId: IdLike,
  userId: IdLike,
  role: number
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(`/channel/detail/${channelId}/admin/${userId}/role`, { role })
  return response.data
}

/**
 * 移除频道管理员（管理后台）
 */
export async function removeChannelAdmin(
  channelId: IdLike,
  userId: IdLike
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(`/channel/detail/${channelId}/admin/${userId}`)
  return response.data
}

/**
 * 获取频道邀请列表（管理后台）
 */
export async function getChannelInvitations(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelInvitation>>> {
  const response = await client.get(`/channel/detail/${channelId}/invitations`, { params })
  return response.data
}

export async function getChannelInvitationsPayload(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelInvitation>> {
  return requireApiPayload(
    await getChannelInvitations(channelId, params),
    '/channel/detail/:id/invitations'
  )
}

/**
 * 获取频道订单列表（管理后台）
 */
export async function getChannelOrders(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelOrder>>> {
  const response = await client.get(`/channel/detail/${channelId}/orders`, { params })
  return response.data
}

export async function getChannelOrdersPayload(
  channelId: IdLike,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelOrder>> {
  return requireApiPayload(
    await getChannelOrders(channelId, params),
    '/channel/detail/:id/orders'
  )
}

/**
 * 获取频道统计数据（管理后台）
 */
export async function getChannelStats(channelId: IdLike): Promise<ApiResponse<ChannelStats>> {
  const response = await client.get(`/channel/detail/${channelId}/stats`)
  return response.data
}

export async function getChannelStatsPayload(channelId: IdLike): Promise<ChannelStats> {
  return requireApiPayload(
    await getChannelStats(channelId),
    '/channel/detail/:id/stats'
  )
}
