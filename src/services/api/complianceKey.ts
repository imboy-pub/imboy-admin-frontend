import client from './client'
import { requireApiPayload } from './responseAdapter'

// --- Query Key ---

export function complianceKeyQueryKey() {
  return ['compliance-key', 'list'] as const
}

// --- 类型定义 ---

export interface ComplianceKey {
  key_id: string
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
  public_key: string
  private_key_encrypted: string
}

interface ComplianceKeyCreateResponse {
  key_id: string
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

export async function revokeComplianceKey(keyId: string): Promise<void> {
  const res = await client.post('/admin/compliance_key/revoke', { key_id: keyId })
  requireApiPayload(res.data, 'compliance_key/revoke')
}
