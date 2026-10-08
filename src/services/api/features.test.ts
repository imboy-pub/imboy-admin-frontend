import { afterEach, describe, expect, it } from 'bun:test'
import { filterByFeatures, flattenLeafItems } from '@/components/layout/sidebarFilters'
import { defaultConfig } from '@/components/layout/sidebarSchema'
import {
  isAdminFeatureEnabled,
  featureKeyForAdminPath,
  adminEntryForPath,
  adminFeatureQueryKey,
  assertAdminFeatureManifest,
  FeatureManifestMismatchError,
  type FeatureFlags,
} from './features'
import {
  compiledProductFeatures,
  productFeatureManifestHash,
  productFeatureSchemaVersion,
} from '@/generated/productFeatures'

// Clear localStorage between tests to prevent cache contamination
afterEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// isAdminFeatureEnabled
// ---------------------------------------------------------------------------
describe('phase-one deferred domain paths', () => {
  it('filters the actual sidebar configuration while preserving enterprise delivery tools', () => {
    const leaves = flattenLeafItems(filterByFeatures(defaultConfig.items, {
      bot_webhook: false, agent_hub: false, mcp: false,
    }))
    const paths = leaves.map((leaf) => leaf.path)
    expect(paths).not.toContain('/bots')
    expect(paths).not.toContain('/ai-agents')
    expect(paths).not.toContain('/ai-agents/roles')
    expect(paths).not.toContain('/ai-hub')
    expect(paths).not.toContain('/mcp-governance')
    expect(paths).toContain('/ai-hub/deliveries')
    expect(paths).toContain('/enterprise/applications')
  })

  it('maps menus and direct paths to the same server feature keys', () => {
    for (const [path, key] of [
      ['/bots', 'bot_webhook'],
      ['/bots/42', 'bot_webhook'],
      ['/ai-agents/roles', 'agent_hub'],
      ['/ai-hub?tab=tasks', 'agent_hub'],
      ['/mcp-governance', 'mcp'],
    ]) {
      expect(featureKeyForAdminPath(path)).toBe(key)
      expect(isAdminFeatureEnabled({ [key]: false }, key)).toBe(false)
    }
  })

  it('keeps enterprise webhook delivery operations accessible', () => {
    expect(featureKeyForAdminPath('/ai-hub/deliveries')).toBeNull()
  })

  it('server flags cannot enable deferred domains absent from the build manifest', () => {
    for (const key of ['ai_assistant', 'agent_hub', 'mcp']) {
      expect(isAdminFeatureEnabled({}, key)).toBe(false)
      expect(isAdminFeatureEnabled(null, key)).toBe(false)
      expect(isAdminFeatureEnabled({ [key]: true }, key)).toBe(false)
      expect(isAdminFeatureEnabled({ [key]: false }, key)).toBe(false)
    }
  })
})

describe('isAdminFeatureEnabled', () => {
  it('returns true when featureKey is null (no gate)', () => {
    expect(isAdminFeatureEnabled({}, null)).toBe(true)
  })

  it('returns true when featureKey is undefined', () => {
    expect(isAdminFeatureEnabled({}, undefined)).toBe(true)
  })

  it('returns true when featureFlags is null', () => {
    expect(isAdminFeatureEnabled(null, 'channel')).toBe(true)
  })

  it('returns true when feature is enabled', () => {
    const flags: FeatureFlags = { channel: true }
    expect(isAdminFeatureEnabled(flags, 'channel')).toBe(true)
  })

  it('returns false when server enables a feature absent from the build', () => {
    const flags: FeatureFlags = { not_compiled: true }
    expect(isAdminFeatureEnabled(flags, 'not_compiled')).toBe(false)
  })

  it('returns false when feature is explicitly disabled', () => {
    const flags: FeatureFlags = { channel: false }
    expect(isAdminFeatureEnabled(flags, 'channel')).toBe(false)
  })

  it('returns true when feature key is absent (default allow)', () => {
    const flags: FeatureFlags = {}
    expect(isAdminFeatureEnabled(flags, 'channel')).toBe(true)
  })

  describe('parent feature propagation', () => {
    it('returns false when child feature enabled but parent disabled', () => {
      const flags: FeatureFlags = { channel: false, channel_invitation: true }
      expect(isAdminFeatureEnabled(flags, 'channel_invitation')).toBe(false)
    })

    it('allows enabled child and parent only when the child is compiled', () => {
      const flags: FeatureFlags = { channel: true, channel_invitation: true }
      expect(isAdminFeatureEnabled(flags, 'channel_invitation')).toBe(
        (compiledProductFeatures as readonly string[]).includes('channel_invitation')
      )
    })

    it('defaults an absent parent to allow without bypassing the compiled child boundary', () => {
      const flags: FeatureFlags = { channel_invitation: true }
      expect(isAdminFeatureEnabled(flags, 'channel_invitation')).toBe(
        (compiledProductFeatures as readonly string[]).includes('channel_invitation')
      )
    })

    it('handles channel_order with channel parent', () => {
      const flags: FeatureFlags = { channel: false, channel_order: true }
      expect(isAdminFeatureEnabled(flags, 'channel_order')).toBe(false)
    })

    it('handles channel_discover with channel parent', () => {
      const flags: FeatureFlags = { channel: true, channel_discover: true }
      expect(isAdminFeatureEnabled(flags, 'channel_discover')).toBe(
        (compiledProductFeatures as readonly string[]).includes('channel_discover')
      )
    })
  })
})

describe('assertAdminFeatureManifest', () => {
  it('accepts a complete matching payload', () => {
    expect(() => assertAdminFeatureManifest({
      manifest_hash: productFeatureManifestHash,
      manifest_schema_version: productFeatureSchemaVersion,
      compiled_features: compiledProductFeatures,
    })).not.toThrow()
  })

  it('fails visibly on missing or mismatched contract fields', () => {
    expect(() => assertAdminFeatureManifest({})).toThrow(FeatureManifestMismatchError)
    expect(() => assertAdminFeatureManifest({ manifest_hash: 'sha256:mismatch' }))
      .toThrow(FeatureManifestMismatchError)
    expect(() => assertAdminFeatureManifest({ manifest_schema_version: 999 }))
      .toThrow(FeatureManifestMismatchError)
  })

  it('rejects incomplete or duplicated feature sets even with a matching hash', () => {
    for (const features of [
      compiledProductFeatures.slice(1),
      ...(compiledProductFeatures.length > 1
        ? [[...compiledProductFeatures.slice(0, -1), compiledProductFeatures[0]]]
        : []),
      [...compiledProductFeatures, compiledProductFeatures[0]],
    ]) {
      expect(() => assertAdminFeatureManifest({
        manifest_hash: productFeatureManifestHash,
        manifest_schema_version: productFeatureSchemaVersion,
        compiled_features: features,
      })).toThrow(FeatureManifestMismatchError)
    }
  })

  it('accepts the same feature set in a different order', () => {
    expect(() => assertAdminFeatureManifest({
      manifest_hash: productFeatureManifestHash,
      manifest_schema_version: productFeatureSchemaVersion,
      compiled_features: [...compiledProductFeatures].reverse(),
    })).not.toThrow()
  })

  it('fails when server features exceed the compiled Admin capability', () => {
    expect(() => assertAdminFeatureManifest({ compiled_features: ['not_compiled'] }))
      .toThrow(FeatureManifestMismatchError)
    expect(() => assertAdminFeatureManifest({ compiled_features: [123] }))
      .toThrow(FeatureManifestMismatchError)
    expect(() => assertAdminFeatureManifest({ compiled_features: [] }))
      .toThrow(FeatureManifestMismatchError)
    expect(() => assertAdminFeatureManifest({ compiled_features: 'not-an-array' }))
      .toThrow(FeatureManifestMismatchError)
  })
})

// ---------------------------------------------------------------------------
// featureKeyForAdminPath
// ---------------------------------------------------------------------------
describe('featureKeyForAdminPath', () => {
  it('returns null for null input', () => {
    expect(featureKeyForAdminPath(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(featureKeyForAdminPath(undefined)).toBeNull()
  })

  it('returns null for unmatched path', () => {
    expect(featureKeyForAdminPath('/dashboard')).toBeNull()
    expect(featureKeyForAdminPath('/users/123')).toBeNull()
    expect(featureKeyForAdminPath('/settings')).toBeNull()
  })

  describe('enterprise preset query paths (plan §13.1)', () => {
    it('菜单叶子携带 ?preset=enterprise 时门禁身份仍按纯 pathname 匹配', () => {
      expect(featureKeyForAdminPath('/channels?preset=enterprise')).toBe('channel')
      expect(featureKeyForAdminPath('/groups?preset=enterprise&organization_id=123')).toBeNull()
      expect(adminEntryForPath('/channels?preset=enterprise')).toBe('channel')
      expect(featureKeyForAdminPath('/channels/paid?preset=enterprise')).toBe('channel_order')
    })
  })

  describe('channel paths', () => {
    it('returns "channel_invitation" for invitation sub-path', () => {
      expect(featureKeyForAdminPath('/channels/42/invitations')).toBe('channel_invitation')
      expect(featureKeyForAdminPath('/channels/42/invitations/')).toBe('channel_invitation')
      expect(featureKeyForAdminPath('/channels/42/invitations/detail')).toBe('channel_invitation')
    })

    it('returns "channel_order" for order sub-path', () => {
      expect(featureKeyForAdminPath('/channels/42/orders')).toBe('channel_order')
      expect(featureKeyForAdminPath('/channels/42/orders/')).toBe('channel_order')
    })

    it('returns "channel" for base channel path', () => {
      expect(featureKeyForAdminPath('/channels')).toBe('channel')
      expect(featureKeyForAdminPath('/channels/')).toBe('channel')
      expect(featureKeyForAdminPath('/channels/42')).toBe('channel')
    })

    it('invitation takes precedence over channel', () => {
      // /channels/:id/invitations should match invitation, not generic channel
      expect(featureKeyForAdminPath('/channels/99/invitations')).toBe('channel_invitation')
    })
  })

  describe('moment/report paths', () => {
    it('returns "moment" for /moments', () => {
      expect(featureKeyForAdminPath('/moments')).toBe('moment')
      expect(featureKeyForAdminPath('/moments/')).toBe('moment')
      expect(featureKeyForAdminPath('/moments/123')).toBe('moment')
    })

    it('returns "moment" for /reports', () => {
      expect(featureKeyForAdminPath('/reports')).toBe('moment')
      expect(featureKeyForAdminPath('/reports/')).toBe('moment')
    })
  })

  describe('group enhancement paths', () => {
    it('returns "group_vote" for vote sub-path', () => {
      expect(featureKeyForAdminPath('/groups/10/votes')).toBe('group_vote')
      expect(featureKeyForAdminPath('/groups/10/votes/')).toBe('group_vote')
    })

    it('returns "group_schedule" for schedule sub-path', () => {
      expect(featureKeyForAdminPath('/groups/10/schedules')).toBe('group_schedule')
    })

    it('returns "group_task" for task sub-path', () => {
      expect(featureKeyForAdminPath('/groups/10/tasks')).toBe('group_task')
      expect(featureKeyForAdminPath('/groups/10/tasks/')).toBe('group_task')
    })
  })

  // 计划 §5.3：项目功能的正常入口（侧栏「项目管理」）与直达 route 受同一
  // feature 配置保护 —— sidebarFilters 与 FeatureRoute 都消费本映射。
  describe('project paths', () => {
    it('returns "project" for /projects and its detail sub-path', () => {
      expect(featureKeyForAdminPath('/projects')).toBe('project')
      expect(featureKeyForAdminPath('/projects/')).toBe('project')
      expect(featureKeyForAdminPath('/projects/42')).toBe('project')
    })

    it('does not swallow unrelated workspace paths', () => {
      expect(featureKeyForAdminPath('/workspaces')).toBeNull()
      expect(featureKeyForAdminPath('/workspaces/42')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// adminFeatureQueryKey
// ---------------------------------------------------------------------------
describe('adminFeatureQueryKey', () => {
  it('returns anonymous key when no account', () => {
    expect(adminFeatureQueryKey()).toEqual(['admin', 'features', 'anonymous'])
    expect(adminFeatureQueryKey(null)).toEqual(['admin', 'features', 'anonymous'])
  })

  it('returns account-scoped key when account provided', () => {
    expect(adminFeatureQueryKey('alice')).toEqual(['admin', 'features', 'alice'])
  })
})
