import { ApiResponse } from '@/types/api'

function normalizeLegacyPagination<T>(payload: T | undefined): T | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }

  const raw = payload as Record<string, unknown>
  const list = raw.list
  const hasItems = Array.isArray(raw.items)

  if (!Array.isArray(list) || hasItems) {
    return payload
  }

  const normalized: Record<string, unknown> = {
    ...raw,
    items: list,
  }

  const total = raw.total
  const size = raw.size
  if (
    typeof normalized.total_pages !== 'number' &&
    typeof total === 'number' &&
    typeof size === 'number' &&
    size > 0
  ) {
    normalized.total_pages = Math.ceil(total / size)
  }

  return normalized as T
}

/**
 * Read envelope payload from canonical backend field.
 */
export function getApiPayload<T>(raw?: ApiResponse<T> | null): T | undefined {
  return normalizeLegacyPagination(raw?.payload)
}

/**
 * Require payload from response envelope.
 * Throws to surface contract regressions in query/mutation call chains.
 */
export function requireApiPayload<T>(raw?: ApiResponse<T> | null, context = 'api'): T {
  const payload = getApiPayload(raw)
  if (payload === undefined) {
    throw new Error(`Missing payload in API response (${context})`)
  }
  return payload
}
