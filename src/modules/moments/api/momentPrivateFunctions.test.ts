/**
 * Inline mirror tests for private pure functions in moments/api/public.ts:
 *   normalizeReportIds, toErrorCode, toErrorMessage,
 *   isBatchResolveEndpointUnavailable, toFailedIds,
 *   parseBatchSummaryPayload, asMomentStats, normalizeMoment
 *
 * These functions are not exported, so we mirror their logic here to test the
 * branches independently from the higher-level integration tests in
 * moments_reports.test.ts.
 */
import { describe, expect, it } from 'bun:test'
import type { EntityId } from '@/types/common'

// ---------------------------------------------------------------------------
// Mirrors of private functions (kept in sync with public.ts)
// ---------------------------------------------------------------------------

interface MomentStats {
  like_count: number
  comment_count: number
}

interface MomentAcl {
  allow_uids: EntityId[]
  deny_uids: EntityId[]
}

interface MomentReport {
  id: EntityId
  post_id: EntityId
  reporter_uid: EntityId
  reason: string
  description: string
  status: number
  handled_by: EntityId | ''
  handled_at: string | null
  created_at: string
  updated_at: string
}

interface MomentItem {
  id: EntityId
  author_uid: EntityId
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

type ApiErrorLike = { code?: number | string; msg?: string; message?: string }

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
  if (errorCode === 404 || errorCode === 405 || errorCode === 501) return true
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('method not allowed') ||
    message.includes('endpoint unavailable')
  )
}

function toFailedIds(raw: unknown): EntityId[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '')
}

interface BatchSummarySlice {
  successCount: number
  failedCount: number
  failedIds: EntityId[]
}

function parseBatchSummaryPayload(payload: unknown, total: number): BatchSummarySlice {
  const record =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
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

function asMomentStats(raw: unknown): MomentStats {
  if (typeof raw !== 'object' || raw === null) return { like_count: 0, comment_count: 0 }
  const stats = raw as Record<string, unknown>
  return {
    like_count: Number(stats.like_count ?? 0),
    comment_count: Number(stats.comment_count ?? 0),
  }
}

function normalizeMoment(raw: unknown): MomentItem {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    id: item.id as EntityId,
    author_uid: item.author_uid as EntityId,
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

// ---------------------------------------------------------------------------
// normalizeReportIds
// ---------------------------------------------------------------------------

describe('normalizeReportIds', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeReportIds([])).toEqual([])
  })

  it('deduplicates identical IDs', () => {
    expect(normalizeReportIds(['r1', 'r2', 'r1'])).toEqual(['r1', 'r2'])
  })

  it('trims whitespace from string IDs', () => {
    const result = normalizeReportIds(['  r1  ', 'r2'])
    expect(result[0]).toBe('r1')
    expect(result[1]).toBe('r2')
  })

  it('removes empty string IDs', () => {
    expect(normalizeReportIds(['', 'r1', '  ', 'r2'])).toEqual(['r1', 'r2'])
  })

  it('deduplicates after trimming', () => {
    // ' r1 ' and 'r1' should be treated as the same
    const result = normalizeReportIds([' r1 ', 'r1'])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('r1')
  })

  it('preserves order of first occurrence', () => {
    expect(normalizeReportIds(['c', 'a', 'b', 'a', 'c'])).toEqual(['c', 'a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// toErrorCode
// ---------------------------------------------------------------------------

describe('toErrorCode', () => {
  it('returns undefined for null', () => {
    expect(toErrorCode(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(toErrorCode(undefined)).toBeUndefined()
  })

  it('returns undefined for a plain Error (no code property)', () => {
    expect(toErrorCode(new Error('oops'))).toBeUndefined()
  })

  it('extracts numeric code from object', () => {
    expect(toErrorCode({ code: 404 })).toBe(404)
  })

  it('parses string code as number', () => {
    expect(toErrorCode({ code: '500' })).toBe(500)
  })

  it('returns undefined for non-numeric string code', () => {
    expect(toErrorCode({ code: 'NaN' })).toBeUndefined()
  })

  it('returns undefined for primitive non-object', () => {
    expect(toErrorCode('error')).toBeUndefined()
    expect(toErrorCode(42)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// toErrorMessage
// ---------------------------------------------------------------------------

describe('toErrorMessage', () => {
  it('returns Error.message for Error instances', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns msg from object with msg field', () => {
    expect(toErrorMessage({ code: 404, msg: 'not found' })).toBe('not found')
  })

  it('returns message from object with message field when no msg', () => {
    expect(toErrorMessage({ message: 'endpoint gone' })).toBe('endpoint gone')
  })

  it('returns String(error) for null', () => {
    expect(toErrorMessage(null)).toBe('null')
  })

  it('returns String(error) for primitives', () => {
    expect(toErrorMessage(42)).toBe('42')
    expect(toErrorMessage('plain string')).toBe('plain string')
  })

  it('prefers msg over message', () => {
    expect(toErrorMessage({ msg: 'primary', message: 'secondary' })).toBe('primary')
  })

  it('falls back to message when msg is empty string', () => {
    expect(toErrorMessage({ msg: '', message: 'fallback' })).toBe('fallback')
  })
})

// ---------------------------------------------------------------------------
// isBatchResolveEndpointUnavailable
// ---------------------------------------------------------------------------

describe('isBatchResolveEndpointUnavailable', () => {
  it('returns true for code 404', () => {
    expect(isBatchResolveEndpointUnavailable({ code: 404 })).toBe(true)
  })

  it('returns true for code 405', () => {
    expect(isBatchResolveEndpointUnavailable({ code: 405 })).toBe(true)
  })

  it('returns true for code 501', () => {
    expect(isBatchResolveEndpointUnavailable({ code: 501 })).toBe(true)
  })

  it('returns true for Error message containing "not found"', () => {
    expect(isBatchResolveEndpointUnavailable(new Error('endpoint not found'))).toBe(true)
  })

  it('returns true for message containing "404"', () => {
    expect(isBatchResolveEndpointUnavailable({ msg: 'HTTP 404 error' })).toBe(true)
  })

  it('returns true for message containing "method not allowed"', () => {
    expect(isBatchResolveEndpointUnavailable(new Error('method not allowed'))).toBe(true)
  })

  it('returns true for message containing "endpoint unavailable"', () => {
    expect(isBatchResolveEndpointUnavailable({ msg: 'endpoint unavailable' })).toBe(true)
  })

  it('returns false for code 500', () => {
    expect(isBatchResolveEndpointUnavailable({ code: 500, msg: 'internal error' })).toBe(false)
  })

  it('returns false for generic timeout error', () => {
    expect(isBatchResolveEndpointUnavailable(new Error('timeout'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// toFailedIds
// ---------------------------------------------------------------------------

describe('toFailedIds', () => {
  it('returns empty array for non-array input', () => {
    expect(toFailedIds(null)).toEqual([])
    expect(toFailedIds(undefined)).toEqual([])
    expect(toFailedIds('r1')).toEqual([])
    expect(toFailedIds(42)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    expect(toFailedIds([])).toEqual([])
  })

  it('filters out non-string non-number items', () => {
    expect(toFailedIds([null, undefined, {}, 'r1', 2])).toEqual(['r1', 2])
  })

  it('trims whitespace from string entries', () => {
    expect(toFailedIds(['  r1  ', '  r2'])).toEqual(['r1', 'r2'])
  })

  it('filters out empty strings and whitespace-only strings after trim', () => {
    expect(toFailedIds(['r1', '', '   ', 'r2'])).toEqual(['r1', 'r2'])
  })

  it('preserves numeric IDs', () => {
    const result = toFailedIds([1, 2, 3])
    expect(result).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// parseBatchSummaryPayload
// ---------------------------------------------------------------------------

describe('parseBatchSummaryPayload', () => {
  it('uses success_count from payload', () => {
    const result = parseBatchSummaryPayload({ success_count: 8, failed_count: 2 }, 10)
    expect(result.successCount).toBe(8)
    expect(result.failedCount).toBe(2)
  })

  it('accepts camelCase successCount/failedCount', () => {
    const result = parseBatchSummaryPayload({ successCount: 5, failedCount: 1 }, 6)
    expect(result.successCount).toBe(5)
    expect(result.failedCount).toBe(1)
  })

  it('infers failedCount from success_count when failed_count absent', () => {
    const result = parseBatchSummaryPayload({ success_count: 7 }, 10)
    expect(result.successCount).toBe(7)
    expect(result.failedCount).toBe(3)
  })

  it('defaults successCount to total when no counts provided', () => {
    const result = parseBatchSummaryPayload({}, 5)
    expect(result.successCount).toBe(5)
    expect(result.failedCount).toBe(0)
  })

  it('extracts failedIds from failed_ids array', () => {
    const result = parseBatchSummaryPayload({ success_count: 1, failed_ids: ['r2', 'r3'] }, 3)
    expect(result.failedIds).toEqual(['r2', 'r3'])
  })

  it('accepts failedIds camelCase alias', () => {
    const result = parseBatchSummaryPayload({ success_count: 2, failedIds: ['x1'] }, 3)
    expect(result.failedIds).toHaveLength(1)
    expect(result.failedIds[0]).toBe('x1')
  })

  it('uses failedIds length to infer counts when neither count is provided', () => {
    const result = parseBatchSummaryPayload({ failed_ids: ['r1', 'r2'] }, 5)
    expect(result.failedCount).toBe(2)
    expect(result.successCount).toBe(3)
  })

  it('clamps successCount to total', () => {
    const result = parseBatchSummaryPayload({ success_count: 999 }, 10)
    expect(result.successCount).toBe(10)
    expect(result.failedCount).toBe(0)
  })

  it('clamps failedCount to prevent successCount + failedCount > total', () => {
    // success=8, failed=5 would sum to 13 > 10 → failedCount clamped to 2
    const result = parseBatchSummaryPayload({ success_count: 8, failed_count: 5 }, 10)
    expect(result.successCount + result.failedCount).toBeLessThanOrEqual(10)
  })

  it('handles null/undefined payload gracefully', () => {
    expect(parseBatchSummaryPayload(null, 3).successCount).toBe(3)
    expect(parseBatchSummaryPayload(undefined, 3).successCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// asMomentStats
// ---------------------------------------------------------------------------

describe('asMomentStats', () => {
  it('returns zeros for null', () => {
    expect(asMomentStats(null)).toEqual({ like_count: 0, comment_count: 0 })
  })

  it('returns zeros for undefined', () => {
    expect(asMomentStats(undefined)).toEqual({ like_count: 0, comment_count: 0 })
  })

  it('returns zeros for non-object primitives', () => {
    expect(asMomentStats(42)).toEqual({ like_count: 0, comment_count: 0 })
    expect(asMomentStats('stats')).toEqual({ like_count: 0, comment_count: 0 })
  })

  it('parses like_count and comment_count from object', () => {
    expect(asMomentStats({ like_count: 5, comment_count: 3 })).toEqual({
      like_count: 5,
      comment_count: 3,
    })
  })

  it('defaults missing fields to 0', () => {
    expect(asMomentStats({ like_count: 10 })).toEqual({ like_count: 10, comment_count: 0 })
    expect(asMomentStats({ comment_count: 7 })).toEqual({ like_count: 0, comment_count: 7 })
  })

  it('converts string numbers', () => {
    const result = asMomentStats({ like_count: '12', comment_count: '8' })
    expect(result.like_count).toBe(12)
    expect(result.comment_count).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// normalizeMoment
// ---------------------------------------------------------------------------

describe('normalizeMoment', () => {
  it('normalizes a complete raw moment', () => {
    const raw = {
      id: 'mom-1',
      author_uid: 'user-99',
      content: 'Hello world',
      media: [{ url: 'http://example.com/img.jpg' }],
      visibility: 2,
      allow_comment: true,
      stats: { like_count: 10, comment_count: 5 },
      status: 1,
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }
    const result = normalizeMoment(raw)
    expect(result.id).toBe('mom-1')
    expect(result.author_uid).toBe('user-99')
    expect(result.content).toBe('Hello world')
    expect(result.media).toHaveLength(1)
    expect(result.visibility).toBe(2)
    expect(result.allow_comment).toBe(true)
    expect(result.stats.like_count).toBe(10)
    expect(result.stats.comment_count).toBe(5)
    expect(result.status).toBe(1)
  })

  it('applies defaults for missing optional fields', () => {
    const result = normalizeMoment({ id: 'x', author_uid: 'u1' })
    expect(result.content).toBe('')
    expect(result.media).toEqual([])
    expect(result.visibility).toBe(1)
    expect(result.allow_comment).toBe(false)
    expect(result.stats).toEqual({ like_count: 0, comment_count: 0 })
    expect(result.status).toBe(1)
    expect(result.created_at).toBe('')
    expect(result.updated_at).toBe('')
  })

  it('handles null input gracefully', () => {
    const result = normalizeMoment(null)
    expect(result.content).toBe('')
    expect(result.media).toEqual([])
  })

  it('preserves acl when present', () => {
    const acl = { allow_uids: ['u1'], deny_uids: [] }
    const result = normalizeMoment({ id: 'x', author_uid: 'u1', acl })
    expect(result.acl).toEqual(acl)
  })

  it('sets acl to undefined when absent', () => {
    const result = normalizeMoment({ id: 'x', author_uid: 'u1' })
    expect(result.acl).toBeUndefined()
  })

  it('preserves reports array when present', () => {
    const reports = [
      { id: 'r1', post_id: 'p1', reporter_uid: 'u2', reason: 'spam', description: '', status: 0, handled_by: '', handled_at: null, created_at: '', updated_at: '' },
    ]
    const result = normalizeMoment({ id: 'x', author_uid: 'u1', reports })
    expect(result.reports).toHaveLength(1)
  })

  it('sets reports to undefined when not an array', () => {
    const result = normalizeMoment({ id: 'x', author_uid: 'u1', reports: null })
    expect(result.reports).toBeUndefined()
  })
})
