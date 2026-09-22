/**
 * ADM-01 Admin provisioning client 单元测试（EADM-05 冻结合同对齐）。
 *
 * 覆盖验收点：
 * - 只落 /api/adm 平台面 `POST /customer-service/organizations/:org_id/provisioning`，
 *   绝不出现 /api/v1（Admin Cookie 不隐式换取 tenant owner JWT）；
 * - body 白名单键（workspace_id / user_id / display_name / max_concurrent），
 *   **无 business_identity_id**（漂移根因，已删除）；max_concurrent 必须为 1..20 数值；
 * - 响应投影对齐真实后端字段（organization_id / workspace_id / business_identity_id /
 *   identity_created / seat.{enabled,max_concurrent}）；
 * - 客户端校验（空 ID / 空 display_name / max_concurrent 越域或非数值）fail-closed，不发请求；
 * - 响应缺 business_identity 事实 → 抛错（fail-closed，不伪成功）。
 *
 * ⚠️ 测试替身说明：本文件用手写 axios client mock（unit 层替身，非真实后端）；
 * 真实后端联调由 P1-E2E-01 覆盖。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import { provisionCustomerServiceSeat } from './provisioning'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { post: AnyFn; get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

const ORG_ID = '1234567890123456789'
const WS_ID = '9876543210987654321'
const USER_ID = '111111111111111111'

const SCOPE = {
  organizationId: ORG_ID,
  workspaceId: WS_ID,
  userId: USER_ID,
  displayName: '小客服',
  maxConcurrent: 3,
}

/** 真实后端出站形状（cs_seat_app:provision_seat → cs_pg_seat:finish_provision）。 */
const REAL_PROVISION_PAYLOAD = {
  organization_id: ORG_ID,
  workspace_id: WS_ID,
  business_identity_id: USER_ID,
  identity_created: true,
  seat_enabled: true,
  seat: { enabled: true, max_concurrent: 3 },
}

describe('POST /customer-service/organizations/:org_id/provisioning（EADM-05 冻结合同）', () => {
  it('路径精确落平台面；body 只含白名单键；max_concurrent 为数值且 1..20；无 business_identity_id', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = (url: unknown, body: unknown) => {
      calls.push({ url: String(url), body })
      return {
        data: { code: 0, msg: 'success', payload: REAL_PROVISION_PAYLOAD },
      }
    }
    mutableClient.get = () => {
      throw new Error('provisioning 不应发起 GET')
    }

    const result = await provisionCustomerServiceSeat(SCOPE)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/customer-service/organizations/1234567890123456789/provisioning')
    expect(calls[0]?.url.includes('/api/v1')).toBe(false)
    const keys = Object.keys(calls[0]?.body as Record<string, unknown>).sort()
    expect(keys).toEqual(['display_name', 'max_concurrent', 'user_id', 'workspace_id'])
    // 漂移根因：禁止发送 business_identity_id
    expect((calls[0]?.body as Record<string, unknown>)['business_identity_id']).toBeUndefined()
    // workspace_id / user_id 一律 string（TSID 传输规范），不得裸 number
    expect(typeof (calls[0]?.body as Record<string, unknown>)['workspace_id']).toBe('string')
    expect(typeof (calls[0]?.body as Record<string, unknown>)['user_id']).toBe('string')
    // max_concurrent 必须为 number，且在 1..20 合法域
    const mc = (calls[0]?.body as Record<string, unknown>)['max_concurrent']
    expect(typeof mc).toBe('number')
    expect(mc).toBeGreaterThanOrEqual(1)
    expect(mc).toBeLessThanOrEqual(20)
    expect(mc).toBe(3)
    expect((calls[0]?.body as Record<string, unknown>)['display_name']).toBe('小客服')
    // 响应解析对齐真实字段
    expect(result.business_identity_id).toBe(USER_ID)
    expect(result.identity_created).toBe(true)
    expect(result.seat?.enabled).toBe(true)
    expect(result.seat?.max_concurrent).toBe(3)
  })

  it('幂等命中（已存在）：identity_created=false 透传', async () => {
    mutableClient.post = () => ({
      data: {
        code: 0,
        msg: 'success',
        payload: { ...REAL_PROVISION_PAYLOAD, identity_created: false },
      },
    })
    const result = await provisionCustomerServiceSeat(SCOPE)
    expect(result.identity_created).toBe(false)
  })

  it('响应缺 business_identity 事实 → 抛错（fail-closed，不伪成功）', async () => {
    mutableClient.post = () => ({
      data: {
        code: 0,
        msg: 'success',
        payload: { organization_id: ORG_ID, workspace_id: WS_ID, seat: { enabled: true } },
      },
    })
    expect(provisionCustomerServiceSeat(SCOPE)).rejects.toThrow('provisioning 响应形状非法')
  })

  it('空/非法入参 → 直接抛错且不发请求', async () => {
    let called = false
    mutableClient.post = () => {
      called = true
      return { data: { code: 0, msg: 'success', payload: {} } }
    }
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, organizationId: '  ' })
    ).rejects.toThrow('缺少必填 ID')
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, workspaceId: '' })
    ).rejects.toThrow('缺少必填 ID')
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, userId: '' })
    ).rejects.toThrow('缺少必填 ID')
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, displayName: '   ' })
    ).rejects.toThrow('缺少必填 display_name')
    expect(called).toBe(false)
  })

  it('max_concurrent 越域（0 / 21）或非数值 → 直接抛错且不发请求', async () => {
    let called = false
    mutableClient.post = () => {
      called = true
      return { data: { code: 0, msg: 'success', payload: {} } }
    }
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, maxConcurrent: 0 })
    ).rejects.toThrow('max_concurrent 非法')
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, maxConcurrent: 21 })
    ).rejects.toThrow('max_concurrent 非法')
    expect(
      provisionCustomerServiceSeat({ ...SCOPE, maxConcurrent: 3.5 })
    ).rejects.toThrow('max_concurrent 非法')
    expect(called).toBe(false)
  })
})
