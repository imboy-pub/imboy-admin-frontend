/**
 * SEAT-02：会话详情面板（权威事实源 + 转接/关闭操作 + 访客最小资料）。
 *
 * - detail 是权威事实源：状态/版本/归属全部来自这里（不消费 SSE payload）；
 * - 访客资料最小化：掩码名 + 来源，无 PII；
 * - 转接：transfer-targets 选择 + expected_version CAS；
 * - 关闭：expected_version CAS（+ 可选原因）；
 * - 写入口收回（canWrite=false / suspended / offboarding）→ 操作按钮隐藏并
 *   给可解释文案（A04：立即收回且状态可解释）；
 * - 评分状态：closed 会话显示「等待访客评分」（评分是访客面动作，坐席只读）。
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SeatSessionDetail, SeatTransferTargetPage } from './contract'
import { SeatLoadingState, seatFailureMessage } from './states'
import { seatFailureKind } from './workbenchHooks'

export type SeatDetailPanelProps = {
  detail: SeatSessionDetail | null
  detailLoading: boolean
  detailError: unknown
  onRetryDetail: () => void
  canWrite: boolean
  writeClosedReason: string | null
  transferTargets: SeatTransferTargetPage | null
  transferTargetsLoading: boolean
  onTransfer: (_toIdentityId: string, _expectedVersion: number) => void
  transferConflict: boolean
  transferPending: boolean
  onClose: (_expectedVersion: number, _reason?: string) => void
  closeConflict: boolean
  closePending: boolean
}

export function SeatDetailPanel(props: SeatDetailPanelProps) {
  const {
    detail,
    detailLoading,
    detailError,
    onRetryDetail,
    canWrite,
    writeClosedReason,
    transferTargets,
    transferTargetsLoading,
    onTransfer,
    transferConflict,
    transferPending,
    onClose,
    closeConflict,
    closePending,
  } = props

  const [selectedTarget, setSelectedTarget] = useState<string>('')

  if (detail === null) {
    if (detailLoading) return <SeatLoadingState message="加载详情…" testId="seat-detail-loading" />
    if (seatFailureKind(detailError) === 'forbidden') {
      return (
        <p className="px-4 py-6 text-sm text-muted-foreground" data-testid="seat-detail-forbidden" role="alert">
          没有查看该会话的权限（可能已被转接或撤权）
        </p>
      )
    }
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground" data-testid="seat-detail-placeholder">
        选择会话后查看详情
      </p>
    )
  }

  const actionsVisible = canWrite && detail.status !== 'closed'
  const statusText =
    detail.status === 'queued' ? '排队中' : detail.status === 'active' ? '进行中' : '已结束'

  return (
    <aside aria-label="会话详情" className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-border p-4" data-testid="seat-detail-panel">
      <section aria-label="基本信息" className="text-sm">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">详情</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">状态</dt>
          <dd data-testid="seat-detail-status">{statusText}</dd>
          <dt className="text-muted-foreground">访客</dt>
          <dd data-testid="seat-detail-visitor">{detail.visitorMaskedName ?? '访客'}</dd>
          <dt className="text-muted-foreground">来源</dt>
          <dd>{detail.visitorSource}</dd>
          <dt className="text-muted-foreground">版本</dt>
          <dd className="tabular-nums" data-testid="seat-detail-version">{detail.version}</dd>
        </dl>
        {detailError !== null && detailError !== undefined && seatFailureKind(detailError) !== null && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {seatFailureMessage(seatFailureKind(detailError)) ?? '详情刷新失败'}
            <button type="button" className="ml-1 underline" onClick={onRetryDetail} data-testid="seat-detail-retry">
              重试
            </button>
          </p>
        )}
      </section>

      {detail.status === 'closed' && (
        <section aria-label="评分状态" className="text-sm" data-testid="seat-rating-state">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">评分状态</h3>
          <p className="text-muted-foreground">会话已结束，等待访客评价或已关闭</p>
        </section>
      )}

      {!canWrite && writeClosedReason !== null && (
        <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900" role="note" data-testid="seat-write-revoked">
          {writeClosedReason}
        </p>
      )}

      {actionsVisible && (
        <>
          <section aria-label="转接" className="text-sm">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">转接</h3>
            {transferTargetsLoading ? (
              <SeatLoadingState message="加载可转接坐席…" testId="seat-transfer-targets-loading" />
            ) : transferTargets !== null && transferTargets.targets.length > 0 ? (
              <>
                <label className="sr-only" htmlFor="seat-transfer-target-select">
                  选择转接目标
                </label>
                <select
                  id="seat-transfer-target-select"
                  data-testid="seat-transfer-target-select"
                  value={selectedTarget}
                  onChange={(event) => setSelectedTarget(event.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">选择坐席…</option>
                  {transferTargets.targets.map((target) => (
                    <option key={target.identityId} value={target.identityId} disabled={!target.available}>
                      {target.displayName}
                      {target.available ? '' : '（忙碌）'}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  disabled={selectedTarget === '' || transferPending}
                  data-testid="seat-transfer-submit"
                  onClick={() => onTransfer(selectedTarget, detail.version)}
                >
                  {transferPending ? '转接中…' : '转接会话'}
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">暂无可转接坐席</p>
            )}
            {transferConflict && (
              <p className="mt-1 text-xs text-destructive" role="alert" data-testid="seat-transfer-conflict">
                会话状态已变化，已刷新，请重试
              </p>
            )}
          </section>

          <section aria-label="关闭会话" className="text-sm">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">关闭</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={closePending}
              data-testid="seat-close-submit"
              onClick={() => onClose(detail.version)}
            >
              {closePending ? '关闭中…' : '关闭会话'}
            </Button>
            {closeConflict && (
              <p className="mt-1 text-xs text-destructive" role="alert" data-testid="seat-close-conflict">
                会话状态已变化，已刷新，请重试
              </p>
            )}
          </section>
        </>
      )}
    </aside>
  )
}
