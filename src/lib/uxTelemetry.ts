export type UxEventName =
  | 'ux_filter_apply'
  | 'ux_saved_view_use'
  | 'ux_batch_action_execute'
  | 'ux_drawer_open'
  | 'ux_command_palette_execute'
  | 'ux_destructive_action_confirmed'
  | 'ux_destructive_action_undone'
  | string

export type UxEventPayload = Record<string, unknown>

export const UX_EVENT_DISPATCH = 'imboy:ux-event'
const UX_EVENT_SESSION_KEY = 'imboy.ux.session_id'

let eventSequence = 0
let fallbackSessionId = ''

function createSessionId(): string {
  return `ux_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function resolveSessionId(): string {
  if (typeof window === 'undefined') return ''

  try {
    const cached = window.sessionStorage.getItem(UX_EVENT_SESSION_KEY)
    if (cached && cached.trim().length > 0) return cached

    const created = createSessionId()
    window.sessionStorage.setItem(UX_EVENT_SESSION_KEY, created)
    return created
  } catch {
    if (!fallbackSessionId) {
      fallbackSessionId = createSessionId()
    }
    return fallbackSessionId
  }
}

function enrichPayload(payload: UxEventPayload): UxEventPayload {
  if (typeof window === 'undefined') return payload

  const incomingMeta = payload.__meta && typeof payload.__meta === 'object'
    ? payload.__meta as Record<string, unknown>
    : {}

  return {
    ...payload,
    __meta: {
      ...incomingMeta,
      session_id: resolveSessionId(),
      seq: ++eventSequence,
      path: window.location.pathname,
      query: window.location.search,
      hash: window.location.hash,
    },
  }
}

export function trackUxEvent(event: UxEventName, payload: UxEventPayload = {}) {
  if (typeof window === 'undefined') return

  const detail = {
    event,
    payload: enrichPayload(payload),
    timestamp: new Date().toISOString(),
  }

  try {
    window.dispatchEvent(new CustomEvent(UX_EVENT_DISPATCH, { detail }))
  } catch {
    // Ignore event dispatch failures to avoid affecting core flows.
  }

  try {
    if (typeof window.__IMBOY_UX_TRACK__ === 'function') {
      window.__IMBOY_UX_TRACK__(event, payload)
    }
  } catch {
    // Ignore external telemetry failures.
  }
}
