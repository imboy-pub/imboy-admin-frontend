/**
 * 企业菜单入口共享 Hooks（plan §13.1/§13.3）。
 * 复用 organization 模块既有平台分页 API 作为组织筛选数据源，
 * 不新建平行服务（Reuse Matrix：Organization → modules/organization/api/public.ts）。
 */
import { useQuery } from '@tanstack/react-query'
import { getOrganizations } from '@/modules/organization/api/public'

export interface OrganizationFilterOption {
  value: string
  label: string
}

/**
 * 组织筛选下拉数据源：平台视角 active 组织前 100 条（有界读，避免无界聚合）。
 * enabled=false 时不请求（非企业语境的页面不产生额外查询）。
 */
export function useEnterpriseOrganizationOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['enterprise_access', 'organization_options'],
    queryFn: async (): Promise<OrganizationFilterOption[]> => {
      const page = await getOrganizations(1, 100, 'active')
      return page.items.map((org) => ({
        value: String(org.id),
        label: org.name,
      }))
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  })
}
