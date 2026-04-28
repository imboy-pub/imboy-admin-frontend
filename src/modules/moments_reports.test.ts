/**
 * Unit tests for:
 *   moments/api/public — getMomentListPayload, getMomentReportListPayload, deleteMoment
 *   ops_governance/api/reports — isReportEndpointUnavailable, getReportListPayload, resolveReport
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getMomentListPayload,
  getMomentReportListPayload,
  getMomentDetailPayload,
  deleteMoment,
  resolveMomentReport,
  resolveMomentReportBatchWithFallback,
} from '@/modules/moments/api/public'
import {
  isReportEndpointUnavailable,
  getReportListPayload,
  resolveReport,
} from '@/modules/ops_governance/api/reports'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

// ---------------------------------------------------------------------------
// moments
// ---------------------------------------------------------------------------
describe('getMomentListPayload', () => {
  it('returns normalized moment list from /moment/list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/moment/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              {
                moment_id: 'mom-001',
                uid: '7001',
                content: '今天天气真好',
                status: 1,
                created_at: '2026-04-01',
              },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getMomentListPayload()
    expect(result.items).toHaveLength(1)
  })
})

describe('getMomentReportListPayload', () => {
  it('returns moment report list from /moment/report/list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/moment/report/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 'r-001', moment_id: 'mom-001', reporter_uid: '7002', reason: '违规内容', status: 0 },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getMomentReportListPayload()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].reason).toBe('违规内容')
  })
})

describe('deleteMoment', () => {
  it('posts moment_id and reason to /moment/delete', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/moment/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteMoment('mom-001', '违反社区规范')
    expect(capturedBody.moment_id).toBe('mom-001')
    expect(capturedBody.reason).toBe('违反社区规范')
  })

  it('uses empty reason by default', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteMoment('mom-001')
    expect(capturedBody.reason).toBe('')
  })
})

// ---------------------------------------------------------------------------
// ops_governance/api/reports — isReportEndpointUnavailable
// ---------------------------------------------------------------------------
describe('isReportEndpointUnavailable', () => {
  it('returns true for code 404', () => {
    expect(isReportEndpointUnavailable({ code: 404, msg: 'not found' })).toBe(true)
  })

  it('returns true for code 405', () => {
    expect(isReportEndpointUnavailable({ code: 405 })).toBe(true)
  })

  it('returns true for code 501', () => {
    expect(isReportEndpointUnavailable({ code: 501 })).toBe(true)
  })

  it('returns true for Error with "not found" in message', () => {
    expect(isReportEndpointUnavailable(new Error('endpoint not found'))).toBe(true)
  })

  it('returns false for code 500', () => {
    expect(isReportEndpointUnavailable({ code: 500, msg: 'internal error' })).toBe(false)
  })

  it('returns false for network error', () => {
    expect(isReportEndpointUnavailable(new Error('timeout'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ops_governance/api/reports — getReportListPayload
// ---------------------------------------------------------------------------
describe('getReportListPayload', () => {
  it('returns report list from /report/list', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/report/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 'rpt-001', target_type: 'user', target_id: '7001', reason: '骚扰', status: 0 },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getReportListPayload({ page: 1, size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].reason).toBe('骚扰')
  })
})

// ---------------------------------------------------------------------------
// ops_governance/api/reports — resolveReport
// ---------------------------------------------------------------------------
describe('resolveReport', () => {
  it('posts to /report/resolve with targetType, report_id, result, note', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/report/resolve')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await resolveReport('user', 'rpt-001', 1, '已处理')
    expect(capturedBody.report_id).toBe('rpt-001')
    expect(capturedBody.result).toBe(1)
    expect(capturedBody.note).toBe('已处理')
    expect(capturedBody.target_type).toBe('user')
  })
})

// ---------------------------------------------------------------------------
// getMomentDetailPayload
// ---------------------------------------------------------------------------

describe('getMomentDetailPayload', () => {
  it('returns normalized moment detail from /moment/detail/:id', async () => {
    const raw = {
      id: 'mom-1',
      author_uid: 'user-99',
      content: 'Hello world',
      media: [],
      visibility: 1,
      allow_comment: true,
      status: 1,
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: raw } })
    const result = await getMomentDetailPayload('mom-1')
    expect(result.id).toBe('mom-1')
    expect(result.content).toBe('Hello world')
    expect(result.allow_comment).toBe(true)
  })

  it('normalizes missing fields with defaults', async () => {
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: { id: 'x', author_uid: 'u1' } } })
    const result = await getMomentDetailPayload('x')
    expect(result.content).toBe('')
    expect(result.media).toEqual([])
    expect(result.visibility).toBe(1)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(getMomentDetailPayload('mom-1')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// resolveMomentReport
// ---------------------------------------------------------------------------

describe('resolveMomentReport', () => {
  it('posts to /moment/report/resolve with report_id, result, note', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body as Record<string, unknown>
      return { data: { code: 0, msg: 'ok' } }
    }
    await resolveMomentReport('rpt-42', 1, '违规确认')
    expect(capturedBody.report_id).toBe('rpt-42')
    expect(capturedBody.result).toBe(1)
    expect(capturedBody.note).toBe('违规确认')
  })

  it('uses empty string for note when omitted', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body as Record<string, unknown>
      return { data: { code: 0, msg: 'ok' } }
    }
    await resolveMomentReport('rpt-1', 2)
    expect(capturedBody.note).toBe('')
  })

  it('resolves with response data', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await resolveMomentReport('rpt-1', 1)
    expect(result.msg).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// resolveMomentReportBatchWithFallback
// ---------------------------------------------------------------------------

describe('resolveMomentReportBatchWithFallback', () => {
  it('returns zero counts for empty reportIds', async () => {
    const result = await resolveMomentReportBatchWithFallback([], 1)
    expect(result.total).toBe(0)
    expect(result.successCount).toBe(0)
    expect(result.failedCount).toBe(0)
    expect(result.mode).toBe('batch')
  })

  it('returns batch mode with counts on successful batch resolve', async () => {
    mutableClient.post = async () => ({
      data: { code: 0, msg: 'ok', payload: { success_count: 3, failed_count: 0, failed_ids: [] } },
    })
    const result = await resolveMomentReportBatchWithFallback(['r1', 'r2', 'r3'], 1)
    expect(result.mode).toBe('batch')
    expect(result.total).toBe(3)
    expect(result.successCount).toBe(3)
    expect(result.failedCount).toBe(0)
  })

  it('falls back to individual calls when batch endpoint is unavailable (404)', async () => {
    let callCount = 0
    mutableClient.post = async (url: unknown) => {
      callCount++
      // First call = batch endpoint → 404
      if (callCount === 1) {
        const err = Object.assign(new Error('Not found'), { code: 404 })
        throw err
      }
      // Subsequent calls = individual resolves
      return { data: { code: 0, msg: 'ok' } }
    }
    const result = await resolveMomentReportBatchWithFallback(['r1', 'r2'], 2)
    expect(result.mode).toBe('fallback')
    expect(result.total).toBe(2)
    expect(result.successCount).toBe(2)
    expect(result.failedCount).toBe(0)
    expect(callCount).toBe(3) // 1 batch + 2 individual
  })

  it('tracks failed individual calls in fallback mode', async () => {
    let callCount = 0
    mutableClient.post = async () => {
      callCount++
      if (callCount === 1) {
        const err = Object.assign(new Error('not found'), { code: 404 })
        throw err
      }
      // Individual: first succeeds, second fails
      if (callCount === 3) throw new Error('server error')
      return { data: { code: 0, msg: 'ok' } }
    }
    const result = await resolveMomentReportBatchWithFallback(['r1', 'r2'], 1)
    expect(result.mode).toBe('fallback')
    expect(result.failedCount).toBe(1)
    expect(result.failedIds).toHaveLength(1)
    expect(result.failedIds[0]).toBe('r2')
  })

  it('deduplicates report IDs', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body as Record<string, unknown>
      return { data: { code: 0, msg: 'ok', payload: { success_count: 2 } } }
    }
    await resolveMomentReportBatchWithFallback(['r1', 'r1', 'r2'], 1)
    // Deduplicated: only r1 and r2
    expect((capturedBody.report_ids as string[]).length).toBe(2)
  })

  it('throws when batch endpoint fails with non-404 error', async () => {
    mutableClient.post = async () => {
      throw new Error('Internal Server Error')
    }
    await expect(resolveMomentReportBatchWithFallback(['r1'], 1)).rejects.toThrow('Internal Server Error')
  })
})
