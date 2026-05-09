import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})

const { window } = dom

globalThis.window = window as unknown as Window & typeof globalThis
globalThis.document = window.document
globalThis.navigator = window.navigator
globalThis.HTMLElement = window.HTMLElement
// HTML element subclasses needed by @testing-library/react
globalThis.HTMLInputElement = window.HTMLInputElement
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement
globalThis.HTMLSelectElement = window.HTMLSelectElement
globalThis.HTMLButtonElement = window.HTMLButtonElement
globalThis.HTMLAnchorElement = window.HTMLAnchorElement
globalThis.HTMLFormElement = window.HTMLFormElement
globalThis.HTMLDivElement = window.HTMLDivElement
globalThis.HTMLSpanElement = window.HTMLSpanElement
globalThis.HTMLLabelElement = window.HTMLLabelElement
globalThis.HTMLParagraphElement = window.HTMLParagraphElement
globalThis.HTMLHeadingElement = window.HTMLHeadingElement
globalThis.SVGElement = window.SVGElement
globalThis.Node = window.Node
globalThis.NodeFilter = window.NodeFilter
globalThis.NodeList = window.NodeList
globalThis.MutationObserver = window.MutationObserver
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.MouseEvent = window.MouseEvent
globalThis.FocusEvent = window.FocusEvent
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.Range = window.Range
globalThis.Text = window.Text
globalThis.Comment = window.Comment
globalThis.DocumentFragment = window.DocumentFragment
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 0) as unknown as number
// gitleaks:allow — DOM Web API standard signature: cancelAnimationFrame(handle: number); not a TSID
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
globalThis.localStorage = window.localStorage
globalThis.sessionStorage = window.sessionStorage

const elementProto = window.HTMLElement.prototype as unknown as {
  attachEvent?: (_eventName: string, _listener: (_event: Event) => void) => void
  detachEvent?: (_eventName: string, _listener: (_event: Event) => void) => void
}

if (typeof elementProto.attachEvent !== 'function') {
  elementProto.attachEvent = () => {}
}

if (typeof elementProto.detachEvent !== 'function') {
  elementProto.detachEvent = () => {}
}

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

// Add global DOM cleanup between tests to prevent "Found multiple elements" errors
// This is necessary because Bun runs test files in parallel and DOM state can leak
import { beforeEach, afterEach } from 'bun:test'

beforeEach(() => {
  // Reset document body to a clean state before each test
  document.body.innerHTML = ''
})

afterEach(() => {
  // Clean up any remaining DOM elements after each test
  document.body.innerHTML = ''
})
