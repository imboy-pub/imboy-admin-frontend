/**
 * Unit tests for module-level logic:
 *   DashboardPanelRegistry
 *   ReportPanelRegistry
 *   identity/api/setup (getSetupStatus, initSetup)
 *   social_graph/api/tags (getUserTagListPayload, deleteUserTag)
 *   social_graph/api/collects (getUserCollectListPayload, removeUserCollect)
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { DashboardPanelExtension } from '@/modules/dashboard/contracts/dashboardPanelExtension'
import { dashboardPanelRegistry } from '@/modules/dashboard/registry/dashboardPanelRegistry'
import type { ReportPanelExtension } from '@/modules/reports/contracts/reportPanelExtension'
import { ReportPanelRegistry } from '@/modules/reports/registry/reportPanelRegistry'
import client from '@/services/api/client'
import { getSetupStatus, initSetup } from '@/modules/identity/api/setup'
import { getUserTagListPayload, deleteUserTag } from '@/modules/social_graph/api/tags'
import { getUserCollectListPayload, removeUserCollect } from '@/modules/social_graph/api/collects'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

// ---------------------------------------------------------------------------
// DashboardPanelRegistry
// ---------------------------------------------------------------------------
describe('DashboardPanelRegistry', () => {
  it('resolveById returns null for unknown id', () => {
    expect(dashboardPanelRegistry.resolveById('nonexistent')).toBeNull()
  })

  it('register and resolveById round-trip', () => {
    const panel: DashboardPanelExtension = {
      id: 'test-panel-dash',
      label: 'Test Dashboard Panel',
      render: () => null,
    }

    dashboardPanelRegistry.register(panel)
    expect(dashboardPanelRegistry.resolveById('test-panel-dash')).toBe(panel)

    // Clean up — panel map is module-level singleton
    const all = dashboardPanelRegistry.list()
    expect(all.some((p) => p.id === 'test-panel-dash')).toBe(true)
  })

  it('list returns all registered panels', () => {
    const before = dashboardPanelRegistry.list().length
    const panel: DashboardPanelExtension = {
      id: 'list-test-panel-dash',
      label: 'List Test',
      render: () => null,
    }
    dashboardPanelRegistry.register(panel)
    expect(dashboardPanelRegistry.list().length).toBe(before + 1)
  })
})

// ---------------------------------------------------------------------------
// ReportPanelRegistry — fresh instance per test
// ---------------------------------------------------------------------------
describe('ReportPanelRegistry', () => {
  it('resolveById returns null for unknown id', () => {
    const registry = new ReportPanelRegistry()
    expect(registry.resolveById('unknown')).toBeNull()
  })

  it('register and resolveById round-trip', () => {
    const registry = new ReportPanelRegistry()
    const panel: ReportPanelExtension = {
      id: 'rp-001',
      targetType: 'user',
      label: 'User Report',
      render: () => null,
    }
    registry.register(panel)
    expect(registry.resolveById('rp-001')).toBe(panel)
  })

  it('resolveForTarget returns first matching panel by targetType', () => {
    const registry = new ReportPanelRegistry()
    const userPanel: ReportPanelExtension = {
      id: 'rp-user',
      targetType: 'user',
      label: 'User Report',
      render: () => null,
    }
    const groupPanel: ReportPanelExtension = {
      id: 'rp-group',
      targetType: 'group',
      label: 'Group Report',
      render: () => null,
    }
    registry.register(userPanel)
    registry.register(groupPanel)

    expect(registry.resolveForTarget('user')).toBe(userPanel)
    expect(registry.resolveForTarget('group')).toBe(groupPanel)
  })

  it('resolveForTarget falls back to "default" panel when no exact match', () => {
    const registry = new ReportPanelRegistry()
    const defaultPanel: ReportPanelExtension = {
      id: 'rp-default',
      targetType: 'default',
      label: 'Default Report',
      render: () => null,
    }
    registry.register(defaultPanel)

    // No 'moment' panel registered — should fall back to default
    expect(registry.resolveForTarget('moment')).toBe(defaultPanel)
  })

  it('resolveForTarget returns null when no match and no default', () => {
    const registry = new ReportPanelRegistry()
    expect(registry.resolveForTarget('channel')).toBeNull()
  })

  it('list returns all registered panels in insertion order', () => {
    const registry = new ReportPanelRegistry()
    const p1: ReportPanelExtension = { id: 'p1', targetType: 'user', label: '1', render: () => null }
    const p2: ReportPanelExtension = { id: 'p2', targetType: 'group', label: '2', render: () => null }
    registry.register(p1)
    registry.register(p2)
    const ids = registry.list().map((p) => p.id)
    expect(ids).toEqual(['p1', 'p2'])
  })

  it('register with same id overwrites previous entry', () => {
    const registry = new ReportPanelRegistry()
    const original: ReportPanelExtension = { id: 'dup', targetType: 'user', label: 'Original', render: () => null }
    const updated: ReportPanelExtension = { id: 'dup', targetType: 'group', label: 'Updated', render: () => null }
    registry.register(original)
    registry.register(updated)

    expect(registry.resolveById('dup')?.label).toBe('Updated')
    expect(registry.list()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// identity/api/setup
// ---------------------------------------------------------------------------
describe('getSetupStatus', () => {
  it('returns initialized: true from payload', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/setup/status')
      return { data: { code: 0, msg: 'ok', payload: { initialized: true } } }
    }

    const result = await getSetupStatus()
    expect(result.initialized).toBe(true)
  })

  it('returns initialized: false from payload', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { initialized: false } },
    })

    const result = await getSetupStatus()
    expect(result.initialized).toBe(false)
  })

  it('throws when payload is missing', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: undefined },
    })

    await expect(getSetupStatus()).rejects.toThrow()
  })
})

describe('initSetup', () => {
  it('posts params to /setup/init and returns id', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/setup/init')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: 'admin-001' } } }
    }

    const result = await initSetup({
      account: 'admin@example.com',
      password: 'SecurePass1',
      nickname: '超级管理员',
    })

    expect(result.id).toBe('admin-001')
    expect(capturedBody.account).toBe('admin@example.com')
    expect(capturedBody.nickname).toBe('超级管理员')
  })
})

// ---------------------------------------------------------------------------
// social_graph/api/tags
// ---------------------------------------------------------------------------
describe('getUserTagListPayload', () => {
  it('returns paginated tag list with required params', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/user/tag/list')
      expect(config?.params?.uid).toBe('8001')
      expect(config?.params?.scene).toBe('friend')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 1, creator_user_id: 8001, scene: 1, name: '同学', created_at: '2026-01-01', updated_at: '2026-01-01' },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getUserTagListPayload({ uid: '8001', scene: 'friend' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('同学')
    expect(result.total).toBe(1)
  })
})

describe('deleteUserTag', () => {
  it('posts uid, scene, tag to /user/tag/delete', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/user/tag/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteUserTag({ uid: '8001', scene: 'friend', tag: '同学' })
    expect(capturedBody.uid).toBe('8001')
    expect(capturedBody.scene).toBe('friend')
    expect(capturedBody.tag).toBe('同学')
  })
})

// ---------------------------------------------------------------------------
// social_graph/api/collects
// ---------------------------------------------------------------------------
describe('getUserCollectListPayload', () => {
  it('returns paginated collect list with uid', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/user/collect/list')
      expect(config?.params?.uid).toBe('9001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              {
                kind: 1,
                kind_id: 'item-001',
                source: 'chat',
                created_at: '2026-02-01',
                updated_at: '2026-02-01',
              },
            ],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getUserCollectListPayload({ uid: '9001' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].kind_id).toBe('item-001')
  })

  it('forwards optional filters (kind, keyword, tag, order)', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { items: [], page: 1, size: 10, total: 0, total_pages: 1 },
        },
      }
    }

    await getUserCollectListPayload({ uid: '9001', kind: 2, keyword: 'photo', tag: 'travel', order: 'recent_use' })
    expect(capturedParams.kind).toBe(2)
    expect(capturedParams.keyword).toBe('photo')
    expect(capturedParams.tag).toBe('travel')
    expect(capturedParams.order).toBe('recent_use')
  })
})

describe('removeUserCollect', () => {
  it('posts uid and kind_id to /user/collect/remove', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/user/collect/remove')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await removeUserCollect({ uid: '9001', kind_id: 'item-001' })
    expect(capturedBody.uid).toBe('9001')
    expect(capturedBody.kind_id).toBe('item-001')
  })
})
