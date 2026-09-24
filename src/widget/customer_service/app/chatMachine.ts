/**
 * CSW-01：Widget 聊天状态机（纯函数、不可变）。
 *
 * 相位：awaiting-context → bootstrapping → consent | notice-rejected →
 * chat（连接子态 connecting/online/reconnecting/offline）→ closed-rating → rated；
 * 任意相位出错 → error + 可重试。
 *
 * 不变量：
 * - notice.state === 'rejected' 时不进入 chat，不产生任何会话/消息持久化动作；
 * - 发送消息用 client_msg_id 幂等（pending → sent/failed，重试沿用同一 id）；
 * - 评分仅 closed 后开放，1..5，提交一次后幂等（重复事件不改变状态）。
 */
import { isValidRatingScore, type WidgetBrand, type WidgetSession } from './contract'
import type { AttachmentUiState } from './attachmentMachine'

/**
 * 合成同意/提示门状态（CSW-01R：bootstrap 响应不再携带独立 notice 对象——
 * consent_version 非空 ⇒ 门开启（pending），空 ⇒ 无门（accepted）；
 * 'rejected' 保留给服务端裁定的拒绝语义）。
 */
export type WidgetNotice = {
  version: string
  state: 'accepted' | 'pending' | 'rejected'
}

export type ChatPhase =
  | 'awaiting-context'
  | 'bootstrapping'
  | 'consent'
  | 'notice-rejected'
  | 'chat'
  | 'closed-rating'
  | 'rated'
  | 'error'

export type ChatConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline'

/** 附件投影（UI 只展示名称/大小/状态；对象 key / presigned URL 绝不进入）。 */
export type ChatAttachment = {
  name: string
  mime: string
  sizeBytes: number
  /** §3.7 UI 映射：pending → confirming → sending → linked | failed。 */
  state: AttachmentUiState
  assetId: string | null
}

/**
 * 历史/服务端投影附件（CS-WGT-01，来源 = 历史消息 assets 五键白名单）。
 * 内容一律经 visit-token 授权代理按需拉取；thumbnailUrl 只可能是内存
 * blob: URL（路径零凭证，无 token/object key 可泄）。
 */
export type MessageAsset = {
  assetId: string
  name: string
  mime: string
  sizeBytes: number | null
  /** 后端只投影 active；防御性映射非 active → failed（不可点开内容）。 */
  state: 'linked' | 'failed'
  /** 图片缩略 blob: URL（授权 fetch 后填充；未加载为 null）。 */
  thumbnailUrl: string | null
  /** 内容获取状态（图片缩略与非图片下载共用）。 */
  content: 'idle' | 'loading' | 'ready' | 'error'
}

/** 图片大图预览（overlay；objectUrl 为内存 blob: URL）。 */
export type AssetPreview = {
  key: string
  assetId: string
  objectUrl: string
  mime: string
  fileName: string
}

export type ChatMessage = {
  key: string
  id: string | null
  clientMsgId: string | null
  role: 'visitor' | 'agent' | 'system'
  body: string
  status: 'pending' | 'sent' | 'failed'
  attachment: ChatAttachment | null
  /** 服务端投影附件（历史刷新 / SSE 补偿读回；刷新后仍在）。 */
  attachments: MessageAsset[]
}

export type ChatState = {
  phase: ChatPhase
  brand: WidgetBrand
  notice: WidgetNotice | null
  session: WidgetSession | null
  messages: ChatMessage[]
  connection: ChatConnectionState
  ratingScore: number | null
  errorMessage: string | null
  preview: AssetPreview | null
}

export type ChatEvent =
  | { type: 'bootstrap_started' }
  | { type: 'bootstrap_succeeded'; brand: WidgetBrand; notice: WidgetNotice }
  | { type: 'bootstrap_failed'; message: string }
  | { type: 'consent_accepted' }
  | { type: 'consent_declined' }
  | { type: 'session_created'; session: WidgetSession }
  | { type: 'messages_loaded'; messages: ChatMessage[] }
  | { type: 'message_optimistic'; key: string; clientMsgId: string; body: string; attachment?: ChatAttachment | null }
  | { type: 'message_confirmed'; key: string; id: string }
  | { type: 'message_failed'; key: string }
  | { type: 'attachment_progress'; key: string; state: AttachmentUiState; assetId?: string | null }
  | { type: 'message_received'; message: ChatMessage }
  | { type: 'asset_content_started'; key: string; assetId: string }
  | { type: 'asset_content_ready'; key: string; assetId: string; objectUrl: string | null }
  | { type: 'asset_content_failed'; key: string; assetId: string }
  | { type: 'asset_preview_opened'; preview: AssetPreview }
  | { type: 'asset_preview_closed' }
  | { type: 'session_status'; status: string }
  | { type: 'connection'; state: ChatConnectionState }
  | { type: 'rating_submitted'; score: number }
  | { type: 'rating_failed'; message: string }
  | { type: 'retry' }

export function initialChatState(brand: WidgetBrand = { displayName: '在线客服', primaryColor: null, welcomeText: null }): ChatState {
  return {
    phase: 'awaiting-context',
    brand,
    notice: null,
    session: null,
    messages: [],
    connection: 'connecting',
    ratingScore: null,
    errorMessage: null,
    preview: null,
  }
}

/** 按 id → client_msg_id 双键去重合并消息（SSE 重放 / 补偿可能带来重复）。 */
export function mergeMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idxById = incoming.id === null ? -1 : list.findIndex((m) => m.id !== null && m.id === incoming.id)
  if (idxById !== -1) {
    const next = list.slice()
    next[idxById] = incoming
    return next
  }
  const idxByKey = list.findIndex((m) => m.key === incoming.key)
  if (idxByKey !== -1) {
    const next = list.slice()
    next[idxByKey] = incoming
    return next
  }
  const idxByClient =
    incoming.clientMsgId === null
      ? -1
      : list.findIndex((m) => m.clientMsgId !== null && m.clientMsgId === incoming.clientMsgId)
  if (idxByClient !== -1) {
    const next = list.slice()
    next[idxByClient] = incoming
    return next
  }
  return [...list, incoming]
}

function mapMessageByKey(list: ChatMessage[], key: string, patch: Partial<ChatMessage>): ChatMessage[] {
  return list.map((m) => (m.key === key ? { ...m, ...patch } : m))
}

/** 定位 (消息 key, assetId) 双键并打补丁（附件内容获取状态机）；
 * patch 可为函数（拿到当前 asset 计算补丁，用于条件保留旧值）。 */
function mapAssetByKey(
  state: ChatState,
  key: string,
  assetId: string,
  patch: Partial<MessageAsset> | ((_asset: MessageAsset) => Partial<MessageAsset>)
): ChatState {
  let changed = false
  const messages = state.messages.map((message) => {
    if (message.key !== key) return message
    const hit = message.attachments.find((asset) => asset.assetId === assetId)
    if (hit === undefined) return message
    const resolved = typeof patch === 'function' ? patch(hit) : patch
    changed = true
    return {
      ...message,
      attachments: message.attachments.map((asset) =>
        asset.assetId === assetId ? { ...asset, ...resolved } : asset
      ),
    }
  })
  return changed ? { ...state, messages } : state
}

export function reduceChat(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'bootstrap_started':
      return { ...state, phase: 'bootstrapping', errorMessage: null }
    case 'bootstrap_succeeded':
      return {
        ...state,
        brand: event.brand,
        notice: event.notice,
        phase: event.notice.state === 'rejected' ? 'notice-rejected' : event.notice.state === 'accepted' ? 'chat' : 'consent',
        errorMessage: null,
      }
    case 'bootstrap_failed':
      return { ...state, phase: 'error', errorMessage: event.message }
    case 'consent_accepted':
      return state.phase === 'consent' ? { ...state, phase: 'chat' } : state
    case 'consent_declined':
      // 拒绝：不持久化任何内容（不建会话、不发消息），仅停留在提示屏
      return state.phase === 'consent' ? { ...state, phase: 'notice-rejected' } : state
    case 'session_created':
      return state.phase === 'chat' ? { ...state, session: event.session } : state
    case 'messages_loaded': {
      let messages = state.messages
      for (const message of event.messages) messages = mergeMessage(messages, message)
      return { ...state, messages }
    }
    case 'message_optimistic':
      // 复用 mergeMessage：重试（同 key）时覆盖原条目而非追加
      return {
        ...state,
        messages: mergeMessage(state.messages, {
          key: event.key,
          id: null,
          clientMsgId: event.clientMsgId,
          role: 'visitor',
          body: event.body,
          status: 'pending',
          attachment: event.attachment ?? null,
          attachments: [],
        }),
      }
    case 'message_confirmed':
      return { ...state, messages: mapMessageByKey(state.messages, event.key, { id: event.id, status: 'sent' }) }
    case 'message_failed':
      return { ...state, messages: mapMessageByKey(state.messages, event.key, { status: 'failed' }) }
    case 'attachment_progress':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.key !== event.key || message.attachment === null) return message
          const attachment = {
            ...message.attachment,
            state: event.state,
            assetId: event.assetId !== undefined ? event.assetId : message.attachment.assetId,
          }
          // linked 是唯一成功态；failed 才出现重试入口（§3.7）。
          const status =
            event.state === 'linked' ? ('sent' as const) : event.state === 'failed' ? ('failed' as const) : message.status
          return { ...message, attachment, status }
        }),
      }
    case 'message_received':
      return { ...state, messages: mergeMessage(state.messages, event.message) }
    case 'asset_content_started':
      return mapAssetByKey(state, event.key, event.assetId, { content: 'loading' })
    case 'asset_content_ready':
      // objectUrl=null（非图片下载成功）只翻状态；图片缩略只在有新 URL 时覆盖。
      return mapAssetByKey(state, event.key, event.assetId, (asset) => ({
        content: 'ready' as const,
        thumbnailUrl: event.objectUrl !== null ? event.objectUrl : asset.thumbnailUrl,
      }))
    case 'asset_content_failed':
      return mapAssetByKey(state, event.key, event.assetId, { content: 'error' })
    case 'asset_preview_opened':
      return { ...state, preview: event.preview }
    case 'asset_preview_closed':
      return state.preview === null ? state : { ...state, preview: null }
    case 'session_status':
      if (event.status !== 'closed' || state.phase === 'rated') return state
      return { ...state, phase: 'closed-rating' }
    case 'connection':
      return { ...state, connection: event.state }
    case 'rating_submitted':
      if (state.phase !== 'closed-rating' || !isValidRatingScore(event.score)) return state
      return { ...state, phase: 'rated', ratingScore: event.score }
    case 'rating_failed':
      return { ...state, errorMessage: event.message }
    case 'retry':
      return { ...initialChatState(state.brand), phase: 'bootstrapping' }
    default:
      return state
  }
}
