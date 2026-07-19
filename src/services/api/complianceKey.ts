import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'

// --- Query Key ---

export function complianceKeyQueryKey() {
  return ['compliance-key', 'list'] as const
}

// --- 类型定义 ---

export interface ComplianceKey {
  key_id: EntityId
  algorithm?: string
  status: number          // 1=active, 0=revoked
  created_by?: number
  created_at: string
  revoked_at?: string | null
}

interface ComplianceKeyListResponse {
  list: ComplianceKey[]
}

interface ComplianceKeyCreateParams {
  /**
   * 合规公钥（PEM 格式）。
   * 零信任改造（线 A）：仅上送公钥；合规私钥由审计方在本地（HSM / 离线介质）
   * 生成与保管，服务端永不接收、永不落盘。
   * Zero-trust (line A): only the public key is uploaded. The compliance
   * private key is generated and held locally by the auditor.
   */
  public_key: string
}

interface ComplianceKeyCreateResponse {
  key_id: EntityId
}

// --- API ---

export async function listComplianceKeys(): Promise<ComplianceKeyListResponse> {
  const res = await client.get('/admin/compliance_key/list')
  return requireApiPayload<ComplianceKeyListResponse>(res.data, 'compliance_key/list')
}

export async function createComplianceKey(
  params: ComplianceKeyCreateParams,
): Promise<ComplianceKeyCreateResponse> {
  const res = await client.post('/admin/compliance_key/create', params)
  return requireApiPayload<ComplianceKeyCreateResponse>(res.data, 'compliance_key/create')
}

export async function revokeComplianceKey(keyId: EntityId): Promise<void> {
  const res = await client.post('/admin/compliance_key/revoke', { key_id: keyId })
  requireApiPayload(res.data, 'compliance_key/revoke')
}
