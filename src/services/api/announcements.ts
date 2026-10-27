import client from './client'
import { requireApiPayload } from './responseAdapter'
import { toApiInstantIso } from '@/lib/apiInstant'
import type { PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export type AnnouncementType = 'info' | 'warning' | 'important'
type AnnouncementStatus = -1 | 0 | 1 | 2

export type Announcement = {
  id: EntityId
  adm_user_id: EntityId
  title: string
  body: string
  type: AnnouncementType
  status: AnnouncementStatus
  pinned: number
  /** R08/R14：时间字段经 adapter 归一为规范 ISO（或 null）；wire 单位毫秒
   * （BE adm_announcement_handler index → elib_response:success →
   * convert_at_timestamps → rfc3339_to/1：datetime 元组→ms 整数、整数直通）。 */
  published_at: string | null
  expired_at: string | null
  created_at: string | null
  updated_at: string | null
}

type AnnouncementListParams = {
  page?: number
  size?: number
  status?: number
  type?: string
  keyword?: string
}

export type AnnouncementFormData = {
  title: string
  body: string
  type: AnnouncementType
  pinned?: number
  expired_at?: string | null
}

export async function getAnnouncementList(
  params: AnnouncementListParams = {},
): Promise<PaginatedResponse<Announcement>> {
  const response = await client.get('/announcement/index', { params })
  const payload = requireApiPayload<Record<string, unknown>>(response.data, '/announcement/index')
  const rawList = (payload.items ?? payload.list ?? []) as unknown[]
  // R08/R14：列表项时间字段在 API 边界归一为规范 ISO（毫秒 wire），
  // 消费方（列表展示/CSV）不再接触裸 wire 值（毫秒整数/带偏移串）。
  const list: Announcement[] = rawList.map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      ...(row as object),
      published_at: toApiInstantIso(row.published_at, 'milliseconds'),
      expired_at: toApiInstantIso(row.expired_at, 'milliseconds'),
      created_at: toApiInstantIso(row.created_at, 'milliseconds'),
      updated_at: toApiInstantIso(row.updated_at, 'milliseconds'),
    } as Announcement
  })
  const page = (payload.page ?? 1) as number
  const size = (payload.size ?? 10) as number
  const total = (payload.total ?? 0) as number
  return {
    items: list,
    page,
    size,
    total,
    total_pages: Math.ceil(total / size) || 1,
  }
}

export async function createAnnouncement(data: AnnouncementFormData): Promise<{ id: EntityId }> {
  const response = await client.post('/announcement/create', data)
  return requireApiPayload(response.data, '/announcement/create')
}

export async function updateAnnouncement(
  id: EntityId,
  data: Partial<AnnouncementFormData>,
): Promise<{ id: EntityId }> {
  const response = await client.put('/announcement/update', { id, ...data })
  return requireApiPayload(response.data, '/announcement/update')
}

export async function deleteAnnouncement(id: EntityId): Promise<{ id: EntityId }> {
  const response = await client.post('/announcement/delete', { id })
  return requireApiPayload(response.data, '/announcement/delete')
}

export async function publishAnnouncement(id: EntityId): Promise<{ id: EntityId }> {
  const response = await client.post('/announcement/publish', { id })
  return requireApiPayload(response.data, '/announcement/publish')
}

export async function unpublishAnnouncement(id: EntityId): Promise<{ id: EntityId }> {
  const response = await client.post('/announcement/unpublish', { id })
  return requireApiPayload(response.data, '/announcement/unpublish')
}
