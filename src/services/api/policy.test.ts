import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  buildPolicyConfig,
  getPolicyEffective,
  previewPolicyChange,
  savePolicyChange,
  storageModeLabel,
  ENCRYPTION_TIERS,
  deriveEncryptionTier,
  DEFAULT_CAPABILITIES,
  STORAGE_MODE_LABELS,
  type PolicyConfig,
  type PolicyResponse,
  type StorageMode,
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

// ---------------------------------------------------------------------------
// storageModeLabel
// ---------------------------------------------------------------------------
describe('storageModeLabel', () => {
  // 回归：展示层曾用 `storage_mode === 'archived' ? '归档存储' : '安全加密存储'` 这种
  // 二值判断，加入 disabled 档后会把「E2EE 整档关闭」显示成「安全加密存储」——语义相反。
  it('每个档位各有独立展示名，disabled 不落回加密档文案', () => {
    const modes: StorageMode[] = ['disabled', 'archived', 'compliance_e2ee', 'secure_e2ee']
    for (const mode of modes) {
      expect(storageModeLabel(mode)).toBe(STORAGE_MODE_LABELS[mode])
    }
    expect(storageModeLabel('disabled')).not.toBe(storageModeLabel('secure_e2ee'))
    expect(storageModeLabel('disabled')).not.toBe(storageModeLabel('compliance_e2ee'))
  })

  it('未知或缺失取值返回占位符，而不是其它档位的名字', () => {
    expect(storageModeLabel(undefined)).toBe('—')
    expect(storageModeLabel(null)).toBe('—')
    expect(storageModeLabel('')).toBe('—')
    expect(storageModeLabel('future_mode')).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// ENCRYPTION_TIERS / deriveEncryptionTier
// ---------------------------------------------------------------------------
describe('ENCRYPTION_TIERS', () => {
  // 档位→双字段映射是三处共用真源（本表 / 后端 catalog 注释 / 概念文档），
  // 此处逐项锁死，防止其中任何一处单方面漂移。
  it('四个档位与 (e2ee_mode, storage_mode) 的对应关系逐项锁定', () => {
    expect(ENCRYPTION_TIERS.map((t) => [t.id, t.e2eeMode, t.storageMode])).toEqual([
      ['closed', 'disabled', 'disabled'],
      ['optional', 'optional', 'archived'],
      ['compliance', 'compliance', 'compliance_e2ee'],
      ['required', 'required', 'secure_e2ee'],
    ])
  })

  it('档位两两字段取值组合互不重复（防止档位表写重）', () => {
    const pairs = ENCRYPTION_TIERS.map((t) => `${t.e2eeMode}:${t.storageMode}`)
    expect(new Set(pairs).size).toBe(ENCRYPTION_TIERS.length)
  })

  it('deriveEncryptionTier：标准组合精确命中', () => {
    expect(deriveEncryptionTier({ e2ee_mode: 'disabled', storage_mode: 'disabled' })?.id).toBe('closed')
    expect(deriveEncryptionTier({ e2ee_mode: 'optional', storage_mode: 'archived' })?.id).toBe('optional')
    expect(deriveEncryptionTier({ e2ee_mode: 'compliance', storage_mode: 'compliance_e2ee' })?.id).toBe('compliance')
    expect(deriveEncryptionTier({ e2ee_mode: 'required', storage_mode: 'secure_e2ee' })?.id).toBe('required')
  })

  it('deriveEncryptionTier：交叉/历史组合不误判（返回 null 由页面提示）', () => {
    // 企业预设的历史组合：E2EE 关但无硬闸
    expect(deriveEncryptionTier({ e2ee_mode: 'disabled', storage_mode: 'archived' })).toBeNull()
    // 硬闸下旧 e2ee_mode 残留
    expect(deriveEncryptionTier({ e2ee_mode: 'required', storage_mode: 'disabled' })).toBeNull()
    expect(deriveEncryptionTier(undefined)).toBeNull()
    expect(deriveEncryptionTier({})).toBeNull()
  })
})
