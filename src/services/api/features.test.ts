import { afterEach, describe, expect, it } from 'bun:test'
import {
  isAdminFeatureEnabled,
  featureKeyForAdminPath,
  adminFeatureQueryKey,
  type FeatureFlags,
} from './features'

// Clear localStorage between tests to prevent cache contamination
afterEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// isAdminFeatureEnabled
// ---------------------------------------------------------------------------
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

    it('returns true when both child and parent are enabled', () => {
      const flags: FeatureFlags = { channel: true, channel_invitation: true }
      expect(isAdminFeatureEnabled(flags, 'channel_invitation')).toBe(true)
    })

    it('returns true when child enabled and parent absent (default allow)', () => {
      const flags: FeatureFlags = { channel_invitation: true }
      expect(isAdminFeatureEnabled(flags, 'channel_invitation')).toBe(true)
    })

    it('handles channel_order with channel parent', () => {
      const flags: FeatureFlags = { channel: false, channel_order: true }
      expect(isAdminFeatureEnabled(flags, 'channel_order')).toBe(false)
    })

    it('handles channel_discover with channel parent', () => {
      const flags: FeatureFlags = { channel: true, channel_discover: true }
      expect(isAdminFeatureEnabled(flags, 'channel_discover')).toBe(true)
    })
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
