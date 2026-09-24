/**
 * CSW-01 聊天状态机单元测试（纯函数）。
 *
 * 覆盖验收点：
 * - bootstrap：成功/失败/retry 转移；
 * - notice/consent：pending → 同意/拒绝（拒绝不进入 chat、不产生任何持久化动作）；
 * - 重连：connection 子态转移（connecting/online/reconnecting/offline）不影响消息；
 * - 消息：client_msg_id 幂等合并（SSE 重放/补偿去重）、失败标记与恢复；
 * - rating：仅 closed 后开放、1..5、提交后幂等（重复事件不改变状态）。
 */
import { describe, expect, it } from 'bun:test'
import { initialChatState, mergeMessage, reduceChat, type ChatMessage, type ChatState, type MessageAsset } from './chatMachine'

const BRAND = { displayName: 'E2E 商城客服', primaryColor: '#2563eb' }
const NOTICE_ACCEPTED = { version: 'v1', state: 'accepted' as const }
const NOTICE_PENDING = { version: 'v1', state: 'pending' as const }
const SESSION = { id: '72057594037927936', status: 'active' }

function stateAfterBootstrap(notice: { version: string; state: 'pending' | 'accepted' | 'rejected' }): ChatState {
  return reduceChat(initialChatState(BRAND), { type: 'bootstrap_succeeded', brand: BRAND, notice })
}

describe('bootstrap 转移', () => {
  it('bootstrapping → succeeded(accepted) 直接进入 chat', () => {
    const state = stateAfterBootstrap(NOTICE_ACCEPTED)
    expect(state.phase).toBe('chat')
    expect(state.brand.displayName).toBe(BRAND.displayName)
  })

  it('succeeded(pending) 进入 consent；declined 后拒绝屏且永不进入 chat', () => {
    const pending = stateAfterBootstrap(NOTICE_PENDING)
    expect(pending.phase).toBe('consent')
    const declined = reduceChat(pending, { type: 'consent_declined' })
    expect(declined.phase).toBe('notice-rejected')
    // 拒绝后：session 事件也不该产生（reduce 忽略）
    expect(reduceChat(declined, { type: 'session_created', session: SESSION }).session).toBeNull()
  })

  it('succeeded(rejected) 直接 notice-rejected（服务端裁定）', () => {
    expect(stateAfterBootstrap({ version: 'v1', state: 'rejected' }).phase).toBe('notice-rejected')
  })

  it('bootstrap_failed → error；retry 回到 bootstrapping', () => {
    const failed = reduceChat(initialChatState(), { type: 'bootstrap_failed', message: 'HTTP 500' })
    expect(failed.phase).toBe('error')
    expect(failed.errorMessage).toBe('HTTP 500')
    expect(reduceChat(failed, { type: 'retry' }).phase).toBe('bootstrapping')
  })
})

describe('consent → chat → 会话/消息（重连/幂等）', () => {
  function chatState(): ChatState {
    let state = stateAfterBootstrap(NOTICE_PENDING)
    state = reduceChat(state, { type: 'consent_accepted' })
    state = reduceChat(state, { type: 'session_created', session: SESSION })
    return state
  }

  it('同意后进入 chat 并持有 session', () => {
    const state = chatState()
    expect(state.phase).toBe('chat')
    expect(state.session?.id).toBe(SESSION.id)
  })

  it('connection 子态转移：reconnecting/offline 不丢消息', () => {
    let state = chatState()
    state = reduceChat(state, {
      type: 'message_received',
      message: { key: 'srv-1', id: '1', clientMsgId: null, role: 'agent', body: '您好', status: 'sent' },
    })
    state = reduceChat(state, { type: 'connection', state: 'reconnecting' })
    expect(state.connection).toBe('reconnecting')
    expect(state.messages).toHaveLength(1)
    state = reduceChat(state, { type: 'connection', state: 'offline' })
    expect(state.connection).toBe('offline')
    state = reduceChat(state, { type: 'connection', state: 'online' })
    expect(state.connection).toBe('online')
    expect(state.messages).toHaveLength(1)
  })

  it('client_msg_id 幂等：SSE 回显/重放与本地乐观消息按 id/client_msg_id 去重', () => {
    let state = chatState()
    state = reduceChat(state, { type: 'message_optimistic', key: 'local-cm1', clientMsgId: 'cm1', body: '在吗？' })
    // 服务端确认（带 id + 同 client_msg_id）→ 命中 client_msg_id 合并，不产生第二条
    state = reduceChat(state, {
      type: 'message_received',
      message: { key: 'srv-9', id: '9', clientMsgId: 'cm1', role: 'visitor', body: '在吗？', status: 'sent' },
    })
    expect(state.messages.filter((m) => m.body === '在吗？')).toHaveLength(1)
    // 断线补偿重放同一条（同 id）→ 仍然一条
    state = reduceChat(state, {
      type: 'message_received',
      message: { key: 'srv-9-replay', id: '9', clientMsgId: 'cm1', role: 'visitor', body: '在吗？', status: 'sent' },
    })
    expect(state.messages.filter((m) => m.id === '9')).toHaveLength(1)
  })

  it('发送失败标记 failed；重试乐观恢复 pending，再失败仍 failed', () => {
    let state = chatState()
    state = reduceChat(state, { type: 'message_optimistic', key: 'local-cm2', clientMsgId: 'cm2', body: 'hello' })
    state = reduceChat(state, { type: 'message_failed', key: 'local-cm2' })
    expect(state.messages.find((m) => m.key === 'local-cm2')?.status).toBe('failed')
    state = reduceChat(state, { type: 'message_optimistic', key: 'local-cm2', clientMsgId: 'cm2', body: 'hello' })
    expect(state.messages.filter((m) => m.clientMsgId === 'cm2')).toHaveLength(1)
    expect(state.messages.find((m) => m.key === 'local-cm2')?.status).toBe('pending')
  })
})

describe('rating（仅 closed、1..5、幂等）', () => {
  function closedState(): ChatState {
    let state = reduceChat(initialChatState(BRAND), { type: 'bootstrap_succeeded', brand: BRAND, notice: NOTICE_ACCEPTED })
    state = reduceChat(state, { type: 'session_created', session: SESSION })
    state = reduceChat(state, { type: 'session_status', status: 'closed' })
    return state
  }

  it('active 会话不进入 closed-rating；closed 后进入评分', () => {
    let state = reduceChat(initialChatState(BRAND), { type: 'bootstrap_succeeded', brand: BRAND, notice: NOTICE_ACCEPTED })
    state = reduceChat(state, { type: 'session_created', session: SESSION })
    state = reduceChat(state, { type: 'session_status', status: 'active' })
    expect(state.phase).toBe('chat')
    state = reduceChat(state, { type: 'session_status', status: 'closed' })
    expect(state.phase).toBe('closed-rating')
  })

  it('评分 1..5 合法提交进入 rated；越界分数被拒绝', () => {
    expect(reduceChat(closedState(), { type: 'rating_submitted', score: 5 }).phase).toBe('rated')
    expect(reduceChat(closedState(), { type: 'rating_submitted', score: 0 }).phase).toBe('closed-rating')
    expect(reduceChat(closedState(), { type: 'rating_submitted', score: 6 }).phase).toBe('closed-rating')
  })

  it('rated 后重复的评分/状态事件幂等（不回退、不改分）', () => {
    let state = reduceChat(closedState(), { type: 'rating_submitted', score: 4 })
    state = reduceChat(state, { type: 'rating_submitted', score: 5 })
    expect(state.ratingScore).toBe(4)
    state = reduceChat(state, { type: 'session_status', status: 'closed' })
    expect(state.phase).toBe('rated')
  })
})

describe('mergeMessage（纯去重）', () => {
  const base: ChatMessage[] = [
    { key: 'srv-1', id: '1', clientMsgId: null, role: 'agent', body: 'a', status: 'sent' },
  ]
  it('按 id 命中替换；新消息追加', () => {
    const replaced = mergeMessage(base, { key: 'srv-1-b', id: '1', clientMsgId: null, role: 'agent', body: 'a2', status: 'sent' })
    expect(replaced).toHaveLength(1)
    expect(replaced[0]?.body).toBe('a2')
    const appended = mergeMessage(base, { key: 'srv-2', id: '2', clientMsgId: null, role: 'visitor', body: 'b', status: 'sent' })
    expect(appended).toHaveLength(2)
  })
})

describe('历史附件与图片预览（CS-WGT-01）', () => {
  const ASSET: MessageAsset = {
    assetId: '72057594037928101',
    name: '截图.png',
    mime: 'image/png',
    sizeBytes: 20480,
    state: 'linked',
    thumbnailUrl: null,
    content: 'idle',
  }

  function chatWithAssetMessage(): ChatState {
    let state = stateAfterBootstrap(NOTICE_ACCEPTED)
    state = reduceChat(state, { type: 'session_created', session: SESSION })
    return reduceChat(state, {
      type: 'message_received',
      message: {
        key: 'srv-9',
        id: '9',
        clientMsgId: null,
        role: 'agent',
        body: '请看截图',
        status: 'sent',
        attachment: null,
        attachments: [ASSET],
      },
    })
  }

  it('服务端消息携带 attachments 进入状态；乐观消息 attachments=[]（互不串扰）', () => {
    const state = chatWithAssetMessage()
    expect(state.messages[0]?.attachments).toHaveLength(1)
    expect(state.messages[0]?.attachments[0]?.assetId).toBe('72057594037928101')
    let optimistic = reduceChat(state, { type: 'message_optimistic', key: 'local-1', clientMsgId: 'cm-1', body: 'hi' })
    optimistic = reduceChat(optimistic, { type: 'message_optimistic', key: 'local-1', clientMsgId: 'cm-1', body: 'hi', attachment: { name: 'a.pdf', mime: 'application/pdf', sizeBytes: 1, state: 'linked', assetId: 'x' } })
    const local = optimistic.messages.find((m) => m.key === 'local-1')
    expect(local?.attachments).toEqual([])
    expect(local?.attachment?.name).toBe('a.pdf')
  })

  it('附件内容状态机：started → ready（缩略 blob: URL）/ failed；blob URL 不回退', () => {
    let state = chatWithAssetMessage()
    state = reduceChat(state, { type: 'asset_content_started', key: 'srv-9', assetId: '72057594037928101' })
    expect(state.messages[0]?.attachments[0]?.content).toBe('loading')
    state = reduceChat(state, { type: 'asset_content_ready', key: 'srv-9', assetId: '72057594037928101', objectUrl: 'blob:stub-1' })
    expect(state.messages[0]?.attachments[0]?.content).toBe('ready')
    expect(state.messages[0]?.attachments[0]?.thumbnailUrl).toBe('blob:stub-1')
    // ready(null)（非图片下载成功）不动缩略
    state = reduceChat(state, { type: 'asset_content_ready', key: 'srv-9', assetId: '72057594037928101', objectUrl: null })
    expect(state.messages[0]?.attachments[0]?.thumbnailUrl).toBe('blob:stub-1')
    state = reduceChat(state, { type: 'asset_content_failed', key: 'srv-9', assetId: '72057594037928101' })
    expect(state.messages[0]?.attachments[0]?.content).toBe('error')
    // 未知 (key, assetId) 双键不命中 → 原样
    const before = state.messages
    const untouched = reduceChat(state, { type: 'asset_content_started', key: 'srv-404', assetId: 'nope' })
    expect(untouched.messages).toBe(before)
  })

  it('图片预览：opened 持 blob: URL；closed 清空；retry 复位 preview=null', () => {
    let state = chatWithAssetMessage()
    const preview = { key: 'srv-9', assetId: '72057594037928101', objectUrl: 'blob:stub-1', mime: 'image/png', fileName: '截图.png' }
    state = reduceChat(state, { type: 'asset_preview_opened', preview })
    expect(state.preview).toEqual(preview)
    state = reduceChat(state, { type: 'asset_preview_closed' })
    expect(state.preview).toBeNull()
    state = reduceChat(state, { type: 'asset_preview_opened', preview })
    state = reduceChat(state, { type: 'retry' })
    expect(state.preview).toBeNull()
    expect(state.messages).toHaveLength(0)
  })
})
