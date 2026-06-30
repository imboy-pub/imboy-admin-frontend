import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'

export type AdminOperationAction =
  | 'force_logout'
  | 'ban_user'
  | 'unban_user'
  | 'delete_msg'
  | 'delete_group'
  | 'mute_user'
  | 'reset_password'
  | 'assign_role'
  | string

export interface AdminOperationLog {
  id: EntityId
  adm_user_id: EntityId
  action: AdminOperationAction
  target_id: EntityId
  ip: string
  created_at: string
  extra?: Record<string, unknown>
}

export interface AdminOperationLogParams {
  adm_user_id?: EntityId
  action?: AdminOperationAction
  page?: number
  size?: number
}

async function fetchAdminOperationLogs(
  params: AdminOperationLogParams
): Promise<ApiResponse<PaginatedResponse<AdminOperationLog>>> {
  const res = await client.get('/operation_logs', { params })
  return res.data as ApiResponse<PaginatedResponse<AdminOperationLog>>
}

export async function getAdminOperationLogs(
  params: AdminOperationLogParams = { page: 1, size: 20 }
): Promise<PaginatedResponse<AdminOperationLog>> {
  const raw = await fetchAdminOperationLogs(params)
  const payload = requireApiPayload(raw, '/adm/operation_logs')

  const isRecord = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
  const record = isRecord ? (payload as unknown as Record<string, unknown>) : {}

  const rawItems: unknown[] = Array.isArray(record.items)
    ? (record.items as unknown[])
    : Array.isArray(record.list)
      ? (record.list as unknown[])
      : []

  const safeInt = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
  }

  const normalizeLog = (item: unknown): AdminOperationLog => {
    const r = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    return {
      id: String(r.id ?? ''),
      adm_user_id: String(r.adm_user_id ?? ''),
      action: String(r.action ?? '-'),
      target_id: String(r.target_id ?? r.target ?? ''),
      ip: String(r.ip ?? '-'),
      created_at: String(r.created_at ?? ''),
      extra: typeof r.extra === 'object' && r.extra !== null ? (r.extra as Record<string, unknown>) : undefined,
    }
  }

  const items = rawItems.map(normalizeLog)
  const total = safeInt(record.total, items.length)
  const size = safeInt(record.size ?? record.page_size, Math.max(items.length, 1))
  const page = safeInt(record.page ?? record.current_page, 1)
  const total_pages = safeInt(
    record.total_pages,
    Math.max(1, Math.ceil(total / Math.max(size, 1)))
  )

  return { items, page, size, total, total_pages }
}
