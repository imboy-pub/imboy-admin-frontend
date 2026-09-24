/**
 * EntityDrawer sections 分区能力单测（ENT-FND-01）：
 *   - profile / relationship / custom 三种分区渲染与 a11y（section
 *     aria-labelledby）；
 *   - 关系条目为真实 Link：href 正确、进入焦点陷阱（键盘 Tab 可达）；
 *   - relationship loading / empty 态；
 *   - 向后兼容：仅传 children 的既有消费者行为不变；sections 与 children 共存。
 */
import '../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { EntityDrawer } from './EntityDrawer'
import type { EntityDrawerSection } from './EntityDrawerSections'

afterEach(cleanup)

function renderDrawer(sections?: EntityDrawerSection[], children?: ReactNode) {
  return render(
    <MemoryRouter>
      <EntityDrawer
        open
        title="成员详情"
        onOpenChange={() => {}}
        sections={sections}
      >
        {children}
      </EntityDrawer>
    </MemoryRouter>
  )
}

describe('EntityDrawer sections — 渲染与 a11y', () => {
  it('profile 分区按 label/value 呈现字段', () => {
    const view = renderDrawer([
      {
        id: 'member-facts',
        kind: 'profile',
        title: '成员事实',
        fields: [
          { label: '用户 TSID', value: '8800487111111111111', mono: true },
          { label: '昵称', value: 'imboy' },
        ],
      },
    ])
    const section = view.getByTestId('entity-drawer-sections').querySelector('section')
    expect(section).toBeTruthy()
    // section 由标题标注（aria-labelledby 指向标题元素）
    const labelledBy = section?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('成员事实')
    expect(view.getByText('用户 TSID')).toBeTruthy()
    expect(view.getByText('8800487111111111111')).toBeTruthy()
    expect(view.getByText('昵称')).toBeTruthy()
  })

  it('relationship 分区渲染带 href 的关系条目为站内 Link', () => {
    const view = renderDrawer([
      {
        id: 'member-relations',
        kind: 'relationship',
        title: '关系导航',
        items: [
          { id: 'relation-organization', label: '所属组织：imboy', href: '/organizations/8800' },
          { id: 'relation-plain', label: '无路由关系' },
        ],
      },
    ])
    const link = view.getByTestId('entity-drawer-sections').querySelector('a[data-relation-id="relation-organization"]')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBe('/organizations/8800')
    // 无 href 的条目渲染为纯文本（不是链接）
    const plain = view.getByTestId('entity-drawer-sections').querySelector('[data-relation-id="relation-plain"]')
    expect(plain?.tagName).toBe('SPAN')
  })

  it('relationship 分区 loading / empty 态', () => {
    const loading = renderDrawer([
      { id: 'r1', kind: 'relationship', title: '关系', items: [], loading: true },
    ])
    expect(loading.getByText('关系中...')).toBeTruthy()
    cleanup()

    const empty = renderDrawer([
      { id: 'r2', kind: 'relationship', title: '关系', items: [], emptyMessage: '暂无关联记录' },
    ])
    expect(empty.getByText('暂无关联记录')).toBeTruthy()
  })

  it('custom 分区透传任意内容', () => {
    const view = renderDrawer([
      { id: 'extra', kind: 'custom', title: '附加说明', content: <p data-testid="custom-body">自定义内容</p> },
    ])
    expect(view.getByTestId('custom-body')).toBeTruthy()
  })
})

describe('EntityDrawer sections — 键盘导航（焦点陷阱覆盖关系 Link）', () => {
  it('关系 Link 可聚焦且 Tab 循环不逃出抽屉', () => {
    const view = renderDrawer([
      {
        id: 'member-relations',
        kind: 'relationship',
        title: '关系导航',
        items: [{ id: 'relation-a', label: '关系A', href: '/a' }],
      },
    ])
    const drawer = view.getByRole('dialog')
    const link = drawer.querySelector('a[data-relation-id="relation-a"]') as HTMLElement
    expect(link).toBeTruthy()

    // Tab 从最后一个可聚焦元素（关闭按钮）回到第一个，循环覆盖关系 Link
    const focusables = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button'))
    const last = focusables[focusables.length - 1]
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(drawer.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
  })
})

describe('EntityDrawer sections — 向后兼容', () => {
  it('不传 sections 时 children 照常渲染（既有消费者零改动）', () => {
    const view = renderDrawer(undefined, <p data-testid="legacy-body">既有内容</p>)
    expect(view.getByTestId('legacy-body')).toBeTruthy()
    expect(view.queryByTestId('entity-drawer-sections')).toBeNull()
  })

  it('sections 与 children 共存：sections 在前、children 在后', () => {
    const view = renderDrawer(
      [{ id: 's1', kind: 'profile', title: '分区', fields: [{ label: 'k', value: 'v' }] }],
      <p data-testid="legacy-body">既有内容</p>
    )
    const root = view.getByTestId('entity-drawer-sections')
    expect(root).toBeTruthy()
    expect(view.getByTestId('legacy-body')).toBeTruthy()
    // children 渲染在 sections 容器之后
    expect(root.compareDocumentPosition(view.getByTestId('legacy-body')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
