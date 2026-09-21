/**
 * SEAT-02：队列/会话列表面板（queued/active/closed 三视图）。
 *
 * - Tab 计数全部来自服务端 total_by_status（禁本地推断）；
 * - 键集分页「加载更多」（nextAfterId 为空即无更多）；
 * - queued 行内 claim（CAS）按钮；claim 冲突 → 冲突提示由页面 aria-live 呈现；
 * - a11y：tablist/tab 语义 + aria-selected；列表为 list/listitem；
 *   每行主按钮有可读名称（掩码名 + 状态）。
 */
import { Button } from '@/components/ui/button'
import type { SeatSessionSummary } from './contract'
import type { SeatSessionsView, SeatViewStatus } from './workbenchHooks'
import { SeatEmptyState, SeatErrorState, SeatLoadingState, seatFailureMessage } from './states'
import { seatFailureKind } from './workbenchHooks'

export type SeatQueuePanelProps = {
  viewStatus: SeatViewStatus
  onViewStatusChange: (_status: SeatViewStatus) => void
  counts: { queued: number; active: number; closed: number } | null
  views: Record<SeatViewStatus, SeatSessionsView>
  selectedSessionId: string | null
  onSelectSession: (_session: SeatSessionSummary) => void
  onClaim: (_session: SeatSessionSummary) => void
  claimPendingSessionId: string | null
  claimDisabled: boolean
  claimDisabledReason: string
}

const TABS: Array<{ status: SeatViewStatus; label: string }> = [
  { status: 'queued', label: '排队' },
  { status: 'active', label: '进行中' },
  { status: 'closed', label: '已结束' },
]

function formatTime(value: string | null): string {
  if (value === null) return ''
  const match = /(\d{2}:\d{2})/.exec(value)
  return match !== null ? (match[1] ?? '') : value
}

export function SeatQueuePanel(props: SeatQueuePanelProps) {
  const { viewStatus, onViewStatusChange, counts, views, selectedSessionId, onSelectSession, onClaim, claimPendingSessionId, claimDisabled, claimDisabledReason } = props
  const view = views[viewStatus]
  return (
    <section aria-label="会话列表" className="flex min-h-0 flex-col border-r border-border">
      <div role="tablist" aria-label="会话视图" className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            role="tab"
            id={`seat-tab-${tab.status}`}
            aria-selected={viewStatus === tab.status}
            aria-controls="seat-session-list"
            data-testid={`seat-tab-${tab.status}`}
            onClick={() => onViewStatusChange(tab.status)}
            className={`flex-1 px-2 py-2 text-sm ${viewStatus === tab.status ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
            <span className="ml-1 tabular-nums text-xs text-muted-foreground">
              {counts === null ? '–' : counts[tab.status]}
            </span>
          </button>
        ))}
      </div>
      <div id="seat-session-list" role="tabpanel" aria-labelledby={`seat-tab-${viewStatus}`} className="min-h-0 flex-1 overflow-y-auto" data-testid="seat-session-list">
        {view.isLoading && view.sessions.length === 0 ? (
          <SeatLoadingState message="加载会话…" testId="seat-queue-loading" />
        ) : seatFailureKind(view.error) !== null ? (
          <SeatErrorState
            message={seatFailureMessage(seatFailureKind(view.error)) ?? '加载失败'}
            onRetry={view.refetch}
            testId="seat-queue-error"
          />
        ) : view.sessions.length === 0 ? (
          <SeatEmptyState
            message={viewStatus === 'queued' ? '暂无排队会话' : viewStatus === 'active' ? '暂无进行中会话' : '暂无已结束会话'}
            testId="seat-queue-empty"
          />
        ) : (
          <ul className="divide-y divide-border" aria-label={`${TABS.find((t) => t.status === viewStatus)?.label ?? ''}会话`}>
            {view.sessions.map((session) => (
              <li key={session.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid={`seat-session-item-${session.id}`}
                    aria-current={selectedSessionId === session.id ? 'true' : undefined}
                    onClick={() => onSelectSession(session)}
                    className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-sm hover:bg-accent ${selectedSessionId === session.id ? 'bg-accent font-medium' : ''}`}
                  >
                    <span className="block truncate">
                      {session.contactMaskedName ?? '访客'}
                      <span className="ml-2 text-xs text-muted-foreground">{session.source}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatTime(session.queuedAt ?? session.claimedAt ?? session.closedAt)}
                      {session.lastMessage.preview !== null ? ` · ${session.lastMessage.preview}` : ''}
                    </span>
                  </button>
                  {viewStatus === 'queued' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`seat-claim-${session.id}`}
                      disabled={claimDisabled || claimPendingSessionId === session.id}
                      title={claimDisabled ? claimDisabledReason : undefined}
                      onClick={() => onClaim(session)}
                    >
                      {claimPendingSessionId === session.id ? '接单中…' : '接单'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {view.hasNextPage && view.sessions.length > 0 && (
          <div className="p-3">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={view.fetchNextPage} data-testid="seat-queue-load-more">
              加载更多
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
