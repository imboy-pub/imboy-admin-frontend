import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  fetchFeedbackWorkflowConfig,
  saveFeedbackWorkflowConfig,
} from './feedbackWorkflowConfig'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPut = mutableClient.put

type StorageLike = {
  getItem: (_key: string) => string | null
  setItem: (_key: string, _value: string) => void
  removeItem: (_key: string) => void
  clear: () => void
}

type WindowLike = { localStorage: StorageLike }

function createStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => { map.clear() },
  }
}

describe('feedbackWorkflowConfig service', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createStorage() } as unknown as Window
    mutableClient.get = originalGet
    mutableClient.put = originalPut
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
    mutableClient.get = originalGet
    mutableClient.put = originalPut
  })

  it('loads backend config with canonical fields', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          reply_templates: ['模板 A', '模板 A', '模板 B'],
          sla_hours: 18,
        },
      },
    })

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

    mutableClient.get = async () => { throw new Error('network error') }

    const result = await fetchFeedbackWorkflowConfig()

    expect(result.source).toBe('local')
    expect(result.replyTemplates).toEqual(['本地模板'])
    expect(result.slaHours).toBe(30)
  })

  it('saves config to backend with PUT', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> = {}

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      capturedUrl = url as string
      capturedBody = body
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { reply_templates: ['后端模板'], sla_hours: 20 },
        },
      }
    }

    const result = await saveFeedbackWorkflowConfig({
      replyTemplates: ['模板 1', '模板 2'],
      slaHours: 24,
    })

    expect(capturedUrl).toContain('/admin/config/feedback-workflow')
    expect(capturedBody.reply_templates).toEqual(['模板 1', '模板 2'])
    expect(capturedBody.sla_hours).toBe(24)
    expect(result.source).toBe('backend')
    expect(result.config.replyTemplates).toEqual(['后端模板'])
    expect(result.config.slaHours).toBe(20)
  })

  it('falls back to local save when backend PUT fails', async () => {
    mutableClient.put = async () => { throw new Error('404 not found') }

    const result = await saveFeedbackWorkflowConfig({
      replyTemplates: ['兜底模板 A', '兜底模板 B'],
      slaHours: 50,
    })

    expect(result.source).toBe('local')
    expect(result.config.replyTemplates).toEqual(['兜底模板 A', '兜底模板 B'])
    expect(result.config.slaHours).toBe(50)

    const windowMock = (globalThis as { window?: unknown }).window as WindowLike
    const storedRaw = windowMock.localStorage.getItem('imboy.feedback-workflow-config.v1')
    expect(storedRaw).not.toBeNull()
    expect(JSON.parse(storedRaw || '{}')).toEqual({
      reply_templates: ['兜底模板 A', '兜底模板 B'],
      sla_hours: 50,
    })
  })
})
