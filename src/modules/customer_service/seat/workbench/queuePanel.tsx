/**
 * SEAT-02 / CS-WEB-03：队列/会话列表面板（queued/active/closed 三视图 triage）。
 *
 * - Tab 计数全部来自服务端 total_by_status（禁本地推断）；
 * - CS-WEB-03：排队行渲染服务端 preview 摘要 + waiting_seconds 等待时长
 *   （服务端权威值直渲染，不做客户端时钟计算——负值防御在渲染层 max(0)）；
 *   preview 为 null（附件-only/空正文/撤回/keyring 未装配）时诚实占位
 *   「暂无摘要」，不编造文案；未读是占位 slot（真未读数 M2 CS-WEB-05 提供，
 *   此前不伪造数字）；
 * - CS-WEB-03：搜索（掩码名/摘要）是已加载行的显示层过滤——Tab 计数与
 *   分页游标仍是服务端事实；无匹配给筛选空态（区别于服务端空态）；
 * - 键集分页「加载更多」（nextAfterId 为空即无更多）；筛选/切换/加载更多
 *   都不丢 selection（selection 真源在页面 state）；
 * - queued 行内 claim（CAS）按钮；claim 冲突 → 冲突提示由页面 aria-live 呈现；
 * - a11y：tablist/tab 语义 + aria-selected；列表为 list/listitem；搜索框
 *   有关联 label；每行主按钮有可读名称（掩码名 + 状态）。
 */
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

/** preview null 的诚实占位（附件-only/空正文/撤回/keyring 未装配不可区分，统一占位）。 */
const PREVIEW_PLACEHOLDER = '暂无摘要'

/** epoch 秒 → HH:MM（24h，UTC——面板只作相对时点提示，不承诺本地时区）。 */
function formatClock(seconds: number): string {
  const date = new Date(seconds * 1000)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * 服务端 waiting_seconds → 展示文案。负值防御：max(0)（服务端合同本就
 * 钳 0；此处兜底防异常值），绝不显示负等待。
 */
function formatWaiting(seconds: number): string {
  const s = Math.max(0, seconds)
  if (s < 60) return `等待 ${s} 秒`
  if (s < 3600) return `等待 ${Math.floor(s / 60)} 分钟`
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  return minutes > 0 ? `等待 ${hours} 小时 ${minutes} 分` : `等待 ${hours} 小时`
}

/** 显示层搜索匹配（已加载行）：掩码名 / 摘要 / 来源；空查询不过滤。 */
function matchesQuery(session: SeatSessionSummary, query: string): boolean {
  if (query.length === 0) return true
  const haystack = [session.contactMaskedName ?? '', session.lastMessage.preview ?? '', session.source]
  return haystack.some((field) => field.toLowerCase().includes(query))
}

export function SeatQueuePanel(props: SeatQueuePanelProps) {
  const { viewStatus, onViewStatusChange, counts, views, selectedSessionId, onSelectSession, onClaim, claimPendingSessionId, claimDisabled, claimDisabledReason } = props
  const view = views[viewStatus]
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleSessions = query.length === 0 ? view.sessions : view.sessions.filter((s) => matchesQuery(s, query))

  return (
    <section aria-label="会话列表" className="flex min-h-0 flex-1 flex-col border-r border-border">
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
      {/* CS-WEB-03：搜索是已加载行的显示层过滤；Tab 计数仍是服务端事实。 */}
      <div className="border-b border-border px-3 py-2">
        <label className="sr-only" htmlFor="seat-queue-search">
          搜索已加载会话（掩码名 / 摘要）
        </label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="seat-queue-search"
            data-testid="seat-queue-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索已加载会话"
            className="h-8 pl-7 text-sm"
          />
        </div>
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
        ) : visibleSessions.length === 0 ? (
          <SeatEmptyState message="没有匹配的会话（搜索仅作用于已加载行）" testId="seat-queue-filter-empty" />
        ) : (
          <ul className="divide-y divide-border" aria-label={`${TABS.find((t) => t.status === viewStatus)?.label ?? ''}会话`}>
            {visibleSessions.map((session) => (
              <li key={session.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid={`seat-session-item-${session.id}`}
                    aria-current={selectedSessionId === session.id ? 'true' : undefined}
                    onClick={() => onSelectSession(session)}
                    className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-sm hover:bg-accent ${selectedSessionId === session.id ? 'bg-accent font-medium' : ''}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {session.contactMaskedName ?? '访客'}
                        <span className="ml-2 text-xs text-muted-foreground">{session.source}</span>
                      </span>
                      {/* 未读占位 slot（CS-WEB-05 前无真未读数——只留位，不伪造数字）。 */}
                      <span
                        data-testid={`seat-session-unread-${session.id}`}
                        aria-hidden="true"
                        className="shrink-0 rounded-full bg-transparent text-xs text-muted-foreground"
                      />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {session.lastMessage.preview !== null ? session.lastMessage.preview : PREVIEW_PLACEHOLDER}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {session.queuedAt !== null && <span className="tabular-nums">{formatClock(session.queuedAt)}</span>}
                      {session.status === 'queued' && session.waitingSeconds !== null && (
                        <span
                          data-testid={`seat-session-waiting-${session.id}`}
                          title="等待时长由服务端计算（权威值）"
                          className="tabular-nums text-amber-700 dark:text-amber-500"
                        >
                          {formatWaiting(session.waitingSeconds)}
                        </span>
                      )}
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
