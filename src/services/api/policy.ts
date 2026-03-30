import client from './client'
import { requireApiPayload } from './responseAdapter'

// --- 类型定义 ---

export type FeatureName =
  | 'core'
  | 'e2ee'
  | 'channel'
  | 'location'
  | 'moment'
  | 'channel_discover'
  | 'channel_invitation'
  | 'channel_order'
  | 'group_vote'
  | 'group_schedule'
  | 'group_task'

export type StorageMode = 'archived' | 'secure_e2ee'
export type E2eeMode = 'disabled' | 'optional' | 'required'
export type AuditMode = 'none' | 'metadata' | 'full'
export type RetentionPolicyMode = 'rolling_days' | 'infinite'

export type RetentionPolicy = {
  mode: RetentionPolicyMode
  days?: number
}

export type Capabilities = {
  storage_mode?: StorageMode
  e2ee_mode?: E2eeMode
  message_search?: boolean
  message_export?: boolean
  audit_mode?: AuditMode
  retention_policy?: RetentionPolicy
}

export type FeatureFlags = Partial<Record<FeatureName, boolean>>

export type ProductProfile = 'community' | 'enterprise'

export type PolicyConfig = {
  profile?: ProductProfile
  capabilities?: Capabilities
  features?: FeatureFlags
  plugins?: Record<string, boolean>
}

export type FeatureMeta = {
  all: FeatureName[]
  plugin_managed: FeatureName[]
  standalone: FeatureName[]
  dependencies: Record<FeatureName, FeatureName[]>
}

export type CapabilityFieldMeta = {
  type: 'enum' | 'boolean' | 'object'
  options?: string[]
  fields?: Record<string, { type: string; options?: string[] }>
}

export type PolicyMetaResponse = {
  profiles?: {
    supported: ProductProfile[]
    defaults: Record<ProductProfile, PolicyConfig>
  }
  capabilities?: Record<string, CapabilityFieldMeta>
  features?: FeatureMeta
}

export type PolicyAdjustment = {
  saved?: unknown
  effective?: unknown
  reason?: string
  depends_on?: string[]
}

export type PolicyResponse = {
  meta?: PolicyMetaResponse
  saved?: PolicyConfig
  effective?: PolicyConfig
  adjustments?: {
    features?: Record<string, PolicyAdjustment>
    capabilities?: Record<string, PolicyAdjustment>
  }
  origins?: {
    features?: Record<string, string>
    capabilities?: Record<string, string>
  }
}

// --- API 调用 ---

export async function getPolicyMeta(): Promise<PolicyMetaResponse> {
  const response = await client.get('/admin/config/policy/meta')
  return requireApiPayload<PolicyMetaResponse>(response.data, '/admin/config/policy/meta')
}

export async function getPolicySaved(): Promise<PolicyConfig> {
  const response = await client.get('/admin/config/policy/saved')
  return requireApiPayload<PolicyConfig>(response.data, '/admin/config/policy/saved')
}

export async function getPolicyEffective(): Promise<PolicyResponse> {
  const response = await client.get('/admin/config/policy')
  return requireApiPayload<PolicyResponse>(response.data, '/admin/config/policy')
}

export async function previewPolicyChange(payload: PolicyConfig): Promise<PolicyResponse> {
  const response = await client.post('/admin/config/policy/preview', payload as unknown as Record<string, unknown>)
  return requireApiPayload<PolicyResponse>(response.data, '/admin/config/policy/preview')
}

export async function savePolicyChange(payload: PolicyConfig): Promise<PolicyConfig> {
  const response = await client.put('/admin/config/policy', payload as unknown as Record<string, unknown>)
  return requireApiPayload<PolicyConfig>(response.data, '/admin/config/policy')
}
