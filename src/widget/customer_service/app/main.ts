/**
 * CSW-01R：Widget iframe 聊天应用入口（独立 entry，无 React/Router/Admin 依赖）。
 *
 * 流程（逐键对齐后端真实校验，cs_actions table(widget)）：
 * loader postMessage 握手（organization_id + public widget_id 白名单上下文）
 * → bootstrap（organization_id/public_widget_id/subject_id → visit token=secret、
 *   installation_id、consent_version、contact_id）
 * → consent（consent_version 非空才展示同意门；拒绝不产生任何持久化动作）
 * → POST /sessions（organization_id+installation_id）
 * → 历史 after_id 键集（裸数组载荷）+ SSE（Last-Event-ID 补偿）
 * → 发送（installation_id+client_msg_id 幂等）
 * → closed 后评分（rating 1..5 + expected_version CAS，版本取自 list_sessions）。
 *
 * 安全：
 * - 与 loader 的 postMessage 只接受 `event.source === window.parent` 的消息，
 *   逐字校验 envelope；首个可信消息后锁定 host origin；
 * - visit token 只保存在内存（绝不写 URL/storage/Cookie）；
 * - subject_id 每次页面加载随机生成（不持久化——与 A5 零存储纪律一致；
 *   跨刷新 contact 连续性属设计取舍，见报告）；
 * - 面板不可见时收到坐席消息 → 通过 loader 协议上报未读数。
 */
import { initialChatState, reduceChat, type ChatMessage, type ChatState } from './chatMachine'
import {
  buildSsePath,
  isValidExpectedVersion,
  toWidgetMessage,
  type BootstrapResult,
  type RequestScope,
  type WidgetMessage,
} from './contract'
import { WidgetEventStream, type SseEvent, type StreamStatus } from './eventStream'
import { createChatUi } from './ui'
import { parseHostToWidget, WIDGET_MESSAGE_SOURCE } from '../protocol'
import { WidgetApiClient } from './widgetApi'

type HostContext = { organizationId: string; widgetId: string; locale: string; pageOrigin: string; pagePath: string }

const CIPHER_PLACEHOLDER = '[加密消息：明文读面未开放（后端缺口 D5）]'

function newId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** 访客行/坐席行 → 聊天视图（sender_type 决定角色；cipher 缺明文用占位）。 */
function toChatMessage(message: WidgetMessage, selfContactId: string): ChatMessage {
  const role: ChatMessage['role'] =
    message.senderType === 'contact'
      ? 'visitor'
      : message.senderType === 'business_identity'
        ? 'agent'
        : 'system'
  const isSelf = message.senderType === 'contact' && message.senderContactId === selfContactId
  return {
    key: `srv-${message.id}`,
    id: message.id,
    clientMsgId: message.clientMsgId,
    role: isSelf || role === 'visitor' ? 'visitor' : role,
    body: message.body ?? CIPHER_PLACEHOLDER,
    status: 'sent',
  }
}

function boot(): void {
  const rootElement = document.getElementById('cs-widget-root')
  if (rootElement === null) return
  const api = new WidgetApiClient()
  let state: ChatState = initialChatState()
  let context: HostContext | null = null
  let trustedHostOrigin: string | null = null
  let scope: RequestScope | null = null
  let selfContact = ''
  let stream: WidgetEventStream | null = null
  let panelOpen = true
  let unread = 0
  let lastCursor = '0'
  // subject_id：客户端生成的访客主体（bootstrap 必填；内存内一次，不持久化）
  const subjectId = newId()
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
          organizationId: message.organizationId,
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
        if (panelOpen) unread = 0
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
      const result: BootstrapResult = await api.bootstrap({
        organizationId: context.organizationId,
        publicWidgetId: context.widgetId,
        subjectId,
      })
      scope = { organizationId: context.organizationId, installationId: result.installationId }
      selfContact = result.contactId
      // 同意门：installation 配置了 consent_version 才展示（空版本 = 无门）
      const notice =
        result.consentVersion.length > 0
          ? { version: result.consentVersion, state: 'pending' as const }
          : { version: '', state: 'accepted' as const }
      dispatch({ type: 'bootstrap_succeeded', brand: result.branding, notice })
      if (notice.state === 'accepted') await ensureSession()
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
    if (scope === null || state.session !== null) return
    try {
      const session = await api.createSession(scope)
      dispatch({ type: 'session_created', session })
      await refreshHistory()
      startStream(session.id)
    } catch (error) {
      dispatch({ type: 'bootstrap_failed', message: error instanceof Error ? error.message : '创建会话失败' })
      postToHost({ source: WIDGET_MESSAGE_SOURCE, type: 'status', state: 'error' })
    }
  }

  function selfContactId(): string {
    return selfContact
  }

  /** 历史 after_id 键集增量（cursor = 消息 id 十进制字符串；SSE 补偿同源）。 */
  async function refreshHistory(): Promise<void> {
    if (state.session === null || scope === null) return
    const page = await api.listMessages(state.session.id, scope, lastCursor === '0' ? null : lastCursor)
    let agentDelta = 0
    for (const row of page) {
      const before = state.messages.length
      dispatch({ type: 'messages_loaded', messages: [toChatMessage(row, selfContactId())] })
      if (state.messages.length > before && row.senderType === 'business_identity') agentDelta += 1
      if (BigInt(row.id) > BigInt(lastCursor)) lastCursor = row.id
    }
    if (agentDelta > 0 && !panelOpen) {
      unread += agentDelta
      reportUnread()
    }
  }

  function startStream(sessionId: string): void {
    stream?.stop()
    if (scope === null) return
    stream = new WidgetEventStream({
      path: buildSsePath(sessionId, scope),
      token: () => api.currentToken() ?? '',
      onEvent: (event) => void handleSseEvent(event),
      onStatus: (status) => reportStatus(status),
    })
    stream.start()
  }

  async function handleSseEvent(event: SseEvent): Promise<void> {
    try {
      let data: unknown
      try {
        data = JSON.parse(event.data) as unknown
      } catch {
        return
      }
      if (event.event === 'state') {
        // state_data：{resource:'cs.session', session_id, status}
        const status = (data as { status?: unknown } | null)?.status
        if (typeof status === 'string') dispatch({ type: 'session_status', status })
        return
      }
      if (event.event === 'message') {
        // 消息事件帧只携带游标/标识（内容经历史读面拉取——合同如此）
        const row = toWidgetMessage(data)
        if (row !== null && BigInt(row.id) > BigInt(lastCursor)) {
          lastCursor = row.id
        }
        if (event.id !== null && BigInt(event.id) > BigInt(lastCursor)) lastCursor = event.id
        await refreshHistory()
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
    if (session === null || scope === null) return
    const clientMsgId = newId()
    const key = `local-${clientMsgId}`
    dispatch({ type: 'message_optimistic', key, clientMsgId, body })
    try {
      const confirmed = await api.sendMessage(session.id, scope, clientMsgId, body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
      if (BigInt(confirmed.id) > BigInt(lastCursor)) lastCursor = confirmed.id
    } catch {
      dispatch({ type: 'message_failed', key })
    }
  }

  async function retryMessage(key: string): Promise<void> {
    const message = state.messages.find((m) => m.key === key)
    if (message === undefined || state.session === null || scope === null) return
    const clientMsgId = message.clientMsgId ?? newId()
    dispatch({ type: 'message_optimistic', key, clientMsgId, body: message.body })
    try {
      const confirmed = await api.sendMessage(state.session.id, scope, clientMsgId, message.body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
    } catch {
      dispatch({ type: 'message_failed', key })
    }
  }

  async function submitRating(score: number): Promise<void> {
    if (state.session === null || scope === null) return
    // expected_version（评分 CAS）取自访客会话列表视图（create 响应不携带）
    let expectedVersion: number
    try {
      const sessions = await api.listSessions(scope)
      expectedVersion = sessions.find((s) => s.id === state.session?.id)?.version ?? 0
    } catch {
      expectedVersion = 0
    }
    if (!isValidExpectedVersion(expectedVersion)) {
      dispatch({ type: 'rating_failed', message: '无法取得会话版本（expected_version）' })
      return
    }
    dispatch({ type: 'rating_submitted', score })
    try {
      await api.submitRating(state.session.id, scope, score, expectedVersion)
    } catch (error) {
      // 幂等语义：评分提交失败允许重试（phase 保持 closed-rating，重试入口仍在）
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
