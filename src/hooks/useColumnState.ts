/**
 * useColumnState —— 表格列显隐的 localStorage 持久化 hook（ENT-FND-01）。
 *
 * ENT-00 取证结论：全仓无列持久化（唯一列显隐 UI 在 GroupListPage，会话级
 * useState，刷新即丢）。本 hook 补齐该共享能力，语义与 TanStack Table 的
 * ColumnVisibilityState（Record<string, boolean>）兼容：页面把返回的
 * columnVisibility 接进 useLegacyTable 的 state，DataTable 按既有
 * row.getVisibleCells() 渲染，不改 DataTable API。
 *
 * 持久化语义：
 *   - 存储 key = `imboy_admin_column_state:${storageKey}`（对齐既有
 *     imboy_admin_theme / imboy_admin_sidebar_favorites 命名约定）；
 *   - 只持久化已知列（columnIds）的布尔值；加载时丢弃未知键（列 schema
 *     演进后旧存储不致错乱）、缺失键按默认可见补齐（新增列默认可见）；
 *   - 防御：JSON 损坏 / localStorage 不可用（隐私模式、配额）一律静默回退
 *     默认，不抛错不阻塞页面；
 *   - 全隐藏守卫：存储值会把全部已知列都藏掉时回退默认（避免渲染空表格）；
 *   - resetColumns：清掉存储条目并回到默认（列 schema 变更后的逃生门）。
 */
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ColumnVisibilityState } from '@tanstack/react-table'

const STORAGE_KEY_PREFIX = 'imboy_admin_column_state'

export type UseColumnStateOptions = {
  /** 调用方作用域 key（页面级唯一，如 'organization-members'） */
  storageKey: string
  /** 当前列 schema 的全部列 id（存储清洗 + 全隐藏守卫的依据） */
  columnIds: readonly string[]
  /** 默认隐藏的列 id（默认全部可见） */
  defaultHidden?: readonly string[]
}

export type UseColumnStateReturn = {
  columnVisibility: ColumnVisibilityState
  setColumnVisibility: Dispatch<SetStateAction<ColumnVisibilityState>>
  toggleColumn: (_columnId: string) => void
  isColumnVisible: (_columnId: string) => boolean
  /** 清除持久化条目并回到默认列显隐 */
  resetColumns: () => void
  visibleColumnCount: number
  totalColumnCount: number
}

/** 计算 columnIds 的默认可见性（defaultHidden 之外的列可见）。 */
export function computeDefaultColumnVisibility(
  columnIds: readonly string[],
  defaultHidden: readonly string[] = []
): ColumnVisibilityState {
  const hidden = new Set(defaultHidden)
  const next: ColumnVisibilityState = {}
  for (const id of columnIds) {
    next[id] = !hidden.has(id)
  }
  return next
}

/**
 * 清洗存储的原始值：只保留已知列的布尔项；非对象/含非布尔值 → 视为损坏
 * 回退默认；清洗后若全部已知列都被隐藏 → 回退默认（全隐藏守卫）。
 */
export function sanitizeStoredColumnVisibility(
  raw: unknown,
  columnIds: readonly string[],
  defaultHidden: readonly string[] = []
): ColumnVisibilityState {
  const defaults = computeDefaultColumnVisibility(columnIds, defaultHidden)
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults
  }
  const record = raw as Record<string, unknown>
  const sanitized: ColumnVisibilityState = {}
  let visibleCount = 0
  for (const id of columnIds) {
    const value = record[id]
    // 单个列的非法值按默认处理，不整体作废存储
    const visible = typeof value === 'boolean' ? value : defaults[id] === true
    sanitized[id] = visible
    if (visible) visibleCount += 1
  }
  if (visibleCount === 0 && columnIds.length > 0) {
    return defaults
  }
  return sanitized
}

function readStoredVisibility(
  storageKey: string,
  columnIds: readonly string[],
  defaultHidden: readonly string[]
): ColumnVisibilityState {
  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_KEY_PREFIX}:${storageKey}`)
    if (raw == null) {
      return computeDefaultColumnVisibility(columnIds, defaultHidden)
    }
    return sanitizeStoredColumnVisibility(JSON.parse(raw), columnIds, defaultHidden)
  } catch {
    // JSON 损坏或 localStorage 不可用：回退默认，不阻塞页面
    return computeDefaultColumnVisibility(columnIds, defaultHidden)
  }
}

function writeStoredVisibility(storageKey: string, visibility: ColumnVisibilityState): void {
  try {
    globalThis.localStorage?.setItem(`${STORAGE_KEY_PREFIX}:${storageKey}`, JSON.stringify(visibility))
  } catch {
    // 写入失败（隐私模式/配额）：仅失去持久化，会话内仍生效
  }
}

function removeStoredVisibility(storageKey: string): void {
  try {
    globalThis.localStorage?.removeItem(`${STORAGE_KEY_PREFIX}:${storageKey}`)
  } catch {
    // 同上：忽略
  }
}

export function useColumnState(options: UseColumnStateOptions): UseColumnStateReturn {
  const { storageKey, columnIds, defaultHidden = [] } = options

  // columnIds / defaultHidden 由调用方以模块级常量传入（身份稳定）；
  // 懒初始化只读一次存储。
  const [columnVisibility, setColumnVisibilityState] = useState<ColumnVisibilityState>(() =>
    readStoredVisibility(storageKey, columnIds, defaultHidden)
  )

  const setColumnVisibility = useCallback<Dispatch<SetStateAction<ColumnVisibilityState>>>(
    (update) => {
      setColumnVisibilityState((prev) => {
        const next = typeof update === 'function' ? update(prev) : update
        writeStoredVisibility(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibilityState((prev) => {
        const next = { ...prev, [columnId]: !(prev[columnId] === true) }
        // 全隐藏守卫同样约束交互路径：不允许把最后一列藏掉
        if (!Object.values(next).some(Boolean)) {
          return prev
        }
        writeStoredVisibility(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  const resetColumns = useCallback(() => {
    removeStoredVisibility(storageKey)
    setColumnVisibilityState(computeDefaultColumnVisibility(columnIds, defaultHidden))
  }, [storageKey, columnIds, defaultHidden])

  const isColumnVisible = useCallback(
    (columnId: string) => columnVisibility[columnId] === true,
    [columnVisibility]
  )

  const visibleColumnCount = useMemo(
    () => columnIds.filter((id) => columnVisibility[id] === true).length,
    [columnIds, columnVisibility]
  )

  return {
    columnVisibility,
    setColumnVisibility,
    toggleColumn,
    isColumnVisible,
    resetColumns,
    visibleColumnCount,
    totalColumnCount: columnIds.length,
  }
}
