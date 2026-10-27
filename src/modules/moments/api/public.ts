import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'
import { toApiInstantIso } from '@/lib/apiInstant'

type ApiErrorLike = {
  code?: number | string
  msg?: string
  message?: string
}

export interface MomentStats {
  like_count: number
  comment_count: number
}

export interface MomentAcl {
  allow_uids: EntityId[]
  deny_uids: EntityId[]
}

export interface MomentReport {
  id: EntityId
  post_id: EntityId
  reporter_uid: EntityId
  reason: string
  description: string
  status: number
  handled_by: EntityId | ''
  /** 规范 ISO（毫秒 adapter 产物，R08-AD：/moment/report/* 出站 _at 键 = epoch 毫秒）；缺失/非法 → null。 */
  handled_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface MomentItem {
  id: EntityId
  author_uid: EntityId
  content: string
  media: Array<Record<string, unknown>>
  visibility: number
  allow_comment: boolean
  stats: MomentStats
  status: number
  /** 规范 ISO（毫秒 adapter 产物）；缺失 / 非法 → null（展示「-」）。 */
  created_at: string | null
  updated_at: string | null
  acl?: MomentAcl
  reports?: MomentReport[]
}

export interface MomentListParams {
  page?: number
  size?: number
  keyword?: string
  uid?: string
  status?: number
}

export interface MomentReportListParams {
  page?: number
  size?: number
  status?: number
}

export type MomentReportBatchResolveMode = 'batch' | 'fallback'

export interface MomentReportBatchResolveSummary {
  mode: MomentReportBatchResolveMode
  total: number
  successCount: number
  failedCount: number
  failedIds: EntityId[]
}

const BATCH_RESOLVE_ENDPOINT = '/moment/report/batch_resolve'

function normalizeReportIds(reportIds: EntityId[]): EntityId[] {
  const seen = new Set<string>()
  const normalized: EntityId[] = []

  for (const rawId of reportIds) {
    const candidate = typeof rawId === 'string' ? rawId.trim() : rawId
    if (candidate === '') continue
    const key = String(candidate)
    if (key.length === 0 || seen.has(key)) continue
    seen.add(key)
    normalized.push(candidate)
  }

  return normalized
}

function toErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as ApiErrorLike
  const parsed = Number(record.code)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as ApiErrorLike
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

function isBatchResolveEndpointUnavailable(error: unknown): boolean {
  const errorCode = toErrorCode(error)
  if (errorCode === 404 || errorCode === 405 || errorCode === 501) {
    return true
  }

  const message = toErrorMessage(error).toLowerCase()
  return message.includes('not found') ||
    message.includes('404') ||
    message.includes('method not allowed') ||
    message.includes('endpoint unavailable')
}

function toFailedIds(raw: unknown): EntityId[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => coerceEntityId(item))
    .filter((item) => item !== '')
}

function parseBatchSummaryPayload(
  payload: unknown,
  total: number
): Pick<MomentReportBatchResolveSummary, 'successCount' | 'failedCount' | 'failedIds'> {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {}

  const failedIds = toFailedIds(record.failed_ids ?? record.failedIds)

  const rawSuccessCount = Number(record.success_count ?? record.successCount)
  const rawFailedCount = Number(record.failed_count ?? record.failedCount)

  const hasSuccessCount = Number.isFinite(rawSuccessCount)
  const hasFailedCount = Number.isFinite(rawFailedCount)

  let successCount = total
  let failedCount = 0

  if (hasSuccessCount) {
    successCount = Math.max(0, Math.min(total, Math.floor(rawSuccessCount)))
  }

  if (hasFailedCount) {
    failedCount = Math.max(0, Math.min(total, Math.floor(rawFailedCount)))
  } else if (!hasSuccessCount && failedIds.length > 0) {
    failedCount = Math.max(0, Math.min(total, failedIds.length))
    successCount = Math.max(0, total - failedCount)
  } else if (hasSuccessCount) {
    failedCount = Math.max(0, total - successCount)
  }

  if (successCount + failedCount > total) {
    failedCount = Math.max(0, total - successCount)
  }

  return {
    successCount,
    failedCount,
    failedIds,
  }
}

function asMomentStats(raw: unknown): MomentStats {
  if (typeof raw !== 'object' || raw === null) {
    return { like_count: 0, comment_count: 0 }
  }
  const stats = raw as Record<string, unknown>
  return {
    like_count: Number(stats.like_count ?? 0),
    comment_count: Number(stats.comment_count ?? 0),
  }
}

function normalizeMoment(raw: unknown): MomentItem {
  const item = (typeof raw === 'object' && raw !== null
    ? raw
    : {}) as Record<string, unknown>

  return {
    id: item.id as EntityId,
    author_uid: item.author_uid as EntityId,
    content: String(item.content ?? ''),
    media: Array.isArray(item.media) ? (item.media as Array<Record<string, unknown>>) : [],
    visibility: Number(item.visibility ?? 1),
    allow_comment: Boolean(item.allow_comment),
    stats: asMomentStats(item.stats),
    status: Number(item.status ?? 1),
    // /moment/* 出站 _at 键经 elib_response convert_at_timestamps = epoch 毫秒
    // （BE moment_handler.erl 全端点走 elib_response:success）。R08-AD.1：
    // 显式毫秒 adapter → 规范 ISO；非法 / 缺失 → null（展示侧「-」），不裸透传。
    created_at: toApiInstantIso(item.created_at, 'milliseconds'),
    updated_at: toApiInstantIso(item.updated_at, 'milliseconds'),
    acl: (item.acl as MomentAcl | undefined) ?? undefined,
    reports: Array.isArray(item.reports)
      ? (item.reports as Array<unknown>).map((report) => normalizeMomentReport(report))
      : undefined,
  }
}

/**
 * R08-AD：动态举报行同走毫秒 adapter（adm_moment_handler report_list → elib_response:success 链）。
 * W9：id / post_id(?? moment_id) / handled_by 与 ops_governance reports.ts 统一为
 * coerceEntityId 口径（数字 TSID 收敛为字符串，缺失/非法 → ''，不做精度通道转换）；
 * 时间字段仍走毫秒 adapter。
 */
function normalizeMomentReport(raw: unknown): MomentReport {
  const item = (typeof raw === 'object' && raw !== null
    ? raw
    : {}) as Record<string, unknown>

  return {
    id: coerceEntityId(item.id),
    post_id: coerceEntityId(item.post_id ?? item.moment_id),
    reporter_uid: item.reporter_uid as EntityId,
    reason: String(item.reason ?? ''),
    description: String(item.description ?? ''),
    status: Number(item.status ?? 0),
    handled_by: coerceEntityId(item.handled_by),
    handled_at: toApiInstantIso(item.handled_at, 'milliseconds'),
    created_at: toApiInstantIso(item.created_at, 'milliseconds'),
    updated_at: toApiInstantIso(item.updated_at, 'milliseconds'),
  }
}

export async function getMomentList(
  params: MomentListParams = { page: 1, size: 10, status: -2 }
): Promise<ApiResponse<PaginatedResponse<Record<string, unknown>>>> {
  const response = await client.get('/moment/list', { params })
  return response.data
}

export async function getMomentListPayload(
  params: MomentListParams = { page: 1, size: 10, status: -2 }
): Promise<PaginatedResponse<MomentItem>> {
  const payload = requireApiPayload(await getMomentList(params), '/moment/list')
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeMoment(item))
    : []
  return { ...payload, items }
}

export async function getMomentDetail(
  momentId: EntityId
): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await client.get(`/moment/detail/${momentId}`)
  return response.data
}

export async function getMomentDetailPayload(momentId: EntityId): Promise<MomentItem> {
  const payload = requireApiPayload(await getMomentDetail(momentId), '/moment/detail/:id')
  return normalizeMoment(payload)
}

export async function deleteMoment(
  momentId: EntityId,
  reason = ''
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/moment/delete', {
    moment_id: momentId,
    reason,
  })
  return response.data
}

export async function getMomentReportList(
  params: MomentReportListParams = { page: 1, size: 10, status: -1 }
): Promise<ApiResponse<PaginatedResponse<MomentReport>>> {
  const response = await client.get('/moment/report/list', { params })
  return response.data
}

export async function getMomentReportListPayload(
  params: MomentReportListParams = { page: 1, size: 10, status: -1 }
): Promise<PaginatedResponse<MomentReport>> {
  const payload = await requireApiPayload(await getMomentReportList(params), '/moment/report/list')
  return {
    ...payload,
    items: Array.isArray(payload.items)
      ? payload.items.map((item) => normalizeMomentReport(item))
      : [],
  }
}

export async function resolveMomentReport(
  reportId: EntityId,
  result: 1 | 2,
  note = ''
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/moment/report/resolve', {
    report_id: reportId,
    result,
    note,
  })
  return response.data
}

export async function resolveMomentReportBatchWithFallback(
  reportIds: EntityId[],
  result: 1 | 2,
  note = ''
): Promise<MomentReportBatchResolveSummary> {
  const normalizedReportIds = normalizeReportIds(reportIds)
  const total = normalizedReportIds.length

  if (total === 0) {
    return {
      mode: 'batch',
      total: 0,
      successCount: 0,
      failedCount: 0,
      failedIds: [],
    }
  }

  try {
    const response = await client.post(BATCH_RESOLVE_ENDPOINT, {
      report_ids: normalizedReportIds,
      result,
      note,
    })

    const payload = (response.data as ApiResponse<Record<string, unknown>>).payload
    const parsedSummary = parseBatchSummaryPayload(payload, total)

    return {
      mode: 'batch',
      total,
      successCount: parsedSummary.successCount,
      failedCount: parsedSummary.failedCount,
      failedIds: parsedSummary.failedIds,
    }
  } catch (error) {
    if (!isBatchResolveEndpointUnavailable(error)) {
      throw error
    }

    const results = await Promise.allSettled(
      normalizedReportIds.map((reportId) => resolveMomentReport(reportId, result, note))
    )

    const failedIds = results
      .map((item, index) => (item.status === 'rejected' ? normalizedReportIds[index] : null))
      .filter((item): item is EntityId => item !== null)

    const failedCount = failedIds.length
    const successCount = total - failedCount

    return {
      mode: 'fallback',
      total,
      successCount,
      failedCount,
      failedIds,
    }
  }
}
