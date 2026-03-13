import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type ListQueryValue = string | number | boolean | undefined

type ListQueryState = Record<string, ListQueryValue>

type SetListQueryStateOptions = {
  replace?: boolean
}

type UseListQueryStateReturn<T extends ListQueryState> = {
  state: T
  setState: (
    patch: Partial<T> | ((prev: T) => Partial<T>),
    options?: SetListQueryStateOptions
  ) => void
  resetState: (overrides?: Partial<T>, options?: SetListQueryStateOptions) => void
}

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

export function useListQueryState<T extends ListQueryState>(
  defaults: T
): UseListQueryStateReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams()

  const keys = useMemo(
    () => Object.keys(defaults) as Array<keyof T>,
    [defaults]
  )

  const state = useMemo(() => {
    const next: Partial<T> = {}
    for (const key of keys) {
      const fallback = defaults[key]
      const raw = searchParams.get(String(key))
      next[key] = parseQueryValue(raw, fallback) as T[typeof key]
    }
    return next as T
  }, [defaults, keys, searchParams])

  const applyState = (nextState: T, options?: SetListQueryStateOptions) => {
    const nextSearchParams = new URLSearchParams(searchParams)

    for (const key of keys) {
      const serialized = serializeQueryValue(nextState[key])
      if (serialized === undefined) {
        nextSearchParams.delete(String(key))
      } else {
        nextSearchParams.set(String(key), serialized)
      }
    }

    setSearchParams(nextSearchParams, { replace: options?.replace ?? true })
  }

  const setState: UseListQueryStateReturn<T>['setState'] = (patch, options) => {
    const partial = typeof patch === 'function' ? patch(state) : patch
    const nextState = {
      ...state,
      ...partial,
    } as T

    applyState(nextState, options)
  }

  const resetState: UseListQueryStateReturn<T>['resetState'] = (overrides, options) => {
    const nextState = {
      ...defaults,
      ...(overrides || {}),
    } as T

    applyState(nextState, options)
  }

  return {
    state,
    setState,
    resetState,
  }
}

