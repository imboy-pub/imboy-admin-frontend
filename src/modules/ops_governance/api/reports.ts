import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import {
  getMomentReportListPayload,
  resolveMomentReport,
  resolveMomentReportBatchWithFallback,
  type MomentReport,
  type MomentReportBatchResolveSummary,
} from '@/modules/moments/api'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'
import { toApiInstantIso } from '@/lib/apiInstant'

type ApiErrorLike = {
  code?: number | string
  msg?: string
  message?: string
}

export type ReportTargetType = 'moment' | 'group' | 'channel' | 'user' | 'message'
export type NonMomentReportTargetType = Exclude<ReportTargetType, 'moment'>

export interface ReportEvidence {
  e2ee?: boolean
  e2ee_consent?: boolean
  content_state?: string
  content_excerpt?: string
  content_hash?: string
  server_content_hash?: string
  server_msg_id?: string
  client_msg_id?: string
  msg_type?: string
  sent_at?: number
  [key: string]: unknown
}

export interface ReportTicket {
  id: EntityId
  target_type: ReportTargetType
  target_id: EntityId
  target_sub_type: '' | 'c2c' | 'c2g' | 'channel'
  target_scope_id: EntityId
  target_author_id: EntityId
  reporter_uid: EntityId
  reason: string
  description: string
  evidence: ReportEvidence | null
  status: number
  handled_by: EntityId | ''
  /** 规范 ISO（毫秒 adapter 产物，R08-AD：举报域出站 _at 键 = epoch 毫秒）；缺失/非法 → null。 */
  handled_at: string | null
  created_at: string | null
  updated_at: string | null
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
  failedIds: EntityId[]
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
  // R-01: 消息举报只有统一 generic 端点（target_type=message），
  // fallback 复用同一路径（generic 已支持，fallback 永不实际触发）。
  message: {
    list: '/report/list',
    resolve: '/report/resolve',
    batchResolve: '/report/batch_resolve',
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

function toFailedIds(raw: unknown): EntityId[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => coerceEntityId(item))
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
  if (normalized === 'message' || normalized === 'messages') return 'message'
  return fallback
}

function normalizeSubType(raw: unknown): ReportTicket['target_sub_type'] {
  if (raw === 'c2c' || raw === 'c2g' || raw === 'channel') return raw
  return ''
}

function normalizeEvidence(raw: unknown): ReportEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as ReportEvidence
}

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }
  return ''
}

/**
 * R08-AD：举报域 wire 时间 = epoch 毫秒（BE @3106e6c：adm_report_handler 全端点
 * elib_response:success → convert_at_timestamps → rfc3339_to/1 把 timestamptz
 * 归一为毫秒整数）。显式毫秒 adapter → 规范 ISO；缺失/非法 → null（不回填 now）。
 */
function toReportInstantIso(raw: unknown): string | null {
  return toApiInstantIso(raw, 'milliseconds')
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
  const targetSubType = normalizeSubType(item.target_sub_type)
  const targetScopeId = pickFirst(item, ['target_scope_id', 'scope_id'])
  const targetAuthorId = pickFirst(item, ['target_author_id', 'author_id'])
  const reporterUid = pickFirst(item, ['reporter_uid', 'uid', 'from_uid', 'report_uid'])
  const reason = pickFirst(item, ['reason', 'reason_text', 'reason_label', 'category'])
  const description = pickFirst(item, ['description', 'desc', 'detail'])
  const evidence = normalizeEvidence(item.evidence)
  const status = Number(pickFirst(item, ['status', 'result', 'state']))
  const handledBy = pickFirst(item, ['handled_by', 'operator_uid', 'admin_uid'])
  const handledAt = pickFirst(item, ['handled_at', 'resolved_at'])
  const createdAt = pickFirst(item, ['created_at', 'report_at'])
  const updatedAt = pickFirst(item, ['updated_at', 'modified_at'])

  return {
    id: coerceEntityId(id),
    target_type: targetType,
    target_id: coerceEntityId(targetId),
    target_sub_type: targetSubType,
    target_scope_id: coerceEntityId(targetScopeId),
    target_author_id: coerceEntityId(targetAuthorId),
    reporter_uid: coerceEntityId(reporterUid),
    reason: String(reason ?? ''),
    description: String(description ?? ''),
    evidence,
    status: Number.isFinite(status) ? status : 0,
    handled_by: coerceEntityId(handledBy),
    handled_at: toReportInstantIso(handledAt),
    created_at: toReportInstantIso(createdAt),
    updated_at: toReportInstantIso(updatedAt),
  }
}

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

function normalizeMomentReport(report: MomentReport): ReportTicket {
  return {
    id: report.id,
    target_type: 'moment',
    target_id: report.post_id,
    target_sub_type: '',
    target_scope_id: '',
    target_author_id: '',
    reporter_uid: report.reporter_uid,
    reason: report.reason || '',
    description: report.description || '',
    evidence: null,
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
  reportId: EntityId,
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
  const payload = requireApiPayload(
    response.data as ApiResponse<Record<string, unknown>>,
    endpoint
  )
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
  reportIds: EntityId[],
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

/**
 * R-01: 举报工单详情——仅返回该工单自身绑定的结构化证据（含消息举报
 * 的 scope/author/evidence），不提供按消息 ID 的任意浏览入口。
 */
export async function getReportDetail(
  reportId: EntityId
): Promise<ReportTicket> {
  const response = await client.get('/report/detail', { params: { report_id: reportId } })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/report/detail'
  )
  return normalizeReport(payload, 'message')
}

// ─────────────────────────────────────────────────────────────
// R-02: 处置动作（case = report_ticket 行；audit = moderation_action 表）
// ─────────────────────────────────────────────────────────────

export type ReportActionType =
  | 'warning'
  | 'group_mute'
  | 'group_kick'
  | 'reject'
  | 'content_removal'
  | 'account_restrict'

export interface ReportActionRow {
  id: EntityId
  case_id: EntityId
  action: ReportActionType
  target_type: string
  target_id: EntityId
  target_uid: EntityId
  scope: Record<string, unknown>
  reason: string
  actor_id: EntityId
  status: 'executed' | 'failed' | 'reversed' | 'expired'
  result: Record<string, unknown>
  fail_reason: string
  /** 规范 ISO（毫秒 adapter 产物，R08-AD：/report_action/* 同 elib_response:success 毫秒链）；缺失/非法 → null。 */
  start_at: string | null
  end_at: string | null
  reversed_at: string | null
  reversed_by: EntityId
  reverse_reason: string
  created_at: string | null
  updated_at: string | null
}

export interface ReportActionRequest {
  case_id: EntityId
  action: ReportActionType
  target_uid: EntityId
  reason: string
  gid?: EntityId
  duration_minutes?: number
  target_type?: string
  target_id?: EntityId
}

/**
 * R08-AD：处置动作行时间字段经同一毫秒 adapter（wire 同举报域毫秒链）。
 * W9：字段级投影替代 `{...item} as unknown as ReportActionRow` 双重断言，
 * 与 normalizeReport 同口径——标识符字段 coerceEntityId（数字 TSID 不经
 * Number() 精度通道），对象字段收紧形状，其余按声明类型显式收敛。
 */
function normalizeReportAction(raw: unknown): ReportActionRow {
  const item = typeof raw === 'object' && raw !== null
    ? raw as Record<string, unknown> : {}
  const scope = typeof item.scope === 'object' && item.scope !== null && !Array.isArray(item.scope)
    ? item.scope as Record<string, unknown> : {}
  const result = typeof item.result === 'object' && item.result !== null && !Array.isArray(item.result)
    ? item.result as Record<string, unknown> : {}

  return {
    id: coerceEntityId(item.id),
    case_id: coerceEntityId(item.case_id),
    action: (typeof item.action === 'string' ? item.action : '') as ReportActionType,
    target_type: typeof item.target_type === 'string' ? item.target_type : '',
    target_id: coerceEntityId(item.target_id),
    target_uid: coerceEntityId(item.target_uid),
    scope,
    reason: typeof item.reason === 'string' ? item.reason : '',
    actor_id: coerceEntityId(item.actor_id),
    status: (typeof item.status === 'string' ? item.status : '') as ReportActionRow['status'],
    result,
    fail_reason: typeof item.fail_reason === 'string' ? item.fail_reason : '',
    start_at: toReportInstantIso(item.start_at),
    end_at: toReportInstantIso(item.end_at),
    reversed_at: toReportInstantIso(item.reversed_at),
    reversed_by: coerceEntityId(item.reversed_by),
    reverse_reason: typeof item.reverse_reason === 'string' ? item.reverse_reason : '',
    created_at: toReportInstantIso(item.created_at),
    updated_at: toReportInstantIso(item.updated_at),
  }
}

/** 执行处置动作；HTTP 200 且 code!=0（业务拒绝，如重复/unsupported）时由调用方读取 msg。 */
export async function executeReportAction(
  request: ReportActionRequest
): Promise<ApiResponse<ReportActionRow>> {
  const response = await client.post('/report_action/execute', request)
  const data = response.data as ApiResponse<ReportActionRow>
  if (data && data.payload !== undefined && data.payload !== null) {
    data.payload = normalizeReportAction(data.payload)
  }
  return data
}

/** 撤销动作：仅 executed 态可撤销；group_mute 撤销同步解除禁言。 */
export async function reverseReportAction(
  actionId: EntityId,
  reason: string
): Promise<ApiResponse<ReportActionRow>> {
  const response = await client.post('/report_action/reverse', {
    action_id: actionId,
    reason,
  })
  const data = response.data as ApiResponse<ReportActionRow>
  if (data && data.payload !== undefined && data.payload !== null) {
    data.payload = normalizeReportAction(data.payload)
  }
  return data
}

/** 某 case 的动作历史（按 id 升序）。 */
export async function getReportActions(
  caseId: EntityId
): Promise<ReportActionRow[]> {
  const response = await client.get('/report_action/list', {
    params: { case_id: caseId },
  })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/report_action/list'
  )
  const rows = (payload as { data?: unknown }).data
  return Array.isArray(rows) ? rows.map((row) => normalizeReportAction(row)) : []
}
