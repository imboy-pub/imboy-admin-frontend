/**
 * REVIEW-4 F2/B-7：坐席工作台三 UI 入口页面级锁定——结束会话 / 转接 / 登出。
 *
 * 与既有覆盖的分工（同一事实不重复锁定）：
 * - detailPanel.test.tsx：面板组件级（pending/409 提示/忙碌禁选/写入口收回，
 *   mock 回调边界）+ 全链 wire 形状（claim 路径进入 active；close 500 失败）；
 * - SeatWorkspacePage.test.tsx：logout 基础两例（queued 态登出 + 写入口不可达）；
 * - 本文件（页面级 × 假后端，补齐 F2/B-7 剩余缺口）：
 *   1) 结束会话：active 直入路径的 POST close 合同逐键 + 成功后 UI 状态流转
 *      （active 列表消失 → closed 列表在场、已结束、评分只读区、写入口收回）；
 *   2) 结束会话 409：真实 wire 409 → SeatApiError(conflict) → hook 冲突标记 →
 *      seat-close-conflict 播报 + 失败方权威刷新 + 不伪成功（全链）；
 *   3) 转接：payload 逐键（to_identity_id=选中目标 / expected_version=权威版本 /
 *      workspace_id handler 级必填）+ 未选目标禁发 + 成功反馈（按钮复位、
 *      无冲突播报、成功方权威失效刷新）；
 *   4) 转接 409：seat-transfer-conflict 播报 + 权威刷新 + 会话归属未变；
 *   5) 登出：active 会话（关闭/转接/回复入口在场）登出 → vault 同步清空 +
 *      store 复位（endReason=logout）+ 工作台整体收回；登出是纯前端状态清理，
 *      不触发任何服务端写调用。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  FakeSseStream,
  ORG,
  OTHER_IDENTITY,
  SeatFakeBackend,
  SESSION,
  WS,
  makeGateway,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { resetSeatDeviceIdForTest } from './deviceIdentity'

const CLOSE_PATH = `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/close`
const TRANSFER_PATH = `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/transfer`
const DETAIL_PATH = `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}`
/** 服务端写动作端点（claim/transfer/close/messages）——登出不得触发任何一个。 */
const WRITE_ENDPOINT_PATTERN = /\/(claim|transfer|close|messages)$/

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
}

function renderWorkspace(backend: SeatFakeBackend) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <SeatWorkspacePage gateway={makeGateway(backend, new FakeSseStream())} />
    </QueryClientProvider>,
  )
}

function loginSeat(): void {
  expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
}

/**
 * active 直入：服务端事实已是本人 active 会话（version=8）→ 切「进行中」Tab
 * 选中会话，等详情权威落地与写入口出现（区别于 detailPanel.test 的 claim 路径）。
 */
async function openActiveSession(view: ReturnType<typeof renderWorkspace>) {
  fireEvent.click(await waitFor(() => view.getByTestId('seat-tab-active')))
  fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
  // 详情权威落地（version=8 是 CAS 基准的唯一事实源）。
  await waitFor(() => expect(view.getByTestId('seat-detail-version').textContent).toContain('8'))
  // 本人 active 会话 → 关闭/转接写入口在场。
  await waitFor(() => expect(view.getByTestId('seat-close-submit')).toBeDefined())
}

/**
 * 拦截指定写端点回真实 wire 形状的 409（须在 makeGateway 之前安装——
 * gateway 构造时捕获 backend.handle 引用）。被拦请求照常登记进 calls，
 * 供 payload 合同断言（409 的请求与成功请求 payload 逐键一致）。
 */
function interceptWith409(backend: SeatFakeBackend, path: string): void {
  const original = backend.handle
  backend.handle = async (url: string, init?: RequestInit): Promise<Response> => {
    const requestPath = url.split('?')[0] ?? url
    if (requestPath === path) {
      const headers = (init?.headers ?? undefined) as Record<string, string> | undefined
      backend.calls.push({
        method: init?.method ?? 'GET',
        path: requestPath,
        body: typeof init?.body === 'string' ? init.body : '',
        auth: headers?.Authorization ?? null,
      })
      return new Response('{"code":409,"msg":"session version conflict","payload":{}}', { status: 409 })
    }
    return original(url, init)
  }
}

describe('SeatWorkspacePage 三会话入口（REVIEW-4 F2/B-7：结束会话/转接/登出）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
    loginSeat()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
  })

  describe('结束会话（seat-close-submit）', () => {
    it('active 会话点关闭：POST close 合同逐键（expected_version=权威版本 + workspace_id，无 reason 键）→ 已结束 + active 列表消失 + closed 列表在场 + 写入口收回', async () => {
      const backend = new SeatFakeBackend()
      backend.state.sessionStatus = 'active'
      backend.state.version = 8
      const view = renderWorkspace(backend)
      await openActiveSession(view)
      fireEvent.click(view.getByTestId('seat-close-submit'))
      // 请求合同：恰一次 POST，wire 逐键（真实页面不传 reason → 无 reason 键）。
      await waitFor(() => {
        const closeCalls = backend.calls.filter((call) => call.method === 'POST' && call.path === CLOSE_PATH)
        expect(closeCalls).toHaveLength(1)
      })
      const closeCall = backend.calls.find((call) => call.method === 'POST' && call.path === CLOSE_PATH)
      expect(JSON.parse(closeCall?.body ?? '{}')).toEqual({ expected_version: 8, workspace_id: WS })
      expect(closeCall?.auth).toBe('Bearer eyJh.eyJi.c2ln')
      // 成功收敛（权威刷新）：详情已结束 + 版本推进 8→9 + 评分只读区。
      await waitFor(() => expect(view.getByTestId('seat-detail-status').textContent).toBe('已结束'))
      expect(view.getByTestId('seat-detail-version').textContent).toContain('9')
      expect(view.getByTestId('seat-rating-state')).toBeDefined()
      // 写入口收回：closed 会话不再有关闭/转接入口（A04 立即收回）。
      await waitFor(() => expect(view.queryByTestId('seat-close-submit')).toBeNull())
      expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
      expect(view.queryByTestId('seat-transfer-target-select')).toBeNull()
      // 会话从 active 列表消失（active 视图权威刷新后为空）。
      await waitFor(() => expect(view.queryByTestId(`seat-session-item-${SESSION}`)).toBeNull())
      // 同一会话进入 closed 列表（切「已结束」Tab 可见）。
      fireEvent.click(view.getByTestId('seat-tab-closed'))
      await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())
    })

    it('close 撞 409（状态已被他人变更）：payload 合同不变 → seat-close-conflict 播报 + 失败方权威刷新 + 不伪成功', async () => {
      const backend = new SeatFakeBackend()
      backend.state.sessionStatus = 'active'
      backend.state.version = 8
      interceptWith409(backend, CLOSE_PATH)
      const view = renderWorkspace(backend)
      await openActiveSession(view)
      const detailFetchesBefore = backend.calls.filter((call) => call.path === DETAIL_PATH).length
      fireEvent.click(view.getByTestId('seat-close-submit'))
      // 被拒请求的 payload 合同与成功路径逐键一致（CAS 基准仍是权威版本 8）。
      await waitFor(() => {
        const closeCalls = backend.calls.filter((call) => call.method === 'POST' && call.path === CLOSE_PATH)
        expect(closeCalls).toHaveLength(1)
      })
      const closeCall = backend.calls.find((call) => call.method === 'POST' && call.path === CLOSE_PATH)
      expect(JSON.parse(closeCall?.body ?? '{}')).toEqual({ expected_version: 8, workspace_id: WS })
      // 冲突播报（role=alert）——HTTP 409 → SeatApiError(conflict) → hook 冲突标记 → UI。
      await waitFor(() => expect(view.getByTestId('seat-close-conflict')).toBeDefined())
      expect(view.getByTestId('seat-close-conflict').getAttribute('role')).toBe('alert')
      expect(view.getByTestId('seat-close-conflict').textContent).toContain('已刷新，请重试')
      // 失败方自动权威刷新（A01：失效刷新后收敛到真实状态）。
      await waitFor(() =>
        expect(backend.calls.filter((call) => call.path === DETAIL_PATH).length).toBeGreaterThan(
          detailFetchesBefore,
        ),
      )
      // 不伪成功：状态仍进行中、无评分区、按钮复位可重试。
      expect(view.getByTestId('seat-detail-status').textContent).toBe('进行中')
      expect(view.queryByTestId('seat-rating-state')).toBeNull()
      const submit = view.getByTestId('seat-close-submit') as HTMLButtonElement
      expect(submit.disabled).toBe(false)
      expect(submit.textContent).toContain('关闭会话')
    })
  })

  describe('转接（seat-transfer-submit）', () => {
    it('选中坐席乙转接：POST transfer payload 逐键（to_identity_id/expected_version/workspace_id）→ 无冲突播报 + 按钮复位 + 成功方权威刷新；未选目标禁发', async () => {
      const backend = new SeatFakeBackend()
      backend.state.sessionStatus = 'active'
      backend.state.version = 8
      const view = renderWorkspace(backend)
      await openActiveSession(view)
      const user = userEvent.setup()
      const select = await waitFor(
        () => view.getByTestId('seat-transfer-target-select') as HTMLSelectElement,
      )
      // 目标清单来自 transfer-targets 端点（同 Org 其他可用坐席）。
      expect(select.textContent).toContain('坐席乙')
      // 未选目标：submit 禁用（绝不空投 to_identity_id）。
      const submit = view.getByTestId('seat-transfer-submit') as HTMLButtonElement
      expect(submit.disabled).toBe(true)
      await user.selectOptions(select, OTHER_IDENTITY)
      await waitFor(() => expect(submit.disabled).toBe(false))
      const detailFetchesBefore = backend.calls.filter((call) => call.path === DETAIL_PATH).length
      fireEvent.click(submit)
      // 请求合同：恰一次 POST，payload 逐键（目标坐席 + 权威版本 + workspace 门）。
      await waitFor(() => {
        const transferCalls = backend.calls.filter(
          (call) => call.method === 'POST' && call.path === TRANSFER_PATH,
        )
        expect(transferCalls).toHaveLength(1)
      })
      const transferCall = backend.calls.find(
        (call) => call.method === 'POST' && call.path === TRANSFER_PATH,
      )
      expect(JSON.parse(transferCall?.body ?? '{}')).toEqual({
        to_identity_id: OTHER_IDENTITY,
        expected_version: 8,
        workspace_id: WS,
      })
      expect(transferCall?.auth).toBe('Bearer eyJh.eyJi.c2ln')
      // 成功反馈：pending 复位（按钮回「转接会话」可再操作）+ 无冲突播报。
      await waitFor(() => {
        const after = view.getByTestId('seat-transfer-submit') as HTMLButtonElement
        expect(after.disabled).toBe(false)
        expect(after.textContent).toContain('转接会话')
      })
      expect(view.queryByTestId('seat-transfer-conflict')).toBeNull()
      // 成功也触发权威失效刷新（A01：成功方自动收敛真实状态）。
      await waitFor(() =>
        expect(backend.calls.filter((call) => call.path === DETAIL_PATH).length).toBeGreaterThan(
          detailFetchesBefore,
        ),
      )
    })

    it('transfer 撞 409：payload 合同不变 → seat-transfer-conflict 播报 + 权威刷新 + 会话归属未变（不伪成功）', async () => {
      const backend = new SeatFakeBackend()
      backend.state.sessionStatus = 'active'
      backend.state.version = 8
      interceptWith409(backend, TRANSFER_PATH)
      const view = renderWorkspace(backend)
      await openActiveSession(view)
      const user = userEvent.setup()
      const select = await waitFor(
        () => view.getByTestId('seat-transfer-target-select') as HTMLSelectElement,
      )
      await user.selectOptions(select, OTHER_IDENTITY)
      const detailFetchesBefore = backend.calls.filter((call) => call.path === DETAIL_PATH).length
      fireEvent.click(view.getByTestId('seat-transfer-submit'))
      // 被拒请求的 payload 合同逐键一致（含 409 路径的 CAS 基准）。
      await waitFor(() => {
        const transferCalls = backend.calls.filter(
          (call) => call.method === 'POST' && call.path === TRANSFER_PATH,
        )
        expect(transferCalls).toHaveLength(1)
      })
      const transferCall = backend.calls.find(
        (call) => call.method === 'POST' && call.path === TRANSFER_PATH,
      )
      expect(JSON.parse(transferCall?.body ?? '{}')).toEqual({
        to_identity_id: OTHER_IDENTITY,
        expected_version: 8,
        workspace_id: WS,
      })
      // 冲突播报（role=alert）。
      await waitFor(() => expect(view.getByTestId('seat-transfer-conflict')).toBeDefined())
      expect(view.getByTestId('seat-transfer-conflict').getAttribute('role')).toBe('alert')
      expect(view.getByTestId('seat-transfer-conflict').textContent).toContain('已刷新，请重试')
      // 失败方权威刷新；不伪成功：会话仍进行中、按钮复位可重试。
      await waitFor(() =>
        expect(backend.calls.filter((call) => call.path === DETAIL_PATH).length).toBeGreaterThan(
          detailFetchesBefore,
        ),
      )
      expect(view.getByTestId('seat-detail-status').textContent).toBe('进行中')
      const submit = view.getByTestId('seat-transfer-submit') as HTMLButtonElement
      expect(submit.disabled).toBe(false)
      expect(submit.textContent).toContain('转接会话')
    })
  })

  describe('登出（seat-logout）', () => {
    it('active 会话（关闭/转接/回复入口在场）点退出：vault 同步清空 + store 复位（endReason=logout）→ 工作台整体收回回 QR 登录门；登出纯前端，零服务端写调用', async () => {
      const backend = new SeatFakeBackend()
      backend.state.sessionStatus = 'active'
      backend.state.version = 8
      const view = renderWorkspace(backend)
      await openActiveSession(view)
      // 登出前事实：token 在内存 vault（A03 唯一持有点）；三写入口在场。
      expect(seatTokenVault.getToken()).toBe('eyJh.eyJi.c2ln')
      expect(view.getByTestId('seat-close-submit')).toBeDefined()
      expect(view.getByTestId('seat-transfer-submit')).toBeDefined()
      expect(view.getByTestId('seat-composer')).toBeDefined()
      fireEvent.click(view.getByTestId('seat-logout'))
      // 凭证/会话态清理：vault 同步清空（token 不残留）；store 只留非敏感状态。
      await waitFor(() => expect(seatTokenVault.getToken()).toBeNull())
      const authState = useSeatAuthStore.getState()
      expect(authState.status).toBe('anonymous')
      expect(authState.userId).toBeNull()
      expect(authState.endReason).toBe('logout')
      // 工作台整体收回：三写入口随 DOM 卸载不可达（单页状态机，无路由跳转）。
      await waitFor(() => expect(view.queryByTestId('seat-workspace')).toBeNull())
      expect(view.queryByTestId('seat-close-submit')).toBeNull()
      expect(view.queryByTestId('seat-transfer-submit')).toBeNull()
      expect(view.queryByTestId('seat-transfer-target-select')).toBeNull()
      expect(view.queryByTestId('seat-composer')).toBeNull()
      // 回 QR 登录门 + logout 专属可解释文案（区别于 401/过期/无权限文案）。
      await waitFor(() => expect(view.getByTestId('seat-qr-login')).toBeDefined())
      expect(view.getByTestId('seat-login-notice').textContent).toContain('已退出坐席工作台')
      expect(view.getByTestId('seat-login-notice').textContent).not.toContain('失效')
      // 登出是纯前端状态清理：clearSession 不产生任何服务端写调用
      // （claim/transfer/close/messages 全程零 POST——本用例未点过写入口，
      // 登出动作本身也没有触发任何一个）。
      expect(
        backend.calls.filter((call) => call.method === 'POST' && WRITE_ENDPOINT_PATTERN.test(call.path)),
      ).toHaveLength(0)
    })
  })
})
