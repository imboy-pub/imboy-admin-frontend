/**
 * FE-W01：Widget 聊天 UI 可访问性 focused 测试（jsdom + @testing-library/dom）。
 *
 * 覆盖（计划 FE-W01：键盘/焦点/aria live；仓内无既有 a11y 工具（无 axe），
 * 采用针对性 testing-library 角色可达性断言——以 accessible name/role 查询，
 * 元素须在可访问树内（可见）才算通过）：
 * - 消息区 role=log + aria-live=polite（新消息播报）；
 * - consent 门：按钮可经 role/name 触达、原生 button 键盘可达；
 * - 评分：1..5 星均带可读 aria-label；连接状态以文字（非仅颜色）承载；
 * - 附件：按钮/文件输入 aria-label；附件状态用文字（linked 才是成功）；
 * - 失败消息重试按钮可读标签。
 *
 * CSD-FE-01-A05 边界说明：360/768/1280/1440 视口 overflow/遮挡为布局级断言，
 * jsdom 无真实布局引擎不可测——由 CSS（loader 面板 min(380px, calc(100vw-32px))、
 * <=480px 全屏；widget/index.html viewport meta）承担，浏览器级断言留给
 * CSD-E2E-01（不在此伪造）。
 */
import '../../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { getByLabelText, getByRole, getByTestId, getByText, queryByTestId } from '@testing-library/dom'
import { createChatUi, type ChatUi } from './ui'
import { initialChatState, reduceChat, type ChatState } from './chatMachine'

function chatState(): ChatState {
  let state = initialChatState()
  state = reduceChat(state, {
    type: 'bootstrap_succeeded',
    brand: { displayName: 'E2E 商城客服', primaryColor: '#2563eb', welcomeText: null },
    notice: { version: '', state: 'accepted' },
  })
  state = reduceChat(state, { type: 'session_created', session: { id: '72057594037927936', status: 'active', version: 1 } })
  return state
}

function mountUi(initial: ChatState = chatState()): { root: HTMLElement; ui: ChatUi; render: (_s: ChatState) => void } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const ui = createChatUi(root, 'zh-CN', {
    onConsentAccept: () => undefined,
    onConsentDecline: () => undefined,
    onSend: () => undefined,
    onRetryMessage: () => undefined,
    onRetryBootstrap: () => undefined,
    onRating: () => undefined,
    onClose: () => undefined,
    onAttachment: () => undefined,
  })
  ui.render(initial)
  return { root, ui, render: (next: ChatState) => ui.render(next) }
}

function consentState(): ChatState {
  return reduceChat(initialChatState(), {
    type: 'bootstrap_succeeded',
    brand: { displayName: 'E2E 商城客服', primaryColor: '#2563eb', welcomeText: null },
    notice: { version: 'v1', state: 'pending' },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('聊天 UI 可访问性（键盘/焦点/aria live）', () => {
  it('消息区 role=log + aria-live=polite；输入框/关闭按钮有可读标签', () => {
    const { root } = mountUi()
    const log = getByRole(root, 'log')
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(getByLabelText(root, '输入消息').tagName).toBe('INPUT')
    expect(getByRole(root, 'button', { name: '关闭聊天窗口' })).toBeTruthy()
  })

  it('consent 门：同意/拒绝按钮经 role+accessible name 可达且原生可聚焦；隐私版本文字可见', () => {
    const { root } = mountUi(consentState())
    const accept = getByRole(root, 'button', { name: '同意并开始聊天' }) as HTMLButtonElement
    const decline = getByRole(root, 'button', { name: '拒绝' }) as HTMLButtonElement
    expect(accept.tagName).toBe('BUTTON')
    expect(decline.tagName).toBe('BUTTON')
    accept.focus()
    expect(document.activeElement).toBe(accept)
    decline.focus()
    expect(document.activeElement).toBe(decline)
    expect(getByText(root, /隐私提示（版本 v1）/)).toBeTruthy()
  })

  it('评分：1..5 星按钮均带 aria-label；评分标题可读', () => {
    const { root, render } = mountUi()
    render(reduceChat(chatState(), { type: 'session_status', status: 'closed' }))
    for (let score = 1; score <= 5; score += 1) {
      expect(getByRole(root, 'button', { name: `${score} 星评价` })).toBeTruthy()
    }
    expect(getByText(root, '会话已结束')).toBeTruthy()
  })

  it('连接状态以文字承载（offline banner），不只靠颜色', () => {
    const { root, render } = mountUi()
    render(reduceChat(chatState(), { type: 'connection', state: 'offline' }))
    expect(getByTestId(root, 'cs-banner').textContent).toContain('离线')
  })

  it('error 态：错误标题以文字承载，重试按钮经 role+name 键盘可达（CSD-FE-01-A05）', () => {
    const { root, render } = mountUi()
    render(
      reduceChat(initialChatState(), { type: 'bootstrap_failed', message: 'bootstrap 失败（HTTP 404）' })
    )
    expect(getByText(root, '客服暂时不可用')).toBeTruthy()
    const retry = getByRole(root, 'button', { name: '重试' }) as HTMLButtonElement
    expect(retry.getAttribute('data-testid')).toBe('cs-retry-bootstrap')
    retry.focus()
    expect(document.activeElement).toBe(retry)
  })

  it('附件：按钮与文件输入 aria-label；附件状态用文字（failed 可见，linked 才成功）', () => {
    const { root, render } = mountUi()
    expect(getByRole(root, 'button', { name: '添加附件' })).toBeTruthy()
    expect(getByLabelText(root, '选择要发送的文件')).toBeTruthy()

    let state = chatState()
    state = reduceChat(state, {
      type: 'message_optimistic',
      key: 'local-1',
      clientMsgId: 'cm-1',
      body: '',
      attachment: { name: '报表.pdf', mime: 'application/pdf', sizeBytes: 2048, state: 'pending', assetId: null },
    })
    state = reduceChat(state, { type: 'attachment_progress', key: 'local-1', state: 'failed' })
    render(state)
    const bubble = root.querySelector('[data-test-key="local-1"]')
    expect(bubble).not.toBeNull()
    expect(bubble?.textContent).toContain('报表.pdf')
    expect(getByTestId(root, 'cs-att-state').getAttribute('data-state')).toBe('failed')
    expect(getByTestId(root, 'cs-att-state').textContent).toContain('发送失败')
    expect(getByRole(root, 'button', { name: '重发这条消息' })).toBeTruthy()

    // linked：唯一成功态；重试入口消失
    let linked = chatState()
    linked = reduceChat(linked, {
      type: 'message_optimistic',
      key: 'local-2',
      clientMsgId: 'cm-2',
      body: '',
      attachment: { name: '报表.pdf', mime: 'application/pdf', sizeBytes: 2048, state: 'pending', assetId: null },
    })
    linked = reduceChat(linked, { type: 'attachment_progress', key: 'local-2', state: 'linked', assetId: 'asset-1' })
    render(linked)
    const linkedState = getByTestId(root, 'cs-att-state')
    expect(linkedState.getAttribute('data-state')).toBe('linked')
    expect(linkedState.textContent).toContain('已发送')
    expect(queryByTestId(root, 'cs-msg-retry')).toBeNull()
  })

  it('失败文本消息带可读重试按钮', () => {
    const { root, render } = mountUi()
    let state = chatState()
    state = reduceChat(state, { type: 'message_optimistic', key: 'local-t', clientMsgId: 'cm-t', body: '你好' })
    state = reduceChat(state, { type: 'message_failed', key: 'local-t' })
    render(state)
    expect(getByRole(root, 'button', { name: '重发这条消息' })).toBeTruthy()
    expect(getByText(root, '你好')).toBeTruthy()
  })
})
