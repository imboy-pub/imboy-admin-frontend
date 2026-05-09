import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  getAnnouncementList,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  type AnnouncementFormData,
} from './announcements'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
})

const announcementFixture = {
  id: '1',
  adm_user_id: '10',
  title: '系统维护通知',
  body: '今晚 22:00 进行系统维护',
  type: 'warning' as const,
  status: 1 as const,
  pinned: 1,
  published_at: '2026-04-10 10:00:00',
  expired_at: null,
  created_at: '2026-04-10 09:00:00',
  updated_at: null,
}

describe('getAnnouncementList', () => {
  it('returns paginated response with items from payload.list', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/announcement/index')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [announcementFixture],
            page: 1, size: 10, total: 1,
          },
        },
      }
    }

    const result = await getAnnouncementList()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('系统维护通知')
    expect(result.page).toBe(1)
    expect(result.total).toBe(1)
    expect(result.total_pages).toBe(1)
  })

  it('forwards filter params to API', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { list: [], page: 2, size: 5, total: 0 },
        },
      }
    }

    await getAnnouncementList({ page: 2, size: 5, status: 1, type: 'warning', keyword: 'test' })
    expect(capturedParams.page).toBe(2)
    expect(capturedParams.size).toBe(5)
    expect(capturedParams.status).toBe(1)
    expect(capturedParams.type).toBe('warning')
    expect(capturedParams.keyword).toBe('test')
  })

  it('returns total_pages: 1 when total is 0 (avoid division by zero)', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { list: [], page: 1, size: 10, total: 0 } },
    })

    const result = await getAnnouncementList()
    expect(result.total_pages).toBe(1)
  })

  it('throws when API returns error code', async () => {
    mutableClient.get = async () => ({
      data: { code: 1001, msg: '未授权', payload: null },
    })

    await expect(getAnnouncementList()).rejects.toBeTruthy()
  })
})

describe('createAnnouncement', () => {
  it('sends POST to /announcement/create and returns id', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (_url: string, body: Record<string, unknown>) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: '42' } } }
    }

    const formData: AnnouncementFormData = {
      title: '新公告',
      body: '公告内容',
      type: 'info',
      pinned: 0,
    }

    const result = await createAnnouncement(formData)
    expect(result.id).toBe('42')
    expect(capturedBody.title).toBe('新公告')
    expect(capturedBody.type).toBe('info')
  })
})

describe('updateAnnouncement', () => {
  it('sends PUT to /announcement/update with id merged into body', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/announcement/update')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: '1' } } }
    }

    await updateAnnouncement('1', { title: '更新标题' })
    expect(capturedBody.id).toBe('1')
    expect(capturedBody.title).toBe('更新标题')
  })
})

describe('deleteAnnouncement', () => {
  it('sends POST to /announcement/delete with id', async () => {
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/announcement/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: '5' } } }
    }

    const result = await deleteAnnouncement('5')
    expect(result.id).toBe('5')
    expect(capturedBody.id).toBe('5')
  })
})

describe('publishAnnouncement / unpublishAnnouncement', () => {
  it('publishAnnouncement sends POST to /announcement/publish', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> = {}

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: '3' } } }
    }

    const result = await publishAnnouncement('3')
    expect(capturedUrl).toBe('/announcement/publish')
    expect(capturedBody.id).toBe('3')
    expect(result.id).toBe('3')
  })

  it('unpublishAnnouncement sends POST to /announcement/unpublish', async () => {
    let capturedUrl = ''

    mutableClient.post = async (url: string, _body: Record<string, unknown>) => {
      capturedUrl = url
      return { data: { code: 0, msg: 'ok', payload: { id: '3' } } }
    }

    await unpublishAnnouncement('3')
    expect(capturedUrl).toBe('/announcement/unpublish')
  })
})
