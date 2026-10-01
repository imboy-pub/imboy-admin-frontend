import '../../../test/setupDom'
import { afterEach, expect, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DepartmentOrganizationChart } from './DepartmentOrganizationChart'
import { buildDepartmentTree, type DepartmentRow } from '../api/pureFunctions'

afterEach(cleanup)
const row = (id: string, parentId: string | null): DepartmentRow => ({
  id, parentId, organizationId: '8800487111111111111', name: `部门${id}`,
  status: 'active', version: 1, createdAt: '', updatedAt: '',
})

it('完整保留大编号和父子关系；缺失上级、环节点不接到企业根', async () => {
  const id = '9007199254740993'
  const tree = buildDepartmentTree([row(id, null), row('2', id), row('3', 'missing'), row('4', '5'), row('5', '4')])
  let selected: string | null = null
  const view = render(<DepartmentOrganizationChart organizationName="企业" tree={tree} selectedId={null} onSelect={(value) => { selected = value }} />)
  const roots = view.getByRole('list', { name: '企业根部门' })
  expect(roots.querySelector('[data-department-id="3"]')).toBeNull()
  expect(roots.querySelector('[data-department-id="4"]')).toBeNull()
  expect(roots.querySelector('[data-department-id="2"]')?.getAttribute('data-parent-id')).toBe(id)
  expect(view.getByRole('region', { name: '上级关系待核实' })).toBeTruthy()
  for (const value of [id, '2', '3', '4', '5']) expect(view.getAllByTestId(`dept-chart-node-${value}`).length).toBe(1)
  await userEvent.setup().click(view.getByTestId(`dept-chart-node-${id}`))
  expect(selected).toBe(id)
})

it('已归档部门可查看，选中状态可读，滚动区域可通过键盘进入', () => {
  const tree = buildDepartmentTree([{ ...row('1', null), status: 'archived' }])
  const view = render(<DepartmentOrganizationChart organizationName="企业" tree={tree} selectedId="1" onSelect={() => {}} />)
  expect(view.getByTestId('dept-chart-node-1').getAttribute('aria-pressed')).toBe('true')
  expect(view.getByText('已归档')).toBeTruthy()
  expect(view.getByTestId('department-chart').getAttribute('tabindex')).toBe('0')
})
