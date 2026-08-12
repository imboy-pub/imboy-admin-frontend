import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'

type AdminOperationAction =
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
  target_type: string
  /** 操作详情（后端 jsonb），含 before/after 前后值与 reason */
  detail?: Record<string, unknown>
  ip: string
  created_at: string
}

interface AdminOperationLogParams {
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

  // jsonb 字段可能以对象或 JSON 字符串两种形态到达，统一解析
  const parseDetail = (v: unknown): Record<string, unknown> | undefined => {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      return v as Record<string, unknown>
    }
    if (typeof v === 'string' && v.startsWith('{')) {
      try {
        const parsed = JSON.parse(v) as unknown
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as Record<string, unknown>
        }
      } catch {
        return undefined
      }
    }
    return undefined
  }

  const normalizeLog = (item: unknown): AdminOperationLog => {
    const r = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    return {
      id: String(r.id ?? ''),
      adm_user_id: String(r.adm_user_id ?? ''),
      action: String(r.action ?? '-'),
      target_id: String(r.target_id ?? r.target ?? ''),
      target_type: String(r.target_type ?? ''),
      detail: parseDetail(r.detail),
      ip: String(r.ip ?? '-'),
      created_at: String(r.created_at ?? ''),
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
