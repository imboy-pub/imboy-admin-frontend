import client from './client'
import { requireApiPayload } from './responseAdapter'

// --- Query Key ---

export function policyQueryKey(type: 'effective' | 'saved' | 'meta' | 'bootstrap' = 'effective') {
  return ['policy', type] as const
}

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

export type StorageMode = 'archived' | 'compliance_e2ee' | 'secure_e2ee'
export type E2eeMode = 'disabled' | 'optional' | 'compliance' | 'required'
export type AuditMode = 'none' | 'metadata' | 'full'
export type RetentionPolicyMode = 'rolling_days' | 'infinite'

type RetentionPolicy = {
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

type ProductProfile = 'community' | 'enterprise'

export type PolicyConfig = {
  profile?: ProductProfile
  capabilities?: Capabilities
  features?: FeatureFlags
  plugins?: Record<string, boolean>
}

type FeatureFieldMeta = {
  type: 'boolean'
  managed_by?: string
  dependencies?: FeatureName[]
}

type FeatureMeta = {
  all: FeatureName[]
  plugin_managed: FeatureName[]
  standalone: FeatureName[]
  dependencies: Record<FeatureName, FeatureName[]>
  catalog?: Record<string, FeatureFieldMeta>
}

type CapabilityFieldMeta = {
  type: 'enum' | 'boolean' | 'object'
  options?: string[]
  fields?: Record<string, { type: string; options?: string[] }>
}

type PolicyMetaResponse = {
  profiles?: {
    supported: ProductProfile[]
    defaults: Record<ProductProfile, PolicyConfig>
  }
  capabilities?: Record<string, CapabilityFieldMeta>
  features?: FeatureMeta
}

type PolicyAdjustment = {
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

// --- 默认值 ---

export const DEFAULT_CAPABILITIES: Capabilities = {
  storage_mode: 'archived',
  e2ee_mode: 'disabled',
  message_search: false,
  message_export: false,
  audit_mode: 'metadata',
  retention_policy: { mode: 'rolling_days', days: 365 },
}

// --- Helper ---

export function buildPolicyConfig(
  base: PolicyConfig | undefined,
  updates: Partial<PolicyConfig>,
): PolicyConfig {
  return {
    profile: base?.profile,
    capabilities: base?.capabilities,
    features: base?.features,
    plugins: base?.plugins,
    ...updates,
  }
}

// --- API 调用 ---

export async function getPolicyMeta(): Promise<PolicyMetaResponse> {
  const response = await client.get('/admin/config/policy/meta')
  return requireApiPayload<PolicyMetaResponse>(response.data, '/admin/config/policy/meta')
}

export async function getBootstrapConfig(): Promise<PolicyResponse> {
  const response = await client.get('/admin/config/policy/bootstrap')
  return requireApiPayload<PolicyResponse>(response.data, '/admin/config/policy/bootstrap')
}

export async function getPolicyEffective(): Promise<PolicyResponse> {
  const response = await client.get('/admin/config/policy')
  // 该端点返回扁平的 effective 策略 {profile, capabilities, features, plugins}
  // （与 /api/v1/app/policy 共享同一视图）；而 bootstrap/preview/save 返回
  // {saved, effective, adjustments, origins} 包装视图。统一包一层以匹配
  // PolicyResponse，否则页面读 effective.* 恒为 undefined（开关全显示关闭）。
  const effective = requireApiPayload<PolicyConfig>(response.data, '/admin/config/policy')
  return { effective }
}

export async function previewPolicyChange(payload: PolicyConfig): Promise<PolicyResponse> {
  const response = await client.post('/admin/config/policy/preview', payload)
  return requireApiPayload<PolicyResponse>(response.data, '/admin/config/policy/preview')
}

export async function savePolicyChange(payload: PolicyConfig): Promise<PolicyResponse> {
  const response = await client.put('/admin/config/policy', payload)
  return requireApiPayload<PolicyResponse>(response.data, '/admin/config/policy')
}
