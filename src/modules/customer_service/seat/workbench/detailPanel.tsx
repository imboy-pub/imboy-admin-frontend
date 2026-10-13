/** 会话详情以权威 detail 为准；会话动作先确认，再以该事实版本执行 CAS。 */
import type { SeatSessionDetail } from './contract'
import { SeatLoadingState, seatFailureMessage } from './states'
import { seatFailureKind } from './workbenchHooks'
import { SeatSessionActions, sessionActionAuthority, type SessionActionProps } from './sessionActions'

export type SeatDetailPanelProps = Omit<SessionActionProps, 'detail'> & {
  detail: SeatSessionDetail | null
  writeClosedReason: string | null
}

export function SeatDetailPanel(props: SeatDetailPanelProps) {
  if (props.detail === null) return <EmptyDetail {...props} />
  const actions = { ...props, detail: props.detail }
  return <aside aria-label="会话详情"
    className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-border p-4" data-testid="seat-detail-panel">
    <BasicDetails {...props} detail={props.detail} />
    {props.detail.status === 'closed' && <ClosedRating detail={props.detail} />}
    {!props.canWrite && props.writeClosedReason !== null && <p
      className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
      role="note" data-testid="seat-write-revoked">{props.writeClosedReason}</p>}
    {props.canWrite && props.detail.status !== 'closed' &&
      <SeatSessionActions key={sessionActionAuthority(actions)} {...actions} />}
  </aside>
}

function EmptyDetail(props: SeatDetailPanelProps) {
  if (props.detailLoading) return <SeatLoadingState message="加载详情…" testId="seat-detail-loading" />
  if (seatFailureKind(props.detailError) === 'forbidden') {
    return <p className="px-4 py-6 text-sm text-muted-foreground" data-testid="seat-detail-forbidden" role="alert">
      没有查看该会话的权限（可能已被转接或撤权）
    </p>
  }
  return <p className="px-4 py-6 text-sm text-muted-foreground" data-testid="seat-detail-placeholder">
    选择会话后查看详情
  </p>
}

function BasicDetails(props: SeatDetailPanelProps & { detail: SeatSessionDetail }) {
  const statusText = props.detail.status === 'queued' ? '排队中' : props.detail.status === 'active' ? '进行中' : '已结束'
  return <section aria-label="基本信息" className="text-sm">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">详情</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">状态</dt><dd data-testid="seat-detail-status">{statusText}</dd>
      <dt className="text-muted-foreground">访客</dt><dd data-testid="seat-detail-visitor">{props.detail.visitorMaskedName ?? '访客'}</dd>
      <dt className="text-muted-foreground">来源</dt><dd>{props.detail.visitorSource}</dd>
      <dt className="text-muted-foreground">版本</dt><dd className="tabular-nums" data-testid="seat-detail-version">{props.detail.version}</dd>
    </dl>
    <DetailError error={props.detailError} onRetry={props.onRetryDetail} />
  </section>
}

function DetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error === null || error === undefined || seatFailureKind(error) === null) return null
  return <p className="mt-2 text-xs text-destructive" role="alert">
    {seatFailureMessage(seatFailureKind(error)) ?? '详情刷新失败'}
    <button type="button" className="ml-1 underline" onClick={onRetry} data-testid="seat-detail-retry">重试</button>
  </p>
}

function ClosedRating({ detail }: { detail: SeatSessionDetail }) {
  const evaluation = detail.evaluation
  const text = evaluation?.state === 'rated'
    ? `访客评价：${evaluation.score} 星；评分时间：${new Date(evaluation.at * 1000).toISOString()}（UTC）`
    : evaluation?.state === 'unrated' ? '会话已结束，访客尚未评价。' : '会话已结束，评价状态未知，请刷新详情核对。'
  return <section aria-label="评分状态" className="text-sm" data-testid="seat-rating-state">
    <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">评分状态</h3>
    <p className="text-muted-foreground">{text}</p>
  </section>
}
