import { installAttachmentLocksShim } from '@/test/attachmentJournalFixture'
installAttachmentLocksShim()
/**
 * C02 失权后访问（AT08）——admin 坐席工作台组件级补测（session-revoked 三断言）。
 *
 * 缺口背景（STATE 卡 AT08/C02）：A04/DF-12 已覆盖「队列视图下 revoked → claim
 * 禁用 + live-region 播报」，但组件级仍缺三块失权 UI 行为：
 * 1. 接单会话打开时收到 seat.changed revoked → composer 写入口整体收回
 *    （输入不可用）+ `seat-write-closed` 只读降级注记可见且可解释；
 * 2. 踢出播报（live-region）在会话视图下可见且不随后续流量消失；
 * 3. 断线重连（自动重连 / offline 横幅手动 retry）只恢复链路，不恢复写入口
 *    ——未证明授权前 composer 不复活、claim 不解禁。
 *
 * 全部走 workbenchTestHarness 假后端/SSE（同 SEAT-02 口径，isolate 车道，
 * 不依赖浏览器/API/SQL）。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  FakeSseStream,
  SESSION,
  SESSION2,
  SeatFakeBackend,
  envelopeFrame,
  makeGateway,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
}

function renderWorkspace(backend: SeatFakeBackend, sse: FakeSseStream) {
  const gateway = makeGateway(backend, sse)
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <SeatWorkspacePage gateway={gateway} />
    </QueryClientProvider>,
  )
}

async function claimActiveSession(view: ReturnType<typeof renderWorkspace>): Promise<void> {
  fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`), { timeout: 3000 }))
  fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`), { timeout: 3000 }))
  await waitFor(() => expect(view.getByTestId('seat-composer')).toBeDefined(), { timeout: 3000 })
}

function pushRevoked(sse: FakeSseStream, eventId: string): void {
  sse.push(envelopeFrame(eventId, 'seat.changed', 'seat', null, 'revoked'))
}

describe('SeatWorkspacePage C02 失权后组件状态（session-revoked：输入禁用/踢出提示/只读降级）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    mock.restore()
  })

  it('失权断言①+②：接单会话打开时收到 seat.changed revoked → composer 写入口整体收回（输入不可用）+ seat-write-closed 只读降级注记可见且可解释 + live-region 踢出播报在场', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await claimActiveSession(view)
    // 失权前写入口可用：composer 可输入（对照事实）。
    fireEvent.change(view.getByTestId('seat-composer'), { target: { value: '撤权前草稿' } })
    expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe('撤权前草稿')

    pushRevoked(sse, '9900000000000000001')

    // 踢出提示可见（aria-live 播报，DF-12 同源文案）。
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗')
    // 输入禁用（fail-closed 强于 disabled：composer 与发送按钮整体收回，不存在可输入面）。
    expect(view.queryByTestId('seat-composer')).toBeNull()
    expect(view.queryByTestId('seat-send')).toBeNull()
    // 只读降级注记可见且可解释（seat-write-closed 此前全仓零测试引用）。
    const note = await waitFor(() => view.getByTestId('seat-write-closed'))
    expect(note.getAttribute('role')).toBe('note')
    expect(note.textContent).toContain('坐席已暂停或离岗')
    expect(note.textContent).toContain('回复与操作已收回')
  })

  it('失权断言③a：自动重连成功只恢复链路不恢复写入口——online + 仅 benign updated/appended 信封，composer 不复活、只读注记与踢出播报保持', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await claimActiveSession(view)
    pushRevoked(sse, '9900000000000000002')
    await waitFor(() => expect(view.queryByTestId('seat-composer')).toBeNull())

    // 服务端正常 fin → 客户端凭 Last-Event-ID 自动无损重连（网络层允许）。
    sse.close()
    await waitFor(() => expect(sse.connectCount).toBeGreaterThanOrEqual(2), { timeout: 5000 })
    // 重连后的流量全部 benign（非撤权、非证明授权）：updated + 普通消息追加。
    await waitFor(() => expect(view.queryByTestId('seat-composer')).toBeNull())
    sse.push(envelopeFrame('9900000000000000003', 'seat.changed', 'seat', null, 'updated'))
    sse.push(envelopeFrame('9900000000000000004', 'message.appended', 'message', SESSION))
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    // 写入口未复活：composer/发送钮仍收回，只读注记与原因保持。
    expect(view.queryByTestId('seat-composer')).toBeNull()
    expect(view.queryByTestId('seat-send')).toBeNull()
    expect(view.getByTestId('seat-write-closed').textContent).toContain('坐席已暂停或离岗，回复与操作已收回')
  })

  it('失权断言③b：offline 横幅手动重连被拒——retry 只重开事件流，写入口仍关闭且排队 claim 仍禁用（无 proving grant 不解禁）', async () => {
    // 队列视图（不开会话）：harness 的第二排队行只在主会话仍 queued 时在场
    // （pageText 以 sessionStatus 为视图事实源），故此用例不先接单。
    const backend = new SeatFakeBackend()
    backend.state.extraSessionInQueue = true
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await waitFor(() => view.getByTestId(`seat-claim-${SESSION2}`))
    // 失权前：排队会话可 claim（对照事实）。
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).toBeNull()

    pushRevoked(sse, '9900000000000000005')
    await waitFor(() => expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull())
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗，写入口已收回'))

    // 持续断网：自动重连连败 → offline 横幅；用户点 retry 手动重连。
    sse.close()
    sse.failNext = 99
    const banner = await waitFor(() => view.getByTestId('seat-offline-banner'), { timeout: 3000 })
    expect(banner).toBeDefined()
    const connectsBeforeRetry = sse.connectCount
    fireEvent.click(view.getByTestId('seat-offline-banner-retry'))
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBeforeRetry), { timeout: 3000 })

    // 重连尝试被拒（写入口语义）：链路可以重试，但写入口不复开、claim 不解禁。
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull()
    expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗，写入口已收回')

    // 网络恢复：允许下一次重连成功（新流），随后只推 benign 信封——
    // 无 proving grant 也不解禁（写入口恢复只认权威 contexts/capability 复核）。
    sse.failNext = 0
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBeforeRetry + 1), { timeout: 3000 })
    sse.push(envelopeFrame('9900000000000000006', 'seat.changed', 'seat', null, 'updated'))
    sse.push(envelopeFrame('9900000000000000007', 'message.appended', 'message', SESSION))
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull()
    expect(view.queryByTestId('seat-composer')).toBeNull()
  })
})
