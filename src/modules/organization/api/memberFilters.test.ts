/**
 * 成员复合筛选纯函数单测（ENT-ADM-01）：role AND keyword 交集语义、
 * 大小写不敏感包含匹配（昵称 / 账号 / 用户 TSID / 邀请人 TSID）、
 * 激活判定与 URL role 值归一化。adm 合同 members 端点无服务端筛选参数，
 * 该内核由页面在「聚合拉取 + 客户端筛选」模式消费。
 */
import { describe, expect, it } from 'bun:test'
import { toOrganizationMemberRow } from './pureFunctions'
import {
  asMemberRoleFilter,
  filterMemberRows,
  isMemberFilterActive,
  memberMatchesKeyword,
} from './memberFilters'

describe('成员复合筛选 filterMemberRows（ENT-ADM-01）', () => {
  const member = (overrides: Record<string, unknown>) =>
    toOrganizationMemberRow({
      organization_id: 'o1',
      user_id: '6600000000000000001',
      role: 'member',
      status: 'active',
      invited_by: '7700000000000000001',
      joined_at: '2026-09-01T10:00:00Z',
      nickname: '白鹭',
      account: 'Egret_Account',
      ...overrides,
    })
  const rows = [
    member({ user_id: '111', nickname: '白鹭', account: 'egret', role: 'member' }),
    member({ user_id: '222', nickname: '夜鸦', account: 'crow', role: 'admin', invited_by: '999' }),
    member({ user_id: '333', nickname: '苍鹭', account: 'heron', role: 'owner' }),
  ]

  it('默认筛选（all + 空关键词）不丢行、保持服务端目录序', () => {
    const result = filterMemberRows(rows, { role: 'all', keyword: '' })
    expect(result.map((row) => row.userId)).toEqual(['111', '222', '333'])
  })

  it('角色维度精确匹配（admin 档）', () => {
    const result = filterMemberRows(rows, { role: 'admin', keyword: '' })
    expect(result.map((row) => row.userId)).toEqual(['222'])
  })

  it('关键词命中昵称 / 账号（大小写不敏感）/ 用户 TSID / 邀请人 TSID', () => {
    expect(filterMemberRows(rows, { role: 'all', keyword: '鹭' }).map((r) => r.userId)).toEqual(['111', '333'])
    expect(filterMemberRows(rows, { role: 'all', keyword: 'CROW' }).map((r) => r.userId)).toEqual(['222'])
    expect(filterMemberRows(rows, { role: 'all', keyword: '333' }).map((r) => r.userId)).toEqual(['333'])
    expect(filterMemberRows(rows, { role: 'all', keyword: '999' }).map((r) => r.userId)).toEqual(['222'])
  })

  it('多条件组合（交集）：role=member AND keyword=白；组合无匹配返回空数组', () => {
    expect(filterMemberRows(rows, { role: 'member', keyword: '白' }).map((r) => r.userId)).toEqual(['111'])
    expect(filterMemberRows(rows, { role: 'admin', keyword: '白' })).toHaveLength(0)
    expect(filterMemberRows(rows, { role: 'owner', keyword: 'crow' })).toHaveLength(0)
  })

  it('memberMatchesKeyword：空关键词恒匹配；isMemberFilterActive / asMemberRoleFilter 归一化', () => {
    expect(memberMatchesKeyword(rows[0]!, '')).toBe(true)
    expect(memberMatchesKeyword(rows[0]!, '   ')).toBe(true)
    expect(isMemberFilterActive({ role: 'all', keyword: '' })).toBe(false)
    expect(isMemberFilterActive({ role: 'all', keyword: '  ' })).toBe(false)
    expect(isMemberFilterActive({ role: 'owner', keyword: '' })).toBe(true)
    expect(isMemberFilterActive({ role: 'all', keyword: '白' })).toBe(true)
    expect(asMemberRoleFilter('admin')).toBe('admin')
    expect(asMemberRoleFilter('bogus')).toBe('all')
  })
})
