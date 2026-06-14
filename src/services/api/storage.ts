import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

type StorageStats = {
  total_files: number
  total_size: number
  image_count: number
  video_count: number
  document_count: number
  other_count: number
  today_uploads: number
  today_size: number
}

export type StorageItem = {
  id: EntityId
  md5: string
  mime_type: string
  path: string
  url: string
  size: number
  referer_time: number
  status: number
  created_at: string
}

export async function getStorageStats(): Promise<StorageStats> {
  const response = await client.get('/storage/stats')
  return requireApiPayload<StorageStats>(response.data, '/storage/stats')
}

export async function getStorageList(params: {
  page?: number
  size?: number
  mime_type?: string
  keyword?: string
}): Promise<PaginatedResponse<StorageItem>> {
  const response = await client.get('/storage/index', { params })
  const payload = requireApiPayload<Record<string, unknown>>(response.data, '/storage/index')
  const list = (payload.items ?? payload.list ?? []) as StorageItem[]
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

export async function disableAttachment(id: string): Promise<void> {
  requireApiPayload((await client.post('/storage/disable', { id })).data, '/storage/disable')
}

export async function enableAttachment(id: string): Promise<void> {
  requireApiPayload((await client.post('/storage/enable', { id })).data, '/storage/enable')
}

export async function deleteAttachment(id: string): Promise<void> {
  requireApiPayload((await client.post('/storage/delete', { id })).data, '/storage/delete')
}

export async function getDownloadUrl(id: string): Promise<{ url: string }> {
  return requireApiPayload<{ url: string }>(
    (await client.get('/storage/download', { params: { id } })).data,
    '/storage/download'
  )
}

type OrphanStats = { count: number; total_size: number }

export async function getOrphanStats(ageDays = 30): Promise<OrphanStats> {
  return requireApiPayload<OrphanStats>(
    (await client.get('/storage/orphan', { params: { age_days: ageDays } })).data,
    '/storage/orphan'
  )
}

type CleanupResult = { cleaned: number; errors: number }

export async function cleanupOrphans(ageDays = 30): Promise<CleanupResult> {
  return requireApiPayload<CleanupResult>(
    (await client.post('/storage/orphan/cleanup', { age_days: ageDays })).data,
    '/storage/orphan/cleanup'
  )
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
