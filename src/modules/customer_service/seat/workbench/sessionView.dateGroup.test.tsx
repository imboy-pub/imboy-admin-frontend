import '../../../../test/setupDom'

/**
 * R23-B 专项遗留 5a：seat 会话视图日期分组 DOM 断言（组件级 mock 面）。
 *
 * 背景（AD_W3_report §5.1）：7.6"日期分组"条款在 e2e mock 面仅覆盖 widget；
 * seat 的 `seat-message-date` 分组（sessionView.tsx）原计划由真实栈 A04 扩展，
 * 但 A04 EXECUTE-GATED（需真实后端栈）。本文件以组件级测试补上 DOM 断言证据：
 * - 注入固定 zone resolver（与 timeDisplay.test.tsx 同手法），断言跨日消息按
 *   查看 zone 分组渲染 `seat-message-date` 分隔条，文本 = 独立 Intl 预计算
 *   期望（不经被测 displayFormatter 缓存自算自比）；
 * - 运行中切 resolver（rerender 触发渲染期重取 memo）后分组集合即时更新——
 *   与 R14 生命周期机制链（resolver 变化 → 缓存失效 → 重渲染）在消息分组
 *   场景的衔接证据。
 * 证据边界：本文件为 jsdom 组件级 mock 面，非真实浏览器栈；真实栈断言仍属
 * A04（EXECUTE-GATED，解锁条件见 R23B_FLAD_gates.md §5a）。
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { resetDisplayZoneResolver, setDisplayZoneResolver } from '@/lib/displayTime'
import type { SeatMessage, SeatSessionDetail } from './contract'
import { CONTACT, CONV, IDENTITY, ORG, SESSION, WS } from './workbenchTestHarness'
import { SeatSessionView } from './sessionView'

afterEach(() => {
  cleanup()
  resetDisplayZoneResolver()
})

const detail: SeatSessionDetail = {
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

/** 跨两个日历日的三个固定瞬间（UTC）。 */
const M1 = '2026-09-16T10:00:00.000Z' // 上海 09/16 18:00 ｜ 洛杉矶 09/16 03:00
const M2 = '2026-09-16T17:30:00.000Z' // 上海 09/17 01:30 ｜ 洛杉矶 09/16 10:30
const M3 = '2026-09-17T02:00:00.000Z' // 上海 09/17 10:00 ｜ 洛杉矶 09/16 19:00

function msg(id: string, createdAt: string, body: string): SeatMessage {
  return {
    id,
    senderType: 'visitor',
    senderContactId: CONTACT,
    senderIdentityId: IDENTITY,
    clientMsgId: `cm-${id}`,
    body,
    createdAt,
    readAt: null,
    attachments: [],
  }
}

const MESSAGES = [
  msg('9000000000000000001', M1, '第一条（沪 09/16）'),
  msg('9000000000000000002', M2, '第二条（沪 09/17 跨日）'),
  msg('9000000000000000003', M3, '第三条（沪 09/17 同日）'),
]

/** 独立预计算 day 期望串（同 FORMAT_OPTIONS.day 形状、显式 zone，不走被测缓存）。 */
function expectedDay(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
  }).format(new Date(iso))
}

function baseProps(): ComponentProps<typeof SeatSessionView> {
  return {
    fetchAssetBlob: mock(async () => new Blob()),
    detail,
    messages: MESSAGES,
    messagesLoading: false,
    messagesError: null,
    onRetryMessages: mock(() => {}),
    canWrite: true,
    writeClosedReason: null,
    draft: { body: '', fileName: null, fileSize: null },
    onUpdateDraftBody: mock(() => {}),
    onAttachFile: mock((_file: File) => {}),
    onDetachFile: mock(() => {}),
    onSend: mock(() => {}),
    onRetrySend: mock(() => {}),
    sendError: null,
    sending: false,
  } satisfies ComponentProps<typeof SeatSessionView>
}

function dateSeparators(): string[] {
  return Array.from(document.querySelectorAll('[data-testid="seat-message-date"]'))
    .map((el) => el.textContent)
    .filter((t): t is string => t !== null)
}

describe('SeatSessionView 日期分组 DOM（seat-message-date，专项 5a）', () => {
  it('上海 zone：跨日消息渲染 {09/16, 09/17} 两条分隔条，同日多条不重复', () => {
    setDisplayZoneResolver(() => 'Asia/Shanghai')
    render(<SeatSessionView {...baseProps()} />)
    expect(dateSeparators()).toEqual([
      expectedDay(M1, 'Asia/Shanghai'),
      expectedDay(M2, 'Asia/Shanghai'),
    ])
  })

  it('洛杉矶 zone：同一消息列表分组集合收敛为 {09/16} 单条', () => {
    setDisplayZoneResolver(() => 'America/Los_Angeles')
    render(<SeatSessionView {...baseProps()} />)
    expect(dateSeparators()).toEqual([expectedDay(M2, 'America/Los_Angeles')])
  })

  it('运行中切 resolver（重渲染）：分组集合即时从上海组切换为洛杉矶组', () => {
    setDisplayZoneResolver(() => 'Asia/Shanghai')
    const view = render(<SeatSessionView {...baseProps()} />)
    expect(dateSeparators()).toEqual([
      expectedDay(M1, 'Asia/Shanghai'),
      expectedDay(M2, 'Asia/Shanghai'),
    ])
    // 运行中切区（非 reload）：resolver 换目标 + rerender（真实栈由 focus 生命周期驱动，机制链一致）
    setDisplayZoneResolver(() => 'America/Los_Angeles')
    view.rerender(<SeatSessionView {...baseProps()} />)
    expect(dateSeparators()).toEqual([expectedDay(M2, 'America/Los_Angeles')])
  })
})
