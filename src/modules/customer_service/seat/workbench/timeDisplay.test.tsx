/**
 * R14 展示时区一致（timezone-contract 组件级）：
 * - R14-1 同一 queuedAt 在队列面板与详情面板显示一致（注入固定查看者 zone）；
 * - R14-2 两个「浏览器 context」（显式 timeZone 参数）各自显示本地格式；
 * - R14-3 zone resolver 变化 + 生命周期事件（focus）后，缓存失效且已渲染
 *   输出更新（useDisplayZoneEpoch 通知重渲染；不逐消息常驻 timer）；
 * - R14-4（真实 OS 运行中切区）保留为条件未验证：本文件的 resolver 变化
 *   是自动化模拟证据，边界见 AD_W2_report。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { resetDisplayZoneResolver, setDisplayZoneResolver } from '@/lib/displayTime'
import { messageTime } from './messageTime'
import { SeatQueuePanel } from './queuePanel'
import { SeatDetailPanel, type SeatDetailPanelProps } from './detailPanel'
import { useDisplayZoneEpoch } from './useDisplayZone'
import type { SeatSessionDetail, SeatSessionSummary } from './contract'
import type { SeatSessionsView, SeatViewStatus } from './workbenchHooks'

/** 固定瞬间：1789600000 秒 = 2026-09-16T23:06:40Z（上海 09-17 07:06 / 纽约 09-16 19:06）。 */
const QUEUED_AT_SECONDS = 1789600000
const T1_ISO = '2026-09-16T23:06:40.000Z'
const SESSION_ID = '72057594037927937'

function sessionFixture(overrides: Partial<SeatSessionSummary> = {}): SeatSessionSummary {
  return {
    id: SESSION_ID,
    organizationId: '2000000000000000002',
    workspaceId: '3000000000000000003',
    contactId: '4000000000000000004',
    conversationId: '5000000000000000005',
    businessIdentityId: '6000000000000000006',
    status: 'queued',
    version: 3,
    queuedAt: QUEUED_AT_SECONDS,
    claimedAt: null,
    closedAt: null,
    source: 'widget',
    contactMaskedName: '王***',
    lastMessage: { id: null, senderType: null, preview: null, createdAt: null },
    waitingSeconds: null,
    unreadCount: 0,
    needsReply: null,
    ...overrides,
  }
}

function viewsFixture(sessions: SeatSessionSummary[]): Record<SeatViewStatus, SeatSessionsView> {
  const view: SeatSessionsView = {
    sessions,
    nextAfterId: null,
    isLoading: false,
    error: null,
    refetch: () => {},
    fetchNextPage: () => {},
    hasNextPage: false,
  }
  return { queued: view, active: view, closed: view }
}

function queueProps(sessions: SeatSessionSummary[]): ComponentProps<typeof SeatQueuePanel> {
  return {
    viewStatus: 'queued',
    onViewStatusChange: () => {},
    counts: { queued: sessions.length, active: 0, closed: 0 },
    views: viewsFixture(sessions),
    selectedSessionId: null,
    onSelectSession: () => {},
    onClaim: () => {},
    claimPendingSessionId: null,
    claimDisabled: false,
    claimDisabledReason: '',
  }
}

function detailFixture(queuedAt: number | null): SeatSessionDetail {
  const summary = sessionFixture({ status: 'active', queuedAt })
  return { ...summary, visitorMaskedName: '王***', visitorSource: '网页组件' }
}

function detailProps(queuedAt: number | null): SeatDetailPanelProps {
  return {
    actionScopeKey: 'test-scope',
    draftHasContent: false,
    sending: false,
    detail: detailFixture(queuedAt),
    detailLoading: false,
    detailError: null,
    onRetryDetail: () => {},
    canWrite: false,
    writeClosedReason: null,
    transferTargets: { targets: [], nextAfterId: null },
    transferTargetsLoading: false,
    transferTargetsError: null,
    onRetryTransferTargets: () => {},
    transferError: null,
    onTransfer: () => {},
    transferConflict: false,
    transferPending: false,
    closeError: null,
    onClose: () => {},
    closeConflict: false,
    closePending: false,
  }
}

function ZoneProbe({ iso, zone }: { iso: string; zone: string }) {
  const t = messageTime(iso, { timeZone: zone })
  return <p data-testid={`zone-${zone.replace('/', '-')}`}>{t === null ? 'none' : `${t.day} ${t.time}`}</p>
}

function LifecycleProbe({ iso }: { iso: string }) {
  const epoch = useDisplayZoneEpoch()
  const t = messageTime(iso)
  return (
    <div data-testid="lifecycle-probe" data-epoch={epoch}>
      {t === null ? 'none' : `${t.day} ${t.time}`}
    </div>
  )
}

describe('R14 展示时区一致（timezone contract）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    resetDisplayZoneResolver()
  })

  it('R14-1: 同一 queuedAt 在队列与详情面板显示一致（固定查看者 zone）', () => {
    setDisplayZoneResolver(() => 'Asia/Shanghai')

    const queue = render(<SeatQueuePanel {...queueProps([sessionFixture()])} />)
    const detail = render(<SeatDetailPanel {...detailProps(QUEUED_AT_SECONDS)} />)

    const row = queue.getByTestId(`seat-session-item-${SESSION_ID}`)
    expect(row.textContent).toContain('07:06')
    // 队列行时钟＝HH:MM；详情面板同一瞬间的完整展示以同一时钟收尾。
    const detailText = detail.getByTestId('seat-detail-queued-at').textContent ?? ''
    expect(detailText).toBe('2026/09/17 07:06')
    expect(detailText.endsWith('07:06')).toBe(true)

    // 同一 zone 下改用纽约查看者：两面板仍一致（瞬间不变、zone 来源唯一）。
    queue.unmount()
    detail.unmount()
    setDisplayZoneResolver(() => 'America/New_York')
    const queueNy = render(<SeatQueuePanel {...queueProps([sessionFixture()])} />)
    const detailNy = render(<SeatDetailPanel {...detailProps(QUEUED_AT_SECONDS)} />)
    expect(queueNy.getByTestId(`seat-session-item-${SESSION_ID}`).textContent).toContain('19:06')
    expect(detailNy.getByTestId('seat-detail-queued-at').textContent).toBe('2026/09/16 19:06')
  })

  it('R14-1 附：queuedAt 缺失时详情诚实占位，不伪造时间', () => {
    setDisplayZoneResolver(() => 'Asia/Shanghai')
    const detail = render(<SeatDetailPanel {...detailProps(null)} />)
    expect(detail.getByTestId('seat-detail-queued-at').textContent).toBe('未知')
  })

  it('R14-2: 两个浏览器 context 同时各自显示本地格式（显式 timeZone）', () => {
    const view = render(
      <div>
        <ZoneProbe iso={T1_ISO} zone="Asia/Shanghai" />
        <ZoneProbe iso={T1_ISO} zone="America/New_York" />
      </div>,
    )
    expect(view.getByTestId('zone-Asia-Shanghai').textContent).toBe('2026/09/17 07:06')
    expect(view.getByTestId('zone-America-New_York').textContent).toBe('2026/09/16 19:06')
  })

  it('R14-3: zone resolver 变化 + focus 生命周期后缓存失效且输出更新', () => {
    let viewerZone = 'America/New_York'
    setDisplayZoneResolver(() => viewerZone)

    const view = render(<LifecycleProbe iso={T1_ISO} />)
    expect(view.getByTestId('lifecycle-probe').textContent).toBe('2026/09/16 19:06')
    const epochBefore = view.getByTestId('lifecycle-probe').getAttribute('data-epoch')

    // 查看者运行中换区（自动化模拟真实 OS 切区）+ focus 核对 → 重渲染。
    viewerZone = 'Asia/Shanghai'
    fireEvent(window, new Event('focus'))

    expect(view.getByTestId('lifecycle-probe').textContent).toBe('2026/09/17 07:06')
    expect(view.getByTestId('lifecycle-probe').getAttribute('data-epoch')).not.toBe(epochBefore)
  })

  it('R14-3 附：zone 未变化的生命周期事件不触发无谓刷新', () => {
    setDisplayZoneResolver(() => 'Asia/Shanghai')
    const view = render(<LifecycleProbe iso={T1_ISO} />)
    const epochBefore = view.getByTestId('lifecycle-probe').getAttribute('data-epoch')

    fireEvent(window, new Event('focus'))

    expect(view.getByTestId('lifecycle-probe').textContent).toBe('2026/09/17 07:06')
    expect(view.getByTestId('lifecycle-probe').getAttribute('data-epoch')).toBe(epochBefore)
  })

  it('hook dispose：unmount 后生命周期监听不再驱动任何状态', () => {
    let resolverCalls = 0
    setDisplayZoneResolver(() => {
      resolverCalls += 1
      return 'Asia/Shanghai'
    })
    const view = render(<LifecycleProbe iso={T1_ISO} />)
    view.unmount()
    const before = resolverCalls
    fireEvent(window, new Event('focus'))
    fireEvent(document, new Event('visibilitychange'))
    expect(resolverCalls).toBe(before)
  })
})
