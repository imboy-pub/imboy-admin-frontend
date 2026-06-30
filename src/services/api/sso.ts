import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'

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
