/**
 * 企业菜单入口（enterprise preset）共享约定（plan §13.1/§13.3 Reuse Matrix）。
 *
 * 合同要点：
 * - 现有列表页全部复用，不复制页面/服务；企业入口只通过 query 参数传递
 *   UI 状态（preset/organization_id/workspace_id）。
 * - query 参数只表达 UI 状态：personal-vs-workspace、Organization/Workspace
 *   过滤由后端服务端重验强制（imboy adm_enterprise_filter），前端不得用
 *   客户端过滤伪装可见性。
 * - 64-bit TSID 一律 EntityId（string），不回转 Number。
 */
import type { EntityId } from '@/types/common'

export const ENTERPRISE_PRESET = 'enterprise' as const
export type EnterprisePreset = typeof ENTERPRISE_PRESET

export function isEnterprisePreset(value: string | null | undefined): boolean {
  return value === ENTERPRISE_PRESET
}

export interface EnterpriseScopeFilterParams {
  preset?: EnterprisePreset
  organization_id?: EntityId
  workspace_id?: EntityId
}

export interface EnterpriseScopeSource {
  preset?: string | null
  organization_id?: string | null
  workspace_id?: string | null
}

function trimmedId(value: string | null | undefined): EntityId | undefined {
  const id = (value ?? '').trim()
  return id.length > 0 ? id : undefined
}

/**
 * 由列表页 query state（useListQueryState）构造传给后端的 scope 参数。
 * 空值一律省略；preset 仅接受字面量 'enterprise'（其余值不透传）。
 */
export function buildEnterpriseScopeParams(
  source: EnterpriseScopeSource
): EnterpriseScopeFilterParams {
  const params: EnterpriseScopeFilterParams = {}
  if (isEnterprisePreset(source.preset)) {
    params.preset = ENTERPRISE_PRESET
  }
  const organizationId = trimmedId(source.organization_id)
  if (organizationId !== undefined) {
    params.organization_id = organizationId
  }
  const workspaceId = trimmedId(source.workspace_id)
  if (workspaceId !== undefined) {
    params.workspace_id = workspaceId
  }
  return params
}

/**
 * 企业入口提示文案：页面顶部徽标说明服务端强制语义（运营中心入口不展示）。
 */
export function enterpriseScopeHint(scope: 'groups' | 'channels'): string {
  if (scope === 'channels') {
    return '企业入口：仅工作区频道（服务端强制 scope=workspace + status=1，个人频道不可见）'
  }
  return '企业入口：仅工作区群（服务端强制 scope=workspace，个人群不可见）'
}
