/**
 * Unit tests for ops_governance module APIs:
 *   versions — getVersionListPayload, saveVersion, deleteVersion
 *   ddl — getDDLListPayload, saveDDL, deleteDDL
 *   feedback — getFeedbackListPayload, replyFeedback
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getVersionListPayload,
  saveVersion,
  deleteVersion,
} from './versions'
import {
  getDDLListPayload,
  saveDDL,
  deleteDDL,
} from './ddl'
import {
  getFeedbackListPayload,
  replyFeedback,
} from './feedback'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
  mutableClient.delete = originalDelete
})

// ---------------------------------------------------------------------------
// versions
// ---------------------------------------------------------------------------
describe('getVersionListPayload', () => {
  it('returns paginated version list from /app_version/index', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/app_version/index')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: '1', version: '1.2.0', platform: 'android', force_update: false, status: 1, created_at: '2026-01-01' },
              { id: '2', version: '1.2.0', platform: 'ios', force_update: true, status: 1, created_at: '2026-01-02' },
            ],
            page: 1, size: 20, total: 2, total_pages: 1,
          },
        },
      }
    }

    const result = await getVersionListPayload({ page: 1, size: 20 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].version).toBe('1.2.0')
    expect(result.items[1].platform).toBe('ios')
    expect(result.total).toBe(2)
  })
})

describe('saveVersion', () => {
  it('posts version data to /app_version/save', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/app_version/save')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: 'new-1', version: '1.3.0', platform: 'android' } } }
    }

    await saveVersion({ version: '1.3.0', platform: 'android', force_update: false })
    expect(capturedBody.version).toBe('1.3.0')
    expect(capturedBody.platform).toBe('android')
  })
})

describe('deleteVersion', () => {
  it('posts id to /app_version/delete', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/app_version/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteVersion('42')
    expect(capturedBody.id).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// ddl
// ---------------------------------------------------------------------------
describe('getDDLListPayload', () => {
  it('injects ajax=1 and returns paginated DDL list from /app_ddl/index', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/app_ddl/index')
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 3, ddl: 'ALTER TABLE users ADD COLUMN avatar VARCHAR(255)', status: 1, created_at: '2026-02-01' },
            ],
            page: 1, size: 50, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getDDLListPayload({ page: 1, size: 50 })
    expect(capturedParams.ajax).toBe(1)
    expect(result.items[0].ddl).toContain('ALTER TABLE')
    expect(result.total).toBe(1)
  })
})

describe('saveDDL', () => {
  it('posts DDL data to /app_ddl/save', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/app_ddl/save')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: 5, ddl: 'CREATE INDEX...', status: 0 } } }
    }

    await saveDDL({ ddl: 'CREATE INDEX idx_user_created ON users(created_at)', remark: '优化查询' })
    expect(capturedBody.ddl).toContain('CREATE INDEX')
    expect(capturedBody.remark).toBe('优化查询')
  })
})

describe('deleteDDL', () => {
  it('sends DELETE to /app_ddl/delete with id in body', async () => {
    let capturedUrl = ''
    let capturedData: Record<string, unknown> = {}
    mutableClient.delete = async (url: string, config?: { data?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedData = config?.data ?? {}
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteDDL('5')
    expect(capturedUrl).toBe('/app_ddl/delete')
    expect(capturedData.id).toBe('5')
  })
})

// ---------------------------------------------------------------------------
// feedback
// ---------------------------------------------------------------------------
describe('getFeedbackListPayload', () => {
  it('returns paginated feedback list from /feedback/index', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/feedback/index')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: '9', content: '功能体验很好', status: 0, uid: '7001', created_at: '2026-03-01' },
              { id: '10', content: '登录有时候慢', status: 1, uid: '7002', created_at: '2026-03-02' },
            ],
            page: 1, size: 20, total: 2, total_pages: 1,
          },
        },
      }
    }

    const result = await getFeedbackListPayload({ page: 1, size: 20 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].content).toBe('功能体验很好')
    expect(result.total).toBe(2)
  })
})

describe('replyFeedback', () => {
  it('posts feedback_id and reply to /feedback/reply', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/feedback/reply')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await replyFeedback({ feedback_id: '9', reply: '感谢您的反馈！' })
    expect(capturedBody.feedback_id).toBe('9')
    // reply is sent as 'body' field per API contract
    expect(capturedBody.body).toBe('感谢您的反馈！')
  })
})
