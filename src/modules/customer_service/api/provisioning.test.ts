/**
 * ADM-01 Admin provisioning client 单元测试。
 *
 * 覆盖验收点：
 * - 只落 /api/adm 平台面 `POST /customer-service/organizations/:org_id/provisioning`，
 *   绝不出现 /api/v1（Admin Cookie 不隐式换取 tenant owner JWT）；
 * - body 白名单键（workspace_id / business_identity_id），无手工 TSID 之外的注入面；
 * - 响应投影 fail-closed。
 *
 * ⚠️ 测试替身说明：本文件用手写 axios client mock（unit 层替身，非真实后端）；
 * provisioning 端到端联调依赖 BE-S01b 交付（DEPENDENT_BACKEND_BS01B），
 * 真实后端验证由 P1-E2E-01 覆盖。
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

const SCOPE = {
  organizationId: '1234567890123456789',
  workspaceId: '9876543210987654321',
  businessIdentityId: '111111111111111111',
}

describe('POST /customer-service/organizations/:org_id/provisioning（A01）', () => {
  it('路径精确落平台面；body 只含白名单键；全程无 /api/v1', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = (url: unknown, body: unknown) => {
      calls.push({ url: String(url), body })
      return {
        data: {
          code: 0,
          msg: 'success',
          payload: {
            organization_id: SCOPE.organizationId,
            workspace_id: SCOPE.workspaceId,
            identity: { id: SCOPE.businessIdentityId },
            assignment: { id: '222222222222222222' },
            seat: { business_identity_id: SCOPE.businessIdentityId, enabled: true, status: 'enabled' },
            repaired: false,
            audit: [
              { action: 'cs_seat.enable', actor: 'adm-1', target: 'seat:1', before: 'f', after: 't' },
            ],
          },
        },
      }
    }
    mutableClient.get = () => {
      throw new Error('provisioning 不应发起 GET')
    }

    const result = await provisionCustomerServiceSeat(SCOPE)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/customer-service/organizations/1234567890123456789/provisioning')
    expect(calls[0]?.url.includes('/api/v1')).toBe(false)
    expect(Object.keys(calls[0]?.body as Record<string, unknown>).sort()).toEqual([
      'business_identity_id',
      'workspace_id',
    ])
    expect(result.identity_id).toBe(SCOPE.businessIdentityId)
    expect(result.audits).toHaveLength(1)
    expect(result.repaired).toBe(false)
  })

  it('幂等修复重放：repaired=true 透传', async () => {
    mutableClient.post = () => ({
      data: {
        code: 0,
        msg: 'success',
        payload: {
          organization_id: SCOPE.organizationId,
          workspace_id: SCOPE.workspaceId,
          identity_id: SCOPE.businessIdentityId,
          seat: { business_identity_id: SCOPE.businessIdentityId, enabled: true },
          repaired: true,
          audit: [],
        },
      },
    })
    const result = await provisionCustomerServiceSeat(SCOPE)
    expect(result.repaired).toBe(true)
  })

  it('响应缺 identity 事实 → 抛错（fail-closed，不伪成功）', async () => {
    mutableClient.post = () => ({
      data: {
        code: 0,
        msg: 'success',
        payload: { organization_id: SCOPE.organizationId, workspace_id: SCOPE.workspaceId },
      },
    })
    expect(provisionCustomerServiceSeat(SCOPE)).rejects.toThrow('provisioning 响应形状非法')
  })

  it('空 ID 入参 → 直接抛错且不发请求', async () => {
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
      provisionCustomerServiceSeat({ ...SCOPE, businessIdentityId: '' })
    ).rejects.toThrow('缺少必填 ID')
    expect(called).toBe(false)
  })
})
