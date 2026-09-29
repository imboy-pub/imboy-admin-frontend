/**
 * REVIEW-4 F2：会话详情面板组件级测试（close/transfer 两个写入口的零测试锁定）。
 *
 * 覆盖（与 SeatWorkspacePage.test.tsx 同款约定：假后端按冻结 wire 形状回包，
 * mock 只打 api 边界——detailPanel 是纯展示组件，其 api 边界就是 onTransfer/
 * onClose 回调；全链 wire 形状另经 SeatWorkspacePage × 假后端锁定）：
 * - 关闭链：seat-close-submit 以权威 detail.version 作 CAS 基准上调 onClose；
 *   成功流转（closed）→ 已结束 + 评分只读区 + 写入口收回；
 * - 转接链：seat-transfer-submit 以选中目标 identityId + detail.version 上抛
 *   onTransfer；忙碌坐席禁选；无可转接坐席给可解释空态；
 * - pending 防重复提交（关闭中…/转接中… + 禁用）；409 冲突提示（role=alert）
 *   与复位（不残留谎报）；
 * - A04 写入口收回：canWrite=false → seat-write-revoked 可解释 + 按钮隐藏；
 * - 详情骨架四态：loading / placeholder / forbidden / 错误重试。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import { SeatDetailPanel, type SeatDetailPanelProps } from './detailPanel'
import type { SeatSessionDetail, SeatTransferTargetPage } from './contract'
import { SeatApiError } from '../errors'
import {
  CONV,
  CONTACT,
  FakeSseStream,
  IDENTITY,
  ORG,
  OTHER_IDENTITY,
  SeatFakeBackend,
  SESSION,
  WS,
  makeGateway,
  sleep,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { resetSeatDeviceIdForTest } from './deviceIdentity'

const BUSY_IDENTITY = '6000000000000000009'

/** 组件级 detail fixture（形状对齐 contract.SeatSessionDetail 投影）。 */
function detailFixture(overrides: Partial<SeatSessionDetail> = {}): SeatSessionDetail {
  return {
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
    visitorMaskedName: '王***',
    visitorSource: '网页组件',
    ...overrides,
  }
}

/** 转接目标 fixture：一枚可用 + 一枚忙碌（忙碌项必须禁选）。 */
function targetsFixture(): SeatTransferTargetPage {
  return {
    targets: [
      { identityId: OTHER_IDENTITY, displayName: '坐席乙', available: true },
      { identityId: BUSY_IDENTITY, displayName: '坐席丙', available: false },
    ],
    nextAfterId: null,
  }
}

type PanelMocks = {
  onTransfer: ReturnType<typeof mock>
  onClose: ReturnType<typeof mock>
  onRetryDetail: ReturnType<typeof mock>
}

/** 渲染真实 SeatDetailPanel；mock 回调即本组件的 api 边界。 */
function renderPanel(overrides: Partial<SeatDetailPanelProps> = {}) {
  const onTransfer = mock((_toIdentityId: string, _expectedVersion: number) => {})
  const onClose = mock((_expectedVersion: number, _reason?: string) => {})
  const onRetryDetail = mock(() => {})
  const props: SeatDetailPanelProps = {
    detail: detailFixture(),
    detailLoading: false,
    detailError: null,
    onRetryDetail: onRetryDetail as unknown as () => void,
    canWrite: true,
    writeClosedReason: null,
    transferTargets: targetsFixture(),
    transferTargetsLoading: false,
    onTransfer: onTransfer as unknown as SeatDetailPanelProps['onTransfer'],
    transferConflict: false,
    transferPending: false,
    onClose: onClose as unknown as SeatDetailPanelProps['onClose'],
    closeConflict: false,
    closePending: false,
    ...overrides,
  }
  const view = render(<SeatDetailPanel {...props} />)
  return { view, props, mocks: { onTransfer, onClose, onRetryDetail } as PanelMocks }
}

describe('SeatDetailPanel 关闭/转接写入口（组件级）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
  })

  it('关闭链：seat-close-submit 以权威 detail.version 上抛 onClose（真实页面不传 reason）；closed 后写入口收回 + 评分只读区', () => {
    const { view, props, mocks } = renderPanel()
    expect(view.getByTestId('seat-detail-status').textContent).toBe('进行中')
    expect(view.getByTestId('seat-detail-version').textContent).toContain('8')
    fireEvent.click(view.getByTestId('seat-close-submit'))
    // CAS 基准 = 权威事实 detail.version；且只上抛一个参数（reason 可选留空）。
    expect(mocks.onClose).toHaveBeenCalledTimes(1)
    expect(mocks.onClose.mock.calls[0]?.length).toBe(1)
    expect(mocks.onClose.mock.calls[0]?.[0]).toBe(8)
    // 成功流转（父层权威刷新后 detail 变 closed）：状态/评分区/写入口按真实投影断言。
    view.rerender(
      <SeatDetailPanel {...props} detail={detailFixture({ status: 'closed', version: 9, closedAt: 1759000100 })} />,
    )
    expect(view.getByTestId('seat-detail-status').textContent).toBe('已结束')
    expect(view.getByTestId('seat-detail-version').textContent).toContain('9')
    // 评分是访客动作：坐席只见只读说明区。
    expect(view.getByTestId('seat-rating-state').textContent).toContain('等待访客评价')
    expect(view.queryByTestId('seat-close-submit')).toBeNull()
    expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
  })

  it('关闭 pending：按钮禁用 + 文案「关闭中…」（防重复提交），不误显冲突', () => {
    const { view, mocks } = renderPanel({ closePending: true })
    const submit = view.getByTestId('seat-close-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('关闭中…')
    fireEvent.click(submit)
    expect(mocks.onClose).not.toHaveBeenCalled()
    expect(view.queryByTestId('seat-close-conflict')).toBeNull()
  })

  it('关闭 409 冲突：role=alert 提示「已刷新，请重试」；复位后提示消失（不残留）', () => {
    const { view, props } = renderPanel({ closeConflict: true })
    const conflict = view.getByTestId('seat-close-conflict')
    expect(conflict.getAttribute('role')).toBe('alert')
    expect(conflict.textContent).toContain('会话状态已变化')
    expect(conflict.textContent).toContain('重试')
    // 冲突已被父层权威刷新消化（conflict 复位）→ 提示收敛消失。
    view.rerender(<SeatDetailPanel {...props} closeConflict={false} />)
    expect(view.queryByTestId('seat-close-conflict')).toBeNull()
  })

  it('转接链：未选目标禁用；选可用坐席后以 (toIdentityId, version) 上抛 onTransfer；忙碌坐席禁选', async () => {
    const { view, mocks } = renderPanel()
    const submit = view.getByTestId('seat-transfer-submit') as HTMLButtonElement
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    const user = userEvent.setup()
    await user.selectOptions(view.getByTestId('seat-transfer-target-select'), OTHER_IDENTITY)
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    // api 调用形状：to = transfer-targets 的 identityId，CAS 基准 = detail.version。
    expect(mocks.onTransfer).toHaveBeenCalledTimes(1)
    expect(mocks.onTransfer.mock.calls[0]?.length).toBe(2)
    expect(mocks.onTransfer.mock.calls[0]?.[0]).toBe(OTHER_IDENTITY)
    expect(mocks.onTransfer.mock.calls[0]?.[1]).toBe(8)
    // 忙碌坐席：option 原生 disabled（不可被选中），展示「（忙碌）」可解释标注。
    const busyOption = view.getByTestId('seat-transfer-target-select').querySelector(
      `option[value="${BUSY_IDENTITY}"]`,
    ) as HTMLOptionElement
    expect(busyOption.disabled).toBe(true)
    expect(busyOption.textContent).toContain('忙碌')
  })

  it('转接 pending/conflict：转接中… 禁用不重复上抛；conflict role=alert 提示重试', async () => {
    const { view, mocks } = renderPanel({ transferPending: true })
    const submit = view.getByTestId('seat-transfer-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('转接中…')
    fireEvent.click(submit)
    expect(mocks.onTransfer).not.toHaveBeenCalled()
    // 先卸载再渲染冲突态（避免同屏两实例撞 getByTestId 重复）。
    view.unmount()
    const { view: conflictView } = renderPanel({ transferConflict: true })
    const conflict = conflictView.getByTestId('seat-transfer-conflict')
    expect(conflict.getAttribute('role')).toBe('alert')
    expect(conflict.textContent).toContain('会话状态已变化')
  })

  it('无可转接坐席：可解释空态「暂无可转接坐席」，不渲染 select/submit（不伪造入口）', () => {
    const { view } = renderPanel({ transferTargets: { targets: [], nextAfterId: null } })
    expect(view.getByText('暂无可转接坐席')).toBeDefined()
    expect(view.queryByTestId('seat-transfer-target-select')).toBeNull()
    expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
    // 关闭入口不受转接目标影响。
    expect(view.getByTestId('seat-close-submit')).toBeDefined()
  })

  it('A04 写入口收回：canWrite=false + writeClosedReason → seat-write-revoked 可解释 + 两个 submit 隐藏', () => {
    const { view } = renderPanel({
      canWrite: false,
      writeClosedReason: '该会话由其他坐席处理中',
    })
    const revoked = view.getByTestId('seat-write-revoked')
    expect(revoked.getAttribute('role')).toBe('note')
    expect(revoked.textContent).toContain('该会话由其他坐席处理中')
    expect(view.queryByTestId('seat-close-submit')).toBeNull()
    expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
    expect(view.queryByTestId('seat-transfer-target-select')).toBeNull()
  })

  it('详情骨架四态：loading / placeholder / forbidden / 详情错误重试（retry 上抛 onRetryDetail）', () => {
    // loading：detail 未到。
    const loading = renderPanel({ detail: null, detailLoading: true })
    expect(loading.view.getByTestId('seat-detail-loading')).toBeDefined()
    expect(loading.view.queryByTestId('seat-detail-panel')).toBeNull()
    loading.view.unmount()

    // placeholder：无会话无错误。
    const placeholder = renderPanel({ detail: null })
    expect(placeholder.view.getByTestId('seat-detail-placeholder').textContent).toContain('选择会话')
    placeholder.view.unmount()

    // forbidden（可能已被转接或撤权）：fail-closed 可解释拒权态。
    const forbidden = renderPanel({
      detail: null,
      detailError: new SeatApiError('forbidden', 'not session owner'),
    })
    const denied = forbidden.view.getByTestId('seat-detail-forbidden')
    expect(denied.getAttribute('role')).toBe('alert')
    expect(denied.textContent).toContain('没有查看该会话的权限')
    forbidden.view.unmount()

    // 详情刷新失败：错误文案 + 重试入口，点击恰好上抛一次。
    const errored = renderPanel({ detailError: new SeatApiError('server', 'internal') })
    const retry = errored.view.getByTestId('seat-detail-retry')
    expect(errored.view.getByRole('alert').textContent).toContain('服务暂时不可用')
    fireEvent.click(retry)
    expect(errored.mocks.onRetryDetail).toHaveBeenCalledTimes(1)
  })
})

describe('SeatDetailPanel 写动作全链（× 假后端：wire 形状 + 成功/失败收敛）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
    expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
  })

  /** 进入 active 会话并等详情权威刷新落地（xl 第三栏的 SeatDetailPanel）。 */
  async function openActiveDetail(view: ReturnType<typeof render>) {
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`)))
    // claim 成功 → 权威刷新：detail version 7 → 8（CAS 基准的唯一事实源）。
    await waitFor(() => expect(view.getByTestId('seat-detail-version').textContent).toContain('8'))
    await waitFor(() => expect(view.getByTestId('seat-transfer-target-select')).toBeDefined())
  }

  it('转接 wire：POST transfer {to_identity_id, expected_version, workspace_id} + Seat Bearer', async () => {
    const backend = new SeatFakeBackend()
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })}>
        <SeatWorkspacePage gateway={makeGateway(backend, new FakeSseStream())} />
      </QueryClientProvider>,
    )
    await openActiveDetail(view)
    const user = userEvent.setup()
    await user.selectOptions(view.getByTestId('seat-transfer-target-select'), OTHER_IDENTITY)
    fireEvent.click(view.getByTestId('seat-transfer-submit'))
    await waitFor(() => {
      const call = backend.calls.find(
        (item) => item.method === 'POST' && item.path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`,
      )
      expect(call).toBeDefined()
    })
    const call = backend.calls.find(
      (item) => item.method === 'POST' && item.path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`,
    )
    const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>
    expect(body.to_identity_id).toBe(OTHER_IDENTITY)
    expect(body.expected_version).toBe(8)
    expect(body.workspace_id).toBe(WS)
    expect(call?.auth).toBe('Bearer eyJh.eyJi.c2ln')
  })

  it('关闭 wire + 成功收敛：POST close {expected_version, workspace_id}（无 reason 键）→ 已结束 + 评分只读 + 写入口收回', async () => {
    const backend = new SeatFakeBackend()
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })}>
        <SeatWorkspacePage gateway={makeGateway(backend, new FakeSseStream())} />
      </QueryClientProvider>,
    )
    await openActiveDetail(view)
    fireEvent.click(view.getByTestId('seat-close-submit'))
    // 成功：假后端 close 置 closed + version+1 → 权威刷新收敛到已结束。
    await waitFor(() => expect(view.getByTestId('seat-detail-status').textContent).toBe('已结束'))
    const closeCalls = backend.calls.filter(
      (item) => item.method === 'POST' && item.path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/close`,
    )
    expect(closeCalls).toHaveLength(1)
    // wire 形状：expected_version = 详情权威版本（8）；workspace_id handler 级必填；
    // 真实页面不传 reason → wire 无 reason 键（后端可选键不伪造）。
    expect(JSON.parse(closeCalls[0]?.body ?? '{}')).toEqual({ expected_version: 8, workspace_id: WS })
    expect(closeCalls[0]?.auth).toBe('Bearer eyJh.eyJi.c2ln')
    expect(view.getByTestId('seat-detail-version').textContent).toContain('9')
    expect(view.getByTestId('seat-rating-state')).toBeDefined()
    expect(view.queryByTestId('seat-close-submit')).toBeNull()
    expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
  })

  it('关闭 500 失败：不谎报成功（状态停留进行中、无评分区、按钮恢复可重试），恰好一次 close POST', async () => {
    const backend = new SeatFakeBackend()
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })}>
        <SeatWorkspacePage gateway={makeGateway(backend, new FakeSseStream())} />
      </QueryClientProvider>,
    )
    await openActiveDetail(view)
    // 等 claim 触发的权威刷新全部落地，避免全局失败计数被并发读取吃掉。
    await sleep(100)
    backend.state.failingResponsesLeft = 1
    fireEvent.click(view.getByTestId('seat-close-submit'))
    await waitFor(() => {
      const closeCalls = backend.calls.filter(
        (item) => item.method === 'POST' && item.path.endsWith(`/sessions/${SESSION}/close`),
      )
      expect(closeCalls).toHaveLength(1)
    })
    // 真实行为注释：close.error 在产品码中仅用于 401 收敛，非冲突失败没有独立
    // 错误条——UI 的诚实语义是「权威刷新收敛 + 不伪成功」：会话仍进行中、
    // 无评分区、按钮回到可点（可重试），绝不出现已结束的成功假象。
    await waitFor(() => expect(view.getByTestId('seat-detail-status').textContent).toBe('进行中'))
    expect(view.queryByTestId('seat-rating-state')).toBeNull()
    const submit = view.getByTestId('seat-close-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    expect(submit.textContent).toContain('关闭会话')
  })
})
