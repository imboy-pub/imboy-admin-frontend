/**
 * useColumnState 单测（ENT-FND-01 列持久化）：
 *   - 纯函数：默认可见性计算 / 存储清洗（损坏 JSON、未知列、全隐藏守卫）；
 *   - hook round-trip：toggle → localStorage 落盘 → 重新挂载读取；
 *     resetColumns 清条目回默认；最后一列不可隐藏。
 */
import '../test/setupDom'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act, renderHook } from '@testing-library/react'
import {
  computeDefaultColumnVisibility,
  sanitizeStoredColumnVisibility,
  useColumnState,
} from './useColumnState'

const COLUMN_IDS = ['userId', 'nickname', 'role', 'actions'] as const
const STORAGE_KEY = 'test-columns'
const FULL_STORAGE_KEY = `imboy_admin_column_state:${STORAGE_KEY}`

beforeEach(() => {
  globalThis.localStorage?.clear()
})

afterEach(() => {
  globalThis.localStorage?.clear()
})

describe('computeDefaultColumnVisibility', () => {
  it('默认全部可见', () => {
    expect(computeDefaultColumnVisibility(COLUMN_IDS)).toEqual({
      userId: true,
      nickname: true,
      role: true,
      actions: true,
    })
  })

  it('defaultHidden 指定的列默认隐藏', () => {
    expect(computeDefaultColumnVisibility(COLUMN_IDS, ['nickname', 'role'])).toEqual({
      userId: true,
      nickname: false,
      role: false,
      actions: true,
    })
  })
})

describe('sanitizeStoredColumnVisibility', () => {
  it('丢弃未知列 id（列 schema 演进容错）', () => {
    const sanitized = sanitizeStoredColumnVisibility(
      { userId: false, legacyColumn: false, nickname: true, role: true, actions: true },
      COLUMN_IDS
    )
    expect(sanitized).toEqual({ userId: false, nickname: true, role: true, actions: true })
    expect('legacyColumn' in sanitized).toBe(false)
  })

  it('新增列（存储缺失键）按默认可见补齐', () => {
    const sanitized = sanitizeStoredColumnVisibility({ userId: false }, COLUMN_IDS)
    expect(sanitized).toEqual({ userId: false, nickname: true, role: true, actions: true })
  })

  it('非对象输入（损坏 JSON 解析结果）回退默认', () => {
    expect(sanitizeStoredColumnVisibility('garbage', COLUMN_IDS)).toEqual(
      computeDefaultColumnVisibility(COLUMN_IDS)
    )
    expect(sanitizeStoredColumnVisibility(null, COLUMN_IDS)).toEqual(
      computeDefaultColumnVisibility(COLUMN_IDS)
    )
    expect(sanitizeStoredColumnVisibility([1, 2], COLUMN_IDS)).toEqual(
      computeDefaultColumnVisibility(COLUMN_IDS)
    )
  })

  it('单列值非法按该列默认处理，不整体作废', () => {
    const sanitized = sanitizeStoredColumnVisibility(
      { userId: 'yes', nickname: false, role: true, actions: true },
      COLUMN_IDS
    )
    expect(sanitized).toEqual({ userId: true, nickname: false, role: true, actions: true })
  })

  it('全隐藏守卫：存储值会藏掉全部列时回退默认', () => {
    expect(sanitizeStoredColumnVisibility(
      { userId: false, nickname: false, role: false, actions: false },
      COLUMN_IDS
    )).toEqual(computeDefaultColumnVisibility(COLUMN_IDS))
  })
})

describe('useColumnState — 持久化 round-trip', () => {
  it('无存储时返回全可见默认，不写存储', () => {
    const { result } = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    expect(result.current.isColumnVisible('userId')).toBe(true)
    expect(result.current.visibleColumnCount).toBe(COLUMN_IDS.length)
    expect(globalThis.localStorage?.getItem(FULL_STORAGE_KEY)).toBeNull()
  })

  it('toggleColumn 落盘 localStorage，新挂载读取同一份状态（round-trip）', () => {
    const first = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    act(() => first.result.current.toggleColumn('nickname'))
    act(() => first.result.current.toggleColumn('role'))
    expect(first.result.current.isColumnVisible('nickname')).toBe(false)
    expect(first.result.current.isColumnVisible('role')).toBe(false)

    const stored = globalThis.localStorage?.getItem(FULL_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored as string)).toEqual({
      userId: true,
      nickname: false,
      role: false,
      actions: true,
    })

    first.unmount()
    // 模拟刷新页面：重新挂载读取持久化状态
    const second = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    expect(second.result.current.isColumnVisible('nickname')).toBe(false)
    expect(second.result.current.isColumnVisible('role')).toBe(false)
    expect(second.result.current.visibleColumnCount).toBe(2)
  })

  it('resetColumns 清除存储条目并回到默认', () => {
    const { result } = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    act(() => result.current.toggleColumn('userId'))
    act(() => result.current.toggleColumn('nickname'))
    expect(globalThis.localStorage?.getItem(FULL_STORAGE_KEY)).toBeTruthy()

    act(() => result.current.resetColumns())
    expect(result.current.visibleColumnCount).toBe(COLUMN_IDS.length)
    expect(globalThis.localStorage?.getItem(FULL_STORAGE_KEY)).toBeNull()

    // reset 后再挂载：读到默认（而非残留）
    const next = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    expect(next.result.current.visibleColumnCount).toBe(COLUMN_IDS.length)
  })

  it('最后一列守卫：不允许通过 toggle 把全部列藏掉', () => {
    const { result } = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    act(() => result.current.toggleColumn('userId'))
    act(() => result.current.toggleColumn('nickname'))
    act(() => result.current.toggleColumn('role'))
    expect(result.current.visibleColumnCount).toBe(1)
    // 藏掉最后一列 actions：被守卫拒绝，状态与存储都不变
    act(() => result.current.toggleColumn('actions'))
    expect(result.current.visibleColumnCount).toBe(1)
    expect(result.current.isColumnVisible('actions')).toBe(true)
    expect(JSON.parse(globalThis.localStorage?.getItem(FULL_STORAGE_KEY) as string)).toEqual({
      userId: false,
      nickname: false,
      role: false,
      actions: true,
    })
  })

  it('存储中损坏 JSON 回退默认且不抛错', () => {
    globalThis.localStorage?.setItem(FULL_STORAGE_KEY, '{not-json')
    const { result } = renderHook(() =>
      useColumnState({ storageKey: STORAGE_KEY, columnIds: COLUMN_IDS })
    )
    expect(result.current.visibleColumnCount).toBe(COLUMN_IDS.length)
  })

  it('defaultHidden 生效并参与持久化 round-trip', () => {
    const second = renderHook(() =>
      useColumnState({ storageKey: 'hidden-cols', columnIds: COLUMN_IDS, defaultHidden: ['nickname'] })
    )
    expect(second.result.current.isColumnVisible('nickname')).toBe(false)
    expect(second.result.current.visibleColumnCount).toBe(COLUMN_IDS.length - 1)
    // 打开后持久化
    act(() => second.result.current.toggleColumn('nickname'))
    expect(second.result.current.isColumnVisible('nickname')).toBe(true)
    second.unmount()
    const third = renderHook(() =>
      useColumnState({ storageKey: 'hidden-cols', columnIds: COLUMN_IDS, defaultHidden: ['nickname'] })
    )
    expect(third.result.current.isColumnVisible('nickname')).toBe(true)
  })
})
