import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import { getCurrentAdminPayload, loginPayload } from '@/modules/identity/api/auth'
import { getUserListPayload } from '@/modules/identity/api/users'
import { getGroupListPayload } from '@/modules/groups/api/public'
import { resolveMomentReportBatchWithFallback } from '@/modules/moments/api/public'
import {
  deleteChannelMessage,
  getChannelAdminsPayload,
  getChannelDetailPayload,
  getChannelMessagesPayload,
  getChannelStatsPayload,
  getChannelSubscribersPayload,
  pinChannelMessage,
  removeChannelAdmin,
  removeChannelSubscriber,
  updateChannelAdminRole,
} from '@/modules/channels/api/public'
import { getFeedbackListPayload } from '@/modules/ops_governance/api/feedback'
import { getVersionListPayload } from '@/modules/ops_governance/api/versions'
import { getDDLListPayload } from '@/modules/ops_governance/api/ddl'
import {
  exportMessageCsvBlob,
  getMessageDetailPayload,
  getMessageListPayload,
} from '@/modules/messages/api/public'
import {
  getGroupStatsPayload,
  getMessageStatsPayload,
  getOverviewStatsPayload,
  getUserStatsPayload,
} from './stats'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = {
  get: AnyFn
  post: AnyFn
  put: AnyFn
  delete: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
  mutableClient.delete = originalDelete
})

describe('payload-first services', () => {
  it('loginPayload returns payload and forwards params', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> | undefined
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: '1',
            account: 'admin',
            nickname: 'Admin',
            avatar: '',
            role_id: 1,
            next: '/dashboard',
          },
        },
      }
    }

    const payload = await loginPayload({
      account: 'admin',
      pwd: 'encrypted',
      captcha: 'abcde',
      csrf_token: 'csrf_1',
    })

    expect(capturedUrl).toBe('/passport/do_login')
    expect(capturedBody).toEqual({
      account: 'admin',
      pwd: 'encrypted',
      captcha: 'abcde',
      csrf_token: 'csrf_1',
    })
    expect(payload.account).toBe('admin')
    expect(payload.next).toBe('/dashboard')
  })

  it('loginPayload throws when payload is missing', async () => {
    mutableClient.post = async () => ({
      data: {
        code: 0,
        msg: 'ok',
      },
    })

    try {
      await loginPayload({
        account: 'admin',
        pwd: 'encrypted',
        captcha: 'abcde',
        csrf_token: 'csrf_1',
      })
      throw new Error('expected loginPayload to throw')
    } catch (error) {
      expect((error as Error).message).toContain('Missing payload in API response (/passport/do_login)')
    }
  })

  it('getCurrentAdminPayload reads /current payload', async () => {
    let capturedUrl = ''
    mutableClient.get = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: '1',
            account: 'admin',
            nickname: 'Admin',
            avatar: '',
            role_id: 1,
            login_count: 2,
            last_login_ip: '127.0.0.1',
            last_login_at: '2026-02-18 00:00:00',
            status: 1,
            created_at: '2026-01-01 00:00:00',
          },
        },
      }
    }

    const payload = await getCurrentAdminPayload()
    expect(capturedUrl).toBe('/current')
    expect(payload.account).toBe('admin')
  })

  it('getUserListPayload returns pagination payload and forwards query params', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (_url: string, config: { params?: Record<string, unknown> }) => {
      capturedParams = config.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ id: 1, account: 'u1' }],
            page: 2,
            size: 10,
            total: 11,
            total_pages: 2,
          },
        },
      }
    }

    const payload = await getUserListPayload({ page: 2, size: 10, keyword: 'u1' })
    expect(capturedParams).toEqual({ page: 2, size: 10, keyword: 'u1' })
    expect(payload.page).toBe(2)
    expect(payload.items.length).toBe(1)
  })

  it('getGroupListPayload returns pagination payload', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          items: [{ id: 7, title: 'g1' }],
          page: 1,
          size: 20,
          total: 1,
          total_pages: 1,
        },
      },
    })

    const payload = await getGroupListPayload({ page: 1, size: 20, keyword: 'g1' })
    expect(payload.items[0]?.id).toBe(7)
  })

  it('resolveMomentReportBatchWithFallback uses batch endpoint when available', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })

      if (url === '/moment/report/batch_resolve') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              success_count: 1,
              failed_count: 1,
              failed_ids: [702],
            },
          },
        }
      }

      throw new Error(`unexpected POST url: ${url}`)
    }

    const summary = await resolveMomentReportBatchWithFallback(['701', '702'], 2, 'batch_note')

    expect(postCalls.length).toBe(1)
    expect(postCalls[0]).toEqual({
      url: '/moment/report/batch_resolve',
      body: {
        report_ids: ['701', '702'],
        result: 2,
        note: 'batch_note',
      },
    })
    expect(summary).toEqual({
      mode: 'batch',
      total: 2,
      successCount: 1,
      failedCount: 1,
      failedIds: ['702'],
    })
  })

  it('resolveMomentReportBatchWithFallback falls back to single resolve when batch endpoint unavailable', async () => {
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })

      if (url === '/moment/report/batch_resolve') {
        throw {
          code: 404,
          msg: 'not found',
        }
      }

      if (url === '/moment/report/resolve') {
        if (body.report_id === '702') {
          throw {
            code: 500,
            msg: 'resolve failed',
          }
        }
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {},
          },
        }
      }

      throw new Error(`unexpected POST url: ${url}`)
    }

    const summary = await resolveMomentReportBatchWithFallback(['701', '702', '701'], 1, 'fallback_note')

    expect(postCalls.map((item) => item.url)).toEqual([
      '/moment/report/batch_resolve',
      '/moment/report/resolve',
      '/moment/report/resolve',
    ])
    expect(postCalls[1]?.body).toEqual({
      report_id: '701',
      result: 1,
      note: 'fallback_note',
    })
    expect(postCalls[2]?.body).toEqual({
      report_id: '702',
      result: 1,
      note: 'fallback_note',
    })
    expect(summary).toEqual({
      mode: 'fallback',
      total: 2,
      successCount: 1,
      failedCount: 1,
      failedIds: ['702'],
    })
  })

  it('getChannelDetailPayload reads /channel/detail/:id payload', async () => {
    let capturedUrl = ''
    mutableClient.get = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: 8,
            name: 'channel-8',
          },
        },
      }
    }

    const payload = await getChannelDetailPayload(8)
    expect(capturedUrl).toBe('/channel/detail/8')
    expect(payload.id).toBe(8)
  })

  it('getChannelMessagesPayload reads /channel/:id/messages and forwards params', async () => {
    let capturedUrl = ''
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config: { params?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedParams = config.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ id: 101, content: 'hello' }],
            page: 2,
            size: 15,
            total: 33,
            total_pages: 3,
          },
        },
      }
    }

    const payload = await getChannelMessagesPayload(8, { page: 2, size: 15 })
    expect(capturedUrl).toBe('/channel/8/messages')
    expect(capturedParams).toEqual({ page: 2, size: 15 })
    expect(payload.page).toBe(2)
    expect(payload.items[0]?.id).toBe(101)
  })

  it('pinChannelMessage sends PUT /channel/:id/message/:message_id/pin', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> | undefined
    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const response = await pinChannelMessage(8, 101, true)
    expect(capturedUrl).toBe('/channel/8/message/101/pin')
    expect(capturedBody).toEqual({ pinned: true })
    expect(response.code).toBe(0)
  })

  it('deleteChannelMessage sends DELETE /channel/:id/message/:message_id/delete', async () => {
    let capturedUrl = ''
    mutableClient.delete = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const response = await deleteChannelMessage(8, 101)
    expect(capturedUrl).toBe('/channel/8/message/101/delete')
    expect(response.code).toBe(0)
  })

  it('getChannelSubscribersPayload reads /channel/:id/subscribers and forwards params', async () => {
    let capturedUrl = ''
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config: { params?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedParams = config.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ id: 1, user_id: 2001 }],
            page: 1,
            size: 10,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    const payload = await getChannelSubscribersPayload(8, { page: 1, size: 10 })
    expect(capturedUrl).toBe('/channel/8/subscribers')
    expect(capturedParams).toEqual({ page: 1, size: 10 })
    expect(payload.items[0]?.id).toBe(1)
  })

  it('removeChannelSubscriber sends DELETE /channel/:id/subscriber/:user_id', async () => {
    let capturedUrl = ''
    mutableClient.delete = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const response = await removeChannelSubscriber(8, 2001)
    expect(capturedUrl).toBe('/channel/8/subscriber/2001')
    expect(response.code).toBe(0)
  })

  it('getChannelAdminsPayload reads /channel/:id/admins and forwards params', async () => {
    let capturedUrl = ''
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config: { params?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedParams = config.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ id: 3, user_id: 3001, role: 2 }],
            page: 1,
            size: 10,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    const payload = await getChannelAdminsPayload(8, { page: 1, size: 10 })
    expect(capturedUrl).toBe('/channel/8/admins')
    expect(capturedParams).toEqual({ page: 1, size: 10 })
    expect(payload.items[0]?.role).toBe(2)
  })

  it('updateChannelAdminRole sends PUT /channel/:id/admin/:user_id/role', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> | undefined
    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const response = await updateChannelAdminRole(8, 3001, 2)
    expect(capturedUrl).toBe('/channel/8/admin/3001/role')
    expect(capturedBody).toEqual({ role: 2 })
    expect(response.code).toBe(0)
  })

  it('removeChannelAdmin sends DELETE /channel/:id/admin/:user_id', async () => {
    let capturedUrl = ''
    mutableClient.delete = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const response = await removeChannelAdmin(8, 3001)
    expect(capturedUrl).toBe('/channel/8/admin/3001')
    expect(response.code).toBe(0)
  })

  it('getChannelStatsPayload reads /channel/:id/stats', async () => {
    let capturedUrl = ''
    mutableClient.get = async (url: string) => {
      capturedUrl = url
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            channel_id: 8,
            subscriber_count: 32,
            total_messages: 88,
            total_views: 560,
            total_reactions: 145,
          },
        },
      }
    }

    const payload = await getChannelStatsPayload(8)
    expect(capturedUrl).toBe('/channel/8/stats')
    expect(payload.subscriber_count).toBe(32)
    expect(payload.total_reactions).toBe(145)
  })

  it('getFeedbackListPayload returns pagination payload', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          items: [{ id: 9, content: 'feedback' }],
          page: 1,
          size: 20,
          total: 1,
          total_pages: 1,
        },
      },
    })

    const payload = await getFeedbackListPayload({ page: 1, size: 20 })
    expect(payload.total).toBe(1)
  })

  it('getVersionListPayload returns pagination payload', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          items: [{ id: 2, version: '1.0.0' }],
          page: 1,
          size: 50,
          total: 1,
          total_pages: 1,
        },
      },
    })

    const payload = await getVersionListPayload({ page: 1, size: 50 })
    expect(payload.items[0]?.version).toBe('1.0.0')
  })

  it('getDDLListPayload injects ajax=1 and returns payload', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (_url: string, config: { params?: Record<string, unknown> }) => {
      capturedParams = config.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ id: 3, ddl: 'ALTER TABLE t ADD c INT' }],
            page: 1,
            size: 50,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    const payload = await getDDLListPayload({ page: 1, size: 50 })
    expect(capturedParams?.ajax).toBe(1)
    expect(payload.items[0]?.id).toBe(3)
  })

  it('stats payload services return payload from each endpoint', async () => {
    const urls: string[] = []
    mutableClient.get = async (url: string) => {
      urls.push(url)
      if (url === '/stats/overview') {
        return { data: { code: 0, msg: 'ok', payload: { total_users: 10 } } }
      }
      if (url === '/stats/user') {
        return { data: { code: 0, msg: 'ok', payload: { active_users: 7 } } }
      }
      if (url === '/stats/message') {
        return { data: { code: 0, msg: 'ok', payload: { daily_c2c: [] } } }
      }
      return { data: { code: 0, msg: 'ok', payload: { public_groups: 2 } } }
    }

    const overview = await getOverviewStatsPayload()
    const user = await getUserStatsPayload(7)
    const message = await getMessageStatsPayload(7)
    const group = await getGroupStatsPayload(7)

    expect(urls).toContain('/stats/overview')
    expect(urls).toContain('/stats/user')
    expect(urls).toContain('/stats/message')
    expect(urls).toContain('/stats/group')
    expect(overview.total_users).toBe(10)
    expect(user.active_users).toBe(7)
    expect(message.daily_c2c).toEqual([])
    expect(group.public_groups).toBe(2)
  })
})

/**
 * A-04 客服及消息审计最小可见和导出（LOCAL_ENGINEERING_V1）。
 *
 * 覆盖断言（对 src/modules/messages/api/public.ts 的服务面行为）：
 * - A-04:LOCAL:01 无 ticket 读取与导出拒绝：详情/列表在服务端拒绝（错误信封
 *   无 payload）时 fail-closed 抛错，不产出可用数据；ticket+reason 仅在调用方
 *   提供时作为查询参数送服务端授权（客户端不自行放宽）。
 * - A-04:LOCAL:02 权限撤销后分页和导出无法续读：列表 401/403 错误信封 → 抛错
 *   （无分页数据可续读）；导出 403 后每次重试都重新请求服务端并再次被拒，
 *   不存在本地缓存/旁路可以续读。
 * - A-04:LOCAL:03 支持材料不含完整令牌、正文或客户 PII：导出 URL 只含过滤
 *   条件（无 Authorization/令牌查询参数），请求头只有 Accept，鉴权走 cookie；
 *   导出错误只含 HTTP 状态，响应体中的令牌样材料不进入异常消息。
 */
describe('A-04 message audit minimal visibility and export (messages/api/public)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function okEnvelope(payload: unknown) {
    return { data: { code: 0, msg: 'ok', payload } }
  }

  function errorEnvelope(code: number, msg: string) {
    return { data: { code, msg } }
  }

  function captureGet(
    handler: (_url: string, _params: Record<string, unknown>) => { data: { code: number; msg: string; payload?: unknown } },
  ) {
    mutableClient.get = async (url: string, config: { params?: Record<string, unknown> }) =>
      handler(url, config.params ?? {})
  }

  it('A-04:LOCAL:01 详情内容访问参数只在提供时下发：无 ticket 请求不含 ticket/reason 键，带 ticket 时逐字转发（服务端授权输入完整）', async () => {
    const calls: Array<Record<string, unknown>> = []
    captureGet((_url, params) => {
      calls.push(params)
      return okEnvelope({ msg_id: '9100', content: 'ok', msg_scope: 'c2c' })
    })

    await getMessageDetailPayload('9100', 'c2c')
    await getMessageDetailPayload('9100', 'c2c', { ticket: 41001, reason: '工单核查导出' })

    expect(calls.length).toBe(2)
    expect(calls[0]).toEqual({ msg_id: '9100', msg_scope: 'c2c' })
    expect('ticket' in (calls[0] as object)).toBe(false)
    expect('reason' in (calls[0] as object)).toBe(false)
    expect(calls[1]).toEqual({ msg_id: '9100', msg_scope: 'c2c', ticket: 41001, reason: '工单核查导出' })
  })

  it('A-04:LOCAL:01 无 ticket 详情读取拒绝：服务端 403 错误信封（无 payload）→ fail-closed 抛错，无内容外泄', async () => {
    mutableClient.get = async () => errorEnvelope(403, 'ticket_required')

    let threw: Error | null = null
    try {
      await getMessageDetailPayload('9100', 'c2c')
    } catch (error) {
      threw = error as Error
    }
    expect(threw).not.toBeNull()
    expect(threw?.message).toContain('Missing payload in API response (/message/detail)')
  })

  it('A-04:LOCAL:01 列表把 ticket/reason/会话过滤逐字转发（客户端不放宽服务端授权范围）', async () => {
    let captured: Record<string, unknown> | undefined
    captureGet((_url, params) => {
      captured = params
      return okEnvelope({ items: [], page: 2, size: 10, total: 0, total_pages: 0 })
    })

    await getMessageListPayload({
      page: 2,
      size: 10,
      msg_scope: 'c2c',
      conversation: '12:34',
      ticket: 41002,
      reason: '审计导出',
    })

    expect(captured).toEqual({
      page: 2,
      size: 10,
      msg_scope: 'c2c',
      conversation: '12:34',
      ticket: 41002,
      reason: '审计导出',
    })
  })

  it('A-04:LOCAL:02 权限撤销后列表分页无法续读：401/403 错误信封 → 抛错，不产出任何可续读页数据', async () => {
    mutableClient.get = async () => errorEnvelope(403, 'permission_revoked')

    await expect(getMessageListPayload({ page: 3, size: 10 })).rejects.toThrow(
      'Missing payload in API response (/message/list)',
    )
    mutableClient.get = async () => errorEnvelope(401, 'unauthenticated')
    await expect(getMessageListPayload({ page: 4, size: 10 })).rejects.toThrow(
      'Missing payload in API response (/message/list)',
    )
  })

  it('A-04:LOCAL:01+03 导出 URL：ticket/reason 与过滤条件全部入查询串；未定义/空值不下发；URL 与请求头不含令牌，鉴权只走 cookie', async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init ?? {} })
      return new Response('a,b,c', { status: 200, headers: { 'Content-Type': 'text/csv' } })
    }) as typeof fetch

    await exportMessageCsvBlob({
      page: 2,
      size: 10,
      msg_scope: 'c2c',
      conversation: '12:34',
      ticket: 41003,
      reason: '审计导出',
    })
    await exportMessageCsvBlob({ msg_scope: 'all' })

    expect(fetchCalls.length).toBe(2)

    const first = new URL(fetchCalls[0]!.url, 'https://admin.invalid')
    expect(first.pathname.endsWith('/message/export')).toBe(true)
    expect(first.searchParams.get('ticket')).toBe('41003')
    expect(first.searchParams.get('reason')).toBe('审计导出')
    expect(first.searchParams.get('msg_scope')).toBe('c2c')
    expect(first.searchParams.get('conversation')).toBe('12:34')
    expect(first.searchParams.get('page')).toBe('2')

    const second = new URL(fetchCalls[1]!.url, 'https://admin.invalid')
    expect(second.searchParams.get('ticket')).toBeNull()
    expect(second.searchParams.get('reason')).toBeNull()
    expect(second.searchParams.get('page')).toBeNull()
    expect(second.searchParams.get('msg_scope')).toBe('all')

    for (const call of fetchCalls) {
      const lowerUrl = call.url.toLowerCase()
      expect(lowerUrl.includes('authorization')).toBe(false)
      expect(lowerUrl.includes('bearer')).toBe(false)
      expect(lowerUrl.includes('token=')).toBe(false)
      expect(lowerUrl.includes('secret')).toBe(false)
      const headers = call.init.headers as Record<string, string>
      expect(headers).toEqual({ Accept: 'text/csv' })
      expect(call.init.method).toBe('GET')
      expect(call.init.credentials).toBe('include')
    }
  })

  it('A-04:LOCAL:02+03 权限撤销后导出无法续读：403 只抛 HTTP 状态，响应体中令牌样材料不进入错误；重试导出仍真实再请求并再次被拒（无本地旁路）', async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init ?? {} })
      // 响应体带令牌样材料与正文样材料：任何把 body 透传进错误/日志的实现都会被下面断言抓住。
      return new Response(
        JSON.stringify({
          code: 403,
          msg: 'read permission revoked',
          admin_token: 'A04-ADMIN-TOKEN-SAMPLE',
          payload_preview: 'A04-CUSTOMER-BODY-SAMPLE',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    let firstError: Error | null = null
    try {
      await exportMessageCsvBlob({ msg_scope: 'c2c', ticket: 41004, reason: '审计导出' })
    } catch (error) {
      firstError = error as Error
    }

    expect(firstError).not.toBeNull()
    expect(firstError?.message).toBe('导出失败（HTTP 403）')
    expect(firstError?.message.includes('A04-ADMIN-TOKEN-SAMPLE')).toBe(false)
    expect(firstError?.message.includes('A04-CUSTOMER-BODY-SAMPLE')).toBe(false)
    expect(firstError?.message.includes('read permission revoked')).toBe(false)

    let secondError: Error | null = null
    try {
      await exportMessageCsvBlob({ msg_scope: 'c2c', ticket: 41004, reason: '审计导出' })
    } catch (error) {
      secondError = error as Error
    }
    expect(secondError?.message).toBe('导出失败（HTTP 403）')
    // 两次导出都真实打到服务端（无 blob 缓存/本地续读旁路）。
    expect(fetchCalls.length).toBe(2)
    for (const call of fetchCalls) {
      const lowerUrl = call.url.toLowerCase()
      expect(lowerUrl.includes('a04-admin-token-sample')).toBe(false)
      expect(lowerUrl.includes('a04-customer-body-sample')).toBe(false)
    }
  })
})
