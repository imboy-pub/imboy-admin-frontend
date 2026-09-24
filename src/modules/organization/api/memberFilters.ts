/**
 * 成员复合筛选纯函数（ENT-ADM-01）—— 客户端组合筛选内核。
 *
 * adm 合同事实（adm_organization_handler members_action）：GET members 仅
 * 接受 page/size，无 role/status/keyword/department 服务端筛选参数，且服务端
 * 硬编码只返回 active 行。复合筛选因此在前端对已加载行执行——页面在筛选
 * 激活时切换为「聚合拉取 + 客户端筛选 + 本地分页」模式（api/public.ts
 * getOrganizationMembersAggregate），本文件是该模式的筛选内核：
 *   * role：精确匹配组织角色（owner/admin/member/unknown 四档）；
 *   * keyword：对 nickname / account / userId / invitedBy 做大小写不敏感
 *     包含匹配（TSID 数字串与昵称统一走同一关键词）。
 * 状态维度不提供（服务端仅返回 active，无 suspended 列表端点——伪筛选会
 * 误导）；部门维度不提供（adm 合同无成员-部门挂载数据）。
 */
import type { OrganizationMemberRow } from './pureFunctions'

export type MemberRoleFilter = 'all' | 'owner' | 'admin' | 'member' | 'unknown'

export type MemberCompositeFilter = {
  role: MemberRoleFilter
  keyword: string
}

/** 筛选条件是否激活（任一维度非默认即激活 → 页面切换客户端筛选模式）。 */
export function isMemberFilterActive(filter: MemberCompositeFilter): boolean {
  return filter.role !== 'all' || filter.keyword.trim() !== ''
}

function memberKeywordHaystacks(row: OrganizationMemberRow): string[] {
  return [row.nickname, row.account, row.userId, row.invitedBy]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
}

/** 关键词包含匹配（大小写不敏感；空关键词恒匹配）。 */
export function memberMatchesKeyword(row: OrganizationMemberRow, keyword: string): boolean {
  const term = keyword.trim().toLowerCase()
  if (term.length === 0) return true
  return memberKeywordHaystacks(row).some((haystack) => haystack.includes(term))
}

/**
 * 复合筛选内核：role AND keyword 组合（多条件交集语义）。
 * 纯函数、不改输入数组；返回顺序与输入一致（服务端目录序）。
 */
export function filterMemberRows(
  rows: readonly OrganizationMemberRow[],
  filter: MemberCompositeFilter
): OrganizationMemberRow[] {
  return rows.filter(
    (row) => (filter.role === 'all' || row.role === filter.role) && memberMatchesKeyword(row, filter.keyword)
  )
}

/** 归一化 URL 中的 role 筛选值（未知值回退 all，脏链接不致渲染异常）。 */
export function asMemberRoleFilter(value: string): MemberRoleFilter {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'unknown' ? value : 'all'
}
