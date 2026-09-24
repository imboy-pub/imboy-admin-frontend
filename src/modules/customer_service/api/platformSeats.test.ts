/**
 * 平台运营面坐席分页（跨企业）API 单元测试。
 *
 * 覆盖验收点：
 * - 只调 `/customer-service/seats`（client baseURL 即 /api/adm），任何路径不得
 *   出现 `/api/v1`；
 * - 查询串：organization_id 可选过滤（缺失=全局，不下发空串）、after_id 游标、
 *   limit 钳制 1..200；
 * - TSID 全程 string（19 位大数不丢精度）；
 * - 响应整包解析 {seats, next_after_id}。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { getPlatformSeats } from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

function captureGets(payload: unknown) {
  const calls: Array<{ url: string; params: Record<string, unknown> }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    calls.push({
      url: String(url),
      params: ((config as { params?: Record<string, unknown> })?.params ?? {}) as Record<string, unknown>,
    })
    return { data: { code: 0, msg: 'success', payload } }
  }
  return calls
}

const ORG = '114022088375011328'
const BIG_TSID = '1942412345678901234'

describe('getPlatformSeats', () => {
  it('跨企业视图：不带 organization_id，携带 after_id/limit', async () => {
    const calls = captureGets({ seats: [], next_after_id: null })
    await getPlatformSeats({ afterId: BIG_TSID, limit: 10 })
    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe('/customer-service/seats')
    expect(calls[0].params).toEqual({ after_id: BIG_TSID, limit: 10 })
  })

  it('org 过滤视图：organization_id 以 string 直传（19 位大数不丢精度）', async () => {
    const calls = captureGets({
      seats: [
        {
          organization_id: ORG,
          organization_name: 'IMBoy',
          display_name: 'imboy',
          business_identity_id: BIG_TSID,
          function_key: 'customer_service',
          enabled: true,
          max_concurrent: 3,
          active_count: 0,
          workspace_id: ORG,
        },
      ],
      next_after_id: null,
    })
    const page = await getPlatformSeats({ organizationId: ORG, limit: 10 })
    expect(calls[0].params.organization_id).toBe(ORG)
    expect(page.seats.length).toBe(1)
    expect(page.seats[0]?.organization_id).toBe(ORG)
    expect(page.seats[0]?.business_identity_id).toBe(BIG_TSID)
    expect(page.seats[0]?.organization_name).toBe('IMBoy')
  })

  it('limit 钳制到 1..200；非法 after_id 不下发', async () => {
    const calls = captureGets({ seats: [], next_after_id: null })
    await getPlatformSeats({ limit: 500 })
    expect(calls[0].params.limit).toBe(200)
    await getPlatformSeats({ afterId: null, limit: 10 })
    expect('after_id' in calls[1].params).toBe(false)
    expect('organization_id' in calls[1].params).toBe(false)
  })
})
