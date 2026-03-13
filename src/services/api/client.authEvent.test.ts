import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { AUTH_EXPIRED_EVENT, emitAuthExpired } from './client'

describe('emitAuthExpired', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent

  beforeEach(() => {
    if (typeof CustomEvent === 'undefined') {
      class PolyfillCustomEvent<T = unknown> extends Event {
        detail: T
        constructor(type: string, init?: CustomEventInit<T>) {
          super(type)
          this.detail = init?.detail as T
        }
      }
      ;(globalThis as { CustomEvent?: unknown }).CustomEvent = PolyfillCustomEvent
    }
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
    ;(globalThis as { CustomEvent?: unknown }).CustomEvent = originalCustomEvent
  })

  it('dispatches auth-expired event when window is available', () => {
    const dispatched: string[] = []
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type)
        return true
      },
    }

    emitAuthExpired()

    expect(dispatched).toContain(AUTH_EXPIRED_EVENT)
  })
})
