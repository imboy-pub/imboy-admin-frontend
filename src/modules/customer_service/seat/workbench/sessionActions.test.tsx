import '../../../../test/setupDom'
import { StrictMode } from 'react'
import { afterEach, expect, it, mock } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatDetailPanel, type SeatDetailPanelProps } from './detailPanel'
import { SeatApiError } from '../errors'
import type { SeatSessionDetail } from './contract'

const detail: SeatSessionDetail = {
  id: '72057594037928001', organizationId: '11', workspaceId: '12', conversationId: '13',
  contactId: '14', businessIdentityId: '15', status: 'active', version: 8,
  queuedAt: null, claimedAt: null, closedAt: null, source: 'widget',
  contactMaskedName: '访客***', lastMessage: { id: null, senderType: null, preview: null, createdAt: null },
  waitingSeconds: null, unreadCount: null, needsReply: null, visitorMaskedName: '访客***', visitorSource: '网页',
}
function panel(extra: Partial<SeatDetailPanelProps> = {}) {
  const onTransfer = mock((_identity: string, _version: number) => {})
  const onClose = mock((_version: number) => {})
  const onRetryDetail = mock(() => {})
  const props: SeatDetailPanelProps = {
    detail, detailLoading: false, detailError: null, canWrite: true, writeClosedReason: null,
    onRetryDetail, actionScopeKey: 'auth1/org11/ws12/session1',
    transferTargets: { targets: [{ identityId: '16', displayName: '真实目标坐席乙', available: true }], nextAfterId: null },
    transferTargetsLoading: false, onTransfer, transferConflict: false, transferPending: false,
    onClose, closeConflict: false, closePending: false, ...extra,
  }
  return { ...render(<SeatDetailPanel {...props} />), props, onTransfer, onClose, onRetryDetail }
}
afterEach(() => { cleanup(); mock.restore() })

it('transfer confirms the actual target and read-only consequence; cancel is zero-write', async () => {
  const view = panel()
  fireEvent.change(view.getByTestId('seat-transfer-target-select'), { target: { value: '16' } })
  fireEvent.click(view.getByTestId('seat-transfer-submit'))
  expect(view.onTransfer).not.toHaveBeenCalled()
  expect(view.getByRole('alertdialog').textContent).toContain('真实目标坐席乙')
  expect(view.getByRole('alertdialog').textContent).toContain('只读')
  fireEvent.click(view.getByRole('button', { name: '取消' }))
  expect(view.onTransfer).not.toHaveBeenCalled()
  fireEvent.click(view.getByTestId('seat-transfer-submit'))
  fireEvent.click(view.getByRole('button', { name: '确认转接' }))
  await waitFor(() => expect(view.onTransfer).toHaveBeenCalledTimes(1))
  expect(view.onTransfer.mock.calls[0]).toEqual(['16', 8])
})

it('close shows draft, in-flight and unknown-outcome warnings and requires explicit confirmation', async () => {
  const view = panel({ draftHasContent: true, sending: true, sendOutcomeUnknown: true })
  fireEvent.click(view.getByTestId('seat-close-submit'))
  expect(view.onClose).not.toHaveBeenCalled()
  const dialog = view.getByRole('alertdialog')
  for (const text of ['未发送草稿', '发送中', '发送结果未确定']) expect(dialog.textContent).toContain(text)
  fireEvent.click(view.getByRole('button', { name: '取消' }))
  expect(view.onClose).not.toHaveBeenCalled()
  fireEvent.click(view.getByTestId('seat-close-submit'))
  fireEvent.click(view.getByRole('button', { name: '确认结束' }))
  await waitFor(() => expect(view.onClose).toHaveBeenCalledTimes(1))
  expect(view.onClose.mock.calls[0]).toEqual([8])
})

const changes: { label: string; update: Partial<SeatDetailPanelProps> }[] = [
  { label: 'session', update: { detail: { ...detail, id: '72057594037928002' } } },
  { label: 'organization', update: { detail: { ...detail, organizationId: '21' } } },
  { label: 'workspace', update: { detail: { ...detail, workspaceId: '22' } } },
  { label: 'authentication', update: { actionScopeKey: 'auth2/org11/ws12/session1' } },
  { label: 'version', update: { detail: { ...detail, version: 9 } } },
  { label: 'status', update: { detail: { ...detail, status: 'queued' } } },
  { label: 'permission', update: { canWrite: false } },
  { label: 'target availability', update: { transferTargets: {
    targets: [{ identityId: '16', displayName: '真实目标坐席乙', available: false }], nextAfterId: null,
  } } },
]
for (const change of changes) {
  it('rejects old transfer confirmation after ' + change.label + ' changes and never resurrects it', () => {
    const view = panel()
    fireEvent.change(view.getByTestId('seat-transfer-target-select'), { target: { value: '16' } })
    fireEvent.click(view.getByTestId('seat-transfer-submit'))
    const oldConfirm = view.getByRole('button', { name: '确认转接' })
    view.rerender(<SeatDetailPanel {...view.props} {...change.update} />)
    fireEvent.click(oldConfirm)
    expect(view.onTransfer).not.toHaveBeenCalled()
    expect(view.queryByRole('alertdialog')).toBeNull()
    view.rerender(<SeatDetailPanel {...view.props} />)
    expect(view.queryByRole('alertdialog')).toBeNull()
    expect(view.onTransfer).not.toHaveBeenCalled()
  })
}

it('either action pending disables both actions and duplicate confirmation', async () => {
  let resolve!: () => void
  const pending = new Promise<void>((yes) => { resolve = yes })
  const view = panel({ onClose: () => pending })
  fireEvent.click(view.getByTestId('seat-close-submit'))
  fireEvent.click(view.getByRole('button', { name: '确认结束' }))
  await waitFor(() => expect((view.getByTestId('seat-close-submit') as HTMLButtonElement).disabled).toBe(true))
  expect((view.getByTestId('seat-transfer-submit') as HTMLButtonElement).disabled).toBe(true)
  resolve()
  await waitFor(() => expect((view.getByTestId('seat-close-submit') as HTMLButtonElement).disabled).toBe(false))
})

it('callback conflict is caught, explained and never automatically replayed', async () => {
  const failing = mock(async () => { throw new SeatApiError('conflict', 'version changed', { status: 409 }) })
  const view = panel({ onClose: failing })
  fireEvent.click(view.getByTestId('seat-close-submit'))
  fireEvent.click(view.getByRole('button', { name: '确认结束' }))
  await waitFor(() => expect(view.getByTestId('seat-action-result').textContent).toContain('刷新'))
  expect(view.getByTestId('seat-action-result').textContent).toContain('重新确认')
  expect(failing).toHaveBeenCalledTimes(1)
})

it('queued close remains legal while queued transfer is unavailable; missing real target name is never confirmable', () => {
  const view = panel({ detail: { ...detail, status: 'queued' } })
  expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
  expect(view.getByTestId('seat-close-submit')).toBeDefined()
  view.rerender(<SeatDetailPanel {...view.props} detail={detail} transferTargets={{ targets: [
    { identityId: '16', displayName: '', available: true },
  ], nextAfterId: null }} />)
  fireEvent.change(view.getByTestId('seat-transfer-target-select'), { target: { value: '16' } })
  expect((view.getByTestId('seat-transfer-submit') as HTMLButtonElement).disabled).toBe(true)
})

for (const outcome of ['success', 'failure']) {
  it('late A ' + outcome + ' cannot close or contaminate B confirmation', async () => {
    let finish!: () => void
    let fail!: (_error: Error) => void
    const pending = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject })
    const view = panel({ onClose: () => pending })
    fireEvent.click(view.getByTestId('seat-close-submit'))
    fireEvent.click(view.getByRole('button', { name: '确认结束' }))
    const onCloseB = mock(async (_version: number) => {})
    view.rerender(<SeatDetailPanel {...view.props} actionScopeKey="auth1/org11/ws12/sessionB"
      detail={{ ...detail, id: '72057594037928002', version: 9 }} onClose={onCloseB} />)
    fireEvent.click(view.getByTestId('seat-close-submit'))
    await act(async () => { if (outcome === 'success') finish(); else fail(new Error('old failure')); await pending.catch(() => {}) })
    expect(view.getByRole('alertdialog')).toBeDefined()
    expect(view.queryByTestId('seat-action-result')).toBeNull()
    expect(onCloseB).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '确认结束' }))
    await waitFor(() => expect(onCloseB).toHaveBeenCalledTimes(1))
    expect(onCloseB.mock.calls[0]).toEqual([9])
  })
}


it('StrictMode effect replay still dispatches exactly one confirmed action', async () => {
  const initial = panel()
  initial.unmount()
  const onClose = mock(async (_version: number) => {})
  const view = render(<StrictMode><SeatDetailPanel {...initial.props} onClose={onClose} /></StrictMode>)
  fireEvent.click(view.getByTestId('seat-close-submit'))
  fireEvent.click(view.getByRole('button', { name: '确认结束' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(onClose.mock.calls[0]).toEqual([8])
})
