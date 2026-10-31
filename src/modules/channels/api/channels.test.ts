/**
 * Unit tests for channels/api/public.ts
 * Covers the key payload functions and normalizeChannel logic.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getChannelListPayload,
  getChannelDetailPayload,
  searchChannelsPayload,
  getChannelMessagesPayload,
  getChannelSubscribersPayload,
  getChannelAdminsPayload,
  getChannelInvitationsPayload,
  getChannelOrdersPayload,
  getChannelStatsPayload,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; put: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const { get: origGet, put: origPut, delete: origDelete } = mutableClient

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.put = origPut
  mutableClient.delete = origDelete
})

// --- normalizeChannel: owner_id falls back to creator_uid ---
describe('getChannelListPayload — 企业入口 preset 透传（plan §13.1）', () => {
  it('enterprise preset + organization_id 原样传给 /channel/list（服务端强制 scope=workspace + status=1）', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/channel/list')
      capturedParams = config?.params
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 },
        },
      }
    }

    await getChannelListPayload({
      page: 1,
      size: 10,
      preset: 'enterprise',
      organization_id: '114255223532554240',
    })
    expect(capturedParams).toMatchObject({
      preset: 'enterprise',
      organization_id: '114255223532554240',
    })
    expect(typeof capturedParams?.organization_id).toBe('string')
  })
})

describe('getChannelListPayload — normalizeChannel', () => {
  it('uses owner_id when present', async () => {
    const raw = {
      id: '1',
      name: 'ch1',
      visibility: 1,
      access_type: 0,
      join_policy: 1,
      owner_id: '100',
      custom_id: null,
      description: null,
      avatar: null,
      subscriber_count: 0,
      status: 1,
      created_at: '',
      updated_at: '',
    }
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [raw], total: 1, page: 1, size: 10 } },
    })
    const result = await getChannelListPayload()
    expect(result.items[0].owner_id).toBe('100')
  })

  it('falls back to creator_uid when owner_id is null/undefined', async () => {
    const raw = {
      id: '2',
      name: 'ch2',
      visibility: 1,
      access_type: 0,
      join_policy: 1,
      owner_id: null,
      creator_uid: '999',
      custom_id: null,
      description: null,
      avatar: null,
      subscriber_count: 0,
      status: 1,
      created_at: '',
      updated_at: '',
    }
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [raw], total: 1, page: 1, size: 10 } },
    })
    const result = await getChannelListPayload()
    expect(result.items[0].owner_id).toBe('999')
  })

  it('handles empty items array', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
    })
    const result = await getChannelListPayload()
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('passes params to /channel/list', async () => {
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/channel/list')
      const params = (config as { params: Record<string, unknown> }).params
      expect(params.page).toBe(2)
      expect(params.size).toBe(20)
      return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 2, size: 20 } } }
    }
    await getChannelListPayload({ page: 2, size: 20 })
  })
})

describe('getChannelDetailPayload', () => {
  it('calls /channel/detail/:id and normalizes result', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(url).toBe('/channel/detail/ch-001')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: 'ch-001',
            name: 'Test',
            visibility: 1,
            access_type: 0,
            join_policy: 1,
            owner_id: '10',
            custom_id: null,
            description: null,
            avatar: null,
            subscriber_count: 5,
            status: 1,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
          },
        },
      }
    }
    const result = await getChannelDetailPayload('ch-001')
    expect(result.id).toBe('ch-001')
    expect(result.name).toBe('Test')
  })
})

describe('searchChannelsPayload', () => {
  it('calls /channel/search with keyword', async () => {
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/channel/search')
      expect((config as { params: { keyword: string } }).params.keyword).toBe('news')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { items: [], total: 0, page: 1, size: 10 },
        },
      }
    }
    const result = await searchChannelsPayload({ keyword: 'news' })
    expect(result.items).toEqual([])
  })
})

describe('getChannelMessagesPayload', () => {
  it('calls /channel/:id/messages', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(url).toBe('/channel/ch-1/messages')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { items: [], total: 0, page: 1, size: 10 },
        },
      }
    }
    const result = await getChannelMessagesPayload('ch-1')
    expect(result.items).toEqual([])
  })
})

describe('getChannelSubscribersPayload', () => {
  it('calls /channel/:id/subscribers', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(String(url)).toContain('subscribers')
      return {
        data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
      }
    }
    const result = await getChannelSubscribersPayload('ch-1')
    expect(result.items).toEqual([])
  })
})

describe('getChannelAdminsPayload', () => {
  it('calls /channel/:id/admins', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(String(url)).toContain('admin')
      return {
        data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
      }
    }
    const result = await getChannelAdminsPayload('ch-1')
    expect(result.items).toEqual([])
  })
})

describe('getChannelInvitationsPayload', () => {
  it('calls /channel/:id/invitations', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(String(url)).toContain('invitation')
      return {
        data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
      }
    }
    const result = await getChannelInvitationsPayload('ch-1')
    expect(result.items).toEqual([])
  })
})

describe('getChannelOrdersPayload', () => {
  it('calls /channel/:id/orders', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(String(url)).toContain('order')
      return {
        data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
      }
    }
    const result = await getChannelOrdersPayload('ch-1')
    expect(result.items).toEqual([])
  })
})

describe('getChannelStatsPayload', () => {
  it('calls /channel/:id/stats', async () => {
    const stats = {
      channel_id: 'ch-1',
      subscriber_count: 100,
      total_messages: 500,
      total_views: 2000,
      total_reactions: 300,
    }
    mutableClient.get = async (url: unknown) => {
      expect(String(url)).toContain('stat')
      return { data: { code: 0, msg: 'ok', payload: stats } }
    }
    const result = await getChannelStatsPayload('ch-1')
    expect(result.subscriber_count).toBe(100)
    expect(result.total_messages).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// J27.a（plan §9）：仅验证前端旧参数透传及 envelope 适配，不验证后端搜索。
// /channel/list 不读取 keyword；关键词搜索由 /channel/search 处理。
// ---------------------------------------------------------------------------
describe('J27.a — 频道旧参数透传与分页响应适配（plan §9）', () => {
  it('旧 page,size,status,keyword 参数原样透传、{list,...} 旧 envelope 归一零变化', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/channel/list')
      capturedParams = config?.params
      // 旧后端 envelope：list + total_page（无 items/total_pages）
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [
              {
                id: 'c-1', name: '公告频道', visibility: 1, access_type: 0, join_policy: 1,
                owner_id: '10', custom_id: null, description: null, avatar: null,
                subscriber_count: 3, status: 1, created_at: '', updated_at: '',
              },
            ],
            page: 2, size: 10, total: 11, total_page: 2,
          },
        },
      }
    }

    const result = await getChannelListPayload({ page: 2, size: 10, status: 1, keyword: '公告' })

    // 旧 ADM 参数逐字段原样透传，不新增 pagination=cursor / 新合同 query
    expect(capturedParams).toEqual({ page: 2, size: 10, status: 1, keyword: '公告' })
    expect(capturedParams).not.toHaveProperty('cursor')
    expect(capturedParams).not.toHaveProperty('pagination')
    // envelope 归一零变化，行数据经 normalizeChannel 语义不变
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('c-1')
    expect(result.items[0].owner_id).toBe('10')
    expect(result.page).toBe(2)
    expect(result.total).toBe(11)
    expect(result.total_pages).toBe(2)
  })

  it('无参调用保持旧默认 {page:1,size:10}', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      capturedParams = config?.params
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { list: [], page: 1, size: 10, total: 0, total_page: 0 },
        },
      }
    }

    await getChannelListPayload()
    expect(capturedParams).toEqual({ page: 1, size: 10 })
  })

  it('searchChannelsPayload 仅携带 keyword 时旧 envelope 零变化', async () => {
    let capturedParams: Record<string, unknown> | undefined
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/channel/search')
      capturedParams = config?.params
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { list: [], page: 1, size: 10, total: 0, total_page: 0 },
        },
      }
    }

    const result = await searchChannelsPayload({ keyword: 'news' })
    expect(capturedParams).toEqual({ keyword: 'news' })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.total_pages).toBe(0)
  })
})
