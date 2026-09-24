/**
 * 部门树搜索 / 前端排序 / 名称高亮纯函数单测（ENT-ADM-01）：命中路径保留
 * （叶子命中保留祖先链 / 中间命中保留整棵子树）、兄弟排序三档（目录序 =
 * 服务端 ORDER BY id ASC 镜像 / 名称升降序）、高亮切分三段语义。
 * adm 部门行无 member_count —— 成员数相关能力不在本域提供（不伪造）。
 */
import { describe, expect, it } from 'bun:test'
import { buildDepartmentTree, toDepartmentRow } from './pureFunctions'
import {
  asDepartmentSortMode,
  departmentMatchesTerm,
  filterDepartmentTree,
  sortDepartmentTree,
  splitHighlightParts,
} from './departmentDirectory'

describe('部门树搜索与排序（ENT-ADM-01）', () => {
  const rows = [
    toDepartmentRow({ id: '100', organization_id: 'o1', parent_id: null, name: '研发部', status: 'active', version: 1 }),
    toDepartmentRow({ id: '200', organization_id: 'o1', parent_id: '100', name: '后端组', status: 'active', version: 1 }),
    toDepartmentRow({ id: '300', organization_id: 'o1', parent_id: '200', name: 'Erlang 小队', status: 'active', version: 1 }),
    toDepartmentRow({ id: '400', organization_id: 'o1', parent_id: '100', name: '前端组', status: 'active', version: 1 }),
    toDepartmentRow({ id: '500', organization_id: 'o1', parent_id: null, name: '运营部', status: 'active', version: 1 }),
  ]
  const tree = buildDepartmentTree(rows)

  it('departmentMatchesTerm：名称与 TSID 包含匹配（大小写不敏感）；空词恒不命中', () => {
    expect(departmentMatchesTerm({ id: '300', name: 'Erlang 小队' }, 'erlang')).toBe(true)
    expect(departmentMatchesTerm({ id: '300', name: 'Erlang 小队' }, '小队')).toBe(true)
    expect(departmentMatchesTerm({ id: '300', name: 'Erlang 小队' }, '300')).toBe(true)
    expect(departmentMatchesTerm({ id: '300', name: 'Erlang 小队' }, 'golang')).toBe(false)
    expect(departmentMatchesTerm({ id: '300', name: 'Erlang 小队' }, '  ')).toBe(false)
  })

  it('filterDepartmentTree：命中叶子保留其全部祖先路径，其余子树隐藏；不改输入树', () => {
    const filtered = filterDepartmentTree(tree, 'erlang')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('研发部')
    expect(filtered[0]?.children.map((child) => child.name)).toEqual(['后端组'])
    expect(filtered[0]?.children[0]?.children[0]?.name).toBe('Erlang 小队')
    const names = JSON.stringify(filtered)
    expect(names.includes('前端组')).toBe(false)
    expect(names.includes('运营部')).toBe(false)
    expect(JSON.stringify(tree).includes('前端组')).toBe(true)
  })

  it('filterDepartmentTree：命中中间节点保留其全部后代；空搜索词返回原引用；无命中返回空数组', () => {
    const filtered = filterDepartmentTree(tree, '后端')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.children[0]?.children[0]?.name).toBe('Erlang 小队')
    expect(filterDepartmentTree(tree, '')).toBe(tree)
    expect(filterDepartmentTree(tree, '不存在')).toHaveLength(0)
  })

  it('sortDepartmentTree：directory 按 TSID 数值升序；name-desc 名称降序；name-asc 返回原引用', () => {
    const directory = sortDepartmentTree(tree, 'directory')
    expect(directory.map((node) => node.id)).toEqual(['100', '500'])
    expect(directory[0]?.children.map((node) => node.id)).toEqual(['200', '400'])

    const desc = sortDepartmentTree(tree, 'name-desc')
    expect(desc.map((node) => node.name)).toEqual(['运营部', '研发部'])
    expect(desc[1]?.children.map((node) => node.name)).toEqual(['前端组', '后端组'])

    expect(sortDepartmentTree(tree, 'name-asc')).toBe(tree)
    expect(asDepartmentSortMode('name-desc')).toBe('name-desc')
    expect(asDepartmentSortMode('bogus')).toBe('directory')
  })

  it('splitHighlightParts：按首个命中切三段（match 标记高亮段）；未命中单段', () => {
    expect(splitHighlightParts('Erlang 小队', 'erlang')).toEqual([
      { text: 'Erlang', match: true },
      { text: ' 小队', match: false },
    ])
    expect(splitHighlightParts('后端组-平台', '端')).toEqual([
      { text: '后', match: false },
      { text: '端', match: true },
      { text: '组-平台', match: false },
    ])
    expect(splitHighlightParts('前端组', '不存在')).toEqual([{ text: '前端组', match: false }])
    expect(splitHighlightParts('前端组', '  ')).toEqual([{ text: '前端组', match: false }])
  })
})
