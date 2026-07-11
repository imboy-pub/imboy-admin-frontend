import '../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { EntityDrawer } from './EntityDrawer'

afterEach(cleanup)

describe('EntityDrawer a11y', () => {
  it('exposes dialog role, aria-modal and is labelled by the title', () => {
    const { getByRole } = render(
      <EntityDrawer open title="用户详情" onOpenChange={() => {}}>
        <button type="button">内部按钮</button>
      </EntityDrawer>
    )
    const dialog = getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    expect(document.getElementById(labelId as string)?.textContent).toBe('用户详情')
  })

  it('moves focus into the drawer on open', () => {
    const { getByText } = render(
      <EntityDrawer open title="用户详情" onOpenChange={() => {}}>
        <button type="button">内部按钮</button>
      </EntityDrawer>
    )
    // 焦点应落在抽屉内部（首个可聚焦元素或抽屉容器），不应停留在 body
    expect(document.activeElement).not.toBe(document.body)
    const drawer = getByText('用户详情').closest('[role="dialog"]')
    expect(drawer?.contains(document.activeElement)).toBe(true)
  })

  it('traps Tab within the drawer (wraps from last back to first)', () => {
    const { getByText } = render(
      <EntityDrawer
        open
        title="用户详情"
        onOpenChange={() => {}}
        actions={<button type="button">保存</button>}
      >
        <button type="button">内部按钮</button>
      </EntityDrawer>
    )
    const drawer = getByText('用户详情').closest('[role="dialog"]') as HTMLElement
    const focusables = drawer.querySelectorAll('button')
    const last = focusables[focusables.length - 1] as HTMLElement
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(window, { key: 'Tab' })
    // 从最后一个可聚焦元素按 Tab 应回到第一个，仍在抽屉内
    expect(drawer.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
  })
})
