/**
 * Unit tests for messages module API:
 *   messages/api/public — getMessageListPayload, getMessageDetailPayload
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { getMessageListPayload, getMessageDetailPayload } from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

describe('getMessageListPayload', () => {
  it('calls GET /message/list with params and returns paginated payload', async () => {
    let capturedUrl = ''
    let capturedParams: unknown = null
    mutableClient.get = async (url: string, config?: { params?: unknown }) => {
      capturedUrl = url
      capturedParams = config?.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [{ msg_id: 'msg-1', content: 'hello', msg_scope: 'c2c' }],
            page: 1,
            size: 20,
            total: 1,
          },
        },
      }
    }

    const result = await getMessageListPayload({ page: 1, size: 20, msg_scope: 'c2c' })
    expect(capturedUrl).toBe('/message/list')
    expect((capturedParams as Record<string, unknown>).msg_scope).toBe('c2c')
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('throws when response has no payload field', async () => {
    mutableClient.get = async () => ({
      data: { code: 500, msg: '内部错误' },
    })

    await expect(getMessageListPayload({})).rejects.toThrow('Missing payload')
  })
})

describe('getMessageDetailPayload', () => {
  it('calls GET /message/detail with msg_id and msg_scope params', async () => {
    let capturedParams: unknown = null
    mutableClient.get = async (_url: string, config?: { params?: unknown }) => {
      capturedParams = config?.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { msg_id: 'msg-42', content: 'test message', msg_scope: 'c2g' },
        },
      }
    }

    const result = await getMessageDetailPayload('msg-42', 'c2g')
    expect((capturedParams as Record<string, unknown>).msg_id).toBe('msg-42')
    expect((capturedParams as Record<string, unknown>).msg_scope).toBe('c2g')
    expect(result.msg_id).toBe('msg-42')
  })

  it('defaults msg_scope to "all" when not provided', async () => {
    let capturedParams: unknown = null
    mutableClient.get = async (_url: string, config?: { params?: unknown }) => {
      capturedParams = config?.params
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { msg_id: 'msg-1', content: 'hi', msg_scope: 'all' },
        },
      }
    }

    await getMessageDetailPayload('msg-1')
    expect((capturedParams as Record<string, unknown>).msg_scope).toBe('all')
  })

  it('throws when response has no payload field', async () => {
    mutableClient.get = async () => ({
      data: { code: 404, msg: '消息不存在' },
    })

    await expect(getMessageDetailPayload('missing-id')).rejects.toThrow('Missing payload')
  })
})
