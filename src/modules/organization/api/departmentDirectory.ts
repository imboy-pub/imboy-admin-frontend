/**
 * 部门树搜索 / 排序 / 高亮纯函数（ENT-ADM-01）—— 客户端目录定位内核。
 *
 * adm 合同事实（admin_department_list）：GET departments 仅接受 status，
 * 行无 member_count（成员计数只在 App 面目录端点 organization_directory_pg
 * 存在）。因此本文件只做目录结构层面的搜索定位（名称 / TSID 包含匹配）、
 * 兄弟节点前端排序与名称高亮；成员数徽章 / 按成员数排序因无合同数据源
 * 不提供（不伪造）。
 */
import type { DepartmentRow, DepartmentTreeNode } from './pureFunctions'

export type DepartmentSortMode = 'directory' | 'name-asc' | 'name-desc'

export function asDepartmentSortMode(value: string): DepartmentSortMode {
  return value === 'directory' || value === 'name-asc' || value === 'name-desc' ? value : 'directory'
}

/** 搜索词是否命中单个部门节点（名称大小写不敏感包含，或 TSID 包含）。 */
export function departmentMatchesTerm(
  row: Pick<DepartmentRow, 'id' | 'name'>,
  term: string
): boolean {
  const normalized = term.trim().toLowerCase()
  if (normalized.length === 0) return false
  return row.name.toLowerCase().includes(normalized) || row.id.toLowerCase().includes(normalized)
}

/**
 * 搜索视图树：只保留「命中节点及其全部祖先」的路径（其余子树隐藏），
 * 返回新构树对象（不改输入）。空搜索词返回原树引用。
 */
export function filterDepartmentTree(
  tree: DepartmentTreeNode[],
  term: string
): DepartmentTreeNode[] {
  if (term.trim().length === 0) return tree

  const keep = (nodes: DepartmentTreeNode[]): DepartmentTreeNode[] => {
    const result: DepartmentTreeNode[] = []
    for (const node of nodes) {
      if (departmentMatchesTerm(node, term)) {
        // 命中节点：整棵子树原样保留（搜索定位后可直接浏览其后代）
        result.push(node)
      } else {
        // 未命中：仅当子树内有命中时保留为路径骨架
        const keptChildren = keep(node.children)
        if (keptChildren.length > 0) {
          result.push({ ...node, children: keptChildren })
        }
      }
    }
    return result
  }
  return keep(tree)
}

/**
 * 兄弟节点前端排序（纯展示，不改治理语义）：
 *   * directory —— TSID 升序（服务端 ORDER BY id ASC 的目录事实序镜像）；
 *   * name-asc / name-desc —— 名称 localeCompare(zh-CN) 升 / 降序。
 * 返回新构树对象；子树递归同序。
 */
export function sortDepartmentTree(
  tree: DepartmentTreeNode[],
  mode: DepartmentSortMode
): DepartmentTreeNode[] {
  if (mode === 'name-asc') return tree
  const compare =
    mode === 'directory'
      ? (a: DepartmentTreeNode, b: DepartmentTreeNode) =>
          a.id.localeCompare(b.id, undefined, { numeric: true })
      : (a: DepartmentTreeNode, b: DepartmentTreeNode) =>
          b.name.localeCompare(a.name, 'zh-CN') || a.id.localeCompare(b.id, undefined, { numeric: true })
  const sortNodes = (nodes: DepartmentTreeNode[]): DepartmentTreeNode[] =>
    [...nodes]
      .sort(compare)
      .map((node) => ({ ...node, children: sortNodes(node.children) }))
  return sortNodes(tree)
}

export type HighlightPart = { text: string; match: boolean }

/**
 * 名称高亮切分：按首个大小写不敏感命中把名称切成 [前缀, 命中, 后缀]
 * 三段（命中段 match=true 供 <mark> 渲染）。未命中返回单段。
 */
export function splitHighlightParts(name: string, term: string): HighlightPart[] {
  const normalized = term.trim().toLowerCase()
  if (normalized.length === 0 || name.length === 0) return [{ text: name, match: false }]
  const index = name.toLowerCase().indexOf(normalized)
  if (index < 0) return [{ text: name, match: false }]
  return [
    { text: name.slice(0, index), match: false },
    { text: name.slice(index, index + normalized.length), match: true },
    { text: name.slice(index + normalized.length), match: false },
  ].filter((part) => part.text.length > 0)
}
