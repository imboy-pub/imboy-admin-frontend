import '../../../../test/setupDom'
import { afterEach, beforeEach, expect, it, mock } from 'bun:test'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useSeatMessageViewport } from './messageViewport'

const originalObserver = globalThis.IntersectionObserver
const observers: TestObserver[] = []
class TestObserver {
  targets = new Set<Element>()
  constructor(private _callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    expect(options.root).toBeNull()
    observers.push(this)
  }
  observe(target: Element) { this.targets.add(target); this.update() }
  disconnect() { this.targets.clear() }
  update() {
    const entries = [...this.targets].map(target => {
      const rect = target.getBoundingClientRect()
      const visible = rect.height > 0 && rect.bottom > 0 && rect.top < 100
      return { target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry
    })
    this._callback(entries, this as unknown as IntersectionObserver)
  }
}
beforeEach(() => Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: TestObserver }))
afterEach(() => {
  cleanup()
  observers.length = 0
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: originalObserver })
})
const updateObservers = () => act(() => { for (const observer of observers) observer.update() })
const ids = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => String(start + i))

function Harness({ messages, scope = 'a', visible }: {
  messages: string[]; scope?: string; visible: (_id: string | null) => void
}) {
  const { containerRef, onScroll, hasNewMessages, jumpToLatest } = useSeatMessageViewport(scope, messages, visible)
  return <>
    <div data-testid="viewport" ref={containerRef} onScroll={onScroll}>
      <ul ref={node => {
        const box = node?.parentElement
        if (box) {
        Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 100 })
        Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => box.querySelectorAll('li').length * 20 })
        box.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)
      }
      }}>{messages.map((id, i) => <li key={id} data-message-id={id} ref={node => {
        if (node) node.getBoundingClientRect = () => {
          const top = i * 20 - (node.closest('[data-testid="viewport"]') as HTMLElement).scrollTop
          return { top, bottom: top + 20, height: 20 } as DOMRect
        }
      }}>{id}</li>)}</ul>
    </div>
    {hasNewMessages && <button onClick={jumpToLatest}>新消息</button>}
  </>
}

it('opens the latest window and reports the visible maximum, then updates on scroll', () => {
  const visible = mock((_id: string | null) => {})
  const v = render(<Harness messages={ids(151, 200)} visible={visible} />)
  const box = v.getByTestId('viewport')
  expect(box.scrollTop).toBe(900)
  expect(visible).toHaveBeenLastCalledWith('200')
  box.scrollTop = 100
  fireEvent.scroll(box)
  updateObservers()
  expect(visible).toHaveBeenLastCalledWith('160')
})

it('preserves the visible anchor when older messages are prepended', () => {
  const visible = mock((_id: string | null) => {})
  const v = render(<Harness messages={ids(151, 200)} visible={visible} />)
  const box = v.getByTestId('viewport')
  box.scrollTop = 100
  fireEvent.scroll(box)
  updateObservers()
  v.rerender(<Harness messages={ids(101, 200)} visible={visible} />)
  expect(box.scrollTop).toBe(1100)
  expect(visible).toHaveBeenLastCalledWith('160')
})

it('does not jump while reading history, offers new-message navigation, and follows the bottom', () => {
  const visible = mock((_id: string | null) => {})
  const v = render(<Harness messages={ids(151, 200)} visible={visible} />)
  const box = v.getByTestId('viewport')
  box.scrollTop = 100
  fireEvent.scroll(box)
  updateObservers()
  v.rerender(<Harness messages={ids(151, 201)} visible={visible} />)
  expect(box.scrollTop).toBe(100)
  fireEvent.scroll(box)
  expect(v.queryByText('新消息')).not.toBeNull()
  fireEvent.click(v.getByText('新消息'))
  updateObservers()
  expect(box.scrollTop).toBe(920)
  expect(v.queryByText('新消息')).toBeNull()
  v.rerender(<Harness messages={ids(151, 202)} visible={visible} />)
  expect(box.scrollTop).toBe(940)
})

it('resets scroll state when the session scope changes', () => {
  const visible = mock((_id: string | null) => {})
  const v = render(<Harness messages={ids(151, 200)} visible={visible} />)
  const box = v.getByTestId('viewport')
  box.scrollTop = 100
  fireEvent.scroll(box)
  updateObservers()
  v.rerender(<Harness scope="b" messages={ids(1, 10)} visible={visible} />)
  expect(box.scrollTop).toBe(100)
  expect(visible).toHaveBeenLastCalledWith('10')
})

it('waits for viewport intersection and stops reporting rows when the observer reports clipping', () => {
  const original = globalThis.IntersectionObserver
  let callback: IntersectionObserverCallback | undefined
  class Observer {
    constructor(cb: IntersectionObserverCallback, options: IntersectionObserverInit) {
      expect(options.root).toBeNull()
      callback = cb
    }
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: Observer })
  try {
    const visible = mock((_id: string | null) => {})
    const v = render(<Harness messages={ids(1, 10)} visible={visible} />)
    expect(visible).toHaveBeenLastCalledWith(null)
    const row = v.getByText('10')
    const entry = (intersecting: boolean) => ({ target: row, isIntersecting: intersecting, intersectionRatio: intersecting ? 1 : 0 }) as IntersectionObserverEntry
    act(() => callback!([entry(true)], {} as IntersectionObserver))
    expect(visible).toHaveBeenLastCalledWith('10')
    act(() => callback!([entry(false)], {} as IntersectionObserver))
    expect(visible).toHaveBeenLastCalledWith(null)
    cleanup()
  } finally {
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: original })
  }
})

it('fails closed for reading when viewport observation is unavailable', () => {
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: undefined })
  const visible = mock((_id: string | null) => {})
  render(<Harness messages={ids(1, 10)} visible={visible} />)
  expect(visible).toHaveBeenLastCalledWith(null)
})
