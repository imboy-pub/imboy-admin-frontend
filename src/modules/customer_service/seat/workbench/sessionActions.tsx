import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import type { EntityId } from '../types'
import { isSeatApiError } from '../errors'
import type { SeatSessionDetail, SeatTransferTargetPage } from './contract'
import { SeatLoadingState } from './states'

export type SessionActionProps = {
  detail: SeatSessionDetail
  detailLoading: boolean
  detailError: unknown
  onRetryDetail: () => void
  canWrite: boolean
  actionScopeKey?: string
  draftHasContent?: boolean
  sending?: boolean
  sendOutcomeUnknown?: boolean
  transferTargets: SeatTransferTargetPage | null
  transferTargetsLoading: boolean
  transferTargetsError?: unknown
  onRetryTransferTargets?: () => void
  onTransfer: (_toIdentityId: EntityId, _expectedVersion: number) => void | Promise<void>
  transferConflict: boolean
  transferPending: boolean
  transferError?: unknown
  onClose: (_expectedVersion: number, _reason?: string) => void | Promise<void>
  closeConflict: boolean
  closePending: boolean
  closeError?: unknown
}
type Target = SeatTransferTargetPage['targets'][number]
type Intent = { kind: 'close'; authority: string; version: number } |
  { kind: 'transfer'; authority: string; version: number; target: Target }

export function sessionActionAuthority(props: SessionActionProps): string {
  const d = props.detail
  return JSON.stringify([props.actionScopeKey ?? null, d.organizationId, d.workspaceId, d.id,
    d.conversationId, d.businessIdentityId, d.version, d.status, props.canWrite,
    props.detailLoading, Boolean(props.detailError), props.transferTargetsLoading,
    Boolean(props.transferTargetsError), props.transferTargets?.targets.map(
      (t) => [t.identityId, t.displayName, t.available])])
}

export function SeatSessionActions(props: SessionActionProps) {
  const action = useActionConfirmation(props)
  return <>
    {props.detail.status === 'active' && <TransferControls props={props} action={action} />}
    <CloseControls props={props} action={action} />
    {action.notice && <p role="alert" data-testid="seat-action-result" className="text-xs text-destructive">
      {action.notice}<button type="button" className="ml-1 underline" onClick={props.onRetryDetail}>刷新会话</button>
    </p>}
    <ConfirmDialog open={action.intent !== null} onOpenChange={(open) => { if (!open) action.cancel() }}
      title={action.intent?.kind === 'transfer' ? '确认转接会话' : '确认结束会话'}
      description={confirmationDescription(action.intent, props)}
      confirmText={action.intent?.kind === 'transfer' ? '确认转接' : '确认结束'}
      variant={action.intent?.kind === 'close' ? 'destructive' : 'default'}
      loading={action.busy} onConfirm={action.confirm} />
  </>
}

function useActionConfirmation(props: SessionActionProps) {
  const [intent, setIntent] = useState<Intent | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<EntityId>('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const live = useRef(true), submitted = useRef(false), currentIntent = useRef<Intent | null>(null)
  useEffect(() => {
    live.current = true
    return () => { live.current = false; currentIntent.current = null }
  }, [])
  const busy = pending || props.transferPending || props.closePending
  const cancel = () => { currentIntent.current = null; setIntent(null) }
  const begin = (kind: Intent['kind']) => {
    if (busy || submitted.current || !actionAllowed(props, kind)) return
    const target = kind === 'transfer' ? validTarget(props, selectedTarget) : null
    if (kind === 'transfer' && target === null) return
    const base = { authority: sessionActionAuthority(props), version: props.detail.version }
    const next: Intent = target === null ? { ...base, kind: 'close' } : { ...base, kind: 'transfer', target }
    currentIntent.current = next; setIntent(next); setNotice(null)
  }
  const confirm = async () => {
    if (!live.current || busy || submitted.current || intent === null || currentIntent.current !== intent) return
    if (!intentValid(intent, props)) { cancel(); setNotice('会话状态、权限或目标已变化，请刷新后重新确认。'); return }
    submitted.current = true; setPending(true); cancel()
    try { await performAction(intent, props) }
    catch (error) { if (live.current) setNotice(actionFailure(error)) }
    finally { if (live.current) { submitted.current = false; setPending(false) } }
  }
  return { intent, selectedTarget, setSelectedTarget, begin, cancel, confirm, busy, notice }
}
type ActionState = ReturnType<typeof useActionConfirmation>

function actionAllowed(props: SessionActionProps, kind: Intent['kind']) {
  return props.canWrite && !props.detailLoading && !props.detailError &&
    (kind === 'transfer' ? props.detail.status === 'active' && !props.transferTargetsLoading &&
      !props.transferTargetsError : props.detail.status === 'active' || props.detail.status === 'queued')
}
function validTarget(props: SessionActionProps, identityId: EntityId): Target | null {
  return props.transferTargets?.targets.find((t) => t.identityId === identityId &&
    t.available && t.displayName.trim().length > 0) ?? null
}
function intentValid(intent: Intent, props: SessionActionProps) {
  if (intent.authority !== sessionActionAuthority(props) || !actionAllowed(props, intent.kind)) return false
  if (intent.kind === 'close') return true
  const target = validTarget(props, intent.target.identityId)
  return target !== null && target.displayName === intent.target.displayName
}
async function performAction(intent: Intent, props: SessionActionProps) {
  if (intent.kind === 'transfer') await props.onTransfer(intent.target.identityId, intent.version)
  else await props.onClose(intent.version)
}
function actionFailure(error: unknown): string {
  if (isSeatApiError(error) && error.kind === 'conflict') return '会话状态已变化，请刷新后重新确认；不会自动重试。'
  if (isSeatApiError(error) && (error.kind === 'forbidden' || error.kind === 'unauthorized')) {
    return '操作权限已变化，请刷新会话事实后重新确认。'
  }
  return '操作结果未确认，请刷新会话事实后重新确认；不会自动重试。'
}
function confirmationDescription(intent: Intent | null, props: SessionActionProps) {
  if (intent?.kind === 'transfer') return `转接给“${intent.target.displayName}”。转接后，你对该会话将变为只读。`
  const warnings = ['结束后，该会话不能继续发送消息。']
  if (props.draftHasContent) warnings.push('有未发送草稿，结束后不会自动发送。')
  if (props.sending) warnings.push('有消息发送中，请核实发送结果。')
  if (props.sendOutcomeUnknown) warnings.push('发送结果未确定，请先核实是否已送达。')
  return warnings.join(' ')
}

function TransferControls({ props, action }: { props: SessionActionProps; action: ActionState }) {
  return <section aria-label="转接" className="text-sm">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">转接</h3>
    {props.transferTargetsLoading ? <SeatLoadingState message="加载可转接坐席…" testId="seat-transfer-targets-loading" /> :
      props.transferTargetsError ? <p role="alert" className="text-xs text-destructive">
        可转接坐席加载失败。
        {props.onRetryTransferTargets && <button type="button" onClick={props.onRetryTransferTargets}>刷新坐席</button>}
      </p> : props.transferTargets && props.transferTargets.targets.length > 0 ?
        <TransferChoice props={props} action={action} /> :
        <p className="text-xs text-muted-foreground">暂无可转接坐席</p>}
    <ActionError kind="transfer" conflict={props.transferConflict} error={props.transferError} />
  </section>
}

function TransferChoice({ props, action }: { props: SessionActionProps; action: ActionState }) {
  return <>
    <label className="sr-only" htmlFor="seat-transfer-target-select">选择转接目标</label>
    <select id="seat-transfer-target-select" data-testid="seat-transfer-target-select"
      value={action.selectedTarget} disabled={action.busy}
      onChange={(event) => action.setSelectedTarget(event.target.value)}
      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
      <option value="">选择坐席…</option>
      {props.transferTargets?.targets.map((target) =>
        <option key={target.identityId} value={target.identityId}
          disabled={!target.available || target.displayName.trim().length === 0}>
          {target.displayName || '（名称未提供）'}{target.available ? '' : '（忙碌）'}
        </option>)}
    </select>
    <Button type="button" variant="outline" size="sm" className="mt-2 w-full"
      disabled={action.busy || !actionAllowed(props, 'transfer') || validTarget(props, action.selectedTarget) === null}
      data-testid="seat-transfer-submit" onClick={() => action.begin('transfer')}>
      {props.transferPending ? '转接中…' : '转接会话'}
    </Button>
  </>
}

function CloseControls({ props, action }: { props: SessionActionProps; action: ActionState }) {
  return <section aria-label="关闭会话" className="text-sm">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">关闭</h3>
    <Button type="button" variant="outline" size="sm" className="w-full"
      disabled={action.busy || !actionAllowed(props, 'close')} data-testid="seat-close-submit"
      onClick={() => action.begin('close')}>
      {props.closePending ? '关闭中…' : '关闭会话'}
    </Button>
    <ActionError kind="close" conflict={props.closeConflict} error={props.closeError} />
  </section>
}

function ActionError({ kind, conflict, error }: { kind: 'transfer' | 'close'; conflict: boolean; error: unknown }) {
  if (!conflict && (error === null || error === undefined)) return null
  return <p className="mt-1 text-xs text-destructive" role="alert" data-testid={`seat-${kind}-conflict`}>
    {conflict ? '会话状态已变化，请刷新并核对后重新确认；不会自动重试。' : actionFailure(error)}
  </p>
}
