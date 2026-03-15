import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  fetchFeedbackWorkflowConfig,
  saveFeedbackWorkflowConfig,
} from './feedbackWorkflowConfig'

type FetchResponseLike = {
  ok: boolean
  status: number
  headers: {
    get: (_name: string) => string | null
  }
  json: () => Promise<unknown>
}

type StorageLike = {
  getItem: (_key: string) => string | null
  setItem: (_key: string, _value: string) => void
  removeItem: (_key: string) => void
  clear: () => void
}

type WindowLike = {
  localStorage: StorageLike
  sessionStorage: StorageLike
  location: {
    pathname: string
    search: string
    hash: string
  }
}

function createStorage(): StorageLike {
  const map = new Map<string, string>()

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
  }
}

function createWindowMock(): WindowLike {
  return {
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    location: {
      pathname: '/feedback',
      search: '?page=1',
      hash: '',
    },
  }
}

describe('feedbackWorkflowConfig service', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalFetch = (globalThis as { fetch?: unknown }).fetch

  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = createWindowMock() as unknown as Window
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
    ;(globalThis as { fetch?: unknown }).fetch = originalFetch
  })

  it('loads backend config with canonical fields', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = (async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        code: 0,
        msg: 'ok',
        payload: {
          reply_templates: ['模板 A', '模板 A', '模板 B'],
          sla_hours: 18,
        },
      }),
    })) as unknown as typeof fetch

    const result = await fetchFeedbackWorkflowConfig()

    expect(result.source).toBe('backend')
    expect(result.replyTemplates).toEqual(['模板 A', '模板 B'])
    expect(result.slaHours).toBe(18)
  })

  it('falls back to local config when backend is unavailable', async () => {
    const windowMock = (globalThis as { window?: unknown }).window as WindowLike
    windowMock.localStorage.setItem('imboy.feedback-workflow-config.v1', JSON.stringify({
      reply_templates: ['本地模板'],
      sla_hours: 30,
    }))

    ;(globalThis as { fetch?: unknown }).fetch = (async () => ({
      ok: false,
      status: 404,
      headers: {
        get: () => null,
      },
      json: async () => ({}),
    })) as unknown as typeof fetch

    const result = await fetchFeedbackWorkflowConfig()

    expect(result.source).toBe('local')
    expect(result.replyTemplates).toEqual(['本地模板'])
    expect(result.slaHours).toBe(30)
  })

  it('saves config to backend with PUT first', async () => {
    const requests: Array<{ method: string; body: string }> = []

    ;(globalThis as { fetch?: unknown }).fetch = (async (_url: string, init?: RequestInit) => {
      requests.push({
        method: String(init?.method || ''),
        body: String(init?.body || ''),
      })
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({
          code: 0,
          msg: 'ok',
          payload: {
            reply_templates: ['后端模板'],
            sla_hours: 20,
          },
        }),
      } satisfies FetchResponseLike
    }) as unknown as typeof fetch

    const result = await saveFeedbackWorkflowConfig({
      replyTemplates: ['模板 1', '模板 2'],
      slaHours: 24,
    })

    expect(requests.length).toBe(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(JSON.parse(requests[0]?.body || '{}')).toEqual({
      reply_templates: ['模板 1', '模板 2'],
      sla_hours: 24,
    })
    expect(result.source).toBe('backend')
    expect(result.config.replyTemplates).toEqual(['后端模板'])
    expect(result.config.slaHours).toBe(20)
  })

  it('falls back to local save when backend endpoint is unavailable', async () => {
    const methods: string[] = []
    const windowMock = (globalThis as { window?: unknown }).window as WindowLike

    ;(globalThis as { fetch?: unknown }).fetch = (async (_url: string, init?: RequestInit) => {
      methods.push(String(init?.method || ''))
      const method = String(init?.method || '')
      return {
        ok: false,
        status: method === 'PUT' ? 404 : 405,
        headers: {
          get: () => null,
        },
        json: async () => ({}),
      } satisfies FetchResponseLike
    }) as unknown as typeof fetch

    const result = await saveFeedbackWorkflowConfig({
      replyTemplates: ['兜底模板 A', '兜底模板 B'],
      slaHours: 50,
    })

    expect(methods).toEqual(['PUT', 'POST'])
    expect(result.source).toBe('local')
    expect(result.config.replyTemplates).toEqual(['兜底模板 A', '兜底模板 B'])
    expect(result.config.slaHours).toBe(50)

    const storedRaw = windowMock.localStorage.getItem('imboy.feedback-workflow-config.v1')
    expect(storedRaw).not.toBeNull()
    expect(JSON.parse(storedRaw || '{}')).toEqual({
      reply_templates: ['兜底模板 A', '兜底模板 B'],
      sla_hours: 50,
    })
  })
})
