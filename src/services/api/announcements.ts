import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { PaginatedResponse } from '@/types/api'

export type AnnouncementType = 'info' | 'warning' | 'important'
export type AnnouncementStatus = -1 | 0 | 1 | 2

export type Announcement = {
  id: number
  adm_user_id: number
  title: string
  body: string
  type: AnnouncementType
  status: AnnouncementStatus
  pinned: number
  published_at: string | null
  expired_at: string | null
  created_at: string
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
  const list = (payload.list ?? []) as Announcement[]
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

export async function createAnnouncement(data: AnnouncementFormData): Promise<{ id: number }> {
  const response = await client.post('/announcement/create', data as unknown as Record<string, unknown>)
  return requireApiPayload(response.data, '/announcement/create')
}

export async function updateAnnouncement(
  id: number,
  data: Partial<AnnouncementFormData>,
): Promise<{ id: number }> {
  const response = await client.put('/announcement/update', { id, ...data } as unknown as Record<string, unknown>)
  return requireApiPayload(response.data, '/announcement/update')
}

export async function deleteAnnouncement(id: number): Promise<{ id: number }> {
  const response = await client.post('/announcement/delete', { id })
  return requireApiPayload(response.data, '/announcement/delete')
}

export async function publishAnnouncement(id: number): Promise<{ id: number }> {
  const response = await client.post('/announcement/publish', { id })
  return requireApiPayload(response.data, '/announcement/publish')
}

export async function unpublishAnnouncement(id: number): Promise<{ id: number }> {
  const response = await client.post('/announcement/unpublish', { id })
  return requireApiPayload(response.data, '/announcement/unpublish')
}
