/**
 * Unit tests for the paid-channel operations money-path:
 *   - setChannelPrice: PUT URL + fen body field passthrough (price_fen/original_price_fen)
 *   - getChannelOrdersPayload: pagination envelope parsing
 *   - yuanToFen / fenToYuan: 元 ↔ 分 conversion used by SetChannelPriceDialog
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { setChannelPrice, getChannelOrdersPayload } from './public'
import { yuanToFen, fenToYuan } from '@/lib/money'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; put: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get
const origPut = mutableClient.put

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.put = origPut
})

// ---------------------------------------------------------------------------
// setChannelPrice — money-path (fen body fields)
// ---------------------------------------------------------------------------

describe('setChannelPrice', () => {
  it('sends PUT to /channel/:id/price with fen body fields', async () => {
    let capturedUrl: unknown
    let capturedBody: unknown
    mutableClient.put = async (url: unknown, body: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await setChannelPrice('ch-100', {
      price_fen: 990,
      original_price_fen: 1990,
      currency: 'CNY',
      subscription_type: 2,
      description: '含全部往期',
    })

    expect(capturedUrl).toBe('/channel/ch-100/price')
    const body = capturedBody as {
      price_fen: number
      original_price_fen: number
      currency: string
      subscription_type: number
      description: string
    }
    expect(body.price_fen).toBe(990)
    expect(body.original_price_fen).toBe(1990)
    expect(body.currency).toBe('CNY')
    expect(body.subscription_type).toBe(2)
    expect(body.description).toBe('含全部往期')
  })

  it('resolves with response envelope on success', async () => {
    mutableClient.put = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const result = await setChannelPrice('ch-1', { price_fen: 100 })
    expect(result.code).toBe(0)
  })

  it('uses yuanToFen output as price_fen (form 元 → 分)', async () => {
    let capturedBody: unknown
    mutableClient.put = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    // 用户在表单输入 9.90 元 → 990 分
    await setChannelPrice('ch-2', { price_fen: yuanToFen('9.90') })
    expect((capturedBody as { price_fen: number }).price_fen).toBe(990)
  })
})

// ---------------------------------------------------------------------------
// getChannelOrdersPayload — pagination envelope parsing
// ---------------------------------------------------------------------------

describe('getChannelOrdersPayload', () => {
  const rawOrder = {
    id: '700001',
    channel_id: '100',
    user_id: '52278',
    order_no: 'ORD-20260622-001',
    amount: '9.90',
    currency: 'CNY',
    status: 1,
    payment_method: 'alipay',
    payment_at: '2026-06-22 10:00:00',
    subscription_start_at: '2026-06-22 10:00:00',
    subscription_end_at: '2026-07-22 10:00:00',
    created_at: '2026-06-22 09:59:00',
  }

  it('parses paginated orders payload', async () => {
    mutableClient.get = async (url: unknown) => {
      expect(url).toBe('/channel/ch-9/orders')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { items: [rawOrder], page: 1, size: 10, total: 1, total_pages: 1 },
        },
      }
    }

    const result = await getChannelOrdersPayload('ch-9', { page: 1, size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].order_no).toBe('ORD-20260622-001')
    expect(result.page).toBe(1)
    expect(result.total).toBe(1)
  })

  it('forwards page/size query params', async () => {
    let capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: unknown, config?: { params?: Record<string, unknown> }) => {
      capturedParams = config?.params ?? {}
      return {
        data: { code: 0, msg: 'ok', payload: { items: [], page: 2, size: 5, total: 0, total_pages: 0 } },
      }
    }

    await getChannelOrdersPayload('ch-1', { page: 2, size: 5 })
    expect(capturedParams.page).toBe(2)
    expect(capturedParams.size).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// money helpers — load-bearing 元 ↔ 分 conversion
// ---------------------------------------------------------------------------

describe('money conversion (元 ↔ 分)', () => {
  it('yuanToFen converts decimal 元 string to 分 integer', () => {
    expect(yuanToFen('9.90')).toBe(990)
    expect(yuanToFen('19.99')).toBe(1999)
    expect(yuanToFen('1')).toBe(100)
    expect(yuanToFen('0')).toBe(0)
  })

  it('fenToYuan formats 分 integer to ¥ 元 string', () => {
    expect(fenToYuan(990)).toBe('¥9.90')
    expect(fenToYuan(0)).toBe('¥0.00')
    expect(fenToYuan(100)).toBe('¥1.00')
  })

  it('round-trips 元 → 分 → 元 without drift', () => {
    const fen = yuanToFen('123.45')
    expect(fen).toBe(12345)
    expect(fenToYuan(fen)).toBe('¥123.45')
  })
})
