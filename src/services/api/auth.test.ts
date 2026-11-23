import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getCurrentAdminPayload, loginPayload, logout, normalizeLoginMeta } from '@/modules/identity/api/auth'
import { useAuthStore } from '@/stores/authStore'
import client from './client'

describe('normalizeLoginMeta', () => {
  it('fills defaults when fields are missing', () => {
    const normalized = normalizeLoginMeta({})
    expect(normalized.csrf_token).toBe('')
    expect(normalized.public_key).toBe('')
    expect(normalized.system_name).toBe('Imboy Admin')
  })

  it('keeps server-provided values', () => {
    const normalized = normalizeLoginMeta({
      csrf_token: 'csrf_1',
      public_key: 'PUBLIC_KEY',
      system_name: 'IMBoy Admin System',
    })
    expect(normalized.csrf_token).toBe('csrf_1')
    expect(normalized.public_key).toBe('PUBLIC_KEY')
    expect(normalized.system_name).toBe('IMBoy Admin System')
  })
})

describe('Admin cookie mutation ordering', () => {
  type MockPost = (_url: string, _body?: unknown, _config?: { signal?: AbortSignal }) => Promise<unknown>
  type MockGet = (_url: string, _config?: { signal?: AbortSignal }) => Promise<unknown>
  const mutableClient = client as unknown as { post: MockPost; get: MockGet }
  const originalPost = mutableClient.post
  const originalGet = mutableClient.get
  const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
  const loginInput = { account: 'admin', pwd: 'ciphertext', captcha: 'captcha', csrf_token: 'csrf' }
  const loginResponse = { data: { code: 0, payload: { id: '1', account: 'admin' } } }

  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    mutableClient.get = async () => loginResponse
  })

  afterEach(() => {
    mutableClient.post = originalPost
    mutableClient.get = originalGet
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
    else Reflect.deleteProperty(navigator, 'locks')
  })

  it('lets a dispatched login settle before sending the next logout', async () => {
    const response = Promise.withResolvers<unknown>()
    const started = Promise.withResolvers<void>()
    const paths: string[] = []
    mutableClient.post = (url, _body, config) => {
      paths.push(url)
      if (url.endsWith('/do_login')) {
        expect(config?.signal).toBeUndefined()
        started.resolve()
        return response.promise
      }
      return Promise.resolve({ data: { code: 0 } })
    }

    const controller = new AbortController()
    const login = loginPayload(loginInput, controller.signal).catch((error: unknown) => error)
    await started.promise
    controller.abort()
    const endSession = logout()
    useAuthStore.getState().logout()
    await Promise.resolve()
    expect(paths).toEqual(['/passport/do_login'])

    response.resolve(loginResponse)
    expect(await login).toMatchObject({ name: 'AbortError' })
    await endSession
    expect(paths).toEqual(['/passport/do_login', '/passport/logout'])
  })

  it('reads the current session only after a pending logout settles', async () => {
    const response = Promise.withResolvers<unknown>()
    const started = Promise.withResolvers<void>()
    const paths: string[] = []
    mutableClient.post = (url) => {
      paths.push(url)
      started.resolve()
      return response.promise
    }
    mutableClient.get = async (url) => {
      paths.push(url)
      return loginResponse
    }
    const endSession = logout()
    const current = getCurrentAdminPayload()
    await started.promise
    expect(paths).toEqual(['/passport/logout'])
    response.resolve({ data: { code: 0 } })
    await endSession
    await current
    expect(paths).toEqual(['/passport/logout', '/current'])
  })

  it('discards a cancelled queued login and continues processing later requests', async () => {
    const response = Promise.withResolvers<unknown>()
    const paths: string[] = []
    mutableClient.post = async (url) => {
      paths.push(url)
      return url.endsWith('/logout') ? response.promise : loginResponse
    }

    const endSession = logout()
    const controller = new AbortController()
    const cancelled = loginPayload(loginInput, controller.signal).catch((error: unknown) => error)
    controller.abort()
    const next = loginPayload(loginInput)
    response.resolve({ data: { code: 0 } })

    await endSession
    expect(await cancelled).toMatchObject({ name: 'AbortError' })
    expect(await next).toMatchObject({ account: 'admin' })
    expect(paths).toEqual(['/passport/logout', '/passport/do_login'])
  })

  it('uses the same origin lock for both login and logout when available', async () => {
    const names: string[] = []
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: <T,>(name: string, execute: () => Promise<T>) => {
          names.push(name)
          return execute()
        },
      },
    })
    mutableClient.post = async () => loginResponse

    await loginPayload(loginInput)
    await logout()

    expect(names).toEqual(['imboy:admin-auth-cookie', 'imboy:admin-auth-cookie'])
  })

  it('rejects a successful login response if the newly issued session has been revoked', async () => {
    mutableClient.post = async () => loginResponse
    mutableClient.get = async (url) => {
      expect(url).toBe('/current')
      throw { code: 401, msg: '会话已失效' }
    }

    await expect(loginPayload(loginInput)).rejects.toMatchObject({ code: 401 })
  })

  it('rejects login when the verified cookie belongs to another subject', async () => {
    mutableClient.post = async () => loginResponse
    mutableClient.get = async () => ({ data: { code: 0, payload: { id: '2' } } })

    await expect(loginPayload(loginInput)).rejects.toMatchObject({ code: 401 })
  })

  it('rejects a verification that became stale while waiting for current', async () => {
    const verification = Promise.withResolvers<unknown>()
    const started = Promise.withResolvers<void>()
    mutableClient.post = async () => loginResponse
    mutableClient.get = () => {
      started.resolve()
      return verification.promise
    }
    const login = loginPayload(loginInput).catch((error: unknown) => error)

    await started.promise
    useAuthStore.getState().logout()
    verification.resolve(loginResponse)

    expect(await login).toMatchObject({ name: 'AbortError' })
  })

  it('surfaces a failed session read without replaying login and allows an explicit retry', async () => {
    let posts = 0
    mutableClient.post = async () => {
      posts++
      return loginResponse
    }
    const networkError = new Error('Network Error')
    mutableClient.get = async () => { throw networkError }

    await expect(loginPayload(loginInput)).rejects.toBe(networkError)
    expect(posts).toBe(1)

    mutableClient.get = async () => loginResponse
    await expect(loginPayload(loginInput)).resolves.toMatchObject({ id: '1' })
    expect(posts).toBe(2)
  })
})
