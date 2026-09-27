/**
 * CP-CON-04：Widget 无坐席留言状态（queued 且无 online 坐席 → 可留言提示）。
 *
 * 数据形状：访客面坐席在线汇总 `agents_online`（安全整数计数；0 = 无在线
 * 坐席，>0 = 有；缺键/非法 → null 未知）。枚举语义对齐 seat 面冻结合同
 * SeatPresenceStatus（online/away/busy/offline）——"无 online 坐席"即
 * online 计数为 0。
 *
 * 覆盖验收点：
 * - 合同投影：agents_online 三态 fail-closed（0/>0/缺键）；
 * - 状态判定：仅「queued + 无在线坐席」显示留言状态（有坐席/未知/active 均不显示）；
 * - UI（zh-CN / en-US 两 locale）：无坐席提示条可见，有坐席不可见；
 * - 不阻断：留言状态下输入可编辑、发送照常派发 onSend、消息进入列表。
 */
import '../../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { getByTestId } from '@testing-library/dom'
import { createChatUi, type ChatUi } from './ui'
import { initialChatState, reduceChat, showLeaveMessageNotice, type ChatState } from './chatMachine'
import { toCreatedSession, toSession } from './contract'

const BRAND = { displayName: 'E2E 商城客服', primaryColor: '#2563eb', welcomeText: null }

/** 进入 chat 相位并建会话（status/agentsOnline 可注入）。 */
function chatWithSession(session: { status: string; agentsOnline: boolean | null }): ChatState {
  let state = reduceChat(initialChatState(), {
    type: 'bootstrap_succeeded',
    brand: BRAND,
    notice: { version: '', state: 'accepted' },
  })
  state = reduceChat(state, {
    type: 'session_created',
    session: { id: '72057594037927936', status: session.status, version: 1, agentsOnline: session.agentsOnline },
  })
  return state
}

type SendSpy = { sent: string[] }

function mountUi(initial: ChatState, locale = 'zh-CN'): { root: HTMLElement; render: (_s: ChatState) => void; spy: SendSpy } {
  const spy: SendSpy = { sent: [] }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const ui: ChatUi = createChatUi(root, locale, {
    onConsentAccept: () => undefined,
    onConsentDecline: () => undefined,
    onSend: (body) => void spy.sent.push(body),
    onRetryMessage: () => undefined,
    onRetryBootstrap: () => undefined,
    onRating: () => undefined,
    onClose: () => undefined,
    onAttachment: () => undefined,
    onOpenAttachment: () => undefined,
    onClosePreview: () => undefined,
  })
  ui.render(initial)
  return { root, render: (next: ChatState) => ui.render(next), spy }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('访客面 agents_online 投影（fail-closed）', () => {
  it('agents_online=0 → 无在线坐席；>0 → 有；缺键/负数 → null（未知不猜）', () => {
    expect(toCreatedSession({ session_id: '1', status: 'queued', agents_online: 0 })?.agentsOnline).toBe(false)
    expect(toCreatedSession({ session_id: '1', status: 'queued', agents_online: 2 })?.agentsOnline).toBe(true)
    expect(toCreatedSession({ session_id: '1', status: 'queued' })?.agentsOnline).toBeNull()
    expect(toCreatedSession({ session_id: '1', agents_online: -1 })?.agentsOnline).toBeNull()
    expect(toSession({ id: '1', status: 'queued', agents_online: 0 })?.agentsOnline).toBe(false)
    expect(toSession({ id: '1', status: 'queued' })?.agentsOnline).toBeNull()
  })

  it('初始状态 presence 未知（null）', () => {
    expect(initialChatState().agentsOnline).toBeNull()
  })
})

describe('留言状态判定（queued 且无 online 坐席）', () => {
  it('无坐席 + queued → 显示留言状态', () => {
    expect(showLeaveMessageNotice(chatWithSession({ status: 'queued', agentsOnline: false }))).toBe(true)
  })

  it('有坐席 + queued → 不显示（正常排队，非留言态）', () => {
    expect(showLeaveMessageNotice(chatWithSession({ status: 'queued', agentsOnline: true }))).toBe(false)
  })

  it('presence 未知 + queued → 不显示（fail-closed：缺数据不声称无坐席）', () => {
    expect(showLeaveMessageNotice(chatWithSession({ status: 'queued', agentsOnline: null }))).toBe(false)
  })

  it('无坐席 + active → 不显示（会话已被接待）', () => {
    expect(showLeaveMessageNotice(chatWithSession({ status: 'active', agentsOnline: false }))).toBe(false)
  })
})

describe('widget 留言状态 UI（i18n 中英；不阻断发送）', () => {
  it('无 online 坐席 + queued → 显示可留言提示（zh-CN 文案）', () => {
    const { root } = mountUi(chatWithSession({ status: 'queued', agentsOnline: false }))
    const hint = getByTestId(root, 'cs-leave-message-hint')
    expect(hint.getAttribute('role')).toBe('status')
    expect(hint.textContent).toContain('留言')
    expect(hint.textContent).not.toContain('undefined')
  })

  it('有 online 坐席 + queued → 不显示留言提示', () => {
    const { root } = mountUi(chatWithSession({ status: 'queued', agentsOnline: true }))
    // 提示条常驻 DOM、display 切换（与连接 banner 同模式）：不可见即不显示。
    const hint = getByTestId(root, 'cs-leave-message-hint') as HTMLElement
    expect(hint.style.display).toBe('none')
    expect(hint.textContent).toBe('')
  })

  it('无坐席状态出现/消失随权威刷新切换（SSE session_status 更新 agentsOnline）', () => {
    let state = chatWithSession({ status: 'queued', agentsOnline: null })
    const { root, render } = mountUi(state)
    expect((getByTestId(root, 'cs-leave-message-hint') as HTMLElement).style.display).toBe('none')
    state = reduceChat(state, { type: 'session_status', status: 'queued', agentsOnline: false })
    render(state)
    expect((getByTestId(root, 'cs-leave-message-hint') as HTMLElement).style.display).toBe('block')
    state = reduceChat(state, { type: 'session_status', status: 'active', agentsOnline: true })
    render(state)
    expect((getByTestId(root, 'cs-leave-message-hint') as HTMLElement).style.display).toBe('none')
  })

  it('en locale → 英文文案（leave a message）', () => {
    const { root } = mountUi(chatWithSession({ status: 'queued', agentsOnline: false }), 'en-US')
    expect(getByTestId(root, 'cs-leave-message-hint').textContent).toContain('leave a message')
  })

  it('留言状态下发送不被阻断：输入可编辑、发送派发 onSend、消息进入列表', () => {
    let state = chatWithSession({ status: 'queued', agentsOnline: false })
    const { root, render, spy } = mountUi(state)
    const input = getByTestId(root, 'cs-input') as HTMLInputElement
    const send = getByTestId(root, 'cs-send') as HTMLButtonElement
    expect(input.disabled).toBe(false)
    expect(send.disabled).toBe(false)

    input.value = '请问什么时候发货？'
    send.click()
    expect(spy.sent).toEqual(['请问什么时候发货？'])
    expect(input.value).toBe('')

    // 发送后乐观消息进入列表（留言状态不拦截消息动作）
    state = reduceChat(state, { type: 'message_optimistic', key: 'local-1', clientMsgId: 'cm-1', body: '请问什么时候发货？' })
    render(state)
    const bubble = root.querySelector('[data-test-key="local-1"]')
    expect(bubble?.textContent).toContain('请问什么时候发货？')
    expect(getByTestId(root, 'cs-leave-message-hint')).not.toBeNull()
  })
})
