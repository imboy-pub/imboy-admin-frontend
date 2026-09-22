/**
 * OrganizationWorkspacePicker 组件测试（EADM-06 / A6）。
 * 纯组件测试，无后端、无网络依赖；数据通过 props 注入（data-agnostic）。
 * 不涉及 TanStack Query / Router，故无需 Provider 包裹。
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it, vi } from 'bun:test'
import { render, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { OrganizationWorkspacePicker } from './OrganizationWorkspacePicker'

const orgs = [
  { id: 'org_1', name: '甲公司', meta: '12 成员' },
  { id: 'org_2', name: '乙公司', meta: '3 成员' },
  { id: 'org_3', name: 'Acme Corp', meta: '9 成员' },
]
const wsOfOrg1 = [
  { id: 'ws_1a', name: '默认工作区' },
  { id: 'ws_1b', name: '支持工作区' },
]

afterEach(() => {
  cleanup()
})

describe('OrganizationWorkspacePicker — trigger', () => {
  it('renders placeholder when nothing selected', () => {
    const { getByLabelText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={[]}
        onChange={() => {}}
      />
    )
    expect(getByLabelText('选择组织与工作区').textContent).toContain('选择组织 / 工作区')
  })

  it('renders selected org name', () => {
    const { getByLabelText } = render(
      <OrganizationWorkspacePicker
        organizationId="org_1"
        workspaceId={null}
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={() => {}}
      />
    )
    expect(getByLabelText('选择组织与工作区').textContent).toContain('甲公司')
  })

  it('renders org + workspace when both selected', () => {
    const { getByLabelText } = render(
      <OrganizationWorkspacePicker
        organizationId="org_1"
        workspaceId="ws_1a"
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={() => {}}
      />
    )
    const t = getByLabelText('选择组织与工作区').textContent ?? ''
    expect(t).toContain('甲公司')
    expect(t).toContain('默认工作区')
  })

  it('does not open dialog when disabled', () => {
    const { getByLabelText, queryByText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={[]}
        onChange={() => {}}
        disabled
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    expect(queryByText('请先选择组织')).toBeNull()
  })
})

describe('OrganizationWorkspacePicker — dialog interaction', () => {
  it('opens dialog and lists organizations', () => {
    const { getByLabelText, getByText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={[]}
        onChange={() => {}}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    expect(getByText('组织')).toBeTruthy()
    expect(getByText('甲公司')).toBeTruthy()
    expect(getByText('乙公司')).toBeTruthy()
  })

  it('filters organizations by local search', async () => {
    const user = userEvent.setup()
    const { getByLabelText, getByText, queryByText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={[]}
        onChange={() => {}}
      />
    )
    await user.click(getByLabelText('选择组织与工作区'))
    await user.type(getByLabelText('搜索组织'), 'Acme')
    expect(getByText('Acme Corp')).toBeTruthy()
    expect(queryByText('甲公司')).toBeNull()
  })

  it('calls onChange + onOrganizationChange when an org is picked (ws reset to null)', () => {
    const onChange = vi.fn()
    const onOrgChange = vi.fn()
    const { getByLabelText, getByText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={onChange}
        onOrganizationChange={onOrgChange}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('甲公司'))
    expect(onChange).toHaveBeenCalledWith({ organizationId: 'org_1', workspaceId: null })
    expect(onOrgChange).toHaveBeenCalledWith('org_1')
  })

  it('shows workspaces only after an org is selected, and picks one', () => {
    const onChange = vi.fn()
    const { getByLabelText, getByText } = render(
      <OrganizationWorkspacePicker
        organizationId="org_1"
        workspaceId={null}
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={onChange}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    expect(getByText('默认工作区')).toBeTruthy()
    fireEvent.click(getByText('支持工作区'))
    expect(onChange).toHaveBeenCalledWith({ organizationId: 'org_1', workspaceId: 'ws_1b' })
  })

  it('marks already-selected org/workspace as pressed', () => {
    const { getByLabelText, getByRole } = render(
      <OrganizationWorkspacePicker
        organizationId="org_1"
        workspaceId="ws_1a"
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={() => {}}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    // 按钮的 accessible name 含 meta 文案，故用正则匹配
    const selectedOrgBtn = getByRole('button', { name: /甲公司/ }) as HTMLButtonElement
    expect(selectedOrgBtn.getAttribute('aria-pressed')).toBe('true')
    const selectedWsBtn = getByRole('button', { name: '默认工作区' }) as HTMLButtonElement
    expect(selectedWsBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('clear button resets both dimensions', () => {
    const onChange = vi.fn()
    const onOrgChange = vi.fn()
    const { getByLabelText, getByText } = render(
      <OrganizationWorkspacePicker
        organizationId="org_1"
        workspaceId="ws_1a"
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={onChange}
        onOrganizationChange={onOrgChange}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('清除选择'))
    expect(onChange).toHaveBeenCalledWith({ organizationId: null, workspaceId: null })
    expect(onOrgChange).toHaveBeenCalledWith(null)
  })

  it('disables workspace search until an org is chosen', () => {
    const { getByLabelText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={wsOfOrg1}
        onChange={() => {}}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    const wsSearch = getByLabelText('搜索工作区') as HTMLInputElement
    expect(wsSearch.disabled).toBe(true)
  })
})

// 简单冒烟：withIn 仅验证 within 工具可用（不影响覆盖）
describe('OrganizationWorkspacePicker — within helper smoke', () => {
  it('within dialog content locates organization label', () => {
    const { getByLabelText, getByText } = render(
      <OrganizationWorkspacePicker
        organizationId={null}
        workspaceId={null}
        organizations={orgs}
        workspaces={[]}
        onChange={() => {}}
      />
    )
    fireEvent.click(getByLabelText('选择组织与工作区'))
    const title = getByText('组织')
    expect(within(title.parentElement as HTMLElement).getByText('组织')).toBeTruthy()
  })
})
