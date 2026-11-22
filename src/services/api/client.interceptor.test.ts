import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { AxiosError } from 'axios'
import client, { AUTH_EXPIRED_EVENT, handleUnauthorizedStatus, toApiError } from './client'
import { useAuthStore } from '@/stores/authStore'

describe('client unauthorized handling', () => {
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

  it('emits auth-expired event on 401', () => {
    const dispatched: string[] = []
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type)
        return true
      },
    }

    const handled = handleUnauthorizedStatus(401)

    expect(handled).toBeTrue()
    expect(dispatched).toContain(AUTH_EXPIRED_EVENT)
  })

  it('returns false for non-401 status', () => {
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: () => true,
    }
    expect(handleUnauthorizedStatus(500)).toBeFalse()
    expect(handleUnauthorizedStatus(undefined)).toBeFalse()
  })

  it('broadcasts a 401 only for the session that started the request', async () => {
    const dispatched: string[] = []
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type)
        return true
      },
    }
    const baseEpoch = useAuthStore.getState().authEpoch
    try {
      const started = Promise.withResolvers<void>()
      const finish = Promise.withResolvers<void>()
      const pending = client.get('/current', {
        adapter: async (config) => {
          started.resolve()
          await finish.promise
          throw new AxiosError('Unauthorized', undefined, config, undefined, {
            data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config,
          })
        },
      })
      const result = pending.catch((error: unknown) => error)
      await started.promise
      useAuthStore.setState({ authEpoch: baseEpoch + 1 })
      finish.resolve()
      expect(await result).toMatchObject({ code: 401 })
      expect(dispatched).not.toContain(AUTH_EXPIRED_EVENT)

      await expect(client.get('/current', {
        adapter: async (config) => {
          throw new AxiosError('Unauthorized', undefined, config, undefined, {
            data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config,
          })
        },
      })).rejects.toMatchObject({ code: 401 })
      expect(dispatched).toContain(AUTH_EXPIRED_EVENT)
    } finally {
      useAuthStore.setState({ authEpoch: baseEpoch })
    }
  })
})

describe('toApiError', () => {
  it('prefers backend code and msg when present', () => {
    const apiError = toApiError({
      response: {
        status: 400,
        data: {
          code: 1234,
          msg: 'bad request',
        },
      } as never,
      message: 'network',
    })
    expect(apiError.code).toBe(1234)
    expect(apiError.msg).toBe('bad request')
  })

  it('falls back to http status or generic message', () => {
    const apiError = toApiError({
      response: {
        status: 502,
        data: {} as never,
      } as never,
      message: '',
    })
    expect(apiError.code).toBe(502)
    expect(apiError.msg).toBe('服务器错误，请稍后重试')
  })
})
