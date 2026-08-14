import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  buildPolicyConfig,
  getPolicyEffective,
  previewPolicyChange,
  savePolicyChange,
  DEFAULT_CAPABILITIES,
  type PolicyConfig,
  type PolicyResponse,
} from './policy'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
})

const policyResponseFixture: PolicyResponse = {
  effective: {
    profile: 'community',
    capabilities: {
      storage_mode: 'archived',
      e2ee_mode: 'disabled',
      message_search: false,
      message_export: false,
      audit_mode: 'metadata',
      retention_policy: { mode: 'rolling_days', days: 365 },
    },
    features: { channel: true, moment: false },
  },
  meta: {
    features: {},
    capabilities: {},
  },
  saved: {
    profile: 'community',
    capabilities: {
      storage_mode: 'archived',
      e2ee_mode: 'disabled',
      message_search: false,
      message_export: false,
      audit_mode: 'metadata',
      retention_policy: { mode: 'rolling_days', days: 365 },
    },
  },
}

// ---------------------------------------------------------------------------
// buildPolicyConfig — pure function
// ---------------------------------------------------------------------------
describe('buildPolicyConfig', () => {
  it('returns updates merged over base', () => {
    const base: PolicyConfig = {
      profile: 'community',
      capabilities: DEFAULT_CAPABILITIES,
      features: { channel: true },
    }
    const updates: Partial<PolicyConfig> = {
      profile: 'enterprise',
    }

    const result = buildPolicyConfig(base, updates)
    expect(result.profile).toBe('enterprise')
    // Original base fields preserved when not in updates
    expect(result.capabilities).toEqual(DEFAULT_CAPABILITIES)
    expect(result.features).toEqual({ channel: true })
  })

  it('works with undefined base', () => {
    const updates: Partial<PolicyConfig> = { profile: 'enterprise' }
    const result = buildPolicyConfig(undefined, updates)
    expect(result.profile).toBe('enterprise')
    expect(result.capabilities).toBeUndefined()
  })

  it('does not mutate the base object', () => {
    const base: PolicyConfig = { profile: 'community', capabilities: DEFAULT_CAPABILITIES }
    const updates: Partial<PolicyConfig> = { profile: 'enterprise' }
    buildPolicyConfig(base, updates)
    expect(base.profile).toBe('community') // unchanged
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_CAPABILITIES constant
// ---------------------------------------------------------------------------
describe('DEFAULT_CAPABILITIES', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CAPABILITIES.storage_mode).toBe('archived')
    expect(DEFAULT_CAPABILITIES.e2ee_mode).toBe('disabled')
    expect(DEFAULT_CAPABILITIES.message_search).toBe(false)
    expect(DEFAULT_CAPABILITIES.message_export).toBe(false)
    expect(DEFAULT_CAPABILITIES.audit_mode).toBe('metadata')
    expect(DEFAULT_CAPABILITIES.retention_policy.mode).toBe('rolling_days')
    expect(DEFAULT_CAPABILITIES.retention_policy.days).toBe(365)
  })
})

// ---------------------------------------------------------------------------
// getPolicyEffective
// ---------------------------------------------------------------------------
describe('getPolicyEffective', () => {
  it('wraps the flat effective policy from /admin/config/policy', async () => {
    // 后端该端点返回扁平 effective 策略（非 {saved, effective} 包装）
    const flatEffective: PolicyConfig = {
      profile: 'community',
      capabilities: {
        storage_mode: 'archived',
        e2ee_mode: 'disabled',
        message_search: false,
        message_export: false,
        audit_mode: 'metadata',
        retention_policy: { mode: 'rolling_days', days: 365 },
      },
      features: { channel: true, moment: false },
    }
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/admin/config/policy')
      return { data: { code: 0, msg: 'ok', payload: flatEffective } }
    }

    const result = await getPolicyEffective()
    expect(result.effective?.profile).toBe('community')
    expect(result.effective?.features?.channel).toBe(true)
    expect(result.effective?.features?.moment).toBe(false)
  })

  it('throws when payload is absent (undefined)', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: undefined },
    })

    await expect(getPolicyEffective()).rejects.toThrow('Missing payload')
  })

  it('throws on network error', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    await expect(getPolicyEffective()).rejects.toThrow('network error')
  })
})

// ---------------------------------------------------------------------------
// previewPolicyChange
// ---------------------------------------------------------------------------
describe('previewPolicyChange', () => {
  it('sends POST to /admin/config/policy/preview and returns response', async () => {
    let capturedBody: unknown = null

    mutableClient.post = async (url: string, body: unknown) => {
      expect(url).toBe('/admin/config/policy/preview')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: policyResponseFixture } }
    }

    const payload: PolicyConfig = {
      profile: 'enterprise',
      capabilities: DEFAULT_CAPABILITIES,
    }

    const result = await previewPolicyChange(payload)
    expect(result.effective.profile).toBe('community')
    expect(capturedBody).toEqual(payload)
  })
})

// ---------------------------------------------------------------------------
// savePolicyChange
// ---------------------------------------------------------------------------
describe('savePolicyChange', () => {
  it('sends PUT to /admin/config/policy and returns saved config', async () => {
    const savedConfig: PolicyConfig = { profile: 'enterprise', capabilities: DEFAULT_CAPABILITIES }
    let capturedUrl = ''

    mutableClient.put = async (url: string, _body: unknown) => {
      capturedUrl = url
      return { data: { code: 0, msg: 'ok', payload: savedConfig } }
    }

    const result = await savePolicyChange({ profile: 'enterprise' })
    expect(capturedUrl).toBe('/admin/config/policy')
    expect(result.profile).toBe('enterprise')
  })
})
