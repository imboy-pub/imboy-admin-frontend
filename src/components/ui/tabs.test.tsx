import '../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

function TabsDemo() {
  const [value, setValue] = useState('one')
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <TabsTrigger value="one">First</TabsTrigger>
        <TabsTrigger value="two">Second</TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel One</TabsContent>
      <TabsContent value="two">Panel Two</TabsContent>
    </Tabs>
  )
}

afterEach(() => {
  cleanup()
})

describe('Tabs 无障碍（WAI-ARIA APG）', () => {
  it('方向键切换激活项并移动焦点（roving focus，自动激活）', () => {
    const view = render(<TabsDemo />)
    const first = view.getByRole('tab', { name: 'First' })
    const second = view.getByRole('tab', { name: 'Second' })

    expect(first.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(first, { key: 'ArrowRight' })

    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(view.getByRole('tabpanel').textContent).toBe('Panel Two')
    expect(document.activeElement).toBe(second)

    fireEvent.keyDown(second, { key: 'ArrowLeft' })

    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(view.getByRole('tabpanel').textContent).toBe('Panel One')
    expect(document.activeElement).toBe(first)
  })

  it('方向键在末尾循环回到首个 tab', () => {
    const view = render(<TabsDemo />)
    const first = view.getByRole('tab', { name: 'First' })
    const second = view.getByRole('tab', { name: 'Second' })

    fireEvent.click(second)
    expect(second.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(second, { key: 'ArrowRight' })
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(first)
  })

  it('roving tabindex：激活 tab 为 0，其余为 -1', () => {
    const view = render(<TabsDemo />)
    const first = view.getByRole('tab', { name: 'First' })
    const second = view.getByRole('tab', { name: 'Second' })

    expect(first.tabIndex).toBe(0)
    expect(second.tabIndex).toBe(-1)

    fireEvent.click(second)
    expect(first.tabIndex).toBe(-1)
    expect(second.tabIndex).toBe(0)
  })

  it('trigger aria-controls 指向已挂载 panel 的 id，panel aria-labelledby 指回 trigger', () => {
    const view = render(<TabsDemo />)
    const first = view.getByRole('tab', { name: 'First' })
    const panel = view.getByRole('tabpanel')

    expect(first.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(first.id)
    expect(view.container.querySelector(`#${first.getAttribute('aria-controls')}`)).toBe(panel)
  })

  it('tablist 声明 aria-orientation', () => {
    const view = render(<TabsDemo />)
    expect(view.getByRole('tablist').getAttribute('aria-orientation')).toBe('horizontal')
  })
})
