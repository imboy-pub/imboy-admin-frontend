import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { PaginatedResponse } from '@/types/api'

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
  id: number | string
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
  const list = (payload.list ?? []) as StorageItem[]
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

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
