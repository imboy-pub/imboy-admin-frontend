import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import { getCurrentAdminPayload, loginPayload } from './auth'
import { getUserListPayload } from './users'
import { getGroupListPayload } from './groups'
import { resolveMomentReportBatchWithFallback } from './moments'
import {
  deleteChannelMessage,
  getChannelAdminsPayload,
  getChannelDetailPayload,
  getChannelInvitationsPayload,
  getChannelMessagesPayload,
  getChannelOrdersPayload,
  getChannelStatsPayload,
  getChannelSubscribersPayload,
  pinChannelMessage,
  removeChannelAdmin,
  removeChannelSubscriber,
  updateChannelAdminRole,
} from './channels'
import { getFeedbackListPayload } from './feedback'
import { getVersionListPayload } from './versions'
import { getDDLListPayload } from './ddl'
import {
  getGroupStatsPayload,
  getMessageStatsPayload,
  getOverviewStatsPayload,
  getUserStatsPayload,
} from './stats'

type AnyFn = (...args: unknown[]) => unknown
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

    const summary = await resolveMomentReportBatchWithFallback([701, 702], 2, 'batch_note')

    expect(postCalls.length).toBe(1)
    expect(postCalls[0]).toEqual({
      url: '/moment/report/batch_resolve',
      body: {
        report_ids: [701, 702],
        result: 2,
        note: 'batch_note',
      },
    })
    expect(summary).toEqual({
      mode: 'batch',
      total: 2,
      successCount: 1,
      failedCount: 1,
      failedIds: [702],
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
        if (body.report_id === 702) {
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

    const summary = await resolveMomentReportBatchWithFallback([701, 702, 701], 1, 'fallback_note')

    expect(postCalls.map((item) => item.url)).toEqual([
      '/moment/report/batch_resolve',
      '/moment/report/resolve',
      '/moment/report/resolve',
    ])
    expect(postCalls[1]?.body).toEqual({
      report_id: 701,
      result: 1,
      note: 'fallback_note',
    })
    expect(postCalls[2]?.body).toEqual({
      report_id: 702,
      result: 1,
      note: 'fallback_note',
    })
    expect(summary).toEqual({
      mode: 'fallback',
      total: 2,
      successCount: 1,
      failedCount: 1,
      failedIds: [702],
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

  it('getChannelMessagesPayload reads /channel/detail/:id/messages and forwards params', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/messages')
    expect(capturedParams).toEqual({ page: 2, size: 15 })
    expect(payload.page).toBe(2)
    expect(payload.items[0]?.id).toBe(101)
  })

  it('pinChannelMessage sends PUT /channel/detail/:id/message/:message_id/pin', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/message/101/pin')
    expect(capturedBody).toEqual({ pinned: true })
    expect(response.code).toBe(0)
  })

  it('deleteChannelMessage sends DELETE /channel/detail/:id/message/:message_id/delete', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/message/101/delete')
    expect(response.code).toBe(0)
  })

  it('getChannelSubscribersPayload reads /channel/detail/:id/subscribers and forwards params', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/subscribers')
    expect(capturedParams).toEqual({ page: 1, size: 10 })
    expect(payload.items[0]?.id).toBe(1)
  })

  it('removeChannelSubscriber sends DELETE /channel/detail/:id/subscriber/:user_id', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/subscriber/2001')
    expect(response.code).toBe(0)
  })

  it('getChannelAdminsPayload reads /channel/detail/:id/admins and forwards params', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/admins')
    expect(capturedParams).toEqual({ page: 1, size: 10 })
    expect(payload.items[0]?.role).toBe(2)
  })

  it('updateChannelAdminRole sends PUT /channel/detail/:id/admin/:user_id/role', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/admin/3001/role')
    expect(capturedBody).toEqual({ role: 2 })
    expect(response.code).toBe(0)
  })

  it('removeChannelAdmin sends DELETE /channel/detail/:id/admin/:user_id', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/admin/3001')
    expect(response.code).toBe(0)
  })

  it('getChannelInvitationsPayload reads /channel/detail/:id/invitations and forwards params', async () => {
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
            items: [{ id: 11, inviter_uid: 4001, invitee_uid: 4002 }],
            page: 1,
            size: 10,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    const payload = await getChannelInvitationsPayload(8, { page: 1, size: 10 })
    expect(capturedUrl).toBe('/channel/detail/8/invitations')
    expect(capturedParams).toEqual({ page: 1, size: 10 })
    expect(payload.items[0]?.id).toBe(11)
  })

  it('getChannelOrdersPayload reads /channel/detail/:id/orders and forwards params', async () => {
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
            items: [{ id: 21, order_no: 'CH202602220001' }],
            page: 2,
            size: 20,
            total: 41,
            total_pages: 3,
          },
        },
      }
    }

    const payload = await getChannelOrdersPayload(8, { page: 2, size: 20 })
    expect(capturedUrl).toBe('/channel/detail/8/orders')
    expect(capturedParams).toEqual({ page: 2, size: 20 })
    expect(payload.page).toBe(2)
    expect(payload.items[0]?.id).toBe(21)
  })

  it('getChannelStatsPayload reads /channel/detail/:id/stats', async () => {
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
    expect(capturedUrl).toBe('/channel/detail/8/stats')
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
