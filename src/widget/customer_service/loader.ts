/**
 * CSW-01：客服 Widget 宿主页 loader（构建为独立 IIFE `loader.js`）。
 *
 * 设计约束（§12.7 / CSW-01-A01..A05）：
 * - 零第三方依赖、单文件 IIFE；宿主只需贴一段 `<script async src=".../loader.js"
 *   data-widget-id="<public_widget_id>">`；
 * - 幂等：重复注入（多份 script / 重复执行）全局只挂一个按钮（全局哨兵 + DOM 查重）；
 * - 宿主异常零外泄：全部入口 try/catch，失败只隐藏/降级，绝不向宿主页抛错；
 * - iframe sandbox 最小权限起步：`allow-scripts allow-same-origin`——同源是
 *   Widget 应用访问自身同源 API 所必需；不给 allow-top-navigation /
 *   allow-popups / allow-forms（Widget 内不用表单提交，输入框为 JS 驱动），
 *   iframe 与宿主 origin 不同时该组合没有逃逸面；
 * - postMessage：只接受「已知 origin + 已知 source === iframe.contentWindow」的
 *   消息，逐字校验；发往 iframe 的只有白名单上下文（页面 origin/path）。
 *
 * 只读 data-* 白名单键（见 protocol.ts LOADER_DATA_KEYS）；出现其它 data-* 键
 * （例如 SECRET 形状的 data-shop-key）一律忽略并 warn（只 warn 键名，绝不落值）。
 */
import {
  isAllowedLoaderDataKey,
  normalizeOriginInput,
  parseWidgetToHost,
  type WidgetConnectionState,
  type WidgetPosition,
} from './protocol'

const ROOT_ELEMENT_ID = 'imboy-cs-widget-root'
const LAUNCHER_FLAG = '__IMBOY_CS_WIDGET_V1__'
const DEFAULT_WIDGET_PATH = '/widget/index.html'
const DEFAULT_LOCALE = 'zh-CN'
const MESSAGE_SOURCE = 'imboy-cs-widget'

export type LoaderConfig = {
  organizationId: string
  widgetId: string
  widgetOrigin: string
  widgetPath: string
  locale: string
  position: WidgetPosition
}

type LoaderHandle = {
  root: HTMLDivElement
  shadow: ShadowRoot
  iframe: () => HTMLIFrameElement | null
  config: LoaderConfig
  destroy: () => void
}

type WidgetState = {
  open: boolean
  unread: number
  connection: WidgetConnectionState
  iframe: HTMLIFrameElement | null
  frameReady: boolean
}

type UiRefs = {
  button: HTMLButtonElement
  badge: HTMLSpanElement
  panel: HTMLDivElement
  liveRegion: HTMLDivElement
}

// ---------------------------------------------------------------------------
// 配置读取（白名单 + fail-closed）
// ---------------------------------------------------------------------------

export function readLoaderConfig(el: Element): { config: LoaderConfig; ignoredKeys: string[] } | null {
  const ignoredKeys: string[] = []
  const picked: Record<string, string> = {}
  // index 遍历（NamedNodeMap 在部分实现里不可迭代）
  const attributes = el.attributes
  for (let index = 0; index < attributes.length; index += 1) {
    const attr = attributes.item(index)
    if (attr === null || !attr.name.startsWith('data-')) continue
    const key = attr.name.slice(5)
    if (!isAllowedLoaderDataKey(key)) {
      // SECRET 形状键（如 data-shop-key）在此被忽略；绝不把值写入日志
      ignoredKeys.push(key)
      continue
    }
    picked[key] = attr.value
  }
  const widgetId = (picked['widget-id'] ?? '').trim()
  const organizationId = (picked['org-id'] ?? '').trim()
  if (widgetId.length === 0 || organizationId.length === 0) return null
  const originRaw = picked['widget-origin']
  const origin = typeof originRaw === 'string' ? normalizeOriginInput(originRaw) : null
  if (originRaw !== undefined && origin === null) return null
  const pathRaw = picked['widget-path']
  const path = typeof pathRaw === 'string' && pathRaw.startsWith('/') ? pathRaw : DEFAULT_WIDGET_PATH
  const position: WidgetPosition = picked.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'
  return {
    config: {
      organizationId,
      widgetId,
      widgetOrigin: origin ?? '',
      widgetPath: path,
      locale: (picked.locale ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE,
      position,
    },
    ignoredKeys,
  }
}

/** Widget 面板页完整 URL（固定 = 自身 entry origin + 固定 path）。 */
export function buildWidgetUrl(config: LoaderConfig): string | null {
  if (config.widgetOrigin.length === 0) return null
  try {
    return new URL(config.widgetPath, config.widgetOrigin + '/').toString()
  } catch {
    return null
  }
}

/**
 * 规范化 origin：显式 data-widget-origin 优先（非法即 fail-closed，绝不回退）；
 * 缺省时从 loader 自身 `script.src` 推导（计划 FE-W01 / ADM-01-A05：
 * Widget origin 来自 loader src）。两路都经 normalizeOriginInput 严格规范化。
 */
export function resolveWidgetOrigin(explicit: string, scriptSrc: string | null): string | null {
  if (explicit.length > 0) return normalizeOriginInput(explicit)
  if (scriptSrc === null || scriptSrc.length === 0) return null
  try {
    return normalizeOriginInput(new URL(scriptSrc).origin)
  } catch {
    return null
  }
}

/** script.src 绝对化（相对路径按文档 baseURI 解析）；无 src 返回 null。 */
function absoluteScriptSrc(scriptEl: Element, doc: Document): string | null {
  const raw = scriptEl.getAttribute('src')
  if (raw === null || raw.length === 0) return null
  try {
    return new URL(raw, doc.baseURI).toString()
  } catch {
    return null
  }
}

/** postMessage 逐字校验：origin 必须等于期望值，source 必须就是我们的 iframe。 */
export function isFromWidgetFrame(
  event: MessageEvent,
  expectedOrigin: string,
  frame: HTMLIFrameElement | null
): boolean {
  try {
    if (expectedOrigin.length === 0 || event.origin !== expectedOrigin) return false
    if (frame === null) return false
    const win = frame.contentWindow
    if (win === null || event.source !== win) return false
    return true
  } catch {
    return false
  }
}

function alreadyInstalled(doc: Document): boolean {
  const win = doc.defaultView as (Window & Record<string, unknown>) | null
  if (win && win[LAUNCHER_FLAG] === true) return true
  return doc.getElementById(ROOT_ELEMENT_ID) !== null
}

function markInstalled(doc: Document): void {
  const win = doc.defaultView as (Window & Record<string, unknown>) | null
  if (win) win[LAUNCHER_FLAG] = true
}

function unmarkInstalled(doc: Document): void {
  const win = doc.defaultView as (Window & Record<string, unknown>) | null
  if (win) delete win[LAUNCHER_FLAG]
}

// ---------------------------------------------------------------------------
// UI 构建（全部封闭在 shadow root，不污染宿主 CSS/全局）
// ---------------------------------------------------------------------------

function buildStyle(doc: Document): HTMLStyleElement {
  const style = doc.createElement('style')
  style.textContent = `
:host { all: initial; }
.cs-launcher {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 9999px; border: 0;
  background: #2563eb; color: #fff; cursor: pointer;
  box-shadow: 0 10px 25px rgba(0,0,0,.25);
  font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center;
}
.cs-launcher[data-position="bottom-left"] { right: auto; left: 24px; }
.cs-launcher:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.cs-launcher[data-state="error"] { background: #9ca3af; }
.cs-launcher[data-state="offline"] { background: #6b7280; }
.cs-badge {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;
  border-radius: 9999px; background: #dc2626; color: #fff; font-size: 12px;
  display: none; align-items: center; justify-content: center; padding: 0 5px; font-weight: 700;
}
.cs-panel {
  position: fixed; bottom: 92px; right: 24px; z-index: 2147483000;
  width: min(380px, calc(100vw - 32px)); height: min(560px, calc(100vh - 120px));
  border-radius: 12px; overflow: hidden; background: #fff;
  box-shadow: 0 20px 50px rgba(0,0,0,.3);
}
.cs-panel[data-position="bottom-left"] { right: auto; left: 24px; }
@media (max-width: 480px) {
  .cs-panel { bottom: 0; right: 0; left: 0; width: 100vw; height: 100vh; border-radius: 0; }
}
`
  return style
}

function buildLauncherButton(doc: Document, position: WidgetPosition, locale: string): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'cs-launcher'
  button.setAttribute('data-testid', 'cs-widget-launcher')
  button.setAttribute('data-position', position)
  button.setAttribute('data-state', 'online')
  button.setAttribute('aria-haspopup', 'dialog')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-label', locale === 'zh-CN' ? '打开客服聊天' : 'Open customer service chat')
  button.textContent = '💬'
  return button
}

function buildUi(doc: Document, position: WidgetPosition, locale: string): { shadow: ShadowRoot; ui: UiRefs } {
  const root = doc.createElement('div')
  root.id = ROOT_ELEMENT_ID
  root.setAttribute('data-testid', 'cs-widget-root')
  doc.body.appendChild(root)
  const shadow = root.attachShadow({ mode: 'open' })
  shadow.appendChild(buildStyle(doc))
  const button = buildLauncherButton(doc, position, locale)
  const badge = doc.createElement('span')
  badge.className = 'cs-badge'
  badge.setAttribute('data-testid', 'cs-widget-unread-badge')
  badge.setAttribute('aria-hidden', 'true')
  button.appendChild(badge)
  const panel = doc.createElement('div')
  panel.className = 'cs-panel'
  panel.setAttribute('data-testid', 'cs-widget-panel')
  panel.setAttribute('data-position', position)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', locale === 'zh-CN' ? '客服聊天窗口' : 'Customer service chat')
  panel.style.display = 'none'
  const liveRegion = doc.createElement('div')
  liveRegion.setAttribute('data-testid', 'cs-widget-live-region')
  liveRegion.setAttribute('aria-live', 'polite')
  hideElement(liveRegion)
  shadow.appendChild(button)
  shadow.appendChild(panel)
  shadow.appendChild(liveRegion)
  return { shadow, ui: { button, badge, panel, liveRegion } }
}

function hideElement(el: HTMLElement): void {
  el.style.position = 'absolute'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.overflow = 'hidden'
  el.style.clip = 'rect(0 0 0 0)'
}

function renderWidgetState(ui: UiRefs, state: WidgetState, locale: string): void {
  try {
    const open = state.open
    ui.button.setAttribute('data-state', open ? 'open' : state.connection)
    ui.button.setAttribute('aria-expanded', open ? 'true' : 'false')
    const baseLabel = open ? (locale === 'zh-CN' ? '关闭客服聊天' : 'Close chat') : locale === 'zh-CN' ? '打开客服聊天' : 'Open chat'
    const stateLabel =
      state.connection === 'error'
        ? locale === 'zh-CN'
          ? '（客服暂不可用，点击重试）'
          : ' (unavailable, click to retry)'
        : state.connection === 'offline'
          ? locale === 'zh-CN'
            ? '（网络离线）'
            : ' (offline)'
          : ''
    const unreadLabel = !open && state.unread > 0 ? (locale === 'zh-CN' ? `，未读 ${state.unread} 条` : `, ${state.unread} unread`) : ''
    ui.button.setAttribute('aria-label', `${baseLabel}${unreadLabel}${stateLabel}`)
    ui.badge.textContent = state.unread > 0 ? String(state.unread) : ''
    ui.badge.style.display = !open && state.unread > 0 ? 'flex' : 'none'
    ui.panel.style.display = open ? 'block' : 'none'
    ui.liveRegion.textContent =
      !open && state.unread > 0 && locale === 'zh-CN' ? `客服未读消息 ${state.unread} 条` : ''
  } catch {
    /* 宿主异常零外泄 */
  }
}

// ---------------------------------------------------------------------------
// iframe 与消息
// ---------------------------------------------------------------------------

function ensureIframe(
  doc: Document,
  ui: UiRefs,
  config: LoaderConfig,
  widgetUrl: string,
  state: WidgetState,
  onFrameLoad: () => void
): HTMLIFrameElement | null {
  if (state.iframe !== null) return state.iframe
  try {
    const iframe = doc.createElement('iframe')
    iframe.setAttribute('data-testid', 'cs-widget-iframe')
    // sandbox 最小权限：见文件头注释（同源需要 + 不给导航/弹窗/表单）
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.title = config.locale === 'zh-CN' ? '客服聊天窗口' : 'Customer service chat'
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = '0'
    iframe.src = widgetUrl
    iframe.addEventListener('load', onFrameLoad)
    ui.panel.appendChild(iframe)
    state.iframe = iframe
    state.frameReady = false
    return iframe
  } catch {
    return null
  }
}

/** 只向 iframe 发白名单上下文：页面 origin + path（§12.7）；绝不读 cookie/表单/storage/正文。 */
function sendHostContext(win: Window, config: LoaderConfig, state: WidgetState): void {
  try {
    const target = state.iframe?.contentWindow
    if (!target) return
    target.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: 'host-context',
        organizationId: config.organizationId,
        widgetId: config.widgetId,
        locale: config.locale,
        page: { origin: win.location.origin, path: win.location.pathname },
      },
      config.widgetOrigin
    )
  } catch {
    /* 宿主异常零外泄 */
  }
}

/** 面板可见性通知（iframe 据此计未读；协议白名单 HostToWidgetMessage.panel）。 */
function sendPanelState(config: LoaderConfig, state: WidgetState, open: boolean): void {
  try {
    const target = state.iframe?.contentWindow
    if (!target) return
    target.postMessage({ source: MESSAGE_SOURCE, type: 'panel', open }, config.widgetOrigin)
  } catch {
    /* 宿主异常零外泄 */
  }
}

function handleWidgetMessage(
  event: MessageEvent,
  config: LoaderConfig,
  state: WidgetState,
  ui: UiRefs,
  locale: string,
  actions: { onReady: () => void; onClose: () => void }
): void {
  try {
    if (!isFromWidgetFrame(event, config.widgetOrigin, state.iframe)) return
    const message = parseWidgetToHost(event.data)
    if (message === null) return
    if (message.type === 'ready') {
      state.frameReady = true
      actions.onReady()
      return
    }
    if (message.type === 'status') {
      state.connection = message.state
      renderWidgetState(ui, state, locale)
      return
    }
    if (message.type === 'unread') {
      state.unread = message.count
      renderWidgetState(ui, state, locale)
      return
    }
    if (message.type === 'close') {
      actions.onClose()
    }
  } catch {
    /* 宿主异常零外泄 */
  }
}

function warn(win: Window | null, message: string): void {
  try {
    const consoleRef = (win as unknown as { console?: { warn?: (_msg: string) => void } } | null)?.console
    if (consoleRef && typeof consoleRef.warn === 'function') {
      consoleRef.warn(`[imboy-cs-widget] ${message}`)
    }
  } catch {
    /* 宿主异常零外泄 */
  }
}

// ---------------------------------------------------------------------------
// 挂载入口（幂等 + 异常零外泄）
// ---------------------------------------------------------------------------

export function mountCustomerServiceWidget(
  doc: Document,
  scriptEl: Element,
  win: Window = doc.defaultView as Window
): LoaderHandle | null {
  const read = readLoaderConfig(scriptEl)
  if (read === null) {
    warn(win, '缺少 data-widget-id，客服 Widget 未挂载')
    return null
  }
  if (read.ignoredKeys.length > 0) {
    // 只报键名；值为 SECRET 形状时也绝不外泄
    warn(win, `忽略未知的 script data-* 配置键：${read.ignoredKeys.join(', ')}`)
  }
  if (alreadyInstalled(doc)) return null
  // origin 解析：显式 data-widget-origin 优先；缺省从 script.src 推导
  // （FE-W01：loader 缺显式 origin 时从自身 script.src 推导；相对 src 按
  // 文档 baseURI 解析为绝对 URL）。
  const scriptSrc = absoluteScriptSrc(scriptEl, doc)
  const resolvedOrigin = resolveWidgetOrigin(read.config.widgetOrigin, scriptSrc)
  if (resolvedOrigin === null) {
    warn(win, 'widget origin 缺失或非法（data-widget-origin 与 script.src 均不可用），客服 Widget 未挂载')
    return null
  }
  const config: LoaderConfig = { ...read.config, widgetOrigin: resolvedOrigin }
  const widgetUrl = buildWidgetUrl(config)
  if (widgetUrl === null || !win || !doc.body) {
    warn(win, 'widget URL 拼接失败，客服 Widget 未挂载')
    return null
  }

  const state: WidgetState = { open: false, unread: 0, connection: 'online', iframe: null, frameReady: false }
  const { shadow, ui } = buildUi(doc, config.position, config.locale)

  const openPanel = (): void => {
    try {
      ensureIframe(doc, ui, config, widgetUrl, state, () => sendHostContext(win, config, state))
      state.open = true
      state.unread = 0
      renderWidgetState(ui, state, config.locale)
      sendPanelState(config, state, true)
      try {
        state.iframe?.focus()
      } catch {
        /* 聚焦失败不致命 */
      }
    } catch {
      /* 宿主异常零外泄 */
    }
  }
  const closePanel = (): void => {
    try {
      state.open = false
      renderWidgetState(ui, state, config.locale)
      sendPanelState(config, state, false)
      try {
        ui.button.focus()
      } catch {
        /* 聚焦失败不致命 */
      }
    } catch {
      /* 宿主异常零外泄 */
    }
  }
  const onMessage = (event: MessageEvent): void => {
    handleWidgetMessage(event, config, state, ui, config.locale, {
      onReady: () => sendHostContext(win, config, state),
      onClose: closePanel,
    })
  }
  const onKeydown = (event: KeyboardEvent): void => {
    try {
      if (event.key === 'Escape' && state.open) closePanel()
    } catch {
      /* 宿主异常零外泄 */
    }
  }

  ui.button.addEventListener('click', () => {
    if (state.open) closePanel()
    else openPanel()
  })
  win.addEventListener('message', onMessage, false)
  doc.addEventListener('keydown', onKeydown, false)
  markInstalled(doc)
  renderWidgetState(ui, state, config.locale)

  const root = doc.getElementById(ROOT_ELEMENT_ID) as HTMLDivElement | null
  return {
    root: root as HTMLDivElement,
    shadow,
    config,
    iframe: () => state.iframe,
    destroy: () => {
      try {
        win.removeEventListener('message', onMessage, false)
        doc.removeEventListener('keydown', onKeydown, false)
        root?.remove()
        unmarkInstalled(doc)
      } catch {
        /* 宿主异常零外泄 */
      }
    },
  }
}

/** 顶层自动挂载：任何异常都被吞掉——宿主页面绝不能被 widget 拖垮（CSW-01-A05）。 */
export function autoMountCustomerServiceWidget(doc: Document): void {
  try {
    if (alreadyInstalled(doc)) return
    const win = doc.defaultView as Window | null
    if (!win) return
    const script = (doc.currentScript as HTMLScriptElement | null) ?? doc.querySelector('script[src*="loader.js"]')
    if (script === null) {
      warn(win, '未找到 loader script 标签')
      return
    }
    mountCustomerServiceWidget(doc, script, win)
  } catch {
    /* 宿主异常零外泄 */
  }
}

const autoDoc: Document | null = typeof document !== 'undefined' ? (document as Document) : null
if (autoDoc !== null) {
  try {
    if (autoDoc.readyState === 'loading') {
      const kick = () => autoMountCustomerServiceWidget(autoDoc as Document)
      autoDoc.addEventListener('DOMContentLoaded', kick, { once: true })
    } else {
      autoMountCustomerServiceWidget(autoDoc)
    }
  } catch {
    /* 宿主异常零外泄 */
  }
}
