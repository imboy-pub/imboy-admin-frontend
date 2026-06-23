import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export interface Channel {
  id: EntityId
  name: string
  type: number
  owner_id: EntityId
  custom_id: string | null
  description: string | null
  avatar: string | null
  subscriber_count: number
  status: number
  created_at: string
  updated_at: string
  price?: number
  currency?: string
  original_price?: number
  subscription_type?: number
}

export interface ChannelListParams {
  page?: number
  size?: number
  status?: number
  keyword?: string
  /** 频道类型过滤（0公开 1私密 2付费），由后端 /channel/list 服务端分页 */
  type?: number
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

export interface ChannelPriceParams {
  price_fen: number
  original_price_fen?: number
  currency?: string
  subscription_type?: number
  description?: string
}

export interface ChannelMessage {
  id: EntityId
  channel_id: EntityId
  author_id: EntityId
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
  id: EntityId
  account?: string
  nickname?: string
  avatar?: string
  status?: number
}

export interface ChannelSubscriber {
  id: EntityId
  channel_id: EntityId
  user_id: EntityId
  is_pinned: boolean
  unread_count: number
  last_read_at: string | null
  subscribed_at: string
  user?: ChannelUserSummary
}

export interface ChannelAdmin {
  id: EntityId
  channel_id: EntityId
  user_id: EntityId
  role: number
  created_at: string
  user?: ChannelUserSummary
}

export interface ChannelInvitation {
  id: EntityId
  channel_id: EntityId
  inviter_uid: EntityId
  invitee_uid: EntityId
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
  id: EntityId
  channel_id: EntityId
  user_id: EntityId
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
  channel_id: EntityId
  subscriber_count: number
  total_messages: number
  total_views: number
  total_reactions: number
}

type RawChannel = Channel & {
  creator_uid?: EntityId
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
export async function getChannelList(
  params: ChannelListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<Channel>>> {
  const response = await client.get('/channel/list', { params })
  return response.data
}

export async function getChannelListPayload(
  params: ChannelListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<Channel>> {
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
export async function getChannelDetail(channelId: EntityId): Promise<ApiResponse<Channel>> {
  const response = await client.get(`/channel/detail/${channelId}`)
  return response.data
}

export async function getChannelDetailPayload(channelId: EntityId): Promise<Channel> {
  const payload = requireApiPayload(await getChannelDetail(channelId), '/channel/detail')
  return normalizeChannel(payload as RawChannel)
}

/**
 * 搜索频道
 * @deprecated Prefer `searchChannelsPayload` to consume typed payload directly.
 */
export async function searchChannels(
  params: ChannelSearchParams
): Promise<ApiResponse<PaginatedResponse<Channel>>> {
  const response = await client.get('/channel/search', { params })
  return response.data
}

export async function searchChannelsPayload(
  params: ChannelSearchParams
): Promise<PaginatedResponse<Channel>> {
  const payload = requireApiPayload(await searchChannels(params), '/channel/search')
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeChannel(item as RawChannel))
    : []
  return { ...payload, items }
}

export async function updateChannel(
  channelId: EntityId,
  data: ChannelUpdateParams
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(`/channel/detail/${channelId}`, data)
  return response.data
}

export async function deleteChannel(id: EntityId): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete('/channel/delete', {
    data: { id },
  })
  return response.data
}

export async function getChannelMessages(
  channelId: EntityId,
  params: ChannelMessageListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelMessage>>> {
  const response = await client.get(`/channel/${channelId}/messages`, { params })
  return response.data
}

export async function getChannelMessagesPayload(
  channelId: EntityId,
  params: ChannelMessageListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelMessage>> {
  return requireApiPayload(
    await getChannelMessages(channelId, params),
    '/channel/:id/messages'
  )
}

export async function pinChannelMessage(
  channelId: EntityId,
  messageId: EntityId,
  pinned: boolean
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(
    `/channel/${channelId}/message/${messageId}/pin`,
    { pinned }
  )
  return response.data
}

export async function deleteChannelMessage(
  channelId: EntityId,
  messageId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(
    `/channel/${channelId}/message/${messageId}/delete`
  )
  return response.data
}

export async function getChannelSubscribers(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelSubscriber>>> {
  const response = await client.get(`/channel/${channelId}/subscribers`, { params })
  return response.data
}

export async function getChannelSubscribersPayload(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelSubscriber>> {
  return requireApiPayload(
    await getChannelSubscribers(channelId, params),
    '/channel/:id/subscribers'
  )
}

export async function removeChannelSubscriber(
  channelId: EntityId,
  userId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(`/channel/${channelId}/subscriber/${userId}`)
  return response.data
}

export async function getChannelAdmins(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelAdmin>>> {
  const response = await client.get(`/channel/${channelId}/admins`, { params })
  return response.data
}

export async function getChannelAdminsPayload(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelAdmin>> {
  return requireApiPayload(
    await getChannelAdmins(channelId, params),
    '/channel/:id/admins'
  )
}

export async function updateChannelAdminRole(
  channelId: EntityId,
  userId: EntityId,
  role: number
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(`/channel/${channelId}/admin/${userId}/role`, { role })
  return response.data
}

export async function removeChannelAdmin(
  channelId: EntityId,
  userId: EntityId
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.delete(`/channel/${channelId}/admin/${userId}`)
  return response.data
}

export async function getChannelInvitations(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelInvitation>>> {
  const response = await client.get(`/channel/${channelId}/invitations`, { params })
  return response.data
}

export async function getChannelInvitationsPayload(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelInvitation>> {
  return requireApiPayload(
    await getChannelInvitations(channelId, params),
    '/channel/:id/invitations'
  )
}

export async function getChannelOrders(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<ChannelOrder>>> {
  const response = await client.get(`/channel/${channelId}/orders`, { params })
  return response.data
}

export async function getChannelOrdersPayload(
  channelId: EntityId,
  params: ChannelGovernanceListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<ChannelOrder>> {
  return requireApiPayload(
    await getChannelOrders(channelId, params),
    '/channel/:id/orders'
  )
}

export async function getChannelStats(channelId: EntityId): Promise<ApiResponse<ChannelStats>> {
  const response = await client.get(`/channel/${channelId}/stats`)
  return response.data
}

export async function getChannelStatsPayload(channelId: EntityId): Promise<ChannelStats> {
  return requireApiPayload(
    await getChannelStats(channelId),
    '/channel/:id/stats'
  )
}

export async function setChannelPrice(
  channelId: EntityId,
  data: ChannelPriceParams
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.put(`/channel/${channelId}/price`, data)
  return response.data
}

/**
 * 频道订单退款（管理端，client 自动加 adm 前缀）。
 * 成功返回 { order_no }；退款不可撤销。
 */
export async function refundChannelOrder(
  orderNo: string,
  reason: string
): Promise<ApiResponse<{ order_no: string }>> {
  const response = await client.post('/channel/order/refund', {
    order_no: orderNo,
    refund_reason: reason,
  })
  return response.data
}
