/**
 * CSW-01：loader ⇄ iframe postMessage 协议解析器单元测试（REVIEW-2 R2-4 缺口
 * 扫描落点）。既有 loader.test.ts 已覆盖 isValidPublicWidgetId / normalizeOriginInput
 * 与 DOM 集成侧双校验；此处直测**纯解析器**的逐字段 fail-closed 合同（不可信
 * postMessage 输入面的第一道门）：
 *   - 信封双校验的 source 侧：非 `imboy-cs-widget` source 一律拒收；
 *   - 逐字段校验：status/unread/panel/host-context 的值域门；
 *   - 未知 type / 非对象 / 数组 → null（绝不猜测）。
 */
import { describe, expect, it } from 'bun:test'
import {
  isAllowedLoaderDataKey,
  isWidgetEnvelope,
  LOADER_DATA_KEYS,
  parseHostToWidget,
  parseWidgetToHost,
  WIDGET_MESSAGE_SOURCE,
} from './protocol'

const SRC = WIDGET_MESSAGE_SOURCE

describe('isWidgetEnvelope：信封 source 侧合同', () => {
  it('source 逐字相等才放行；非对象/数组/缺 source/伪 source 一律 false', () => {
    expect(isWidgetEnvelope({ source: SRC, type: 'ready' })).toBe(true)
    expect(isWidgetEnvelope({ source: 'imboy-cs-widget-evil', type: 'ready' })).toBe(false)
    expect(isWidgetEnvelope({ source: 'IMBOY-CS-WIDGET', type: 'ready' })).toBe(false)
    expect(isWidgetEnvelope({ type: 'ready' })).toBe(false)
    expect(isWidgetEnvelope(null)).toBe(false)
    expect(isWidgetEnvelope('ready')).toBe(false)
    expect(isWidgetEnvelope([{ source: SRC }])).toBe(false)
  })
})

describe('parseWidgetToHost：iframe → loader 逐字段校验', () => {
  it('ready/close 无载荷字段，合法即回投影', () => {
    expect(parseWidgetToHost({ source: SRC, type: 'ready' })).toEqual({ source: SRC, type: 'ready' })
    expect(parseWidgetToHost({ source: SRC, type: 'close' })).toEqual({ source: SRC, type: 'close' })
  })

  it('status 仅接受 online/offline/error 三态；未知状态 → null', () => {
    expect(parseWidgetToHost({ source: SRC, type: 'status', state: 'online' })).toEqual({
      source: SRC,
      type: 'status',
      state: 'online',
    })
    expect(parseWidgetToHost({ source: SRC, type: 'status', state: 'busy' })).toBeNull()
    expect(parseWidgetToHost({ source: SRC, type: 'status' })).toBeNull()
  })

  it('unread 仅接受非负整数；负数/小数/字符串 → null', () => {
    expect(parseWidgetToHost({ source: SRC, type: 'unread', count: 0 })).toEqual({
      source: SRC,
      type: 'unread',
      count: 0,
    })
    expect(parseWidgetToHost({ source: SRC, type: 'unread', count: 3 })).toEqual({
      source: SRC,
      type: 'unread',
      count: 3,
    })
    expect(parseWidgetToHost({ source: SRC, type: 'unread', count: -1 })).toBeNull()
    expect(parseWidgetToHost({ source: SRC, type: 'unread', count: 1.5 })).toBeNull()
    expect(parseWidgetToHost({ source: SRC, type: 'unread', count: '3' })).toBeNull()
  })

  it('未知 type / 缺信封 / 额外载荷字段不透传（投影重建，不透传原始对象）', () => {
    expect(parseWidgetToHost({ source: SRC, type: 'exec' })).toBeNull()
    expect(parseWidgetToHost({ type: 'ready' })).toBeNull()
    // 合法消息的返回是白名单重建对象：原始对象上的多余键不进入投影
    const projected = parseWidgetToHost({ source: SRC, type: 'ready', evil: 'payload' })
    expect(projected).toEqual({ source: SRC, type: 'ready' })
    expect('evil' in (projected as object)).toBe(false)
  })
})

describe('parseHostToWidget：loader → iframe 逐字段校验', () => {
  it('panel 仅接受布尔 open', () => {
    expect(parseHostToWidget({ source: SRC, type: 'panel', open: true })).toEqual({
      source: SRC,
      type: 'panel',
      open: true,
    })
    expect(parseHostToWidget({ source: SRC, type: 'panel', open: 'yes' })).toBeNull()
    expect(parseHostToWidget({ source: SRC, type: 'panel' })).toBeNull()
  })

  it('host-context 白名单上下文：widgetId/locale/page{origin,path} 齐全才放行', () => {
    const msg = {
      source: SRC,
      type: 'host-context',
      widgetId: '702000000000000101',
      locale: 'zh-CN',
      page: { origin: 'https://shop.test:18443', path: '/products/1' },
    }
    expect(parseHostToWidget(msg)).toEqual(msg)
    expect(parseHostToWidget({ ...msg, widgetId: '' })).toBeNull()
    expect(parseHostToWidget({ ...msg, page: { origin: 1, path: '/x' } })).toBeNull()
    expect(parseHostToWidget({ ...msg, page: 'https://evil' })).toBeNull()
  })

  it('宿主不得借 host-context 夹带白名单外数据（投影只取 origin/path 两键）', () => {
    const projected = parseHostToWidget({
      source: SRC,
      type: 'host-context',
      widgetId: 'w',
      locale: 'zh-CN',
      page: { origin: 'https://shop.test', path: '/', cookie: 'stolen=1' },
    })
    expect(projected).not.toBeNull()
    expect(Object.keys((projected as { page: object }).page).sort()).toEqual(['origin', 'path'])
  })

  it('未知 type / 缺信封 → null', () => {
    expect(parseHostToWidget({ source: SRC, type: 'unread', count: 1 })).toBeNull()
    expect(parseHostToWidget({ source: SRC, type: 'ready' })).toBeNull()
    expect(parseHostToWidget(undefined)).toBeNull()
  })
})

describe('loader data-* 白名单：LOADER_DATA_KEYS 合同（S1）', () => {
  it('唯一允许键 = widget-id；历史键（shop-key/org-id）一律拒绝', () => {
    expect(LOADER_DATA_KEYS).toEqual(['widget-id'])
    expect(isAllowedLoaderDataKey('widget-id')).toBe(true)
    expect(isAllowedLoaderDataKey('shop-key')).toBe(false)
    expect(isAllowedLoaderDataKey('org-id')).toBe(false)
    expect(isAllowedLoaderDataKey('widget-id-')).toBe(false)
  })
})
