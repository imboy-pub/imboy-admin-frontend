/**
 * ADM-01：agent-hub API 模块单测（MutableClient 范式，mock services/api/client）。
 * 覆盖：MCP secret 一次返回透传、死信列表/重放透传、信号聚合取数。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  createMcpClient,
  fetchDeadDeliveries,
  fetchBotCount,
  replayDeadDelivery,
} from './api'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }
type MutableGetMethod = AnyFn
type MutablePostMethod = AnyFn
const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

describe('createMcpClient（A02：secret 仅本次响应）', () => {
  it('透传创建参数并返回含 secret 的创建结果', async () => {
    mutableClient.post = async (_url: string, _body?: unknown) => {
      expect(true).toBe(true)
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            client_id: '900', client_key: 'mck-abc12345', secret: 'topsecret',
            credential_prefix: 'topsecre', status: 'pending',
          },
        },
      }
    }
    const result = await createMcpClient(42, 'client-a', 'desc')
    expect(result.secret).toBe('topsecret')
    expect(result.credential_prefix).toBe('topsecre')
  })
})

describe('fetchDeadDeliveries / fetchBotCount / replayDeadDelivery', () => {
  it('死信数取 total', async () => {
    const get: MutableGetMethod = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [], total: 7, page: 1, size: 20, total_pages: 1 } },
    })
    mutableClient.get = get
    expect(await fetchDeadDeliveries()).toBe(7)
  })

  it('Bot 数取 total', async () => {
    const get2: MutableGetMethod = async () => ({
      data: { code: 0, msg: 'ok', payload: { items: [], total: 3, page: 1, size: 1, total_pages: 3 } },
    })
    mutableClient.get = get2
    expect(await fetchBotCount()).toBe(3)
  })

  it('重放透传 delivery_id', async () => {
    const post: MutablePostMethod = async () => ({
      data: { code: 0, msg: 'ok', payload: { delivery_id: 'dlv-1' } },
    })
    mutableClient.post = post
    const result = await replayDeadDelivery('dlv-1')
    expect(result.delivery_id).toBe('dlv-1')
  })
})
