/**
 * 企业菜单入口 preset 传递（plan §13.1/§13.3）纯函数测试。
 * 合同：query 参数只表达 UI 状态，服务端强制重验；前端只负责如实传递。
 */
import { describe, expect, it } from 'bun:test'
import {
  ENTERPRISE_PRESET,
  buildEnterpriseScopeParams,
  enterpriseScopeHint,
  isEnterprisePreset,
} from './preset'

describe('isEnterprisePreset', () => {
  it('仅接受字面量 enterprise', () => {
    expect(isEnterprisePreset(ENTERPRISE_PRESET)).toBe(true)
    expect(isEnterprisePreset('enterprise')).toBe(true)
    expect(isEnterprisePreset('')).toBe(false)
    expect(isEnterprisePreset(undefined)).toBe(false)
    expect(isEnterprisePreset(null)).toBe(false)
    expect(isEnterprisePreset('Enterprise')).toBe(false)
    expect(isEnterprisePreset('personal')).toBe(false)
  })
})

describe('buildEnterpriseScopeParams', () => {
  it('空状态返回空对象（运营中心全局语义：零额外参数）', () => {
    expect(buildEnterpriseScopeParams({})).toEqual({})
    expect(
      buildEnterpriseScopeParams({ preset: '', organization_id: '', workspace_id: '' })
    ).toEqual({})
  })

  it('enterprise preset 原样透传', () => {
    expect(
      buildEnterpriseScopeParams({ preset: 'enterprise', organization_id: '', workspace_id: '' })
    ).toEqual({ preset: 'enterprise' })
  })

  it('非法 preset 值不透传（不伪造企业语境）', () => {
    expect(buildEnterpriseScopeParams({ preset: 'global' })).toEqual({})
    expect(buildEnterpriseScopeParams({ preset: 'Enterprise' })).toEqual({})
  })

  it('organization_id / workspace_id trim 后作为 EntityId 透传（保持 string）', () => {
    const params = buildEnterpriseScopeParams({
      preset: 'enterprise',
      organization_id: ' 114255223532554240 ',
      workspace_id: '114255223532554241',
    })
    expect(params).toEqual({
      preset: 'enterprise',
      organization_id: '114255223532554240',
      workspace_id: '114255223532554241',
    })
    // 64-bit TSID 不得被数值化（safeParseBigIntJson/EntityId 约定）
    expect(typeof params.organization_id).toBe('string')
    expect(typeof params.workspace_id).toBe('string')
  })

  it('仅 organization_id 也透传（服务端无条件窄化，与 preset 无关）', () => {
    expect(buildEnterpriseScopeParams({ preset: '', organization_id: '9001' })).toEqual({
      organization_id: '9001',
    })
  })

  it('null 视为缺省', () => {
    expect(
      buildEnterpriseScopeParams({ preset: null, organization_id: null, workspace_id: null })
    ).toEqual({})
  })
})

describe('enterpriseScopeHint', () => {
  it('groups/channels 提示语义与服务端强制谓词一致', () => {
    expect(enterpriseScopeHint('groups')).toContain('scope=workspace')
    expect(enterpriseScopeHint('groups')).toContain('个人群不可见')
    expect(enterpriseScopeHint('channels')).toContain('status=1')
    expect(enterpriseScopeHint('channels')).toContain('个人频道不可见')
  })
})
