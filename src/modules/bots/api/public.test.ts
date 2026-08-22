// Bot 管理 API 测试（对齐 ai_agent/api/public.test.ts 的 client mock 范式）
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { getBotList, getBotDetail, setBotStatus } from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

const listRow = {
  user_id: '2001',
  name: 'GitHub 通知',
  username: 'github_bot',
  description: 'PR/Issue 通知推送',
  owner_uid: '100',
  nickname: '张三',
  avatar: '',
  is_public: true,
  status: 1,
}

describe('getBotList', () => {
  it('calls /bot/list and normalizes list→items', async () => {
    let capturedUrl = ''
    let capturedParams: unknown
    mutableClient.get = async (url: string, config?: { params?: unknown }) => {
      capturedUrl = url
      capturedParams = config?.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { list: [listRow], page: 1, size: 10, total: 1 },
        },
      }
    }
    const page = await getBotList({ page: 2, size: 20 })
    expect(capturedUrl).toBe('/bot/list')
    expect(capturedParams).toEqual({ page: 2, size: 20 })
    expect(page.total).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.username).toBe('github_bot')
  })

  it('returns empty items on malformed payload', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { page: 1, size: 10, total: 0 } },
    })
    const page = await getBotList()
    expect(page.items).toEqual([])
  })
})

describe('getBotDetail', () => {
  it('parses jsonb string columns to arrays', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/bot/detail')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            ...listRow,
            webhook_url: 'https://example.com/hook',
            commands: '["/pr","/issue"]',
            permissions: '["send:messages"]',
            events: '["message"]',
          },
        },
      }
    }
    const detail = await getBotDetail('2001')
    expect(detail.commands).toEqual(['/pr', '/issue'])
    expect(detail.permissions).toEqual(['send:messages'])
    expect(detail.events).toEqual(['message'])
  })

  it('falls back to empty arrays on malformed jsonb', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: { ...listRow, webhook_url: '', commands: 'not-json', permissions: null, events: undefined },
      },
    })
    const detail = await getBotDetail('2001')
    expect(detail.commands).toEqual([])
    expect(detail.permissions).toEqual([])
    expect(detail.events).toEqual([])
  })
})

describe('setBotStatus', () => {
  it('posts to /bot/enable for status 1', async () => {
    let capturedUrl = ''
    let capturedBody: unknown
    mutableClient.post = async (url: string, body?: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }
    await setBotStatus('2001', 1)
    expect(capturedUrl).toBe('/bot/enable')
    expect(capturedBody).toEqual({ bot_id: '2001' })
  })

  it('posts to /bot/disable for status 0', async () => {
    mutableClient.post = async (url: string) => {
      expect(url).toBe('/bot/disable')
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }
    await setBotStatus('2001', 0)
  })
})
