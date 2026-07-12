import client, { BASE_URL } from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'

// ─── 敏感字段哨兵（与后端 sso_logic 脱敏契约对齐）────────────────────────────────
// GET：敏感字段非空时返回 "***"，并附 has_<field> 布尔标志
// POST：传 "***" 或空字符串 = 不修改（后端保留已存密文）；传新值 = 覆盖并加密

export const SECRET_MASK = '***'

/** GET 返回的敏感字段值 → 表单初始值：脱敏值不进 input，置空 */
export function secretInitial(value?: string): string {
  return value === SECRET_MASK ? '' : (value ?? '')
}

/** 表单值 → 提交值：用户未改动（空或仍为 ***）提交哨兵 ***，否则提交新值 */
export function secretForSubmit(value: string): string {
  return value === '' || value === SECRET_MASK ? SECRET_MASK : value
}

/** OIDC 用户端回调地址（需管理员在 IdP 侧登记） */
export function oidcCallbackUrl(): string {
  const origin = /^https?:\/\//.test(BASE_URL)
    ? new URL(BASE_URL).origin
    : window.location.origin
  return `${origin}/api/v1/auth/oidc/callback`
}

// ─── SSO 类型定义 ───────────────────────────────────────────────────────────────

export type SSOProvider = 'ldap' | 'saml' | 'oauth2'

export interface LdapConfig {
  provider: 'ldap'
  enabled: boolean
  host: string
  port: number
  use_ssl: boolean
  base_dn: string
  bind_dn: string
  bind_password: string
  /** 后端脱敏契约：bind_password 是否已配置（只读，GET 附带） */
  has_bind_password?: boolean
  user_filter: string
  uid_attr: string
  mail_attr: string
  display_name_attr: string
}

export interface SamlConfig {
  provider: 'saml'
  enabled: boolean
  metadata_url: string
  entity_id: string
  assertion_consumer_service_url: string
  name_id_format: string
}

export interface OAuth2Config {
  provider: 'oauth2'
  enabled: boolean
  client_id: string
  client_secret: string
  /** 后端脱敏契约：client_secret 是否已配置（只读，GET 附带） */
  has_client_secret?: boolean
  /** OIDC issuer（id_token iss 校验用） */
  issuer?: string
  auth_url: string
  token_url: string
  userinfo_url: string
  scopes: string
}

export type SSOConfig = LdapConfig | SamlConfig | OAuth2Config

export interface SSOConfigResponse {
  ldap?: LdapConfig
  saml?: SamlConfig
  oauth2?: OAuth2Config
}

export async function getSSOConfig(): Promise<ApiResponse<SSOConfigResponse>> {
  const response = await client.get('/sso/config')
  return response.data
}

export async function getSSOConfigPayload(): Promise<SSOConfigResponse> {
  return requireApiPayload(await getSSOConfig(), '/sso/config')
}

export async function saveSSOConfig(config: SSOConfig): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/sso/config', config)
  return response.data
}

export async function testSSOConnection(
  provider: SSOProvider,
  config: SSOConfig
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const response = await client.post('/sso/test', { provider, config })
  return response.data
}
