/**
 * SEAT-01：seat-contexts 投影与 fail-closed 选路单测（A04/A05）。
 */
import { describe, expect, it } from 'bun:test'
import { selectActiveSeatContexts, toSeatContexts } from './seatContexts'
import { isSeatApiError } from './errors'

const VALID_CONTEXT = {
  organization_id: '9223372036854775807',
  organization_name: '客服组织',
  workspaces: [{ id: '9876543210987654321', name: '商城工作区' }],
  business_identity_id: '1111111111111111111',
  seat_enabled: true,
  capabilities: ['conversation.read', 'conversation.write', 'message.write', 'asset.read', 'asset.write'],
}

describe('toSeatContexts（A05 TSID string 投影）', () => {
  it('标准 payload → 全 TSID string 强类型投影', () => {
    const result = toSeatContexts({ user_id: '8888888888888888888', contexts: [VALID_CONTEXT] })
    expect(result.userId).toBe('8888888888888888888')
    expect(result.contexts).toHaveLength(1)
    const ctx = result.contexts[0]
    expect(ctx?.organizationId).toBe('9223372036854775807')
    expect(ctx?.workspaces[0]?.id).toBe('9876543210987654321')
    expect(ctx?.businessIdentityId).toBe('1111111111111111111')
    expect(ctx?.seatEnabled).toBe(true)
    expect(ctx?.capabilities).toHaveLength(5)
  })

  it('线缆 JSON integer 形状（精度保护后已是 string）同样可投影', () => {
    // 模拟经 parseSeatJson 后的形状：TSID 已是 string
    const result = toSeatContexts({ user_id: '42', contexts: [] })
    expect(result.userId).toBe('42')
    expect(result.contexts).toEqual([])
  })

  it('未知 capability 键 fail-closed 丢弃，不放大权限', () => {
    const result = toSeatContexts({
      user_id: '1',
      contexts: [{ ...VALID_CONTEXT, capabilities: ['conversation.read', 'platform.admin'] }],
    })
    expect(result.contexts[0]?.capabilities).toEqual(['conversation.read'])
  })

  it('DF-7：seatless 组织行（business_identity_id=null, seat_enabled=false）与正常行混合 → 解析不抛，active 选路只含启用行', () => {
    // 后端 /cs/me/seat-contexts 按 organization_member 逐组织发行：
    // 未开坐席的组织行 business_identity_id=null、seat_enabled=false、capabilities=[]。
    const seatlessRow = {
      organization_id: '9223372036854775000',
      organization_name: '未开坐席的组织',
      workspaces: [{ id: '9876543210987654000', name: '普通工作区' }],
      business_identity_id: null,
      seat_enabled: false,
      capabilities: [],
    }
    let thrown: unknown = null
    let result: ReturnType<typeof toSeatContexts> | null = null
    try {
      result = toSeatContexts({ user_id: '1', contexts: [seatlessRow, VALID_CONTEXT] })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeNull()
    expect(result).not.toBeNull()
    // seatless 行投影为 businessIdentityId=null，不整体 invalid_response。
    expect(result?.contexts).toHaveLength(2)
    expect(result?.contexts[0]?.businessIdentityId).toBeNull()
    expect(result?.contexts[0]?.seatEnabled).toBe(false)
    expect(result?.contexts[0]?.capabilities).toEqual([])
    // A04 过滤语义不变：停用/seatless 行被剔除，仅启用行进入可用上下文。
    const active = selectActiveSeatContexts(result!)
    expect(active).toHaveLength(1)
    expect(active[0]?.organizationId).toBe(VALID_CONTEXT.organization_id)
  })

  it('缺字段/形状非法 → 整体 invalid_response（不部分采纳）', () => {
    const bad = (payload: unknown): void => {
      let thrown: unknown = null
      try {
        toSeatContexts(payload)
      } catch (error) {
        thrown = error
      }
      expect(isSeatApiError(thrown)).toBe(true)
      expect((thrown as { kind: string }).kind).toBe('invalid_response')
    }
    bad(null)
    bad({})
    bad({ user_id: '1' })
    bad({ user_id: 'not-tsid', contexts: [] })
    bad({ user_id: '1', contexts: 'nope' })
    bad({ user_id: '1', contexts: [{ ...VALID_CONTEXT, organization_id: 'oops' }] })
    bad({ user_id: '1', contexts: [{ ...VALID_CONTEXT, workspaces: [{ id: '1' }] }] })
    bad({ user_id: '1', contexts: [{ ...VALID_CONTEXT, organization_name: '' }] })
  })
})

describe('A04 fail-closed（disabled seat / 无 assignment / 非成员）', () => {
  it('seat_enabled=false → capabilities 空集且被 selectActiveSeatContexts 剔除', () => {
    const result = toSeatContexts({
      user_id: '1',
      contexts: [{ ...VALID_CONTEXT, seat_enabled: false, capabilities: [] }],
    })
    expect(result.contexts[0]?.seatEnabled).toBe(false)
    expect(result.contexts[0]?.capabilities).toEqual([])
    expect(selectActiveSeatContexts(result)).toEqual([])
  })

  it('workspaces 空（无 assignment）→ 被剔除', () => {
    const result = toSeatContexts({ user_id: '1', contexts: [{ ...VALID_CONTEXT, workspaces: [] }] })
    expect(selectActiveSeatContexts(result)).toEqual([])
  })

  it('非成员（组织行根本不出现在 contexts）→ 空选路', () => {
    const result = toSeatContexts({ user_id: '1', contexts: [] })
    expect(selectActiveSeatContexts(result)).toEqual([])
  })

  it('enabled + 有 workspace → 保留', () => {
    const result = toSeatContexts({ user_id: '1', contexts: [VALID_CONTEXT] })
    expect(selectActiveSeatContexts(result)).toHaveLength(1)
  })
})
