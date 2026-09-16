/**
 * CSW-01：客服 Widget loader ⇄ iframe 共享消息协议与配置白名单。
 *
 * 安全要点（§12.7）：
 * - loader 与 iframe 只与「已知 origin + 已知 source window」互发 postMessage，
 *   每条消息都必须带 `source` 标识并通过逐字校验；
 * - 宿主页 → Widget 只允许传白名单上下文（页面 origin/path），禁止读取/转发
 *   Cookie、表单、localStorage、正文等任何其他宿主数据；
 * - script 标签只接受 LOADER_DATA_KEYS 白名单内的 data-* 属性，
 *   其余（例如 data-shop-key 这类 SECRET 形状）一律忽略并 warn（键名，不含值）。
 */

export const WIDGET_MESSAGE_SOURCE = 'imboy-cs-widget' as const

/** loader 支持的 data-* 配置键（不含 `data-` 前缀，kebab-case），全部为 PUBLIC 标识。 */
export const LOADER_DATA_KEYS = ['widget-id', 'widget-origin', 'widget-path', 'locale', 'position'] as const

export type LoaderDataKey = (typeof LOADER_DATA_KEYS)[number]

export type WidgetConnectionState = 'online' | 'offline' | 'error'

export type WidgetPosition = 'bottom-right' | 'bottom-left'

/** loader → iframe：宿主白名单上下文（仅页面 origin + path）。 */
export type HostContextMessage = {
  source: typeof WIDGET_MESSAGE_SOURCE
  type: 'host-context'
  widgetId: string
  locale: string
  page: { origin: string; path: string }
}

/** iframe → loader：就绪握手 / 连接状态 / 未读数 / 请求关闭面板。 */
export type WidgetToHostMessage =
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'ready' }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'status'; state: WidgetConnectionState }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'unread'; count: number }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'close' }

/** loader → iframe：宿主上下文 + 打开/关闭通知（iframe 可感知面板可见性）。 */
export type HostToWidgetMessage =
  | HostContextMessage
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'panel'; open: boolean }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isWidgetEnvelope(data: unknown): data is Record<string, unknown> {
  return isPlainObject(data) && data.source === WIDGET_MESSAGE_SOURCE
}

/** 逐字段校验 iframe → loader 消息；不认识的形状一律返回 null（fail-closed）。 */
export function parseWidgetToHost(data: unknown): WidgetToHostMessage | null {
  if (!isWidgetEnvelope(data)) return null
  switch (data.type) {
    case 'ready':
      return { source: WIDGET_MESSAGE_SOURCE, type: 'ready' }
    case 'status':
      if (data.state === 'online' || data.state === 'offline' || data.state === 'error') {
        return { source: WIDGET_MESSAGE_SOURCE, type: 'status', state: data.state }
      }
      return null
    case 'unread':
      if (typeof data.count === 'number' && Number.isInteger(data.count) && data.count >= 0) {
        return { source: WIDGET_MESSAGE_SOURCE, type: 'unread', count: data.count }
      }
      return null
    case 'close':
      return { source: WIDGET_MESSAGE_SOURCE, type: 'close' }
    default:
      return null
  }
}

/** 逐字段校验 loader → iframe 消息；不认识的形状一律返回 null（fail-closed）。 */
export function parseHostToWidget(data: unknown): HostToWidgetMessage | null {
  if (!isWidgetEnvelope(data)) return null
  if (data.type === 'panel') {
    if (typeof data.open === 'boolean') {
      return { source: WIDGET_MESSAGE_SOURCE, type: 'panel', open: data.open }
    }
    return null
  }
  if (data.type === 'host-context') {
    const page = isPlainObject(data.page) ? data.page : null
    if (
      typeof data.widgetId === 'string' &&
      data.widgetId.length > 0 &&
      typeof data.locale === 'string' &&
      page !== null &&
      typeof page.origin === 'string' &&
      typeof page.path === 'string'
    ) {
      return {
        source: WIDGET_MESSAGE_SOURCE,
        type: 'host-context',
        widgetId: data.widgetId,
        locale: data.locale,
        page: { origin: page.origin, path: page.path },
      }
    }
  }
  return null
}

/**
 * 规范化 origin 字符串（去空白、去尾斜杠、必须 http(s) 裸 origin——
 * 拒绝路径/查询串/hash/通配）。非法输入返回 null（fail-closed，绝不猜测）。
 */
export function normalizeOriginInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (trimmed.length === 0) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if ((url.pathname !== '' && url.pathname !== '/') || url.search !== '' || url.hash !== '') return null
    if (url.hostname.includes('*')) return null
    return url.origin
  } catch {
    return null
  }
}

/** script data-* 白名单校验：只放行 LOADER_DATA_KEYS（首字母小写驼峰形式）。 */
export function isAllowedLoaderDataKey(key: string): key is LoaderDataKey {
  return (LOADER_DATA_KEYS as readonly string[]).includes(key)
}
