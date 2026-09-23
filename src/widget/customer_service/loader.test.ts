/**
 * CSW-01 / CSD-FE-01 loader 单元测试（jsdom）。
 *
 * 覆盖验收点（合同 v1 S1/S2/S3 / 计划 CSD-FE-01-A01..A05）：
 * - A01：最小 snippet（只有 data-widget-id）可挂载；缺/非法 widget ID fail-closed
 *   （不注入 iframe、不建 root、console.warn 一条、宿主页零副作用）；
 * - A02：origin 只能来自自身 script.src（data-widget-origin/data-org-id 等
 *   历史/未知键一律忽略 + warn 只报键名；非法 scheme fail-closed）；
 *   iframe src 固定 = <origin>/w/<public_widget_id>（无 path 覆写）；
 * - A03：iframe sandbox 最小权限 + 标题 + postMessage origin/source 逐字校验
 *   + 未读徽标 + aria 状态 + 键盘可达（原生 button + Escape 关闭）；
 * - A05：宿主异常零外泄（body 缺失 / 查询抛错均不向宿主抛出）。
 * - A04（API 相对同源/credentials omit/token 纪律）见 widgetApi.test.ts。
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
import { isValidPublicWidgetId, normalizeOriginInput } from './protocol'

/** 合同 v1 S1：public_widget_id = TSID 十进制 string。 */
const WIDGET_ID = '72057594037928001'
const OTHER_WIDGET_ID = '72057594037928009'

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

const MIN_ATTRS = { 'data-widget-id': WIDGET_ID }

describe('readLoaderConfig / buildWidgetUrl（CSD-FE-01-A01/A02）', () => {
  it('唯一配置 = data-widget-id；其它 data-* 键（含 data-org-id/data-widget-origin/data-shop-key）一律进 ignoredKeys，值绝不入配置', () => {
    const script = makeScript(document, {
      ...MIN_ATTRS,
      'data-org-id': '1234567890123456789',
      'data-widget-origin': 'https://evil.example',
      'data-widget-path': '/attacker/path',
      'data-shop-key': 'sk_live_SHOULD_NEVER_BE_READ_0123456789',
    })
    const read = readLoaderConfig(script)
    expect(read).not.toBeNull()
    expect(read?.config.widgetId).toBe(WIDGET_ID)
    expect(read?.ignoredKeys).toEqual(['org-id', 'widget-origin', 'widget-path', 'shop-key'])
    const serialized = JSON.stringify(read)
    // 历史键的值 / SECRET 形状值绝不进入配置与日志对象
    expect(serialized).not.toContain('evil.example')
    expect(serialized).not.toContain('attacker/path')
    expect(serialized).not.toContain('SHOULD_NEVER_BE_READ')
    expect(serialized).not.toContain('organizationId')
  })

  it('缺 data-widget-id → fail-closed（null）；非法形状（非 TSID 十进制）→ fail-closed', () => {
    expect(readLoaderConfig(makeScript(document, {}))).toBeNull()
    expect(readLoaderConfig(makeScript(document, { 'data-widget-id': '   ' }))).toBeNull()
    expect(readLoaderConfig(makeScript(document, { 'data-widget-id': 'wgt_pub_unit' }))).toBeNull()
    expect(readLoaderConfig(makeScript(document, { 'data-widget-id': '../../etc/passwd' }))).toBeNull()
    expect(readLoaderConfig(makeScript(document, { 'data-widget-id': '123;alert(1)' }))).toBeNull()
    expect(isValidPublicWidgetId(WIDGET_ID)).toBe(true)
    expect(isValidPublicWidgetId('0')).toBe(true) // 形状合法；服务端 404 兜底
    expect(isValidPublicWidgetId('abc')).toBe(false)
    expect(isValidPublicWidgetId('1/2')).toBe(false)
  })

  it('buildWidgetUrl 固定落点 = <origin>/w/<public_widget_id>；origin 为空或 id 非法返回 null', () => {
    const config: LoaderConfig = {
      widgetId: WIDGET_ID,
      widgetOrigin: 'https://cs.example.com',
      locale: 'zh-CN',
      position: 'bottom-right',
    }
    expect(buildWidgetUrl(config)).toBe('https://cs.example.com/w/72057594037928001')
    expect(buildWidgetUrl({ ...config, widgetOrigin: '' })).toBeNull()
    expect(buildWidgetUrl({ ...config, widgetId: 'not-a-tsid' })).toBeNull()
  })

  it('normalizeOriginInput 严格规范化：拒绝非 http(s)/路径/查询/通配', () => {
    expect(normalizeOriginInput('ftp://x')).toBeNull()
    expect(normalizeOriginInput('javascript:alert(1)')).toBeNull()
    expect(normalizeOriginInput('not a url')).toBeNull()
    expect(normalizeOriginInput('https://*.example.com')).toBeNull()
    expect(normalizeOriginInput('https://cs.example.com/')).toBe('https://cs.example.com')
  })
})

describe('origin 推导（CSD-FE-01-A02：唯一真源 = script.src）', () => {
  it('resolveWidgetOrigin 恒从 script.src 推导（剥离路径/查询，归一化端口/大小写）', () => {
    expect(resolveWidgetOrigin('https://cs.example.com/static/loader.js?v=3')).toBe('https://cs.example.com')
    expect(resolveWidgetOrigin('https://CS.Example.com:443/loader.js')).toBe('https://cs.example.com')
    expect(resolveWidgetOrigin('http://localhost:8080/loader.js')).toBe('http://localhost:8080')
  })

  it('src 缺失/为空/非法 → null（fail-closed，绝不猜测）', () => {
    expect(resolveWidgetOrigin(null)).toBeNull()
    expect(resolveWidgetOrigin('')).toBeNull()
    expect(resolveWidgetOrigin('not-a-url')).toBeNull()
  })

  it('src 的 origin 非 http(s) → fail-closed（file/ftp/javascript 均拒绝）', () => {
    expect(resolveWidgetOrigin('file:///usr/local/loader.js')).toBeNull()
    expect(resolveWidgetOrigin('ftp://cs.example.com/loader.js')).toBeNull()
    expect(resolveWidgetOrigin('javascript:alert(1)')).toBeNull()
  })

  it('data-widget-origin 显式提供也不能改变 origin（恒从 src 推导）', () => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
    const script = makeScript(document, {
      'data-widget-id': WIDGET_ID,
      'data-widget-origin': 'https://attacker.example',
    })
    const created = mountCustomerServiceWidget(document, script, window)
    expect(created).not.toBeNull()
    expect(created?.config.widgetOrigin).toBe('https://cs.example.com')
    expect(buildWidgetUrl(created!.config)).toBe(`https://cs.example.com/w/${WIDGET_ID}`)
    created?.destroy()
    document.body.innerHTML = ''
    delete win.__IMBOY_CS_WIDGET_V1__
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

  it('最小 snippet（只有 data-widget-id）可挂载', () => {
    const script = makeScript(document, MIN_ATTRS)
    handle = mountCustomerServiceWidget(document, script, window)
    expect(handle).not.toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(1)
  })

  it('同一 script 重复 mount 只有一个 root/按钮；第二次返回 null', () => {
    const script = makeScript(document, MIN_ATTRS)
    handle = mountCustomerServiceWidget(document, script, window)
    expect(handle).not.toBeNull()
    const second = mountCustomerServiceWidget(document, script, window)
    expect(second).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(1)
    expect(handle?.shadow.querySelectorAll('[data-testid="cs-widget-launcher"]').length).toBe(1)
  })

  it('两份 script 标签（真实重复注入场景）仍单实例', () => {
    const scriptA = makeScript(document, MIN_ATTRS)
    const scriptB = makeScript(document, { 'data-widget-id': OTHER_WIDGET_ID })
    handle = mountCustomerServiceWidget(document, scriptA, window)
    expect(handle).not.toBeNull()
    expect(mountCustomerServiceWidget(document, scriptB, window)).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(1)
  })
})

describe('fail-closed（CSD-FE-01-A01：宿主页零副作用）', () => {
  let warns: string[] = []
  let originalWarn: typeof console.warn = console.warn

  beforeEach(() => {
    document.body.innerHTML = ''
    const win = window as unknown as Record<string, unknown>
    delete win.__IMBOY_CS_WIDGET_V1__
    warns = []
    originalWarn = console.warn
    console.warn = (message: unknown) => warns.push(String(message))
  })

  afterEach(() => {
    console.warn = originalWarn
    document.body.innerHTML = ''
  })

  it('缺 data-widget-id：不挂载（无 root）、不建 iframe、warn 恰好一条', () => {
    const script = makeScript(document, { 'data-org-id': '1234567890123456789' })
    const created = mountCustomerServiceWidget(document, script, window)
    expect(created).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(0)
    expect(warns).toHaveLength(1)
  })

  it('非法 data-widget-id：不挂载且 warn 不回显非法值', () => {
    const script = makeScript(document, { 'data-widget-id': 'https://evil.example/x' })
    expect(mountCustomerServiceWidget(document, script, window)).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(0)
    expect(warns).toHaveLength(1)
    expect(warns.join('\n')).not.toContain('evil.example')
  })

  it('src 缺失（origin 无法推导）：不挂载、恰一条 warn', () => {
    const script = makeScript(document, MIN_ATTRS)
    script.removeAttribute('src')
    expect(mountCustomerServiceWidget(document, script, window)).toBeNull()
    expect(document.querySelectorAll('[data-testid="cs-widget-root"]').length).toBe(0)
    expect(warns).toHaveLength(1)
  })

  it('未知 data-* 键（历史 data-org-id + data-shop-key）：忽略 + 一次性 warn 只报键名', () => {
    const script = makeScript(document, {
      ...MIN_ATTRS,
      'data-org-id': '1234567890123456789',
      'data-widget-origin': 'https://evil.example',
      'data-shop-key': 'fake_secret_shape_TOPSECRETVALUE',
    })
    const created = mountCustomerServiceWidget(document, script, window)
    expect(created).not.toBeNull()
    created?.destroy()
    const joined = warns.join('\n')
    expect(joined).toContain('org-id')
    expect(joined).toContain('widget-origin')
    expect(joined).toContain('shop-key')
    // 键名之外绝不回显任何值
    expect(joined).not.toContain('1234567890123456789')
    expect(joined).not.toContain('evil.example')
    expect(joined).not.toContain('TOPSECRETVALUE')
  })
})

function postEvent(target: Window, init: MessageEventInit): boolean {
  // 用 jsdom window 的 MessageEvent 构造（globalThis 未注入 MessageEvent，
  // 其他来源的 Event 实例会被 jsdom dispatchEvent 拒绝）
  const WinCtor = (target as unknown as { MessageEvent: typeof MessageEvent }).MessageEvent
  return target.dispatchEvent(new WinCtor('message', init))
}

describe('launcher / iframe / postMessage（CSD-FE-01-A03）', () => {
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
    const script = makeScript(document, MIN_ATTRS)
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

  it('iframe src 固定 = <origin>/w/<public_widget_id>；sandbox/标题/键盘可达（A02/A03）', () => {
    const created = mount()
    const button = launcherOf(created)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toContain('打开客服聊天')
    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const iframe = iframeOf(created)
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe(`https://cs.example.com/w/${WIDGET_ID}`)
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframe?.title.length).toBeGreaterThan(0)
    // aria-label 不携带任何 secret 形状
    expect(button.getAttribute('aria-label')).not.toMatch(/sk_|shop_key|secret/i)
  })

  it('postMessage 双校验：非法 origin / 非法 source 均忽略；合法消息生效（A03）', () => {
    const created = mount()
    launcherOf(created).click()
    const win = fakeFrameWindow(created)
    const badge = created.shadow.querySelector('[data-testid="cs-widget-unread-badge"]')

    // 非法 origin：忽略（未读不变）
    postEvent(window, { origin: 'https://evil.example', source: win, data: { source: 'imboy-cs-widget', type: 'unread', count: 7 } })
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

  it('panel 消息时序：frame 未就绪不投递；ready 后补发当前面板状态（CSD-FE-01-A03 修复）', () => {
    const created = mount()
    const calls: Array<{ msg: unknown; origin: string }> = []
    const recordingWin = {
      postMessage: (msg: unknown, origin: string) => {
        calls.push({ msg, origin })
      },
    } as unknown as Window

    // 首次点击：iframe 刚创建、frame 未 ready，此时不得向 contentWindow postMessage
    //（初始 about:blank 文档继承宿主 origin，投递会在宿主控制台报 DOMException）
    launcherOf(created).click()
    expect(calls).toHaveLength(0)

    // frame 就绪（发 ready）→ host 补发 host-context + panel(当前 open=true)
    const iframe = iframeOf(created)
    if (iframe === null) throw new Error('iframe 未创建')
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: recordingWin })
    postEvent(window, { origin: 'https://cs.example.com', source: recordingWin, data: { source: 'imboy-cs-widget', type: 'ready' } })
    const panelMsgs = calls.filter((c) => (c.msg as { type?: string }).type === 'panel')
    expect(calls.some((c) => (c.msg as { type?: string }).type === 'host-context')).toBe(true)
    expect(panelMsgs).toHaveLength(1)
    expect((panelMsgs[0]?.msg as { open?: boolean }).open).toBe(true)
    expect(panelMsgs[0]?.origin).toBe('https://cs.example.com')

    // frame 已就绪后开关面板：panel 消息正常投递
    launcherOf(created).click()
    const panelMsgsAfter = calls.filter((c) => (c.msg as { type?: string }).type === 'panel')
    expect((panelMsgsAfter.at(-1)?.msg as { open?: boolean }).open).toBe(false)
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
    script.setAttribute('data-widget-id', WIDGET_ID)
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
})
