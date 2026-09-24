/**
 * FE-W01：Widget iframe 聊天应用入口（独立 entry，无 React/Router/Admin 依赖）。
 *
 * 该文件只做 DOM/浏览器接线：状态与流程全部在 controller.ts（可单测）。
 * 流程：loader postMessage 握手 → bootstrap（visit token=secret 只进内存）→
 * consent → session → history + SSE → 文本/附件发送 → close/rating。
 *
 * 安全：
 * - 与 loader 的 postMessage 只接受 `event.source === window.parent` 的消息，
 *   首个可信消息后锁定 host origin（controller 内逐字校验）；
 * - visit token 只保存在 API 客户端内存（绝不写 URL/storage/Cookie）；
 * - sessionStorage 只存 installation 作用域匿名 subject（短期 TTL，见
 *   visitStorage）；access/refresh JWT 绝不进入该存储。
 */
import { createChatUi } from './ui'
import { createWidgetController } from './controller'
import { WidgetApiClient } from './widgetApi'
import { WIDGET_MESSAGE_SOURCE } from '../protocol'
import type { StorageLike } from './visitStorage'

function newId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** sessionStorage 适配（iframe origin 域内；不可用时恢复能力降级为 null）。 */
function sessionStorageAdapter(): StorageLike | null {
  try {
    const storage = window.sessionStorage
    storage.setItem('imboy-cs:probe', '1')
    storage.removeItem('imboy-cs:probe')
    return storage
  } catch {
    return null
  }
}

function nowMs(): number {
  return Date.now()
}

/** 非图片附件下载出口（CS-WGT-01）：anchor[download] 承载 blob 字节——
 * 全程内存对象 URL，无网络地址/token 进 DOM；点击后立即回收。 */
function downloadViaAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function boot(): void {
  const rootElement = document.getElementById('cs-widget-root')
  if (rootElement === null) return
  const api = new WidgetApiClient()
  const controller = createWidgetController({
    api,
    storage: sessionStorageAdapter(),
    nowMs,
    newId,
    fetchImpl: (...args) => fetch(...args),
    io: {
      render: (state) => ui.render(state),
      downloadFile: downloadViaAnchor,
      postToHost: (message) => {
        try {
          // 锁定前（ready 握手）host origin 未知；消息零载荷不含任何敏感数据。
          const target = controller?.currentTrustedOrigin()
          window.parent.postMessage(message, target ?? '*')
        } catch {
          /* 通知宿主失败不致命 */
        }
      },
    },
  })
  const ui = createChatUi(rootElement, 'zh-CN', {
    onConsentAccept: () => controller.acceptConsent(),
    onConsentDecline: () => controller.declineConsent(),
    onSend: (body) => void controller.sendMessage(body),
    onRetryMessage: (key) => void controller.retryMessage(key),
    onRetryBootstrap: () => controller.retryBootstrap(),
    onRating: (score) => void controller.submitRating(score),
    onClose: () => controller.closeAndCleanup(),
    onAttachment: (file) => void controller.sendAttachment(file),
    onOpenAttachment: (key, assetId) => void controller.openAttachment(key, assetId),
    onClosePreview: () => controller.closePreview(),
  })

  window.addEventListener(
    'message',
    (event: MessageEvent) => {
      controller.handleHostMessage(event.origin, event.source === window.parent, event.data)
    },
    false
  )

  ui.render(controller.currentState())
  try {
    // 通知 loader：iframe 应用已就绪，可以接收 host-context。
    window.parent.postMessage({ source: WIDGET_MESSAGE_SOURCE, type: 'ready' }, '*')
  } catch {
    /* 通知失败不致命 */
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
