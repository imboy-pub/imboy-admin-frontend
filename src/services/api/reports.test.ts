import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  getReportActions,
  getReportListPayload,
  isReportEndpointUnavailable,
  resolveReportBatchWithFallback,
} from '@/modules/ops_governance/api/reports'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

// R08-AD wire 形状：举报域 _at 键 = epoch 毫秒（BE convert_at_timestamps 链）。
// T1 瞬间：1789600000000ms = 2026-09-16T23:06:40.000Z（与 apiInstant.test.ts 同锚点）。
const T1_MS = 1789600000000
const T1_ISO = '2026-09-16T23:06:40.000Z'

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
                  // 真实 wire 形状：epoch 毫秒整数（经 convert_at_timestamps 出站）
                  created_at: T1_MS,
                  updated_at: T1_MS + 300000,
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
      id: '101',
      target_type: 'group',
      target_id: '88',
      target_sub_type: '',
      target_scope_id: '',
      target_author_id: '',
      reporter_uid: '3001',
      reason: '广告',
      description: '重复刷屏',
      evidence: null,
      status: 0,
      handled_by: '',
      handled_at: null,
      // R08-AD：毫秒 → 规范 ISO 投影（不再 String() 裸透传）
      created_at: T1_ISO,
      updated_at: '2026-09-16T23:11:40.000Z',
    })
  })

  it('getReportListPayload preserves handled_at epoch-milliseconds as canonical ISO (generic endpoint)', async () => {
    mutableClient.get = async (url: string) => {
      if (url !== '/report/list') throw new Error(`unexpected GET url: ${url}`)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: 202,
                target_type: 'message',
                target_id: 9001,
                reporter_uid: 3002,
                reason: '垃圾消息',
                status: 2,
                handled_by: 42,
                // 已处理工单：handled_at = epoch 毫秒（此前被 typeof-string 分支丢弃为 null）
                handled_at: T1_MS + 60000,
                created_at: T1_MS,
                updated_at: T1_MS + 60000,
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

    const payload = await getReportListPayload('message', { page: 1, size: 10 })
    const item = payload.items[0]
    expect(item.handled_at).toBe('2026-09-16T23:07:40.000Z')
    expect(item.created_at).toBe(T1_ISO)
    expect(item.updated_at).toBe('2026-09-16T23:07:40.000Z')
  })

  it('getReportListPayload fails closed on offset-less string and NaN instants', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          items: [
            {
              id: 303,
              target_type: 'user',
              target_id: 7001,
              reporter_uid: 3003,
              reason: 'x',
              status: 0,
              // 非法形状：无 offset 裸串 / NaN（apiInstant 合同 → null，不回填 now）
              created_at: '2026-03-01 10:00:00',
              updated_at: NaN,
            },
          ],
          page: 1, size: 10, total: 1, total_pages: 1,
        },
      },
    })

    const payload = await getReportListPayload('user', { page: 1, size: 10 })
    expect(payload.items[0].created_at).toBeNull()
    expect(payload.items[0].updated_at).toBeNull()
  })

  it('getReportActions projects action row time fields to canonical ISO', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/report_action/list')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            data: [
              {
                id: 501,
                case_id: 202,
                action: 'group_mute',
                status: 'executed',
                start_at: T1_MS,
                end_at: T1_MS + 3600000,
                reversed_at: null,
                created_at: T1_MS,
                updated_at: T1_MS,
              },
            ],
          },
        },
      }
    }

    const rows = await getReportActions('202')
    expect(rows).toHaveLength(1)
    expect(rows[0].start_at).toBe(T1_ISO)
    expect(rows[0].end_at).toBe('2026-09-17T00:06:40.000Z')
    expect(rows[0].reversed_at).toBeNull()
    expect(rows[0].created_at).toBe(T1_ISO)
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
