/**
 * CSW-01：Widget 聊天 UI（轻量 TS + DOM，无框架依赖）。
 *
 * 纪律：
 * - 全部动态文本走 textContent（绝不 innerHTML 拼接，品牌字段同理防 XSS）；
 * - 可访问性：消息区 role=log + aria-live、按钮都有可读 aria-label、
 *   评分按钮带「N 星」标签、连接状态用文字而非仅颜色；
 * - 窄屏（iframe 已由 loader 铺满视口）下布局纵向自适应。
 */
import type { ChatMessage, ChatState } from './chatMachine'
import { isValidRatingScore } from './contract'

export type ChatUiHandlers = {
  onConsentAccept: () => void
  onConsentDecline: () => void
  onSend: (_body: string) => void
  onRetryMessage: (_key: string) => void
  onRetryBootstrap: () => void
  onRating: (_score: number) => void
  onClose: () => void
  onAttachment: (_file: File) => void
}

export type ChatUi = {
  render: (_state: ChatState) => void
}

const CONNECTION_LABELS: Record<ChatState['connection'], string> = {
  connecting: '连接中',
  online: '已连接',
  reconnecting: '重连中',
  offline: '离线（稍后自动重试）',
}

/** §3.7 UI 映射：只有 linked 显示成功；failed 才给重试入口。 */
const ATTACHMENT_STATE_LABELS: Record<NonNullable<ChatMessage['attachment']>['state'], string> = {
  pending: '处理中',
  confirming: '校验中',
  sending: '发送中',
  linked: '已发送',
  failed: '发送失败',
}

export function createChatUi(root: HTMLElement, locale: string, handlers: ChatUiHandlers): ChatUi {
  const doc = root.ownerDocument
  root.classList.add('cs-app')
  const style = doc.createElement('style')
  style.textContent = `
* { box-sizing: border-box; }
.cs-app { display: flex; flex-direction: column; height: 100vh; margin: 0; font-family: system-ui, sans-serif; color: #111827; background: #f9fafb; }
.cs-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--cs-primary, #2563eb); color: #fff; }
.cs-header h1 { margin: 0; font-size: 15px; font-weight: 600; }
.cs-conn { font-size: 11px; opacity: .9; margin-left: 8px; }
.cs-close { background: transparent; border: 0; color: #fff; font-size: 18px; cursor: pointer; padding: 4px 8px; }
.cs-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.cs-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; }
.cs-log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.cs-msg { max-width: 78%; padding: 8px 11px; border-radius: 12px; font-size: 14px; line-height: 1.45; word-break: break-word; }
.cs-msg[data-role="visitor"] { align-self: flex-end; background: var(--cs-primary, #2563eb); color: #fff; }
.cs-msg[data-role="agent"] { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; }
.cs-msg[data-role="system"] { align-self: center; background: transparent; color: #6b7280; font-size: 12px; }
.cs-msg[data-status="pending"] { opacity: .6; }
.cs-msg[data-status="failed"] { opacity: .9; border: 1px solid #dc2626; }
.cs-retry { margin-top: 4px; font-size: 12px; border: 0; background: #fee2e2; color: #b91c1c; border-radius: 6px; padding: 3px 8px; cursor: pointer; }
.cs-banner { padding: 6px 12px; font-size: 12px; background: #fef3c7; color: #92400e; text-align: center; }
.cs-composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e5e7eb; background: #fff; }
.cs-composer input { flex: 1; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; font-size: 14px; }
.cs-composer input:focus-visible { outline: 2px solid var(--cs-primary, #2563eb); }
.cs-send { border: 0; border-radius: 8px; padding: 9px 14px; background: var(--cs-primary, #2563eb); color: #fff; cursor: pointer; font-size: 14px; }
.cs-send:disabled { opacity: .5; cursor: default; }
.cs-stars { display: flex; gap: 8px; justify-content: center; }
.cs-star { font-size: 22px; background: transparent; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
.cs-star:focus-visible { outline: 2px solid var(--cs-primary, #2563eb); }
.cs-note { font-size: 12px; color: #6b7280; line-height: 1.5; margin: 0; }
.cs-actions { display: flex; gap: 10px; justify-content: center; }
.cs-btn { border: 0; border-radius: 8px; padding: 9px 16px; font-size: 14px; cursor: pointer; }
.cs-btn.primary { background: var(--cs-primary, #2563eb); color: #fff; }
.cs-btn.plain { background: #e5e7eb; color: #374151; }
.cs-attach { border: 0; background: transparent; font-size: 18px; cursor: pointer; padding: 6px; }
.cs-attach:focus-visible { outline: 2px solid var(--cs-primary, #2563eb); }
.cs-attach:disabled { opacity: .4; cursor: default; }
.cs-file { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.cs-att { margin-top: 4px; font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
.cs-att-name { font-weight: 600; word-break: break-all; }
.cs-att-state[data-state="failed"] { color: #b91c1c; }
`
  root.appendChild(style)

  const header = doc.createElement('header')
  header.className = 'cs-header'
  const title = doc.createElement('h1')
  const conn = doc.createElement('span')
  conn.className = 'cs-conn'
  conn.setAttribute('data-testid', 'cs-conn-state')
  const closeBtn = doc.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'cs-close'
  closeBtn.setAttribute('data-testid', 'cs-close')
  closeBtn.setAttribute('aria-label', '关闭聊天窗口')
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', handlers.onClose)
  const titleWrap = doc.createElement('div')
  titleWrap.style.display = 'flex'
  titleWrap.style.alignItems = 'baseline'
  titleWrap.appendChild(title)
  titleWrap.appendChild(conn)
  header.appendChild(titleWrap)
  header.appendChild(closeBtn)

  const body = doc.createElement('div')
  body.className = 'cs-body'
  const center = doc.createElement('div')
  center.className = 'cs-center'
  center.setAttribute('data-testid', 'cs-overlay')
  const log = doc.createElement('div')
  log.className = 'cs-log'
  log.setAttribute('role', 'log')
  log.setAttribute('aria-live', 'polite')
  log.setAttribute('data-testid', 'cs-message-list')
  const banner = doc.createElement('div')
  banner.className = 'cs-banner'
  banner.setAttribute('data-testid', 'cs-banner')
  banner.style.display = 'none'
  const composer = doc.createElement('div')
  composer.className = 'cs-composer'
  const attachBtn = doc.createElement('button')
  attachBtn.type = 'button'
  attachBtn.className = 'cs-attach'
  attachBtn.setAttribute('data-testid', 'cs-attach')
  attachBtn.setAttribute('aria-label', locale === 'zh-CN' ? '添加附件' : 'Attach a file')
  attachBtn.setAttribute('aria-haspopup', 'false')
  attachBtn.textContent = '📎'
  const fileInput = doc.createElement('input')
  fileInput.type = 'file'
  fileInput.className = 'cs-file'
  fileInput.setAttribute('data-testid', 'cs-file-input')
  fileInput.setAttribute('aria-label', locale === 'zh-CN' ? '选择要发送的文件' : 'Choose a file to send')
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file !== undefined) handlers.onAttachment(file)
    fileInput.value = ''
  })
  attachBtn.addEventListener('click', () => fileInput.click())
  const input = doc.createElement('input')
  input.type = 'text'
  input.setAttribute('data-testid', 'cs-input')
  input.setAttribute('aria-label', '输入消息')
  input.placeholder = locale === 'zh-CN' ? '输入消息…' : 'Type a message…'
  const sendBtn = doc.createElement('button')
  sendBtn.type = 'button'
  sendBtn.className = 'cs-send'
  sendBtn.setAttribute('data-testid', 'cs-send')
  sendBtn.textContent = locale === 'zh-CN' ? '发送' : 'Send'
  sendBtn.addEventListener('click', submitInput)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitInput()
  })
  composer.appendChild(attachBtn)
  composer.appendChild(input)
  composer.appendChild(sendBtn)
  composer.appendChild(fileInput)
  body.appendChild(center)
  body.appendChild(log)
  body.appendChild(banner)
  body.appendChild(composer)
  root.appendChild(header)
  root.appendChild(body)

  function submitInput(): void {
    const value = input.value.trim()
    if (value.length === 0) return
    input.value = ''
    handlers.onSend(value)
  }

  function showChat(state: ChatState): void {
    center.style.display = 'none'
    log.style.display = 'flex'
    composer.style.display = 'flex'
    composer.querySelectorAll('button, input').forEach((el) => {
      ;(el as HTMLButtonElement | HTMLInputElement).disabled = state.session === null
    })
    const last = state.messages[state.messages.length - 1]
    banner.style.display = state.connection === 'offline' || state.connection === 'reconnecting' ? 'block' : 'none'
    banner.textContent = CONNECTION_LABELS[state.connection]
    renderLog(state.messages, last !== undefined && last.role === 'agent')
  }

  function attachmentRow(message: ChatMessage): HTMLElement | null {
    const attachment = message.attachment
    if (attachment === null) return null
    const wrap = doc.createElement('span')
    wrap.className = 'cs-att'
    const name = doc.createElement('span')
    name.className = 'cs-att-name'
    name.textContent = `📄 ${attachment.name}`
    wrap.appendChild(name)
    const stateEl = doc.createElement('span')
    stateEl.className = 'cs-att-state'
    stateEl.setAttribute('data-testid', 'cs-att-state')
    // 状态用文字承载（不只靠颜色）；linked 是唯一成功态（§3.7）。
    stateEl.setAttribute('data-state', attachment.state)
    stateEl.textContent = ATTACHMENT_STATE_LABELS[attachment.state]
    wrap.appendChild(stateEl)
    return wrap
  }

  function renderLog(messages: ChatMessage[], scrollToEnd: boolean): void {
    const frag = doc.createDocumentFragment()
    for (const message of messages) {
      const bubble = doc.createElement('div')
      bubble.className = 'cs-msg'
      bubble.setAttribute('data-role', message.role)
      bubble.setAttribute('data-status', message.status)
      bubble.setAttribute('data-test-key', message.key)
      // 附件消息：气泡主体 = 附件行（名称+状态文字）；正文（caption）可空。
      const attachment = attachmentRow(message)
      bubble.textContent = message.body
      const retryAfter = (): void => {
        if (message.status !== 'failed') return
        const retry = doc.createElement('button')
        retry.type = 'button'
        retry.className = 'cs-retry'
        retry.setAttribute('data-testid', 'cs-msg-retry')
        retry.setAttribute('aria-label', '重发这条消息')
        retry.textContent = locale === 'zh-CN' ? '重发' : 'Retry'
        retry.addEventListener('click', () => handlers.onRetryMessage(message.key))
        bubble.appendChild(doc.createElement('br'))
        bubble.appendChild(retry)
      }
      if (attachment !== null) {
        if (message.body.length > 0) bubble.appendChild(doc.createElement('br'))
        bubble.appendChild(attachment)
      }
      retryAfter()
      frag.appendChild(bubble)
    }
    log.replaceChildren(frag)
    if (scrollToEnd) log.scrollTop = log.scrollHeight
  }

  function render(state: ChatState): void {
    title.textContent = state.brand.displayName
    if (state.brand.primaryColor !== null) root.style.setProperty('--cs-primary', state.brand.primaryColor)
    conn.textContent = state.phase === 'chat' || state.phase === 'closed-rating' ? CONNECTION_LABELS[state.connection] : ''
    if (state.phase === 'chat') {
      showChat(state)
      return
    }
    composer.style.display = 'none'
    log.style.display = 'none'
    banner.style.display = 'none'
    center.style.display = 'flex'
    if (state.phase === 'awaiting-context' || state.phase === 'bootstrapping') {
      center.replaceChildren(textNode('p', locale === 'zh-CN' ? '正在连接客服…' : 'Connecting…'))
      return
    }
    if (state.phase === 'consent') {
      center.replaceChildren(...consentOverlay(state))
      return
    }
    if (state.phase === 'notice-rejected') {
      center.replaceChildren(
        textNode('h2', '已选择不同意'),
        textNode(
          'p',
          '根据你的选择，本次不会创建会话，也不会保存或发送任何聊天内容。你可以随时关闭窗口。'
        )
      )
      return
    }
    if (state.phase === 'error') {
      const retry = doc.createElement('button')
      retry.type = 'button'
      retry.className = 'cs-btn primary'
      retry.setAttribute('data-testid', 'cs-retry-bootstrap')
      retry.textContent = locale === 'zh-CN' ? '重试' : 'Retry'
      retry.addEventListener('click', () => handlers.onRetryBootstrap())
      center.replaceChildren(
        textNode('h2', locale === 'zh-CN' ? '客服暂时不可用' : 'Service unavailable'),
        textNode('p', state.errorMessage ?? ''),
        retry
      )
      return
    }
    if (state.phase === 'closed-rating') {
      center.replaceChildren(...ratingOverlay(state))
      return
    }
    center.replaceChildren(textNode('h2', '感谢您的评价！'), textNode('p', '期待再次为您服务。'))
  }

  function consentOverlay(state: ChatState): Node[] {
    const accept = doc.createElement('button')
    accept.type = 'button'
    accept.className = 'cs-btn primary'
    accept.setAttribute('data-testid', 'cs-consent-accept')
    accept.textContent = locale === 'zh-CN' ? '同意并开始聊天' : 'Accept and chat'
    accept.addEventListener('click', () => handlers.onConsentAccept())
    const decline = doc.createElement('button')
    decline.type = 'button'
    decline.className = 'cs-btn plain'
    decline.setAttribute('data-testid', 'cs-consent-decline')
    decline.textContent = locale === 'zh-CN' ? '拒绝' : 'Decline'
    decline.addEventListener('click', () => handlers.onConsentDecline())
    return [
      textNode('h2', state.brand.displayName),
      textNode(
        'p',
        locale === 'zh-CN'
          ? `开始聊天前请确认隐私提示（版本 ${state.notice?.version ?? ''}）：消息内容将用于客服服务，不同意则不保存任何内容。`
          : `Privacy notice v${state.notice?.version ?? ''}: conversation content is used for customer service. Declining saves nothing.`
      ),
      wrapActions([accept, decline]),
    ]
  }

  function ratingOverlay(state: ChatState): Node[] {
    const stars: Node[] = []
    const wrap = doc.createElement('div')
    wrap.className = 'cs-stars'
    for (let score = 1; score <= 5; score += 1) {
      const star = doc.createElement('button')
      star.type = 'button'
      star.className = 'cs-star'
      star.setAttribute('data-testid', `cs-rate-${score}`)
      star.setAttribute('aria-label', locale === 'zh-CN' ? `${score} 星评价` : `Rate ${score} star(s)`)
      star.textContent = '★'
      if (isValidRatingScore(score)) star.addEventListener('click', () => handlers.onRating(score))
      stars.push(star)
      wrap.appendChild(star)
    }
    const nodes: Node[] = [
      textNode('h2', locale === 'zh-CN' ? '会话已结束' : 'Session closed'),
      textNode('p', locale === 'zh-CN' ? '请为本次服务评分（1-5 星）：' : 'Rate this service (1-5 stars):'),
      wrap,
    ]
    if (state.errorMessage !== null) {
      nodes.push(textNode('p', locale === 'zh-CN' ? `提交失败，请重试：${state.errorMessage}` : `Retry: ${state.errorMessage}`))
    }
    return nodes
  }

  function wrapActions(children: Node[]): HTMLElement {
    const wrap = doc.createElement('div')
    wrap.className = 'cs-actions'
    wrap.setAttribute('data-testid', 'cs-actions')
    wrap.replaceChildren(...children)
    return wrap
  }

  function textNode(tag: string, text: string): HTMLElement {
    const el = doc.createElement(tag)
    el.textContent = text
    return el
  }

  return { render }
}
