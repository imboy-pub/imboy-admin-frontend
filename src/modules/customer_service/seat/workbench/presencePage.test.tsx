/**
 * CS-WEB-05（CS-RUNTIME-03）：Seat presence Web 端组件级测试。
 *
 * 覆盖：
 * - 状态条展示服务端派生状态（online/away/busy）——诚实原则：只显示服务端
 *   事实，本地不造状态；
 * - 心跳降级：端点 500 → 「状态不可用」（绝不用本地乐观状态顶替，断网/
 *   失败不得显示 online）；
 * - 手动 away / 恢复自动：PUT 往返 + 缓存回填（切换即时反映）；
 * - 未读 badge：read-state unread_count>0 渲染（可访问文本「未读 N 条」）；
 * - 心跳可见性门控：document.hidden 时不发心跳（诚实在线——不在场不报
 *   online）。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { cleanup, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  FakeSseStream,
  SeatFakeBackend,
  initialFakeState,
  makeGateway,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { resetSeatDeviceIdForTest } from './deviceIdentity'

/** jsdom 的 visibilityState 是 readonly——测试用 defineProperty 覆盖。 */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
}

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

function loginSeat(): void {
  expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
}

describe('CS-WEB-05 presence 状态条', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
    setVisibility('visible')
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('展示服务端派生状态（online）；降级 500 → 状态不可用（不显示 online）', async () => {
    loginSeat()
    const state = initialFakeState()
    const backend = new SeatFakeBackend(state)
    const view = renderWorkspace(backend, new FakeSseStream())

    await waitFor(() => {
      const el = view.container.querySelector('[data-testid="seat-presence-status-online"]')
      expect(el).not.toBeNull()
    })

    // 降级：端点 500 → 状态不可用（诚实降级，不显示任何运行态）。
    state.presenceStatus = null
    const failing = renderWorkspace(new SeatFakeBackend({ ...initialFakeState(), presenceStatus: null }), new FakeSseStream())
    await waitFor(() => {
      const unavailable = failing.container.querySelector('[data-testid="seat-presence-unavailable"]')
      expect(unavailable).not.toBeNull()
    })
    expect(
      failing.container.querySelector('[data-testid="seat-presence-status-online"]'),
    ).toBeNull()
  })

  it('手动 away → 恢复自动（PUT 往返 + 状态切换即时反映）', async () => {
    loginSeat()
    const user = userEvent.setup()
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="seat-presence-away"]')).not.toBeNull()
    })

    await user.click(view.container.querySelector('[data-testid="seat-presence-away"]') as HTMLElement)
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="seat-presence-status-away"]')).not.toBeNull()
    })
    expect(backend.state.presenceStatus).toBe('away')

    const resume = view.container.querySelector('[data-testid="seat-presence-resume"]')
    expect(resume).not.toBeNull()
    await user.click(resume as HTMLElement)
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="seat-presence-status-online"]')).not.toBeNull()
    })
  })

  it('心跳可见性门控：页面隐藏时不发心跳（诚实在线）', async () => {
    setVisibility('hidden')
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())

    // 等过一轮 react-query 初始 resolve 窗口：hidden 下 query disabled，
    // 心跳计数必须保持 0（不在场不得报 online）。
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(backend.heartbeatCalls).toBe(0)
    expect(view.container.querySelector('[data-testid="seat-presence-status-online"]')).toBeNull()

    setVisibility('visible')
  })

  it('busy 状态展示容量派生（服务端事实，本地不造）', async () => {
    loginSeat()
    const backend = new SeatFakeBackend({
      ...initialFakeState(),
      presenceStatus: 'busy',
    })
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => {
      expect(
        view.container.querySelector('[data-testid="seat-presence-status-busy"]'),
      ).not.toBeNull()
    })
    expect(view.container.textContent).toContain('忙碌')
  })
})

describe('CS-WEB-05 未读 badge（CS-BE-04 read-state）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
    setVisibility('visible')
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('选中会话后未读数 >0 渲染 badge（aria-label 未读 N 条）', async () => {
    loginSeat()
    const user = userEvent.setup()
    const backend = new SeatFakeBackend({ ...initialFakeState(), unreadCount: 3 })
    const view = renderWorkspace(backend, new FakeSseStream())

    // 进入会话（队列行点击；写权门在 queued 下为只读但会话视图可打开）。
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid^="seat-session-item-"]')).not.toBeNull()
    })
    await user.click(view.container.querySelector('[data-testid^="seat-session-item-"]') as HTMLElement)
    await waitFor(() => {
      const badge = view.container.querySelector('[data-testid="seat-unread-badge"]')
      expect(badge).not.toBeNull()
      expect(badge?.getAttribute('aria-label')).toBe('未读 3 条')
      expect(badge?.textContent).toBe('3')
    })
  })
})
