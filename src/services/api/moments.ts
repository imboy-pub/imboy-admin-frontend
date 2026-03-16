// Deprecated compatibility implementation.
// New admin callers should prefer '@/modules/moments/api'; keep this file
// until every legacy page implementation has moved behind the module boundary.
import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

type IdLike = string | number

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
  allow_uids: IdLike[]
  deny_uids: IdLike[]
}

export interface MomentReport {
  id: IdLike
  post_id: IdLike
  reporter_uid: IdLike
  reason: string
  description: string
  status: number
  handled_by: IdLike | ''
  handled_at: string | null
  created_at: string
  updated_at: string
}

export interface MomentItem {
  id: IdLike
  author_uid: IdLike
  content: string
  media: Array<Record<string, unknown>>
  visibility: number
  allow_comment: boolean
  stats: MomentStats
  status: number
  created_at: string
  updated_at: string
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
  failedIds: IdLike[]
}

const BATCH_RESOLVE_ENDPOINT = '/moment/report/batch_resolve'

function normalizeReportIds(reportIds: IdLike[]): IdLike[] {
  const seen = new Set<string>()
  const normalized: IdLike[] = []

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

function toFailedIds(raw: unknown): IdLike[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => (typeof item === 'string' ? item.trim() : item))
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
    id: item.id as IdLike,
    author_uid: item.author_uid as IdLike,
    content: String(item.content ?? ''),
    media: Array.isArray(item.media) ? (item.media as Array<Record<string, unknown>>) : [],
    visibility: Number(item.visibility ?? 1),
    allow_comment: Boolean(item.allow_comment),
    stats: asMomentStats(item.stats),
    status: Number(item.status ?? 1),
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
    acl: (item.acl as MomentAcl | undefined) ?? undefined,
    reports: Array.isArray(item.reports) ? (item.reports as MomentReport[]) : undefined,
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

export async function getMomentDetail(momentId: IdLike): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await client.get(`/moment/detail/${momentId}`)
  return response.data
}

export async function getMomentDetailPayload(momentId: IdLike): Promise<MomentItem> {
  const payload = requireApiPayload(await getMomentDetail(momentId), '/moment/detail/:id')
  return normalizeMoment(payload)
}

export async function deleteMoment(momentId: IdLike, reason = ''): Promise<ApiResponse<Record<string, never>>> {
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
  return requireApiPayload(await getMomentReportList(params), '/moment/report/list')
}

export async function resolveMomentReport(
  reportId: IdLike,
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
  reportIds: IdLike[],
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
      .filter((item): item is IdLike => item !== null)

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
