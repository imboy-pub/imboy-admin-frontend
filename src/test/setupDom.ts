import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})

const { window } = dom

globalThis.window = window as unknown as Window & typeof globalThis
globalThis.document = window.document
globalThis.navigator = window.navigator
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.MutationObserver = window.MutationObserver
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 0) as unknown as number
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)

const elementProto = window.HTMLElement.prototype as unknown as {
  attachEvent?: (eventName: string, listener: (event: Event) => void) => void
  detachEvent?: (eventName: string, listener: (event: Event) => void) => void
}

if (typeof elementProto.attachEvent !== 'function') {
  elementProto.attachEvent = () => {}
}

if (typeof elementProto.detachEvent !== 'function') {
  elementProto.detachEvent = () => {}
}

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true
