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

export type StorageMode = 'disabled' | 'archived' | 'compliance_e2ee' | 'secure_e2ee'
export type E2eeMode = 'disabled' | 'optional' | 'compliance' | 'required'

// 存储模式展示名的单一真源。策略页下拉与套餐对比卡共用：`Record<StorageMode, string>`
// 保证新增档位时这里先编译报错，而不是在展示层退化成「非归档 = 加密」的二值判断把
// 档位显示成相反的语义。
export const STORAGE_MODE_LABELS: Record<StorageMode, string> = {
  disabled: '禁用（整档关闭 E2EE）',
  archived: '归档存储',
  compliance_e2ee: '合规加密存储',
  secure_e2ee: '安全存储',
}

/** 取存储模式展示名。未知/缺省值返回占位符，绝不回落到其它档位的名字。 */
export function storageModeLabel(mode: string | undefined | null): string {
  if (!mode) {
    return '—'
  }
  return (STORAGE_MODE_LABELS as Record<string, string | undefined>)[mode] ?? '—'
}

// --- 加密档位（运营者的单一选择入口）---
//
// 底层两个字段各管一头：`e2ee_mode` 是给客户端的加密规矩，`storage_mode` 是
// 服务端存储/审计姿态。但对运营者来说是**同一个决定**，本表是二者唯一对应
// 关系的真源：策略页「加密档位」单选据此**同时**套用两个字段。
// 字段语义与联动的权威说明：imboy/docs/concepts/e2ee.md §加密档位；
// 服务端枚举真源：imboy/src/lib/imboy_policy_catalog.erl（同一张表）。
// ⚠️ 新增/调整档位必须三处同步：本表、imboy_policy_catalog 注释、概念文档。
export type EncryptionTierId = 'closed' | 'optional' | 'compliance' | 'required'

export type EncryptionTier = {
  id: EncryptionTierId
  label: string
  description: string
  e2eeMode: E2eeMode
  storageMode: StorageMode
}

export const ENCRYPTION_TIERS: readonly EncryptionTier[] = [
  {
    id: 'closed',
    label: '关闭（明文交付）',
    description:
      '硬闸：整档关闭 E2EE——密钥端点关闭、明文校验放行、群级加密被忽略、客户端隐藏 E2EE 入口。适合不需要端到端加密的客户交付',
    e2eeMode: 'disabled',
    storageMode: 'disabled',
  },
  {
    id: 'optional',
    label: '可选（明文归档）',
    description: '不强制加密：客户端不加密，服务器明文归档存储（可搜索/导出）',
    e2eeMode: 'optional',
    storageMode: 'archived',
  },
  {
    id: 'compliance',
    label: '合规（可审计）',
    description: '端到端加密 + 合规密钥托管：消息双加密，审计方可凭合规密钥解密',
    e2eeMode: 'compliance',
    storageMode: 'compliance_e2ee',
  },
  {
    id: 'required',
    label: '强制（纯端到端）',
    description: '全站强制端到端加密：服务器无法读取消息内容，消息搜索/导出自动关闭',
    e2eeMode: 'required',
    storageMode: 'secure_e2ee',
  },
] as const

/**
 * 由当前配置反推档位。仅当 (e2ee_mode, storage_mode) 与档位表**精确成对**才命中；
 * 历史组合（如企业预设的 disabled+archived）返回 null，由页面提示并让用户重选——
 * 选择任一档位后两个字段会被同时套用，非标准组合随之消除。
 */
export function deriveEncryptionTier(
  caps: Pick<Capabilities, 'e2ee_mode' | 'storage_mode'> | undefined | null,
): EncryptionTier | null {
  if (!caps) {
    return null
  }
  return (
    ENCRYPTION_TIERS.find(
      (tier) => tier.e2eeMode === caps.e2ee_mode && tier.storageMode === caps.storage_mode,
    ) ?? null
  )
}
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
// 注意：此仅为前端表单初始值。后端真实出厂默认（imboy_profile_preset）：
// community = storage_mode archived + e2ee_mode optional（当前实现等价关闭）；
// enterprise = archived + disabled。保存/展示一律以后端 effective 为准。

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
