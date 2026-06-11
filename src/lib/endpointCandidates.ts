import { getErrorMessage } from './errorUtils'

export function normalizeEndpoint(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function buildEndpointCandidates(rawEnv: unknown, defaults: string[]): string[] {
  const configured = typeof rawEnv === 'string'
    ? rawEnv.split(',').map(normalizeEndpoint).filter((s) => s.length > 0)
    : []
  const normalizedDefaults = defaults.map(normalizeEndpoint).filter((s) => s.length > 0)
  return Array.from(new Set([...configured, ...normalizedDefaults]))
}

export function isEndpointUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as Record<string, unknown>
  const code = Number(e.code)
  if (Number.isFinite(code) && (code === 404 || code === 405 || code === 501)) return true
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('method not allowed') ||
    message.includes('endpoint unavailable') ||
    message.includes('invalid url')
  )
}

/** Generic fallback loop. Tries each endpoint in order; moves on if isEndpointUnavailable. */
export async function tryWithFallback<T>(
  endpoints: string[],
  attempt: (_ep: string) => Promise<T>,
  debugLabel?: string
): Promise<T> {
  let lastError: unknown = new Error('No endpoint candidates configured')
  for (const endpoint of endpoints) {
    try {
      return await attempt(endpoint)
    } catch (error) {
      lastError = error
      if (isEndpointUnavailable(error)) {
        if (import.meta.env.DEV && debugLabel) {
          console.warn(`${debugLabel} ${endpoint} unavailable, trying next candidate:`, getErrorMessage(error))
        }
        continue
      }
      throw error
    }
  }
  throw lastError
}

/** PUT-with-POST-fallback loop for same-endpoint method negotiation. */
export async function tryPutWithPostFallback<T>(
  endpoints: string[],
  putAttempt: (_ep: string) => Promise<T>,
  postAttempt: (_ep: string) => Promise<T>,
  debugLabel?: string
): Promise<T> {
  let lastError: unknown = new Error('No endpoint candidates configured')
  for (const endpoint of endpoints) {
    try {
      return await putAttempt(endpoint)
    } catch (putError) {
      if (!isEndpointUnavailable(putError)) throw putError
      lastError = putError
      if (import.meta.env.DEV && debugLabel) {
        console.warn(`${debugLabel} PUT ${endpoint} unavailable, falling back to POST:`, getErrorMessage(putError))
      }
      try {
        return await postAttempt(endpoint)
      } catch (postError) {
        lastError = postError
        if (isEndpointUnavailable(postError)) {
          if (import.meta.env.DEV && debugLabel) {
            console.warn(`${debugLabel} POST ${endpoint} also unavailable, trying next candidate:`, getErrorMessage(postError))
          }
          continue
        }
        throw postError
      }
    }
  }
  throw lastError
}
