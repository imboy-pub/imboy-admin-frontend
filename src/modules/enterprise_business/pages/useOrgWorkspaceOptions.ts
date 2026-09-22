/**
 * 组织 / 工作区可选项查询（EADM-03 W2 接入）。
 *
 * 仅组合消费既有 org API（A4 的 `getOrganizations` / `listOrganizationWorkspaces`），
 * 把数据投影为共享件 `OrganizationWorkspacePicker` 所需的 `OrgWorkspaceOption[]`。
 * 组件本身 data-agnostic，列表由这里提供；不新增任何后端接口。
 */
import { useQuery } from '@tanstack/react-query'
import { getOrganizations, listOrganizationWorkspaces } from '@/modules/organization/api'
import type { EntityId } from '@/types/common'
import type { OrgWorkspaceOption } from '@/components/shared/OrganizationWorkspacePicker'

const OPTION_STALE_MS = 60_000

/** 组织可选项（服务端按 active 状态搜索；这里取全量首页，组件内再做本地子串搜索）。 */
export function useOrganizationOptions(enabled: boolean) {
  return useQuery<OrgWorkspaceOption[]>({
    queryKey: ['eadm-03', 'org-options'],
    enabled,
    staleTime: OPTION_STALE_MS,
    queryFn: async () => {
      const page = await getOrganizations(1, 200, 'all', '')
      return page.items.map<OrgWorkspaceOption>((o) => ({ id: o.id, name: o.name }))
    },
  })
}

/** 当前组织下的工作区可选项；organizationId 为空时禁用。 */
export function useWorkspaceOptions(organizationId: EntityId | null, enabled: boolean) {
  return useQuery<OrgWorkspaceOption[]>({
    queryKey: ['eadm-03', 'ws-options', organizationId],
    enabled: enabled && organizationId !== null,
    staleTime: OPTION_STALE_MS,
    queryFn: async () => {
      const page = await listOrganizationWorkspaces(organizationId as EntityId, 1, 200)
      return page.items.map<OrgWorkspaceOption>((w) => ({ id: w.id, name: w.name }))
    },
  })
}
