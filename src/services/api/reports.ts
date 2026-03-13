import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'
import {
  getMomentReportListPayload,
  resolveMomentReport,
  resolveMomentReportBatchWithFallback,
  type MomentReport,
  type MomentReportBatchResolveSummary,
} from './moments'

type IdLike = string | number

type ApiErrorLike = {
  code?: number | string
  msg?: string
  message?: string
}

export type ReportTargetType = 'moment' | 'group' | 'channel' | 'user'
export type NonMomentReportTargetType = Exclude<ReportTargetType, 'moment'>

export interface ReportTicket {
  id: IdLike
  target_type: ReportTargetType
  target_id: IdLike
  reporter_uid: IdLike
  reason: string
  description: string
  status: number
  handled_by: IdLike | ''
  handled_at: string | null
  created_at: string
  updated_at: string
}

export interface ReportListParams {
  page?: number
  size?: number
  status?: number
  target_id?: string
  reporter_uid?: string
  keyword?: string
}

export type ReportBatchResolveMode = 'batch' | 'target-batch' | 'fallback'

export interface ReportBatchResolveSummary {
  mode: ReportBatchResolveMode
  total: number
  successCount: number
  failedCount: number
  failedIds: IdLike[]
}

type TargetEndpointMap = Record<NonMomentReportTargetType, {
  list: string
  resolve: string
  batchResolve: string
}>

const TARGET_ENDPOINTS: TargetEndpointMap = {
  group: {
    list: '/group/report/list',
    resolve: '/group/report/resolve',
    batchResolve: '/group/report/batch_resolve',
  },
  channel: {
    list: '/channel/report/list',
    resolve: '/channel/report/resolve',
    batchResolve: '/channel/report/batch_resolve',
  },
  user: {
    list: '/user/report/list',
    resolve: '/user/report/resolve',
    batchResolve: '/user/report/batch_resolve',
  },
}

const GENERIC_REPORT_ENDPOINTS = {
  list: '/report/list',
  resolve: '/report/resolve',
  batchResolve: '/report/batch_resolve',
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

export function isReportEndpointUnavailable(error: unknown): boolean {
  const errorCode = toErrorCode(error)
  if (errorCode === 404 || errorCode === 405 || errorCode === 501) {
    return true
  }

  const message = toErrorMessage(error).toLowerCase()
  return message.includes('not found') ||
    message.includes('404') ||
    message.includes('method not allowed') ||
    message.includes('endpoint unavailable') ||
    message.includes('invalid url')
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
): Pick<ReportBatchResolveSummary, 'successCount' | 'failedCount' | 'failedIds'> {
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

function normalizeTargetType(raw: unknown, fallback: ReportTargetType): ReportTargetType {
  if (typeof raw !== 'string') return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'moment' || normalized === 'moments') return 'moment'
  if (normalized === 'group' || normalized === 'groups') return 'group'
  if (normalized === 'channel' || normalized === 'channels') return 'channel'
  if (normalized === 'user' || normalized === 'users') return 'user'
  return fallback
}

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }
  return ''
}

function normalizeReport(raw: unknown, fallbackType: ReportTargetType): ReportTicket {
  const item = typeof raw === 'object' && raw !== null
    ? raw as Record<string, unknown>
    : {}

  const id = pickFirst(item, ['id', 'report_id'])
  const targetType = normalizeTargetType(
    pickFirst(item, ['target_type', 'object_type', 'report_type']),
    fallbackType
  )
  const targetId = pickFirst(item, ['target_id', 'post_id', 'group_id', 'channel_id', 'user_id', 'reported_id', 'object_id'])
  const reporterUid = pickFirst(item, ['reporter_uid', 'uid', 'from_uid', 'report_uid'])
  const reason = pickFirst(item, ['reason', 'reason_text', 'reason_label', 'category'])
  const description = pickFirst(item, ['description', 'desc', 'evidence', 'detail'])
  const status = Number(pickFirst(item, ['status', 'result', 'state']))
  const handledBy = pickFirst(item, ['handled_by', 'operator_uid', 'admin_uid'])
  const handledAt = pickFirst(item, ['handled_at', 'resolved_at'])
  const createdAt = pickFirst(item, ['created_at', 'report_at'])
  const updatedAt = pickFirst(item, ['updated_at', 'modified_at'])

  return {
    id: typeof id === 'number' || typeof id === 'string' ? id : '',
    target_type: targetType,
    target_id: typeof targetId === 'number' || typeof targetId === 'string' ? targetId : '',
    reporter_uid: typeof reporterUid === 'number' || typeof reporterUid === 'string' ? reporterUid : '',
    reason: String(reason ?? ''),
    description: String(description ?? ''),
    status: Number.isFinite(status) ? status : 0,
    handled_by: typeof handledBy === 'number' || typeof handledBy === 'string' ? handledBy : '',
    handled_at: typeof handledAt === 'string' && handledAt.length > 0 ? handledAt : null,
    created_at: String(createdAt ?? ''),
    updated_at: String(updatedAt ?? ''),
  }
}

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

function normalizeMomentReport(report: MomentReport): ReportTicket {
  return {
    id: report.id,
    target_type: 'moment',
    target_id: report.post_id,
    reporter_uid: report.reporter_uid,
    reason: report.reason || '',
    description: report.description || '',
    status: report.status,
    handled_by: report.handled_by,
    handled_at: report.handled_at,
    created_at: report.created_at,
    updated_at: report.updated_at,
  }
}

function buildReportListParams(targetType: ReportTargetType, params: ReportListParams): Record<string, unknown> {
  const requestParams: Record<string, unknown> = {
    page: params.page ?? 1,
    size: params.size ?? 10,
    status: params.status ?? -1,
  }

  if (targetType !== 'moment') {
    requestParams.target_type = targetType
  }

  const targetId = typeof params.target_id === 'string' ? params.target_id.trim() : ''
  if (targetId.length > 0) {
    requestParams.target_id = targetId
  }

  const reporterUid = typeof params.reporter_uid === 'string' ? params.reporter_uid.trim() : ''
  if (reporterUid.length > 0) {
    requestParams.reporter_uid = reporterUid
  }

  const keyword = typeof params.keyword === 'string' ? params.keyword.trim() : ''
  if (keyword.length > 0) {
    requestParams.keyword = keyword
  }

  return requestParams
}

async function listByEndpoint(
  endpoint: string,
  targetType: ReportTargetType,
  params: Record<string, unknown>,
  context: string
): Promise<PaginatedResponse<ReportTicket>> {
  const response = await client.get(endpoint, { params })
  const payload = requireApiPayload<PaginatedResponse<Record<string, unknown>>>(
    response.data as ApiResponse<PaginatedResponse<Record<string, unknown>>>,
    context
  )

  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeReport(item, targetType))
    : []

  return {
    ...payload,
    items,
  }
}

export async function getReportListPayload(
  targetType: ReportTargetType,
  params: ReportListParams = { page: 1, size: 10, status: -1 }
): Promise<PaginatedResponse<ReportTicket>> {
  if (targetType === 'moment') {
    const payload = await getMomentReportListPayload({
      page: params.page ?? 1,
      size: params.size ?? 10,
      status: params.status ?? -1,
    })
    return {
      ...payload,
      items: Array.isArray(payload.items) ? payload.items.map((item) => normalizeMomentReport(item)) : [],
    }
  }

  const requestParams = buildReportListParams(targetType, params)

  try {
    return await listByEndpoint(
      GENERIC_REPORT_ENDPOINTS.list,
      targetType,
      requestParams,
      '/report/list'
    )
  } catch (error) {
    if (!isReportEndpointUnavailable(error)) {
      throw error
    }
  }

  const fallbackEndpoint = TARGET_ENDPOINTS[targetType].list
  return listByEndpoint(fallbackEndpoint, targetType, requestParams, `${fallbackEndpoint}`)
}

async function resolveByEndpoint(
  endpoint: string,
  body: Record<string, unknown>
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post(endpoint, body)
  return response.data as ApiResponse<Record<string, never>>
}

export async function resolveReport(
  targetType: ReportTargetType,
  reportId: IdLike,
  result: 1 | 2,
  note = ''
): Promise<ApiResponse<Record<string, never>>> {
  if (targetType === 'moment') {
    return resolveMomentReport(reportId, result, note)
  }

  const requestBody = {
    report_id: reportId,
    result,
    note,
    target_type: targetType,
  }

  try {
    return await resolveByEndpoint(GENERIC_REPORT_ENDPOINTS.resolve, requestBody)
  } catch (error) {
    if (!isReportEndpointUnavailable(error)) {
      throw error
    }
  }

  return resolveByEndpoint(TARGET_ENDPOINTS[targetType].resolve, {
    report_id: reportId,
    result,
    note,
  })
}

async function resolveBatchByEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
  total: number
): Promise<Pick<ReportBatchResolveSummary, 'successCount' | 'failedCount' | 'failedIds'>> {
  const response = await client.post(endpoint, body)
  const payload = (response.data as ApiResponse<Record<string, unknown>>).payload
  return parseBatchSummaryPayload(payload, total)
}

function normalizeMomentBatchSummary(summary: MomentReportBatchResolveSummary): ReportBatchResolveSummary {
  return {
    mode: summary.mode,
    total: summary.total,
    successCount: summary.successCount,
    failedCount: summary.failedCount,
    failedIds: summary.failedIds,
  }
}

export async function resolveReportBatchWithFallback(
  targetType: ReportTargetType,
  reportIds: IdLike[],
  result: 1 | 2,
  note = ''
): Promise<ReportBatchResolveSummary> {
  if (targetType === 'moment') {
    const summary = await resolveMomentReportBatchWithFallback(reportIds, result, note)
    return normalizeMomentBatchSummary(summary)
  }

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
    const parsedSummary = await resolveBatchByEndpoint(
      GENERIC_REPORT_ENDPOINTS.batchResolve,
      {
        report_ids: normalizedReportIds,
        result,
        note,
        target_type: targetType,
      },
      total
    )

    return {
      mode: 'batch',
      total,
      successCount: parsedSummary.successCount,
      failedCount: parsedSummary.failedCount,
      failedIds: parsedSummary.failedIds,
    }
  } catch (error) {
    if (!isReportEndpointUnavailable(error)) {
      throw error
    }
  }

  try {
    const parsedSummary = await resolveBatchByEndpoint(
      TARGET_ENDPOINTS[targetType].batchResolve,
      {
        report_ids: normalizedReportIds,
        result,
        note,
      },
      total
    )

    return {
      mode: 'target-batch',
      total,
      successCount: parsedSummary.successCount,
      failedCount: parsedSummary.failedCount,
      failedIds: parsedSummary.failedIds,
    }
  } catch (error) {
    if (!isReportEndpointUnavailable(error)) {
      throw error
    }
  }

  const results = await Promise.allSettled(
    normalizedReportIds.map((reportId) => resolveReport(targetType, reportId, result, note))
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
