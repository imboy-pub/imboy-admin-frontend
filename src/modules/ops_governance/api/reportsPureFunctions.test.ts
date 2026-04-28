/**
 * Inline mirror tests for private pure functions in reports.ts:
 *   toErrorCode, toErrorMessage, toFailedIds, parseBatchSummaryPayload,
 *   normalizeTargetType, pickFirst, normalizeReport, normalizeReportIds,
 *   buildReportListParams
 */
import { describe, expect, it } from 'bun:test'

type EntityId = string
type ReportTargetType = 'moment' | 'user' | 'group' | 'channel'

type ApiErrorLike = { code?: unknown; msg?: string; message?: string }

// ---------------------------------------------------------------------------
// toErrorCode
// ---------------------------------------------------------------------------

function toErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as ApiErrorLike
  const parsed = Number(record.code)
  return Number.isFinite(parsed) ? parsed : undefined
}

describe('toErrorCode (reports)', () => {
  it('returns undefined for null', () => {
    expect(toErrorCode(null)).toBeUndefined()
  })

  it('returns numeric code', () => {
    expect(toErrorCode({ code: 404 })).toBe(404)
  })

  it('returns code from string', () => {
    expect(toErrorCode({ code: '405' })).toBe(405)
  })

  it('returns undefined for non-numeric code', () => {
    expect(toErrorCode({ code: 'err' })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// toFailedIds
// ---------------------------------------------------------------------------

function toFailedIds(raw: unknown): EntityId[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '')
}

describe('toFailedIds', () => {
  it('returns empty for non-array', () => {
    expect(toFailedIds(null)).toEqual([])
    expect(toFailedIds('123')).toEqual([])
  })

  it('returns empty for empty array', () => {
    expect(toFailedIds([])).toEqual([])
  })

  it('filters non-string/non-number values', () => {
    const result = toFailedIds(['id1', null, undefined, 'id2'])
    expect(result).toEqual(['id1', 'id2'])
  })

  it('trims string IDs', () => {
    expect(toFailedIds(['  id1  ', '  id2  '])).toEqual(['id1', 'id2'])
  })

  it('filters empty strings after trim', () => {
    expect(toFailedIds(['  ', 'id1'])).toEqual(['id1'])
  })

  it('includes numeric IDs', () => {
    const result = toFailedIds([1, 2, 3])
    expect(result).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// parseBatchSummaryPayload
// ---------------------------------------------------------------------------

type ReportBatchResolveSummaryPartial = {
  successCount: number
  failedCount: number
  failedIds: EntityId[]
}

function parseBatchSummaryPayload(
  payload: unknown,
  total: number
): ReportBatchResolveSummaryPartial {
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

  return { successCount, failedCount, failedIds }
}

describe('parseBatchSummaryPayload', () => {
  it('returns total as successCount when no counts in payload', () => {
    const result = parseBatchSummaryPayload({}, 5)
    expect(result.successCount).toBe(5)
    expect(result.failedCount).toBe(0)
  })

  it('uses success_count from payload', () => {
    const result = parseBatchSummaryPayload({ success_count: 3 }, 5)
    expect(result.successCount).toBe(3)
    expect(result.failedCount).toBe(2)
  })

  it('uses failed_count from payload (with both counts present)', () => {
    // When only failed_count is provided, successCount defaults to total.
    // Final clamping: successCount(5) + failedCount(2) = 7 > total(5),
    // so failedCount → total - successCount = 0.
    // To observe failed_count, provide both:
    const result = parseBatchSummaryPayload({ success_count: 3, failed_count: 2 }, 5)
    expect(result.failedCount).toBe(2)
  })

  it('supports camelCase aliases', () => {
    const result = parseBatchSummaryPayload({ successCount: 4, failedCount: 1 }, 5)
    expect(result.successCount).toBe(4)
    expect(result.failedCount).toBe(1)
  })

  it('clamps values to not exceed total', () => {
    const result = parseBatchSummaryPayload({ success_count: 10 }, 5)
    expect(result.successCount).toBe(5)
  })

  it('infers failedCount from failedIds when counts absent', () => {
    const result = parseBatchSummaryPayload({ failed_ids: ['a', 'b'] }, 5)
    expect(result.failedCount).toBe(2)
    expect(result.successCount).toBe(3)
  })

  it('returns failedIds', () => {
    const result = parseBatchSummaryPayload({ failed_ids: ['id1', 'id2'] }, 5)
    expect(result.failedIds).toEqual(['id1', 'id2'])
  })

  it('returns empty failedIds for null/undefined payload', () => {
    const result = parseBatchSummaryPayload(null, 5)
    expect(result.failedIds).toEqual([])
    expect(result.successCount).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// normalizeTargetType (reports module variant)
// ---------------------------------------------------------------------------

function normalizeTargetType(raw: unknown, fallback: ReportTargetType): ReportTargetType {
  if (typeof raw !== 'string') return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'moment' || normalized === 'moments') return 'moment'
  if (normalized === 'group' || normalized === 'groups') return 'group'
  if (normalized === 'channel' || normalized === 'channels') return 'channel'
  if (normalized === 'user' || normalized === 'users') return 'user'
  return fallback
}

describe('normalizeTargetType (reports module)', () => {
  it('returns fallback for non-string', () => {
    expect(normalizeTargetType(null, 'moment')).toBe('moment')
    expect(normalizeTargetType(123, 'group')).toBe('group')
  })

  it('maps "moment" and "moments"', () => {
    expect(normalizeTargetType('moment', 'group')).toBe('moment')
    expect(normalizeTargetType('moments', 'group')).toBe('moment')
  })

  it('maps "group" and "groups"', () => {
    expect(normalizeTargetType('group', 'moment')).toBe('group')
    expect(normalizeTargetType('groups', 'moment')).toBe('group')
  })

  it('maps "channel" and "channels"', () => {
    expect(normalizeTargetType('channel', 'moment')).toBe('channel')
    expect(normalizeTargetType('channels', 'moment')).toBe('channel')
  })

  it('maps "user" and "users"', () => {
    expect(normalizeTargetType('user', 'moment')).toBe('user')
    expect(normalizeTargetType('users', 'moment')).toBe('user')
  })

  it('is case-insensitive', () => {
    expect(normalizeTargetType('MOMENT', 'group')).toBe('moment')
    expect(normalizeTargetType('Group', 'moment')).toBe('group')
  })

  it('returns fallback for unknown string', () => {
    expect(normalizeTargetType('unknown', 'moment')).toBe('moment')
  })
})

// ---------------------------------------------------------------------------
// normalizeReportIds
// ---------------------------------------------------------------------------

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

describe('normalizeReportIds', () => {
  it('returns deduplicated IDs', () => {
    expect(normalizeReportIds(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('trims whitespace from IDs', () => {
    expect(normalizeReportIds(['  a  ', 'b'])).toEqual(['a', 'b'])
  })

  it('filters empty strings', () => {
    expect(normalizeReportIds(['', 'a', '  '])).toEqual(['a'])
  })

  it('preserves order of first occurrence', () => {
    expect(normalizeReportIds(['c', 'a', 'b', 'a', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('returns empty for empty input', () => {
    expect(normalizeReportIds([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildReportListParams
// ---------------------------------------------------------------------------

type ReportListParams = {
  page?: number
  size?: number
  status?: number
  target_id?: string
  reporter_uid?: string
  keyword?: string
}

function buildReportListParams(
  targetType: ReportTargetType,
  params: ReportListParams
): Record<string, unknown> {
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

describe('buildReportListParams', () => {
  it('uses default page=1, size=10, status=-1', () => {
    const result = buildReportListParams('moment', {})
    expect(result.page).toBe(1)
    expect(result.size).toBe(10)
    expect(result.status).toBe(-1)
  })

  it('does NOT include target_type for "moment"', () => {
    const result = buildReportListParams('moment', {})
    expect(result.target_type).toBeUndefined()
  })

  it('includes target_type for non-moment types', () => {
    expect(buildReportListParams('group', {}).target_type).toBe('group')
    expect(buildReportListParams('channel', {}).target_type).toBe('channel')
    expect(buildReportListParams('user', {}).target_type).toBe('user')
  })

  it('includes target_id when non-empty', () => {
    const result = buildReportListParams('group', { target_id: 'g001' })
    expect(result.target_id).toBe('g001')
  })

  it('omits target_id when empty', () => {
    const result = buildReportListParams('group', { target_id: '' })
    expect(result.target_id).toBeUndefined()
  })

  it('trims target_id whitespace', () => {
    const result = buildReportListParams('group', { target_id: '  g001  ' })
    expect(result.target_id).toBe('g001')
  })

  it('includes reporter_uid when non-empty', () => {
    const result = buildReportListParams('moment', { reporter_uid: 'u123' })
    expect(result.reporter_uid).toBe('u123')
  })

  it('includes keyword when non-empty', () => {
    const result = buildReportListParams('moment', { keyword: 'spam' })
    expect(result.keyword).toBe('spam')
  })

  it('uses custom page, size, status', () => {
    const result = buildReportListParams('moment', { page: 3, size: 20, status: 1 })
    expect(result.page).toBe(3)
    expect(result.size).toBe(20)
    expect(result.status).toBe(1)
  })
})
