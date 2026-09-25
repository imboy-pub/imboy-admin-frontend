import { describe, expect, test } from 'bun:test'
import { renderHook } from '@testing-library/react'
import '../test/setupDom'
import { zhCN, type I18nKey } from './zh-CN'
import { t, useI18n } from './index'

/** ENT-UX-01 冻结术语键：8 个核心企业术语 + 平台侧补充。 */
const FROZEN_TERMS: ReadonlyArray<[I18nKey, string]> = [
  ['ent.term.organization', '组织'],
  ['ent.term.member', '成员'],
  ['ent.term.department', '部门'],
  ['ent.term.group', '群组'],
  ['ent.term.channel', '频道'],
  ['ent.term.invitation', '邀请'],
  ['ent.term.governance', '治理'],
  ['ent.term.customerService', '客服'],
  ['ent.term.enterprise', '企业'],
  ['ent.term.workspace', '工作区'],
  ['ent.term.seat', '客服坐席'],
  ['ent.term.session', '会话'],
  ['ent.term.provisioning', '开通'],
]

describe('i18n zh-CN 键表完整性（ENT-UX-01 / T-P2-1）', () => {
  test('键表非空且键为受控命名空间（ent.* / cs.*）', () => {
    const keys = Object.keys(zhCN)
    expect(keys.length).toBeGreaterThanOrEqual(100)
    for (const key of keys) {
      expect(key.startsWith('ent.') || key.startsWith('cs.')).toBe(true)
    }
  })

  test('所有键值均为非空字符串（无缺失键 / 空占位）', () => {
    for (const [key, value] of Object.entries(zhCN)) {
      expect(typeof value === 'string' && value.trim().length > 0, `键 ${key} 值为空`).toBe(true)
    }
  })

  test('键表无重复键（对象字面量后写覆盖前写会被 as const 吞掉，逐键核对长度）', () => {
    const literalKeys = Object.keys(zhCN)
    const uniqueKeys = new Set(literalKeys)
    expect(uniqueKeys.size).toBe(literalKeys.length)
  })

  test('冻结术语 8+5 全部落键且值无同义漂移', () => {
    for (const [key, expected] of FROZEN_TERMS) {
      expect(zhCN[key]).toBe(expected)
    }
  })

  test('术语键值不混入禁用同义词（机构/团队/空间/公司）', () => {
    const forbidden = ['机构', '团队', '空间', '公司']
    for (const [key, value] of Object.entries(zhCN)) {
      if (!key.startsWith('ent.term.')) continue
      for (const word of forbidden) {
        expect(value.includes(word), `术语键 ${key} 混入禁用同义词「${word}」`).toBe(false)
      }
    }
  })
})

describe('t() 插值与纯函数行为', () => {
  test('无参数时原样返回键值', () => {
    expect(t('ent.orgList.pageTitle')).toBe('组织治理')
  })

  test('单参数插值', () => {
    expect(t('ent.orgList.noPermissionDescription', { permission: 'organizations:read' })).toBe(
      '进入组织治理面板需要 organizations:read 权限。'
    )
  })

  test('多参数插值（含中文标点上下文）', () => {
    expect(
      t('ent.orgList.archiveTitle', { name: 'IMBoy' })
    ).toBe('归档组织「IMBoy」')
  })

  test('缺参占位符保留原样（暴露漏传而不是静默吞掉）', () => {
    expect(t('cs.home.loadError', {})).toBe('加载客服坐席失败：{message}')
  })

  test('多余参数被忽略', () => {
    expect(t('cs.home.pageTitle', { unused: 1 })).toBe('在线客服坐席')
  })
})

describe('useI18n hook', () => {
  test('hook 返回的 t 与纯函数 t 行为一致', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.t('cs.home.addSeat')).toBe(t('cs.home.addSeat'))
    expect(result.current.t('cs.home.loadError', { message: 'boom' })).toBe(
      '加载客服坐席失败：boom'
    )
  })
})
