import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  getReportListPayload,
  isReportEndpointUnavailable,
  resolveReportBatchWithFallback,
} from './reports'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

describe('reports service', () => {
  it('getReportListPayload falls back to target endpoint when generic endpoint is unavailable', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })

      if (url === '/report/list') {
        throw { code: 404, msg: 'not found' }
      }

      if (url === '/group/report/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              items: [
                {
                  id: 101,
                  group_id: 88,
                  reporter_uid: 3001,
                  reason: '广告',
                  description: '重复刷屏',
                  status: 0,
                  created_at: '2026-03-01 10:00:00',
                  updated_at: '2026-03-01 10:00:00',
                },
              ],
              page: 1,
              size: 10,
              total: 1,
              total_pages: 1,
            },
          },
        }
      }

      throw new Error(`unexpected GET url: ${url}`)
    }

    const payload = await getReportListPayload('group', { page: 1, size: 10, status: 0, target_id: '88' })

    expect(getCalls.map((item) => item.url)).toEqual(['/report/list', '/group/report/list'])
    expect(getCalls[0]?.params).toEqual({
      page: 1,
      size: 10,
      status: 0,
      target_type: 'group',
      target_id: '88',
    })
    expect(payload.items[0]).toEqual({
      id: 101,
      target_type: 'group',
      target_id: 88,
      reporter_uid: 3001,
      reason: '广告',
      description: '重复刷屏',
      status: 0,
      handled_by: '',
      handled_at: null,
      created_at: '2026-03-01 10:00:00',
      updated_at: '2026-03-01 10:00:00',
    })
  })

  it('resolveReportBatchWithFallback uses target batch endpoint when generic endpoint is unavailable', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })

      if (url === '/report/batch_resolve') {
        throw { code: 404, msg: 'not found' }
      }

      if (url === '/channel/report/batch_resolve') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              success_count: 2,
              failed_count: 0,
            },
          },
        }
      }

      throw new Error(`unexpected POST url: ${url}`)
    }

    const summary = await resolveReportBatchWithFallback('channel', [701, 702], 2, 'batch_note')

    expect(postCalls.map((item) => item.url)).toEqual(['/report/batch_resolve', '/channel/report/batch_resolve'])
    expect(summary).toEqual({
      mode: 'target-batch',
      total: 2,
      successCount: 2,
      failedCount: 0,
      failedIds: [],
    })
  })

  it('isReportEndpointUnavailable detects known unavailable cases', () => {
    expect(isReportEndpointUnavailable({ code: 404, msg: 'not found' })).toBe(true)
    expect(isReportEndpointUnavailable({ code: 405, msg: 'method not allowed' })).toBe(true)
    expect(isReportEndpointUnavailable({ code: 500, msg: 'internal error' })).toBe(false)
  })
})
