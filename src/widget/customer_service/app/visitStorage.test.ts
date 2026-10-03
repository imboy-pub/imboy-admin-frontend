/**
 * FE-W01：visit 恢复存储（installation 作用域 subject + TTL + 清理）单元测试。
 *
 * 覆盖验收点（FE-W01-A05）：
 * - 安装作用域键隔离（不同 org/widget 互不可见）；
 * - TTL 过期不可恢复且条目被清除；
 * - 显式清理（拒绝 consent / 吊销 / 退出）；
 * - JWT 形状绝不落盘（access/refresh JWT 禁入）；
 * - 损坏数据 fail-closed（清除并返回 null）。
 */
import { describe, expect, it } from 'bun:test'
import {
  clearVisitSubject,
  loadVisitSubject,
  looksLikeJwt,
  saveVisitSubject,
  subjectStorageKey,
  type StorageLike,
} from './visitStorage'

function memoryStorage(): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map.entries()),
  }
}

const SCOPE = { widgetId: '72057594037928001' }
const OTHER_SCOPE = { widgetId: '72057594037928009' }

describe('visitStorage（安装作用域 + TTL + 清理）', () => {
  it('保存后可恢复同一 installation 的匿名 subject；不同 installation 键隔离', () => {
    const storage = memoryStorage()
    saveVisitSubject(storage, SCOPE, 'subject-abc', 1000)
    expect(loadVisitSubject(storage, SCOPE, 2000)).toBe('subject-abc')
    expect(loadVisitSubject(storage, OTHER_SCOPE, 2000)).toBeNull()
    expect(subjectStorageKey(SCOPE)).toContain('72057594037928001')
  })

  it('TTL 过期后不可恢复，且过期条目被清除', () => {
    const storage = memoryStorage()
    saveVisitSubject(storage, SCOPE, 'subject-abc', 1000, 5000)
    expect(loadVisitSubject(storage, SCOPE, 5999)).toBe('subject-abc')
    expect(loadVisitSubject(storage, SCOPE, 6000)).toBeNull()
    expect(storage.dump()[subjectStorageKey(SCOPE)]).toBeUndefined()
  })

  it('缺省 TTL 为 24 小时（同标签页一天内刷新可接续，产品裁决 2026-10-03）', () => {
    const storage = memoryStorage()
    const now = 1_000_000
    saveVisitSubject(storage, SCOPE, 'subject-abc', now)
    const record = JSON.parse(storage.dump()[subjectStorageKey(SCOPE)]) as { expiresAtMs: number }
    expect(record.expiresAtMs - now).toBe(24 * 60 * 60 * 1000)
    // 23 小时后仍可恢复；25 小时后过期清除
    expect(loadVisitSubject(storage, SCOPE, now + 23 * 60 * 60 * 1000)).toBe('subject-abc')
    expect(loadVisitSubject(storage, SCOPE, now + 25 * 60 * 60 * 1000)).toBeNull()
  })

  it('clearVisitSubject 立即清除（拒绝 consent / 吊销 / 退出路径共用）', () => {
    const storage = memoryStorage()
    saveVisitSubject(storage, SCOPE, 'subject-abc', 1000)
    clearVisitSubject(storage, SCOPE)
    expect(loadVisitSubject(storage, SCOPE, 1001)).toBeNull()
    expect(Object.keys(storage.dump())).toHaveLength(0)
  })

  it('JWT 形状的值绝不落盘（三段 base64url / eyJ 前缀一律拒绝）', () => {
    const storage = memoryStorage()
    expect(looksLikeJwt('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig')).toBe(true)
    expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true)
    expect(looksLikeJwt('subject-anon-01')).toBe(false)
    saveVisitSubject(storage, SCOPE, 'eyJheader.payload.signature', 1000)
    expect(Object.keys(storage.dump())).toHaveLength(0)
    // 篡改存量数据为 JWT 形状 → 读取即清除
    saveVisitSubject(storage, SCOPE, 'subject-ok', 1000)
    storage.setItem(subjectStorageKey(SCOPE), JSON.stringify({ subjectId: 'a.b.c', savedAtMs: 1, expiresAtMs: 9e15 }))
    expect(loadVisitSubject(storage, SCOPE, 2000)).toBeNull()
    expect(storage.dump()[subjectStorageKey(SCOPE)]).toBeUndefined()
  })

  it('损坏/缺字段数据 fail-closed（清除并返回 null）；visit token 等短期状态过期同理', () => {
    const storage = memoryStorage()
    storage.setItem(subjectStorageKey(SCOPE), '{not-json')
    expect(loadVisitSubject(storage, SCOPE, 1000)).toBeNull()
    storage.setItem(subjectStorageKey(SCOPE), JSON.stringify({ subjectId: 's' }))
    expect(loadVisitSubject(storage, SCOPE, 1000)).toBeNull()
    storage.setItem(subjectStorageKey(SCOPE), JSON.stringify({ subjectId: 's', expiresAtMs: 'soon' }))
    expect(loadVisitSubject(storage, SCOPE, 1000)).toBeNull()
    expect(Object.keys(storage.dump())).toHaveLength(0)
  })
})
