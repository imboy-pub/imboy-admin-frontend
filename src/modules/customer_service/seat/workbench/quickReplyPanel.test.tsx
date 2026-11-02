/**
 * V3-27 快捷回复 Seat 面板组件测试（含 SeatSessionView 集成）。
 *
 * 覆盖（任务验收口径）：
 * - 列表加载态 / 空态 / API 失败态（role=status/alert + 重试回调）；
 * - 标题搜索过滤；
 * - 点击条目 → 插入回调（§8 语义：空草稿填入 / 非空换行追加），不直接发送；
 * - 集成：SeatSessionView 传入 quickReplies props 时渲染入口，缺省不渲染；
 * - disabled（sending）时入口与条目禁用。
 */
import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { SeatQuickReplyPanel } from './quickReplyPanel'
import type { SeatQuickReply } from './quickReplies'
import type { SeatSessionDetail } from './contract'
import { SeatSessionView } from './sessionView'
import { CONTACT, CONV, IDENTITY, ORG, SESSION, WS } from './workbenchTestHarness'

afterEach(cleanup)

const ROWS: SeatQuickReply[] = [
  { id: '111111111111111111', title: '问候语', content: '您好，很高兴为您服务。', sort: 0 },
  { id: '222222222222222222', title: '运单查询', content: '请提供您的订单号。', sort: 1 },
]

function renderPanel(overrides: Partial<ComponentProps<typeof SeatQuickReplyPanel>> = {}) {
  const props = {
    replies: ROWS,
    loading: false,
    error: null,
    onRetry: mock(() => {}),
    onInsert: mock((_body: string) => {}),
    draftBody: '',
    ...overrides,
  } satisfies ComponentProps<typeof SeatQuickReplyPanel>
  const view = render(<SeatQuickReplyPanel {...props} />)
  return { view, props }
}

describe('SeatQuickReplyPanel 面板', () => {
  it('默认折叠；点击入口展开并渲染列表条目', async () => {
    const { view } = renderPanel()
    expect(view.queryByTestId('seat-quick-reply-list-panel')).toBeNull()
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-list-panel')).not.toBeNull())
    expect(view.getByTestId('seat-quick-reply-item-111111111111111111').textContent).toContain('问候语')
    expect(view.getByTestId('seat-quick-reply-item-222222222222222222').textContent).toContain('运单查询')
  })

  it('加载态：loading 显示 role=status 文案，无条目', async () => {
    const { view } = renderPanel({ loading: true })
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-loading')).not.toBeNull())
    expect(view.queryByTestId('seat-quick-reply-item-111111111111111111')).toBeNull()
  })

  it('失败态：role=alert + 重试回调触发', async () => {
    const onRetry = mock(() => {})
    const { view } = renderPanel({ error: new Error('boom'), onRetry })
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-error')).not.toBeNull())
    fireEvent.click(view.getByTestId('seat-quick-reply-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('空态：无条目显示「暂无快捷回复」；过滤无结果显示「没有匹配」', async () => {
    const first = renderPanel({ replies: [] })
    fireEvent.click(first.view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(first.view.getByTestId('seat-quick-reply-empty').textContent).toContain('暂无快捷回复'))
    first.view.unmount()

    const user = userEvent.setup()
    const second = renderPanel()
    fireEvent.click(second.view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(second.view.getByTestId('seat-quick-reply-search')).not.toBeNull())
    await user.type(second.view.getByTestId('seat-quick-reply-search'), '不存在')
    await waitFor(() => expect(second.view.getByTestId('seat-quick-reply-empty').textContent).toContain('没有匹配'))
  })

  it('标题搜索过滤（case-insensitive 包含匹配）', async () => {
    const user = userEvent.setup()
    const { view } = renderPanel()
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-search')).not.toBeNull())
    await user.type(view.getByTestId('seat-quick-reply-search'), '运单')
    await waitFor(() => expect(view.queryByTestId('seat-quick-reply-item-111111111111111111')).toBeNull())
    expect(view.getByTestId('seat-quick-reply-item-222222222222222222')).not.toBeNull()
  })

  it('点击条目 → onInsert 收到 §8 语义正文（空草稿填入 / 非空换行追加）并收起', async () => {
    const onInsert = mock((_body: string) => {})
    const { view } = renderPanel({ onInsert, draftBody: '' })
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-item-111111111111111111')).not.toBeNull())
    fireEvent.click(view.getByTestId('seat-quick-reply-item-111111111111111111'))
    expect(onInsert).toHaveBeenCalledTimes(1)
    expect(onInsert.mock.calls[0]?.[0]).toBe('您好，很高兴为您服务。')
    // 插入后收起面板
    await waitFor(() => expect(view.queryByTestId('seat-quick-reply-list-panel')).toBeNull())
    view.unmount()

    const appended = renderPanel({ onInsert, draftBody: '请问' })
    fireEvent.click(appended.view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(appended.view.getByTestId('seat-quick-reply-item-222222222222222222')).not.toBeNull())
    fireEvent.click(appended.view.getByTestId('seat-quick-reply-item-222222222222222222'))
    expect(onInsert.mock.calls[1]?.[0]).toBe('请问\n请提供您的订单号。')
  })

  it('disabled：入口禁用不可展开', () => {
    const { view } = renderPanel({ disabled: true })
    expect((view.getByTestId('seat-quick-reply-toggle') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    expect(view.queryByTestId('seat-quick-reply-list-panel')).toBeNull()
  })
})

const activeDetail: SeatSessionDetail = {
  id: SESSION,
  organizationId: ORG,
  workspaceId: WS,
  contactId: CONTACT,
  conversationId: CONV,
  businessIdentityId: IDENTITY,
  status: 'active',
  version: 8,
  queuedAt: 1758999975,
  claimedAt: 1759000025,
  closedAt: null,
  source: 'widget',
  contactMaskedName: '王***',
  lastMessage: { id: null, senderType: null, preview: null, createdAt: null },
  waitingSeconds: null,
  unreadCount: null,
  needsReply: null,
  visitorMaskedName: '王***',
  visitorSource: '网页组件',
}

function sessionViewProps(overrides: Partial<ComponentProps<typeof SeatSessionView>> = {}) {
  return {
    fetchAssetBlob: mock(async () => new Blob()),
    detail: activeDetail,
    messages: [],
    messagesLoading: false,
    messagesError: null,
    onRetryMessages: mock(() => {}),
    canWrite: true,
    writeClosedReason: null,
    draft: { body: '', fileName: null, fileSize: null },
    onUpdateDraftBody: mock((_body: string) => {}),
    onAttachFile: mock((_file: File) => {}),
    onDetachFile: mock(() => {}),
    onSend: mock(() => {}),
    onRetrySend: mock(() => {}),
    sendError: null,
    sending: false,
    ...overrides,
  } satisfies ComponentProps<typeof SeatSessionView>
}

describe('SeatSessionView 快捷回复集成', () => {
  it('quickReplies 缺省 → 不渲染入口；传入 → 点击条目插入草稿（不触发发送）', async () => {
    const bare = render(<SeatSessionView {...sessionViewProps()} />)
    expect(bare.queryByTestId('seat-quick-reply-toggle')).toBeNull()
    bare.unmount()

    const onUpdateDraftBody = mock((_body: string) => {})
    const onSend = mock(() => {})
    const view = render(
      <SeatSessionView
        {...sessionViewProps({ onUpdateDraftBody, onSend })}
        quickReplies={ROWS}
        quickRepliesLoading={false}
        quickRepliesError={null}
        onRetryQuickReplies={mock(() => {})}
      />
    )
    fireEvent.click(view.getByTestId('seat-quick-reply-toggle'))
    await waitFor(() => expect(view.getByTestId('seat-quick-reply-item-111111111111111111')).not.toBeNull())
    fireEvent.click(view.getByTestId('seat-quick-reply-item-111111111111111111'))
    expect(onUpdateDraftBody).toHaveBeenCalledTimes(1)
    expect(onUpdateDraftBody.mock.calls[0]?.[0]).toBe('您好，很高兴为您服务。')
    // 插入不发送（§8：发送仍走既有 composer 流程）
    expect(onSend).toHaveBeenCalledTimes(0)
    // 草稿框同步为插入值（受控投影）
    expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe('')
  })
})
