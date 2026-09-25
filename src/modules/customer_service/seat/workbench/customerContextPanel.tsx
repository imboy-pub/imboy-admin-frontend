/**
 * CS-WEB-04：客户上下文面板（CS-BE-03 只读投影的唯一渲染面）。
 *
 * - 白名单纪律：只渲染 contract 层 SeatCustomerContext 已收敛的字段；
 *   电话/邮箱/原始外部身份/密文/凭证在投影里就不存在，本组件无从泄漏；
 * - 四态独立（CS-CONTEXT-02）：loading / error(可重试) / permission denied
 *   （转接后原 Seat 失去读权、撤权 seat_disabled）/ empty（无历史、无备注）；
 * - 时间统一 epoch 秒 → 本地文案；原始值同时落在 data-* 属性供测试断言；
 * - 面板是纯只读视图：无写动作、无本地推断事实（来源/时间全部服务端投影）。
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SeatCustomerContext } from './contract'
import {
  SeatErrorState,
  SeatLoadingState,
  SeatPermissionDeniedState,
  seatFailureMessage,
} from './states'
import { seatFailureKind } from './workbenchHooks'

const SOURCE_LABELS: Record<string, string> = {
  widget: '网页组件',
  seat: '坐席创建',
  shop_key: '门店接入',
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** epoch 秒 → 本地时间文案（原始值同步落 data-* 属性，测试断言不依赖时区）。 */
function epochText(seconds: number | null): string {
  if (seconds === null || !Number.isSafeInteger(seconds)) return '—'
  return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
}

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  active: '进行中',
  closed: '已结束',
}

function statusLabel(status: string | null): string {
  if (status === null) return '未知'
  return STATUS_LABELS[status] ?? status
}

function formatRating(rating: number | null): string | null {
  if (rating === null || !Number.isSafeInteger(rating) || rating <= 0) return null
  return `${rating} 星`
}

function SectionEmpty({ message, testId }: { message: string; testId: string }) {
  return (
    <p
      className="px-1 py-3 text-center text-xs text-muted-foreground"
      data-testid={testId}
      role="status"
    >
      {message}
    </p>
  )
}

export type SeatCustomerContextPanelProps = {
  context: SeatCustomerContext | null
  loading: boolean
  error: unknown
  onRetry: () => void
}

export function SeatCustomerContextPanel({
  context,
  loading,
  error,
  onRetry,
}: SeatCustomerContextPanelProps) {
  if (context === null && loading) {
    return <SeatLoadingState message="加载客户上下文…" testId="seat-customer-context-loading" />
  }
  if (context === null) {
    const kind = seatFailureKind(error)
    if (kind === 'forbidden') {
      return (
        <SeatPermissionDeniedState
          message="没有查看该客户上下文的权限（可能已被转接或坐席已停用）"
          testId="seat-customer-context-forbidden"
        />
      )
    }
    return (
      <SeatErrorState
        message={seatFailureMessage(kind) || '加载客户上下文失败'}
        onRetry={onRetry}
        testId="seat-customer-context-error"
      />
    )
  }

  const { contact, history, notes } = context
  const historyEmpty = history.sessions.length === 0
  const notesEmpty = notes.length === 0

  return (
    <div className="flex flex-col gap-3" data-testid="seat-customer-context">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">客户资料</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold" data-testid="seat-customer-context-masked-name">
              {contact.maskedName ?? '未知客户'}
            </span>
            <span className="text-xs text-muted-foreground" data-testid="seat-customer-context-source">
              来源：{sourceLabel(context.source)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span data-first-seen={contact.firstSeen ?? undefined} data-testid="seat-customer-context-first-seen">
              首次联系：{epochText(contact.firstSeen)}
            </span>
            <span data-last-seen={contact.lastSeen ?? undefined} data-testid="seat-customer-context-last-seen">
              最近联系：{epochText(contact.lastSeen)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">历史会话</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {historyEmpty ? (
            <SectionEmpty message="暂无历史会话" testId="seat-customer-context-history-empty" />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="seat-customer-context-history">
              {history.sessions.map((session) => {
                const rating = formatRating(session.rating)
                return (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-xs"
                    data-testid="seat-customer-context-history-row"
                    data-session-id={session.id}
                  >
                    <span className="font-medium">{statusLabel(session.status)}</span>
                    <span className="text-muted-foreground">
                      {session.queuedAt !== null ? `发起 ${epochText(session.queuedAt)}` : '发起时间未知'}
                    </span>
                    {rating !== null && (
                      <span className="text-muted-foreground" data-testid="seat-customer-context-history-rating">
                        {rating}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {history.nextAfterId !== null && (
            <p className="text-xs text-muted-foreground" data-testid="seat-customer-context-history-more">
              仅显示最近一页历史会话
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">备注</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {notesEmpty ? (
            <SectionEmpty message="暂无备注记录" testId="seat-customer-context-notes-empty" />
          ) : (
            <>
              <p className="text-xs text-muted-foreground" data-testid="seat-customer-context-notes-count">
                共 {notes.length} 条备注记录
              </p>
              <ul className="flex flex-col gap-2" data-testid="seat-customer-context-notes">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-xs"
                    data-testid="seat-customer-context-note-row"
                    data-note-id={note.id}
                  >
                    <span className="font-medium">坐席备注</span>
                    <span className="text-muted-foreground">{epochText(note.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">备注内容按授权策略不在坐席面展示</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
