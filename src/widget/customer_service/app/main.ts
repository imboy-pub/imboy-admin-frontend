/**
 * CSW-01：Widget iframe 聊天应用入口（独立 entry，无 React/Router/Admin 依赖）。
 *
 * 流程：loader postMessage 握手（白名单上下文）→ bootstrap（visit token 存内存）
 * → notice/consent → 创建会话 → 历史 after_id + SSE（Last-Event-ID 补偿）
 * → 发送（client_msg_id 幂等）→ closed 后评分（1..5 幂等）。
 *
 * 安全：
 * - 与 loader 的 postMessage 只接受 `event.source === window.parent` 的消息，
 *   且逐字校验 envelope；首个可信消息后锁定 host origin，后续消息 origin 必须一致；
 * - visit token 只保存在内存（绝不写 URL/storage/Cookie）；
 * - 面板不可见时收到坐席消息 → 通过 loader 协议上报未读数。
 * 桩=E2E 替身声明：真实后端联调归 CSX-01。
 */
import { initialChatState, reduceChat, type ChatMessage, type ChatState } from './chatMachine'
import { buildSsePath, toWidgetMessage, type WidgetMessage } from './contract'
import { WidgetEventStream, type StreamStatus } from './eventStream'
import { createChatUi } from './ui'
import { parseHostToWidget, WIDGET_MESSAGE_SOURCE } from '../protocol'
import { WidgetApiClient } from './widgetApi'

type HostContext = { widgetId: string; locale: string; pageOrigin: string; pagePath: string }

function newClientMsgId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function boot(): void {
  const rootElement = document.getElementById('cs-widget-root')
  if (rootElement === null) return
  const api = new WidgetApiClient()
  let state: ChatState = initialChatState()
  let context: HostContext | null = null
  let trustedHostOrigin: string | null = null
  let stream: WidgetEventStream | null = null
  let panelOpen = true
  let unread = 0
  const ui = createChatUi(rootElement, 'zh-CN', {
    onConsentAccept: () => void onConsentAccept(),
    onConsentDecline: () => dispatch({ type: 'consent_declined' }),
    onSend: (body) => void sendMessage(body),
    onRetryMessage: (key) => void retryMessage(key),
    onRetryBootstrap: () => void runBootstrap(),
    onRating: (score) => void submitRating(score),
    onClose: () => postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'close' }),
  })

  function dispatch(event: Parameters<typeof reduceChat>[1]): void {
    state = reduceChat(state, event)
    ui.render(state)
  }

  function postToHost(message: Record<string, unknown>): void {
    try {
      window.parent.postMessage(message, trustedHostOrigin ?? '*')
    } catch {
      /* 通知宿主失败不致命 */
    }
  }

  function reportUnread(): void {
    postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'unread', count: panelOpen ? 0 : unread })
  }

  function reportStatus(connection: StreamStatus): void {
    dispatch({ type: 'connection', state: connection })
    if (connection === 'online') postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'status', state: 'online' })
    if (connection === 'offline') postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'status', state: 'offline' })
  }

  function onHostMessage(event: MessageEvent): void {
    try {
      if (event.source !== window.parent) return
      if (trustedHostOrigin !== null && event.origin !== trustedHostOrigin) return
      const message = parseHostToWidget(event.data)
      if (message === null) return
      if (message.type === 'host-context') {
        if (trustedHostOrigin === null) trustedHostOrigin = event.origin
        if (context !== null) return
        context = {
          widgetId: message.widgetId,
          locale: message.locale,
          pageOrigin: message.page.origin,
          pagePath: message.page.path,
        }
        void runBootstrap()
        return
      }
      if (message.type === 'panel') {
        panelOpen = message.open
        if (panelOpen) {
          unread = 0
        }
        reportUnread()
      }
    } catch {
      /* 消息处理失败不致命 */
    }
  }

  async function runBootstrap(): Promise<void> {
    if (context === null) return
    dispatch({ type: 'bootstrap_started' })
    try {
      const result = await api.bootstrap(context.widgetId)
      dispatch({ type: 'bootstrap_succeeded', brand: result.brand, notice: result.notice })
      if (result.notice.state === 'accepted') await ensureSession()
    } catch (error) {
      dispatch({ type: 'bootstrap_failed', message: error instanceof Error ? error.message : 'bootstrap 失败' })
      postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'status', state: 'error' })
    }
  }

  async function onConsentAccept(): Promise<void> {
    dispatch({ type: 'consent_accepted' })
    await ensureSession()
  }

  async function ensureSession(): Promise<void> {
    if (context === null || state.session !== null) return
    try {
      const session = await api.createSession({ pageOrigin: context.pageOrigin, pagePath: context.pagePath })
      dispatch({ type: 'session_created', session })
      const page = await api.listMessages(session.id, null)
      dispatch({ type: 'messages_loaded', messages: page.messages.map(toChatMessage) })
      startStream(session.id)
    } catch (error) {
      dispatch({ type: 'bootstrap_failed', message: error instanceof Error ? error.message : '创建会话失败' })
      postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'status', state: 'error' })
    }
  }

  function toChatMessage(message: WidgetMessage): ChatMessage {
    return {
      key: `srv-${message.id}`,
      id: message.id,
      clientMsgId: message.clientMsgId,
      role: message.role,
      body: message.body,
      status: 'sent',
    }
  }

  function startStream(sessionId: string): void {
    stream?.stop()
    stream = new WidgetEventStream({
      path: buildSsePath(sessionId),
      token: () => api.currentToken() ?? '',
      onEvent: (event) => handleSseEvent(event),
      onStatus: (status) => reportStatus(status),
    })
    stream.start()
  }

  function handleSseEvent(event: { event: string; data: string }): void {
    try {
      const data = JSON.parse(event.data) as unknown
      if (event.event === 'state') {
        const session = (data as { session?: { status?: unknown } } | null)?.session
        if (typeof session?.status === 'string') dispatch({ type: 'session_status', status: session.status })
        return
      }
      if (event.event === 'message') {
        const message = toWidgetMessage(data)
        if (message === null) return
        dispatch({ type: 'message_received', message: toChatMessage(message) })
        if (message.role === 'agent') {
          if (!panelOpen) unread += 1
          reportUnread()
        }
      }
    } catch {
      /* 非法事件帧忽略 */
    }
  }

  async function sendMessage(body: string): Promise<void> {
    if (state.session === null) {
      dispatch({ type: 'consent_accepted' })
      await ensureSession()
    }
    const session = state.session
    if (session === null) return
    const clientMsgId = newClientMsgId()
    const key = `local-${clientMsgId}`
    dispatch({ type: 'message_optimistic', key, clientMsgId, body })
    try {
      const confirmed = await api.sendMessage(session.id, clientMsgId, body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
    } catch {
      dispatch({ type: 'message_failed', key })
    }
  }

  async function retryMessage(key: string): Promise<void> {
    const message = state.messages.find((m) => m.key === key)
    if (message === undefined || state.session === null) return
    const clientMsgId = message.clientMsgId ?? newClientMsgId()
    dispatch({ type: 'message_optimistic', key, clientMsgId, body: message.body })
    try {
      const confirmed = await api.sendMessage(state.session.id, clientMsgId, message.body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
    } catch {
      dispatch({ type: 'message_failed', key })
    }
  }

  async function submitRating(score: number): Promise<void> {
    if (state.session === null) return
    dispatch({ type: 'rating_submitted', score })
    try {
      await api.submitRating(state.session.id, score)
    } catch (error) {
      // 幂等语义：评分提交失败允许重试（phase 保持 closed-rating，重试按钮仍在）
      dispatch({ type: 'rating_failed', message: error instanceof Error ? error.message : '评分提交失败' })
    }
  }

  window.addEventListener('message', onHostMessage, false)
  ui.render(state)
  try {
    // 通知 loader：iframe 应用已就绪，可以接收 host-context
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
