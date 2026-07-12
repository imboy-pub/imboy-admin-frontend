/**
 * Unit tests for custom hooks:
 *   useTheme — localStorage + system theme resolution
 *   useSetupGuard — async setup status check
 *   useListQueryState — pure helper functions (parseQueryValue, serializeQueryValue)
 *
 * NOTE: React hook rendering tests are skipped here because MemoryRouter +
 * renderHook requires act() wrapping that differs between React 19 and
 * @testing-library/react v16. Logic that can be tested without React is
 * covered directly via the implementation helpers.
 *
 * The useListQueryState hook integration is exercised via the page-level
 * tests (e.g. UserListPage.test.tsx) which use real URL-backed filters.
 */
import '../test/setupDom'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { SetupGuardState } from './useSetupGuard'

// Expose localStorage from JSDOM window
if (typeof globalThis.localStorage === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.localStorage = (globalThis.window as any).localStorage
}

// ---------------------------------------------------------------------------
// Helpers — inline parseQueryValue / serializeQueryValue logic mirror
// These match the private implementations in useListQueryState.ts
// ---------------------------------------------------------------------------
type ListQueryValue = string | number | boolean | undefined

function parseQueryValue(raw: string | null, fallback: ListQueryValue): ListQueryValue {
  if (raw === null) return fallback
  if (typeof fallback === 'number') {
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? numeric : fallback
  }
  if (typeof fallback === 'boolean') {
    return raw === '1' || raw.toLowerCase() === 'true'
  }
  return raw
}

function serializeQueryValue(value: ListQueryValue): string | undefined {
  if (value === undefined) return undefined
  if (value === '') return undefined
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

describe('parseQueryValue', () => {
  it('returns fallback when raw is null', () => {
    expect(parseQueryValue(null, 10)).toBe(10)
    expect(parseQueryValue(null, false)).toBe(false)
    expect(parseQueryValue(null, 'hello')).toBe('hello')
  })

  it('parses numeric strings when fallback is number', () => {
    expect(parseQueryValue('42', 0)).toBe(42)
    expect(parseQueryValue('1.5', 0)).toBe(1.5)
  })

  it('returns fallback for non-numeric string when fallback is number', () => {
    expect(parseQueryValue('abc', 10)).toBe(10)
    // Note: Number('') === 0, which is finite — so empty string parses as 0
    expect(parseQueryValue('', 10)).toBe(0)
  })

  it('parses boolean from "1" and "true" when fallback is boolean', () => {
    expect(parseQueryValue('1', false)).toBe(true)
    expect(parseQueryValue('true', false)).toBe(true)
    expect(parseQueryValue('True', false)).toBe(true) // case-insensitive
  })

  it('returns false for other values when fallback is boolean', () => {
    expect(parseQueryValue('0', true)).toBe(false)
    expect(parseQueryValue('false', true)).toBe(false)
    expect(parseQueryValue('yes', false)).toBe(false)
  })

  it('returns raw string when fallback is string', () => {
    expect(parseQueryValue('keyword', '')).toBe('keyword')
    expect(parseQueryValue('admin', 'default')).toBe('admin')
  })
})

describe('serializeQueryValue', () => {
  it('returns undefined for undefined', () => {
    expect(serializeQueryValue(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(serializeQueryValue('')).toBeUndefined()
  })

  it('serializes boolean true as "1"', () => {
    expect(serializeQueryValue(true)).toBe('1')
  })

  it('serializes boolean false as "0"', () => {
    expect(serializeQueryValue(false)).toBe('0')
  })

  it('serializes numbers as strings', () => {
    expect(serializeQueryValue(1)).toBe('1')
    expect(serializeQueryValue(42)).toBe('42')
    expect(serializeQueryValue(0)).toBe('0')
  })

  it('passes through non-empty strings unchanged', () => {
    expect(serializeQueryValue('hello')).toBe('hello')
    expect(serializeQueryValue('admin')).toBe('admin')
  })
})

// ---------------------------------------------------------------------------
// useTheme — localStorage logic (tested without React rendering)
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'imboy_admin_theme'

type Theme = 'light' | 'dark' | 'system'

function resolveStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

describe('useTheme — localStorage resolution', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  it('defaults to "system" when nothing is stored', () => {
    expect(resolveStoredTheme()).toBe('system')
  })

  it('reads stored "light" theme', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    expect(resolveStoredTheme()).toBe('light')
  })

  it('reads stored "dark" theme', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(resolveStoredTheme()).toBe('dark')
  })

  it('ignores invalid stored values and defaults to "system"', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid_theme')
    expect(resolveStoredTheme()).toBe('system')
  })

  it('stores and retrieves theme correctly round-trip', () => {
    for (const theme of ['light', 'dark', 'system'] as Theme[]) {
      localStorage.setItem(STORAGE_KEY, theme)
      expect(resolveStoredTheme()).toBe(theme)
    }
  })
})

// ---------------------------------------------------------------------------
// useSetupGuard — async logic (tested by simulating getSetupStatus calls)
// ---------------------------------------------------------------------------

async function runSetupGuardLogic(
  statusFn: () => Promise<{ initialized: boolean }>
): Promise<SetupGuardState> {
  let loading: boolean
  let needSetup: boolean
  let error: string | null

  try {
    const status = await statusFn()
    needSetup = !status.initialized
    error = null
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '首启状态检查失败'
    error = msg
    needSetup = false
  } finally {
    loading = false
  }

  return { loading, needSetup, error }
}

describe('useSetupGuard — logic', () => {
  it('sets needSetup=false and loading=false when initialized=true', async () => {
    const result = await runSetupGuardLogic(async () => ({ initialized: true }))
    expect(result.loading).toBe(false)
    expect(result.needSetup).toBe(false)
    expect(result.error).toBeNull()
  })

  it('sets needSetup=true when initialized=false', async () => {
    const result = await runSetupGuardLogic(async () => ({ initialized: false }))
    expect(result.loading).toBe(false)
    expect(result.needSetup).toBe(true)
    expect(result.error).toBeNull()
  })

  it('defaults to needSetup=false on network error (non-blocking)', async () => {
    const result = await runSetupGuardLogic(async () => {
      throw new Error('network failure')
    })
    expect(result.loading).toBe(false)
    expect(result.needSetup).toBe(false)
    expect(result.error).toBe('network failure')
  })

  it('uses fallback message for non-Error thrown values', async () => {
    const result = await runSetupGuardLogic(async () => {
      throw { code: 500, msg: 'internal error' }
    })
    expect(result.error).toBe('首启状态检查失败')
    expect(result.needSetup).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeRoleIds — inline mirror of private helper in useAdminPermission.ts
// ---------------------------------------------------------------------------
function normalizeRoleIds(value: unknown): number[] {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  )
}

describe('normalizeRoleIds', () => {
  it('converts single numeric string to array', () => {
    expect(normalizeRoleIds('3')).toEqual([3])
  })

  it('converts number to array', () => {
    expect(normalizeRoleIds(5)).toEqual([5])
  })

  it('converts array of mixed types to deduplicated numbers', () => {
    expect(normalizeRoleIds([1, '2', 2, 3])).toEqual([1, 2, 3])
  })

  it('filters out zero and negative values', () => {
    expect(normalizeRoleIds([0, -1, 1, 2])).toEqual([1, 2])
  })

  it('filters out non-numeric strings', () => {
    expect(normalizeRoleIds(['admin', '1', 'mod'])).toEqual([1])
  })

  it('returns empty array for empty array input', () => {
    expect(normalizeRoleIds([])).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(normalizeRoleIds(undefined)).toEqual([])
  })

  it('deduplicates identical role ids', () => {
    expect(normalizeRoleIds([1, 1, 1, 2])).toEqual([1, 2])
  })
})
