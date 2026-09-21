/**
 * FE-W01：Widget 聊天控制器（宿主/IO 无关，注入依赖、可单测）。
 *
 * 从 main.ts 提取的可测核心，落实 FE-W01 计划要点：
 * - postMessage 逐字校验：`event.source === window.parent` + 首个可信消息锁定
 *   host origin（此后 origin 不符一律忽略）；
 * - 全流程：bootstrap → consent → session → history → SSE → text/附件 → close/rating；
 * - consent 拒绝链：不建会话、不发消息、清理 visit 恢复存储；
 * - visit 恢复：installation 作用域 subject 存 sessionStorage（短期 TTL），
 *   吊销(401/403)/退出/拒绝/关闭一律清理；token 绝不入存储/URL；
 * - §3.6 SSE 消费：信封解析 + event_id 去重 + resync.required（清游标全量
 *   权威刷新）；payload 不是业务真源，事件只触发权威刷新；
 * - 附件：§3.7 流水线（hash/presign/裸 PUT/confirm/asset_ids），重试复用
 *   同一 client_msg_id。
 */
import type { ChatMessage, ChatState } from './chatMachine'
import { initialChatState, reduceChat } from './chatMachine'
import {
  buildSsePath,
  isValidExpectedVersion,
  type BootstrapResult,
  type RequestScope,
  type WidgetMessage,
} from './contract'
import { WidgetEventStream, type SseEvent, type StreamStatus } from './eventStream'
import {
  classifySseFrame,
  SseEventIdDeduper,
} from './sseProtocol'
import type { AttachmentItem } from './attachmentMachine'
import { runAttachmentPipeline } from './uploader'
import { parseHostToWidget } from '../protocol'
import { WidgetApiClient, WidgetApiError } from './widgetApi'
import {
  clearVisitSubject,
  loadVisitSubject,
  saveVisitSubject,
  type StorageLike,
  type VisitScope,
} from './visitStorage'

const CIPHER_PLACEHOLDER = '[加密消息：明文读面未开放（后端缺口 D5）]'

export type HostContext = {
  widgetId: string
  locale: string
  pageOrigin: string
  pagePath: string
}

export type ControllerIo = {
  render: (_state: ChatState) => void
  postToHost: (_message: Record<string, unknown>) => void
}

export type StreamHandle = { start: () => void; stop: () => void }

export type ControllerDeps = {
  api: WidgetApiClient
  storage: StorageLike | null
  nowMs: () => number
  newId: () => string
  io: ControllerIo
  /** 裸 PUT 通道（附件字节直传；测试注入替换）。 */
  fetchImpl: (_input: string, _init?: RequestInit) => Promise<Response>
  /** 测试注入；缺省用 WidgetEventStream。 */
  streamFactory?: (_opts: {
    path: string
    token: () => string
    onEvent: (_event: SseEvent) => void
    onStatus: (_status: StreamStatus) => void
  }) => StreamHandle
}

export function isRevokeStatus(status: number): boolean {
  return status === 401 || status === 403
}

export function createWidgetController(deps: ControllerDeps) {
  let state: ChatState = initialChatState()
  let context: HostContext | null = null
  let trustedHostOrigin: string | null = null
  let scope: RequestScope | null = null
  let visitScope: VisitScope | null = null
  let selfContact = ''
  let stream: StreamHandle | null = null
  let panelOpen = true
  let unread = 0
  let lastCursor = '0'
  let subjectId = ''
  const deduper = new SseEventIdDeduper()
  const attachmentFiles = new Map<string, Blob>()

  function dispatch(event: Parameters<typeof reduceChat>[1]): void {
    state = reduceChat(state, event)
    deps.io.render(state)
  }

  function postToHost(message: Record<string, unknown>): void {
    deps.io.postToHost(message)
  }

  function reportUnread(): void {
    postToHost({ source: 'imboy-cs-widget', type: 'unread', count: panelOpen ? 0 : unread })
  }

  function reportStatus(connection: StreamStatus): void {
    dispatch({ type: 'connection', state: connection })
    if (connection === 'online') postToHost({ source: 'imboy-cs-widget', type: 'status', state: 'online' })
    if (connection === 'offline') postToHost({ source: 'imboy-cs-widget', type: 'status', state: 'offline' })
  }

  function onRevoke(): void {
    // 吊销/过期：短期恢复状态立即清理（合同：revoke 清理）。
    if (deps.storage !== null && visitScope !== null) clearVisitSubject(deps.storage, visitScope)
    postToHost({ source: 'imboy-cs-widget', type: 'status', state: 'error' })
  }

  function isRevoke(error: unknown): boolean {
    return error instanceof WidgetApiError && isRevokeStatus(error.status)
  }

  // -------------------------------------------------------------------------
  // 宿主 postMessage 入口（origin 锁定 + source 校验）
  // -------------------------------------------------------------------------

  function handleHostMessage(origin: string, sourceIsParent: boolean, data: unknown): void {
    try {
      if (!sourceIsParent) return
      if (trustedHostOrigin !== null && origin !== trustedHostOrigin) return
      const message = parseHostToWidget(data)
      if (message === null) return
      // 首条可信消息锁定 host origin（此后任何其它 origin 一律忽略）。
      if (trustedHostOrigin === null) trustedHostOrigin = origin
      if (message.type === 'host-context') {
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
        setPanelOpen(message.open)
      }
    } catch {
      /* 消息处理失败不致命 */
    }
  }

  // -------------------------------------------------------------------------
  // bootstrap / consent / session / history
  // -------------------------------------------------------------------------

  async function runBootstrap(): Promise<void> {
    if (context === null) return
    // public_widget_id 全局唯一 → 唯一 installation（合同 S3）：widgetId 即
    // 客户端侧安装作用域键（visit 恢复存储命名空间）。
    visitScope = { widgetId: context.widgetId }
    // 恢复优先：同一 installation 的短期匿名 subject（TTL 内）。
    const recovered =
      deps.storage !== null ? loadVisitSubject(deps.storage, visitScope, deps.nowMs()) : null
    subjectId = recovered ?? deps.newId()
    dispatch({ type: 'bootstrap_started' })
    try {
      const result: BootstrapResult = await deps.api.bootstrap({
        publicWidgetId: context.widgetId,
        subjectId,
      })
      // installation_id 只来自 bootstrap 成功响应体（合同 S3 冻结）：
      // 仅内存持有、后续动作以响应值为参，绝不写 storage/URL/log。
      scope = { installationId: result.installationId }
      selfContact = result.contactId
      if (deps.storage !== null && visitScope !== null) {
        saveVisitSubject(deps.storage, visitScope, subjectId, deps.nowMs())
      }
      const notice =
        result.consentVersion.length > 0
          ? { version: result.consentVersion, state: 'pending' as const }
          : { version: '', state: 'accepted' as const }
      dispatch({ type: 'bootstrap_succeeded', brand: result.branding, notice })
      if (notice.state === 'accepted') await ensureSession()
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      dispatch({ type: 'bootstrap_failed', message: error instanceof Error ? error.message : 'bootstrap 失败' })
      postToHost({ source: 'imboy-cs-widget', type: 'status', state: 'error' })
    }
  }

  function acceptConsent(): void {
    if (state.phase !== 'consent') return
    dispatch({ type: 'consent_accepted' })
    void ensureSession()
  }

  /** 拒绝链：不建会话、不发消息；visit 恢复状态立即清理。 */
  function declineConsent(): void {
    if (state.phase !== 'consent') return
    dispatch({ type: 'consent_declined' })
    if (deps.storage !== null && visitScope !== null) clearVisitSubject(deps.storage, visitScope)
  }

  async function ensureSession(): Promise<void> {
    if (scope === null || state.session !== null) return
    try {
      const session = await deps.api.createSession(scope)
      dispatch({ type: 'session_created', session })
      await refreshHistory()
      startStream(session.id)
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      dispatch({ type: 'bootstrap_failed', message: error instanceof Error ? error.message : '创建会话失败' })
      postToHost({ source: 'imboy-cs-widget', type: 'status', state: 'error' })
    }
  }

  function toChatMessage(message: WidgetMessage): ChatMessage {
    const role: ChatMessage['role'] =
      message.senderType === 'contact'
        ? 'visitor'
        : message.senderType === 'business_identity'
          ? 'agent'
          : 'system'
    const isSelf = message.senderType === 'contact' && message.senderContactId === selfContact
    return {
      key: `srv-${message.id}`,
      id: message.id,
      clientMsgId: message.clientMsgId,
      role: isSelf || role === 'visitor' ? 'visitor' : role,
      body: message.body ?? CIPHER_PLACEHOLDER,
      status: 'sent',
      attachment: null,
    }
  }

  /** 历史 after_id 权威刷新（cursor = 消息 id 十进制字符串；resync 后从 0 全量）。 */
  async function refreshHistory(): Promise<void> {
    if (state.session === null || scope === null) return
    try {
      const page = await deps.api.listMessages(state.session.id, scope, lastCursor === '0' ? null : lastCursor)
      let agentDelta = 0
      for (const row of page) {
        const before = state.messages.length
        dispatch({ type: 'messages_loaded', messages: [toChatMessage(row)] })
        if (state.messages.length > before && row.senderType === 'business_identity') agentDelta += 1
        if (row.id > lastCursor && isCursorAhead(row.id, lastCursor)) lastCursor = row.id
      }
      if (agentDelta > 0 && !panelOpen) {
        unread += agentDelta
        reportUnread()
      }
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      throw error
    }
  }

  function isCursorAhead(candidate: string, cursor: string): boolean {
    try {
      return BigInt(candidate) > BigInt(cursor)
    } catch {
      return false
    }
  }

  // -------------------------------------------------------------------------
  // SSE（§3.6 信封 + widget 面帧；去重 + resync 分支）
  // -------------------------------------------------------------------------

  function startStream(sessionId: string): void {
    stream?.stop()
    if (scope === null) return
    const handle =
      deps.streamFactory?.({
        path: buildSsePath(sessionId, scope),
        token: () => deps.api.currentToken() ?? '',
        onEvent: (event) => void handleSseFrame(event),
        onStatus: (status) => reportStatus(status),
      }) ??
      new WidgetEventStream({
        path: buildSsePath(sessionId, scope),
        token: () => deps.api.currentToken() ?? '',
        onEvent: (event) => void handleSseFrame(event),
        onStatus: (status) => reportStatus(status),
      })
    stream = handle
    handle.start()
  }

  async function handleSseFrame(event: SseEvent): Promise<void> {
    const classified = classifySseFrame(event)
    if (classified.kind === 'ignore') return
    if (classified.kind === 'envelope') {
      const envelope = classified.envelope
      // at-least-once：按 event_id 去重（resync.required 会 reset）。
      if (deduper.isDuplicate(envelope.eventId)) return
      if (envelope.type === 'resync.required') {
        // 游标清空 + 全量权威刷新（事件 payload 不是业务真源）。
        deduper.reset()
        lastCursor = '0'
        await refreshSessionStatus()
        await refreshHistory()
        return
      }
      if (envelope.type === 'message.appended') {
        await refreshHistory()
        return
      }
      if (envelope.type === 'session.changed') {
        await refreshSessionStatus()
      }
      return
    }
    if (classified.kind === 'widget-state') {
      dispatch({ type: 'session_status', status: classified.status })
      return
    }
    // widget-message 帧：帧内容不进业务真源，权威刷新 + 游标推进。
    // 顺序不可换：先按推进前的游标做增量读，读回后再推进游标——同一 poll
    // 批次的多帧在同一同步循环派发，若先推进游标，第一条帧的读窗口会从自身
    // 之后开始，中间消息（含本帧）永远不被读回（A03 实证丢帧）。
    try {
      await refreshHistory()
    } catch {
      /* 刷新失败由重连/后续事件收敛 */
    }
    if (classified.messageId !== null && isCursorAhead(classified.messageId, lastCursor)) {
      lastCursor = classified.messageId
    }
  }

  /** 会话状态权威刷新（session.changed / resync 用；payload 不直接入状态）。 */
  async function refreshSessionStatus(): Promise<void> {
    if (scope === null || state.session === null) return
    try {
      const sessions = await deps.api.listSessions(scope)
      const current = sessions.find((s) => s.id === state.session?.id)
      if (current !== undefined) dispatch({ type: 'session_status', status: current.status })
    } catch (error) {
      if (isRevoke(error)) onRevoke()
    }
  }

  // -------------------------------------------------------------------------
  // 发送（文本 / 附件）与重试（幂等键复用）
  // -------------------------------------------------------------------------

  async function sendMessage(body: string): Promise<void> {
    // consent 未同意（含 notice-rejected）一律不产生会话/消息动作。
    if (state.phase !== 'chat') return
    if (state.session === null) {
      await ensureSession()
    }
    const session = state.session
    if (session === null || scope === null) return
    const clientMsgId = deps.newId()
    await sendTextWithKey(session.id, clientMsgId, body)
  }

  async function sendTextWithKey(sessionId: string, clientMsgId: string, body: string): Promise<void> {
    if (scope === null) return
    const key = `local-${clientMsgId}`
    dispatch({ type: 'message_optimistic', key, clientMsgId, body, attachment: null })
    try {
      const confirmed = await deps.api.sendMessage(sessionId, scope, clientMsgId, body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
      if (isCursorAhead(confirmed.id, lastCursor)) lastCursor = confirmed.id
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      dispatch({ type: 'message_failed', key })
    }
  }

  async function sendAttachment(file: Blob): Promise<void> {
    if (state.phase !== 'chat' || state.session === null || scope === null) return
    const sessionId = state.session.id
    const clientMsgId = deps.newId()
    const key = `local-${clientMsgId}`
    const name = file instanceof File ? file.name : 'attachment'
    dispatch({
      type: 'message_optimistic',
      key,
      clientMsgId,
      body: '',
      attachment: {
        name,
        mime: file.type.length > 0 ? file.type : 'application/octet-stream',
        sizeBytes: file.size,
        state: 'pending',
        assetId: null,
      },
    })
    attachmentFiles.set(clientMsgId, file)
    const item = await runAttachmentPipeline({
      sessionId,
      scope,
      file,
      clientMsgId,
      deps: {
        api: deps.api,
        fetchImpl: deps.fetchImpl,
        onItem: applyAttachmentItem,
      },
    })
    if (item.state === 'linked' && item.messageId !== null) {
      dispatch({ type: 'message_confirmed', key, id: item.messageId })
    } else {
      dispatch({ type: 'message_failed', key })
    }
  }

  function applyAttachmentItem(item: AttachmentItem): void {
    dispatch({
      type: 'attachment_progress',
      key: item.key,
      state: item.state,
      assetId: item.assetId,
    })
  }

  async function retryMessage(key: string): Promise<void> {
    const message = state.messages.find((m) => m.key === key)
    if (message === undefined || state.session === null || scope === null) return
    const clientMsgId = message.clientMsgId ?? deps.newId()
    if (message.attachment !== null) {
      // 附件重试：复用同一 client_msg_id（幂等键）；hash 由流水线重算/复用。
      const file = attachmentFiles.get(clientMsgId)
      if (file === undefined) {
        dispatch({ type: 'message_failed', key })
        return
      }
      const item = await runAttachmentPipeline({
        sessionId: state.session.id,
        scope,
        file,
        clientMsgId,
        deps: { api: deps.api, fetchImpl: deps.fetchImpl, onItem: applyAttachmentItem },
      })
      if (item.state === 'linked' && item.messageId !== null) {
        dispatch({ type: 'message_confirmed', key, id: item.messageId })
      } else {
        dispatch({ type: 'message_failed', key })
      }
      return
    }
    dispatch({ type: 'message_optimistic', key, clientMsgId, body: message.body, attachment: null })
    try {
      const confirmed = await deps.api.sendMessage(state.session.id, scope, clientMsgId, message.body)
      dispatch({ type: 'message_confirmed', key, id: confirmed.id })
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      dispatch({ type: 'message_failed', key })
    }
  }

  async function submitRating(score: number): Promise<void> {
    if (state.session === null || scope === null) return
    let expectedVersion: number
    try {
      const sessions = await deps.api.listSessions(scope)
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
      await deps.api.submitRating(state.session.id, scope, score, expectedVersion)
    } catch (error) {
      if (isRevoke(error)) onRevoke()
      // 幂等语义：评分失败允许重试（phase 保持 closed-rating）。
      dispatch({ type: 'rating_failed', message: error instanceof Error ? error.message : '评分提交失败' })
    }
  }

  // -------------------------------------------------------------------------
  // 面板可见性 / 退出清理
  // -------------------------------------------------------------------------

  function setPanelOpen(open: boolean): void {
    panelOpen = open
    if (open) unread = 0
    reportUnread()
  }

  /** 退出（关闭聊天）：visit 恢复状态清理（关闭后不可恢复，A05）。 */
  function closeAndCleanup(): void {
    if (deps.storage !== null && visitScope !== null) clearVisitSubject(deps.storage, visitScope)
    attachmentFiles.clear()
    postToHost({ source: 'imboy-cs-widget', type: 'close' })
  }

  function currentState(): ChatState {
    return state
  }

  function currentTrustedOrigin(): string | null {
    return trustedHostOrigin
  }

  function currentSubjectId(): string {
    return subjectId
  }

  function stopStream(): void {
    stream?.stop()
  }

  return {
    handleHostMessage,
    acceptConsent,
    declineConsent,
    sendMessage,
    sendAttachment,
    retryMessage,
    submitRating,
    handleSseFrame,
    closeAndCleanup,
    setPanelOpen,
    stopStream,
    retryBootstrap: () => void runBootstrap(),
    currentState,
    currentTrustedOrigin,
    currentSubjectId,
  }
}
