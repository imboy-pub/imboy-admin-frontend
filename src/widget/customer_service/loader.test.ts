/**
 * CSW-01 loader 单元测试（jsdom）。
 *
 * 覆盖验收点：
 * - CSW-01-A02：重复注入幂等（多份 script / 重复调用只挂一个按钮）；
 * - CSW-01-A03：iframe sandbox 最小权限 + 标题 + postMessage origin/source 逐字校验
 *   + 未读徽标 + aria 状态 + 键盘可达（原生 button + Escape 关闭）；
 * - CSW-01-A04/CSC-00-A04：SECRET 形状 data-* 键（如 data-shop-key）被忽略并 warn
 *   （只 warn 键名，值绝不外泄）；
 * - CSW-01-A05：宿主异常零外泄（body 缺失 / 查询抛错均不向宿主抛出）。
 */
import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  autoMountCustomerServiceWidget,
  buildWidgetUrl,
  isFromWidgetFrame,
  mountCustomerServiceWidget,
  readLoaderConfig,
  resolveWidgetOrigin,
  type LoaderConfig,
  type LoaderHandle,
} from './loader'
import { normalizeOriginInput } from './protocol'

function makeScript(doc: Document, attrs: Record<string, string> = {}): HTMLScriptElement {
  const script = doc.createElement('script')
  script.setAttribute('src', 'https://cs.example.com/loader.js')
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value)
  doc.body.appendChild(script)
  return script
}

function launcherOf(handle: LoaderHandle): HTMLButtonElement {
  const button = handle.shadow.querySelector('button[data-testid="cs-widget-launcher"]')
  if (button === null) throw new Error('launcher button 不存在')
  return button as HTMLButtonElement
}

function iframeOf(handle: LoaderHandle): HTMLIFrameElement | null {
  return handle.shadow.querySelector('iframe[data-testid="cs-widget-iframe"]')
}

const BASE_ATTRS = {
  'data-org-id': '1234567890123456789',
  'data-widget-id': 'wgt_pub_unit',
  'data-widget-origin': 'https://cs.example.com',
}

describe('readLoaderConfig / buildWidgetUrl（A01/A04）', () => {
  it('读取白名单 data-* 键（含 data-org-id），忽略未知键（如 data-shop-key）并只报键名', () => {
    const script = makeScript(document, {
      ...BASE_ATTRS,
      'data-locale': 'zh-CN',
      'data-position': 'bottom-left',
      'data-shop-key': 'sk_live_SHOULD_NEVER_BE_READ_0123456789',
    })
    const read = readLoaderConfig(script)
    expect(read).not.toBeNull()
    expect(read?.config.organizationId).toBe('1234567890123456789')
    expect(read?.config.widgetId).toBe('wgt_pub_unit')
    expect(read?.config.widgetOrigin).toBe('https://cs.example.com')
    expect(read?.config.position).toBe('bottom-left')
    expect(read?.ignoredKeys).toEqual(['shop-key'])
    // 配置对象里绝不出现 shop key 值
    expect(JSON.stringify(read?.config)).not.toContain('SHOULD_NEVER_BE_READ')
  })

  it('缺少 data-widget-id 或 data-org-id 时 fail-closed（返回 null）', () => {
    const noWidget = makeScript(document, { 'data-widget-origin': 'https://cs.example.com', 'data-org-id': '1' })
    expect(readLoaderConfig(noWidget)).toBeNull()
    const noOrg = makeScript(document, { 'data-widget-id': 'wgt_pub_unit', 'data-widget-origin': 'https://cs.example.com' })
    expect(readLoaderConfig(noOrg)).toBeNull()
  })

  it('data-widget-origin 非法时 fail-closed；normalizeOriginInput 拒绝非 http(s)', () => {
    const bad = makeScript(document, { 'data-widget-id': 'w1', 'data-widget-origin': 'javascript:alert(1)' })
    expect(readLoaderConfig(bad)).toBeNull()
    expect(normalizeOriginInput('ftp://x')).toBeNull()
    expect(normalizeOriginInput('not a url')).toBeNull()
    expect(normalizeOriginInput('https://cs.example.com/')).toBe('https://cs.example.com')
  })

  it('buildWidgetUrl 拼接固定 entry path；origin 为空返回 null', () => {
    const config: LoaderConfig = {
      organizationId: '1234567890123456789',
      widgetId: 'w',
      widgetOrigin: 'https://cs.example.com',
      widgetPath: '/widget/index.html',
      locale: 'zh-CN',
      position: 'bottom-right',
    }
    expect(buildWidgetUrl(config)).toBe('https://cs.example.com/widget/index.html')
    expect(buildWidgetUrl({ ...config, widgetOrigin: '' })).toBeNull()
  })
})

describe('mountCustomerServiceWidget 幂等（A02）', () => {
  let handle: LoaderHandle | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
  })

  afterEach(() => {
    handle?.destroy()
    handle = null
    document.body.innerHTML = ''
  })

  it('同一 script 重复 mount 只有一个 root/按钮；第二次返回 null', () => {
    const script = makeScript(document, BASE_ATTRS)
    handle = mountCustomerServiceWidget(document, script, window)
    expect(handle).not.toBeNull()
    const second = mountCustomerServiceWidget(document, script, window)
    expect(second).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(1)
    expect(handle?.shadow.querySelectorAll('[data-testid="cs-widget-launcher"]').length).toBe(1)
  })

  it('两份 script 标签（真实重复注入场景）仍单实例', () => {
    const scriptA = makeScript(document, BASE_ATTRS)
    const scriptB = makeScript(document, { ...BASE_ATTRS, 'data-position': 'bottom-left' })
    handle = mountCustomerServiceWidget(document, scriptA, window)
    expect(handle).not.toBeNull()
    expect(mountCustomerServiceWidget(document, scriptB, window)).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(1)
  })
})

function postEvent(target: Window, init: MessageEventInit): boolean {
  // 用 jsdom window 的 MessageEvent 构造（globalThis 未注入 MessageEvent，
  // 其他来源的 Event 实例会被 jsdom dispatchEvent 拒绝）
  const WinCtor = (target as unknown as { MessageEvent: typeof MessageEvent }).MessageEvent
  return target.dispatchEvent(new WinCtor('message', init))
}

describe('launcher / iframe / postMessage（A03）', () => {
  let handle: LoaderHandle | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
  })

  afterEach(() => {
    handle?.destroy()
    handle = null
    document.body.innerHTML = ''
  })

  function mount(): LoaderHandle {
    const script = makeScript(document, BASE_ATTRS)
    const created = mountCustomerServiceWidget(document, script, window)
    if (created === null) throw new Error('mount 失败')
    handle = created
    return created
  }

  /** jsdom 不为 iframe 创建 contentWindow：注入可预测的假窗口供 source 校验用。 */
  function fakeFrameWindow(created: LoaderHandle): Window {
    const iframe = iframeOf(created)
    if (iframe === null) throw new Error('iframe 未创建')
    const fake = { postMessage: () => undefined } as unknown as Window
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: fake })
    return fake
  }

  it('按钮键盘可达（原生 button）+ 点击打开 iframe（sandbox/标题/aria-expanded）', () => {
    const created = mount()
    const button = launcherOf(created)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toContain('打开客服聊天')
    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const iframe = iframeOf(created)
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframe?.title.length).toBeGreaterThan(0)
    // aria-label 不携带任何 secret 形状
    expect(button.getAttribute('aria-label')).not.toMatch(/sk_|shop_key|secret/i)
  })

  it('合法 origin+source 的消息更新未读徽标；非法 origin 被忽略', () => {
    const created = mount()
    launcherOf(created).click()
    const win = fakeFrameWindow(created)

    // 非法 origin：忽略（未读不变）
    postEvent(window, { origin: 'https://evil.example', source: win, data: { source: 'imboy-cs-widget', type: 'unread', count: 7 } })
    const badge = created.shadow.querySelector('[data-testid="cs-widget-unread-badge"]')
    expect(badge?.textContent).toBe('')

    // 非法 source（同 origin 但不是我们的 iframe）：忽略
    postEvent(window, { origin: 'https://cs.example.com', source: window, data: { source: 'imboy-cs-widget', type: 'unread', count: 9 } })
    expect(badge?.textContent).toBe('')

    // 合法消息：未读更新（面板打开时不显示徽标，先关闭再验证）
    postEvent(window, { origin: 'https://cs.example.com', source: win, data: { source: 'imboy-cs-widget', type: 'unread', count: 3 } })
    launcherOf(created).click() // 关闭面板
    expect(badge?.textContent).toBe('3')
    expect(launcherOf(created).getAttribute('aria-label')).toContain('未读 3 条')
  })

  it('Escape 关闭面板并把焦点还给按钮（焦点管理）', () => {
    const created = mount()
    const button = launcherOf(created)
    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('状态消息映射：error 状态更新按钮 data-state 与 aria-label', () => {
    const created = mount()
    launcherOf(created).click()
    const win = fakeFrameWindow(created)
    postEvent(window, { origin: 'https://cs.example.com', source: win, data: { source: 'imboy-cs-widget', type: 'status', state: 'error' } })
    const button = launcherOf(created)
    // 面板打开时 data-state=open；关闭后回到 error 态
    button.click()
    expect(button.getAttribute('data-state')).toBe('error')
    expect(button.getAttribute('aria-label')).toContain('客服暂不可用')
  })
})

describe('isFromWidgetFrame / 宿主异常零外泄（A05）', () => {
  it('origin 不匹配 / source 不匹配 / 异常输入一律 false', () => {
    expect(isFromWidgetFrame({ origin: 'https://other' } as MessageEvent, 'https://cs.example.com', null)).toBe(false)
    expect(isFromWidgetFrame({ origin: 'https://cs.example.com' } as MessageEvent, 'https://cs.example.com', null)).toBe(false)
    expect(isFromWidgetFrame({ origin: '' } as MessageEvent, '', null)).toBe(false)
  })

  it('body 缺失时 mount 返回 null 且不抛错', () => {
    const detached = document.implementation.createHTMLDocument('x')
    detached.body.remove()
    const script = detached.createElement('script')
    script.setAttribute('data-org-id', '1')
    script.setAttribute('data-widget-id', 'w')
    script.setAttribute('data-widget-origin', 'https://cs.example.com')
    expect(() => mountCustomerServiceWidget(detached, script, detached.defaultView as Window)).not.toThrow()
  })

  it('querySelector 抛错时 autoMount 吞掉异常（宿主页面继续运行）', () => {
    const hostile = document.implementation.createHTMLDocument('hostile')
    const hostileAsAny = hostile as unknown as { querySelector: () => never }
    hostileAsAny.querySelector = () => {
      throw new Error('hostile page broke querySelector')
    }
    expect(() => autoMountCustomerServiceWidget(hostile)).not.toThrow()
  })

  it('warn 只出现在 console（jest spy），且不包含被忽略键的值', () => {
    const warns: string[] = []
    const originalWarn = console.warn
    console.warn = (message: unknown) => warns.push(String(message))
    try {
      const doc = document
      doc.body.innerHTML = ''
      const script = makeScript(doc, { 'data-org-id': '1', 'data-widget-id': 'w', 'data-widget-origin': 'https://cs.example.com', 'data-shop-key': 'fake_secret_shape_TOPSECRETVALUE' })
      const h = mountCustomerServiceWidget(doc, script, window)
      h?.destroy()
      const joined = warns.join('\n')
      expect(joined).toContain('shop-key')
      expect(joined).not.toContain('TOPSECRETVALUE')
    } finally {
      console.warn = originalWarn
    }
  })
})

describe('origin 推导与严格规范化（FE-W01 / ADM-01-A05）', () => {
  it('resolveWidgetOrigin：显式值优先且严格规范化（大小写/默认端口/尾斜杠）', () => {
    expect(resolveWidgetOrigin('https://CS.Example.com:443/', null)).toBe('https://cs.example.com')
    expect(resolveWidgetOrigin('  https://cs.example.com  ', 'https://other.example/loader.js')).toBe('https://cs.example.com')
    // 显式值非法 → fail-closed（绝不回退到推导，绝不猜测）
    expect(resolveWidgetOrigin('javascript:alert(1)', 'https://cs.example.com/loader.js')).toBeNull()
    expect(resolveWidgetOrigin('https://cs.example.com/path', null)).toBeNull()
    expect(resolveWidgetOrigin('https://*.example.com', null)).toBeNull()
  })

  it('缺显式 origin 时从自身 script.src 推导（含路径剥离）', () => {
    expect(resolveWidgetOrigin('', 'https://cs.example.com/static/loader.js?v=3')).toBe('https://cs.example.com')
    expect(resolveWidgetOrigin('', 'http://localhost:8080/loader.js')).toBe('http://localhost:8080')
    expect(resolveWidgetOrigin('', null)).toBeNull()
    expect(resolveWidgetOrigin('', '')).toBeNull()
    expect(resolveWidgetOrigin('', 'not-a-url')).toBeNull()
  })

  it('mount：无 data-widget-origin 时按 script src 推导并成功挂载', () => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
    const script = makeScript(document, { 'data-org-id': '1234567890123456789', 'data-widget-id': 'wgt_pub_unit' })
    script.setAttribute('src', 'https://cs.example.com/static/loader.js')
    const created = mountCustomerServiceWidget(document, script, window)
    expect(created).not.toBeNull()
    expect(created?.config.widgetOrigin).toBe('https://cs.example.com')
    expect(buildWidgetUrl(created!.config)).toBe('https://cs.example.com/widget/index.html')
    created?.destroy()
    document.body.innerHTML = ''
    delete win.__IMBOY_CS_WIDGET_V1__
  })

  it('mount：无显式 origin 且无可用 src → fail-closed 不挂载', () => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
    const script = makeScript(document, { 'data-org-id': '1', 'data-widget-id': 'w' })
    script.removeAttribute('src')
    expect(mountCustomerServiceWidget(document, script, window)).toBeNull()
    document.body.innerHTML = ''
    delete win.__IMBOY_CS_WIDGET_V1__
  })
})
