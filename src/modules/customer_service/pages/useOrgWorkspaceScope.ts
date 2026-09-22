/**
 * 共享 org/workspace 选择器上下文（EADM-06 / A5 接入，W2）。
 *
 * 设计（与 EADM-06 CONTRACT.md 对齐）：
 * - **URL 是上下文真源**：org/ws 来自 URL 的 `org`/`ws` 查询参数，用 EADM-06 的
 *   纯函数 codec（`parseOrgWorkspaceQuery` / `serializeOrgWorkspaceQuery`）读写，
 *   禁止手写 `?org=` 拼接；刷新/分享后上下文不丢失。
 * - **数据无关**：`OrganizationWorkspacePicker` 不查后端；组织/工作区列表由本
 *   hook 用既有 admin 数据面（`@/modules/organization/api`）查询后作为 props 传入。
 * - onChange 同时写回 URL（replaceState，避免污染历史栈）。
 *
 * 关键合同（C3）：本 hook 只产出"被选中的组织/工作区 TSID"，绝不把 `org`
 * 当 `ws` 误用——`workspaceId` 即 ws 参数，调用方据此作为 provisioning 的
 * `workspace_id` 发出去（A5 在 W2 接线时负责）。
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { EntityId } from '@/types/common'
import { parseOrgWorkspaceQuery, serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import type {
  OrgWorkspaceOption,
  OrganizationWorkspaceValue,
} from '@/components/shared/OrganizationWorkspacePicker'
import { getOrganizations, listOrganizationWorkspaces } from '@/modules/organization/api'

export interface UseOrgWorkspaceScopeOptions {
  /**
   * 可选：组织列表的服务端搜索关键字（搜索框场景；空白串 = 不过滤）。
   * 不传时行为与共享选择器其他消费者一致（拉取前 50 个 active 组织）。
   */
  orgKeyword?: string
  /** 仅有一个可选项时自动进入，适合任务型首页；治理列表默认仍由用户选择。 */
  autoSelectSingle?: boolean
}

export function useOrgWorkspaceScope(options: UseOrgWorkspaceScopeOptions = {}) {
  const orgKeyword = options.orgKeyword?.trim() ?? ''

  const [value, setValue] = useState<OrganizationWorkspaceValue>(() => {
    const { org, ws } = parseOrgWorkspaceQuery(window.location.search)
    return { organizationId: org, workspaceId: ws }
  })

  const persist = useCallback((next: OrganizationWorkspaceValue) => {
    setValue(next)
    const qs = serializeOrgWorkspaceQuery(
      { org: next.organizationId, ws: next.workspaceId },
      window.location.search
    )
    const pathname = window.location.pathname
    const url = qs ? `${pathname}?${qs}` : pathname
    window.history.replaceState(null, '', url)
  }, [])

  const orgsQuery = useQuery({
    queryKey: ['cs-pages', 'org-workspace-options', 'organizations', orgKeyword],
    queryFn: () => getOrganizations(1, 50, 'active', orgKeyword),
  })

  const organizations = useMemo<OrgWorkspaceOption[]>(
    () =>
      (orgsQuery.data?.items ?? []).map((org) => ({
        id: org.id,
        name: org.name,
        meta: org.status === 'active' ? undefined : org.status,
      })),
    [orgsQuery.data]
  )
  const organizationId = value.organizationId ?? (
    options.autoSelectSingle === true && organizations.length === 1 ? organizations[0].id : null
  )

  const wssQuery = useQuery({
    queryKey: ['cs-pages', 'org-workspace-options', 'workspaces', organizationId],
    queryFn: () => listOrganizationWorkspaces(organizationId as EntityId, 1, 50),
    enabled: organizationId != null,
  })

  const workspaces = useMemo<OrgWorkspaceOption[]>(
    () =>
      (wssQuery.data?.items ?? []).map((ws) => ({
        id: ws.id,
        name: ws.name,
      })),
    [wssQuery.data]
  )
  const workspaceId = value.workspaceId ?? (
    options.autoSelectSingle === true && workspaces.length === 1 ? workspaces[0].id : null
  )

  return {
    organizationId,
    workspaceId,
    organizations,
    workspaces,
    loading: orgsQuery.isLoading,
    workspacesLoading: wssQuery.isLoading,
    orgsError: orgsQuery.error,
    workspacesError: wssQuery.error,
    onChange: persist,
    /** 组织列表失效时的显式重试（消费方错误态按钮用）。 */
    refetchOrganizations: () => {
      void orgsQuery.refetch()
    },
    /** 工作区列表失效时的显式重试（同上）。 */
    refetchWorkspaces: () => {
      void wssQuery.refetch()
    },
  }
}
