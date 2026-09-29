/**
 * REVIEW-4 F12：seat-org-select / seat-ws-select 切换器行为测试（此前仅有
 * 骨架断言——只看 org 选项文案，不覆盖切换数据流）。
 *
 * 被测对象是 SeatWorkspacePage header 内的组织/工作区切换器（无独立组件
 * 文件，故本文件按被测区域命名，避免与 SeatWorkspacePage.test.tsx 并写）。
 * 按真实实现断言，mock 只打 fetch 替身边界：
 * - org/ws 选项来自 GET /api/v1/cs/me/seat-contexts（selectActiveSeatContexts
 *   过滤 seat_enabled && workspaces>0 后的全部上下文）；
 * - useSeatScopeSelection：默认第一个上下文 + 第一个工作区；selectOrganization
 *   重置 workspaceId（回落新组织第一个工作区）；selectWorkspace 保留组织；
 * - 页面层切换回调同时清空 selectedSessionId（详情/消息/读游标随选中态卸载）；
 * - 切换后 sessions/detail/messages/customer-context 等权威查询的 queryKey 含
 *   organizationId+workspaceId → 自动按新 scope 重载；SSE 流 scopeKey 变化 →
 *   旧流 stop、新流 start；contexts 查询键不含 scope → 不重新拉取。
 *
 * 共享替身 workbenchTestHarness 冻结单组织单工作区 fixture（不改动），本文件
 * 自带 MultiScopeBackend 组合替身：多组织/多工作区 contexts 载荷 + 按
 * workspace_id 区分的 queue 回包，其余请求原样转发原替身。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import type { SeatStreamHandlers } from './workbenchHooks'
import { SeatWorkbenchApi } from './workbenchApi'
import {
  FakeSseStream,
  IDENTITY,
  ORG,
  SESSION,
  WS,
  SeatFakeBackend,
  initialFakeState,
  presenceText,
  type SeatFakeBackendState,
} from './workbenchTestHarness'
import { SeatApiClient } from '../seatApiClient'
import { SeatEventStream } from '../seatSseClient'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'

/** 第二组织/第二工作区 TSID（19 位，与 harness 常量同段不冲突）。 */
const ORG2 = '2000000000000000004'
const WS2 = '3000000000000000008'
const ORG2_WS = '3000000000000000009'

/** 多组织/多工作区 seat-contexts 载荷（线缆形状镜像 harness CONTEXTS_TEXT）。 */
const MULTI_CONTEXTS_TEXT =
  `{"user_id":"1000000000000000001","contexts":[` +
  `{"organization_id":"${ORG}","organization_name":"示例商城",` +
  `"workspaces":[{"id":"${WS}","name":"默认工作区"},{"id":"${WS2}","name":"售前工作区"}],` +
  `"business_identity_id":"${IDENTITY}","seat_enabled":true,` +
  `"capabilities":["conversation.read","conversation.write","message.write","asset.read"]},` +
  `{"organization_id":"${ORG2}","organization_name":"示例企业",` +
  `"workspaces":[{"id":"${ORG2_WS}","name":"企业工作区"}],` +
  `"business_identity_id":"${IDENTITY}","seat_enabled":true,` +
  `"capabilities":["conversation.read","conversation.write","message.write","asset.read"]}]}`

/** 空会话页（服务端事实口径：total 0 + 全零计数 + 空 next 游标）。 */
const EMPTY_PAGE_TEXT =
  '{"sessions":[],"total":0,"total_by_status":{"queued":0,"active":0,"closed":0},"next_after_id":null}'

function ok(payloadText: string): Response {
  return new Response(`{"code":0,"msg":"success","payload":${payloadText}}`, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 组合替身：contexts 换成多组织/多工作区；queue 按 workspace_id 区分回包
 * （默认工作区转发原替身——含 SESSION 行；售前工作区/企业组织一律空页）；
 * 其余请求转发原替身。queue 请求的完整观测（path + workspace_id）是"切换
 * 触发按新 scope 重载"断言的唯一事实源。
 */
class MultiScopeBackend {
  readonly inner: SeatFakeBackend
  contextsFetchCount = 0
  queueCalls: Array<{ path: string; workspaceId: string | null }> = []

  constructor(state: SeatFakeBackendState = initialFakeState()) {
    this.inner = new SeatFakeBackend(state)
  }

  handle = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.split('?')[0] ?? url
    if (path === '/api/v1/cs/me/seat-contexts') {
      this.contextsFetchCount += 1
      return ok(MULTI_CONTEXTS_TEXT)
    }
    if (path === `/api/v1/cs/organizations/${ORG}/sessions/queue` || path === `/api/v1/cs/organizations/${ORG2}/sessions/queue`) {
      const workspaceId = new URL(url, 'http://localhost').searchParams.get('workspace_id')
      this.queueCalls.push({ path, workspaceId })
      if (workspaceId !== WS) return ok(EMPTY_PAGE_TEXT)
    } else if (path.includes(`/organizations/${ORG2}/`)) {
      if (path.endsWith('/seats/sessions')) return ok(EMPTY_PAGE_TEXT)
      if (path.endsWith('/seats/me/presence') || path.endsWith('/seats/me/heartbeat')) {
        return ok(presenceText('online', 1790312470))
      }
      return ok('{}')
    }
    return this.inner.handle(url, init)
  }
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
}

function renderWorkspace(backend: MultiScopeBackend, sse: FakeSseStream) {
  // 与 makeGateway 同构，但 api.client 的 HTTP 出口指向 MultiScopeBackend.handle
  // （makeGateway 内部构造 SeatApiClient 会绑死 inner.handle，无法换 contexts 载荷）。
  const getToken = (): string | null => seatTokenVault.getToken()
  const gateway = {
    api: new SeatWorkbenchApi({
      client: new SeatApiClient({ fetchImpl: backend.handle, getToken }),
    }),
    fetchImpl: sse.fetchImpl,
    createStream: (handlers: SeatStreamHandlers) =>
      new SeatEventStream({ getToken, fetchImpl: sse.fetchImpl, backoffBaseMs: 10, ...handlers }),
    sse,
    backend: backend.inner,
  }
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <SeatWorkspacePage gateway={gateway} />
    </QueryClientProvider>,
  )
}

describe('seat org/ws 切换器（SeatWorkspacePage header，F12）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('正常渲染：org 选项来自 seat-contexts 全部组织；ws 选项随当前组织；默认选中第一个组织第一个工作区', async () => {
    const backend = new MultiScopeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId('seat-workspace')).toBeDefined())

    const orgSelect = view.getByTestId('seat-org-select') as HTMLSelectElement
    expect(orgSelect.textContent).toContain('示例商城')
    expect(orgSelect.textContent).toContain('示例企业')
    expect(orgSelect.value).toBe(ORG)

    const wsSelect = view.getByTestId('seat-ws-select') as HTMLSelectElement
    // ws 选项 = 当前组织的工作区列表（不混入其他组织的工作区）。
    expect(wsSelect.textContent).toContain('默认工作区')
    expect(wsSelect.textContent).toContain('售前工作区')
    expect(wsSelect.textContent).not.toContain('企业工作区')
    expect(wsSelect.value).toBe(WS)

    // 默认 scope 的权威读取已按 (ORG, WS) 发出。
    await waitFor(() =>
      expect(backend.queueCalls.some((call) => call.workspaceId === WS)).toBe(true),
    )
  })

  it('切换 org：ws 列表刷新为新组织工作区（回落第一个）、选中会话清空、权威读取与 SSE 流切到新组织', async () => {
    const backend = new MultiScopeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)

    // 先选中会话（详情按选中态加载），再切组织——验证切换清空选中态。
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    await waitFor(() => expect(view.getByTestId('seat-conversation-title')).toBeDefined())

    const contextsBefore = backend.contextsFetchCount
    const connectsBefore = sse.connectCount
    fireEvent.change(view.getByTestId('seat-org-select'), { target: { value: ORG2 } })

    // org 值更新；ws 选项刷新为新组织的工作区且 workspaceId 回落第一个。
    expect((view.getByTestId('seat-org-select') as HTMLSelectElement).value).toBe(ORG2)
    const wsSelect = await waitFor(() => {
      const el = view.getByTestId('seat-ws-select') as HTMLSelectElement
      expect(el.value).toBe(ORG2_WS)
      return el
    })
    expect(wsSelect.textContent).toContain('企业工作区')
    expect(wsSelect.textContent).not.toContain('售前工作区')

    // 选中会话被清空 → 详情面板卸载。
    await waitFor(() => expect(view.queryByTestId('seat-conversation-title')).toBeNull())

    // 权威读取按新组织重发（queue 打 ORG2，空队列计数为服务端事实）。
    await waitFor(() =>
      expect(backend.queueCalls.some((call) => call.path.includes(ORG2))).toBe(true),
    )
    await waitFor(() => expect(view.getByTestId('seat-tab-queued').textContent).toContain('0'))
    // SSE 流 scopeKey 变化 → 旧流 stop、新流 start。
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBefore))
    // contexts 查询键不含 scope：切换不重拉 seat-contexts（列表刷新来自本地选路）。
    expect(backend.contextsFetchCount).toBe(contextsBefore)
  })

  it('切换 ws：会话列表按新 workspace 重载（queue 带 workspace_id）、组织不变、SSE 流随 scope 重建', async () => {
    const backend = new MultiScopeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)

    // 初始：默认工作区有 1 条 queued 会话（服务端计数与行都来自权威读取）。
    await waitFor(() => expect(view.getByTestId('seat-tab-queued').textContent).toContain('1'))
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())

    const connectsBefore = sse.connectCount
    fireEvent.change(view.getByTestId('seat-ws-select'), { target: { value: WS2 } })

    // 组织选择保持不变，ws 值更新。
    expect((view.getByTestId('seat-org-select') as HTMLSelectElement).value).toBe(ORG)
    expect((view.getByTestId('seat-ws-select') as HTMLSelectElement).value).toBe(WS2)

    // queue 请求带新 workspace_id 重发；新工作区无会话 → 列表与计数收敛为空。
    await waitFor(() =>
      expect(backend.queueCalls.some((call) => call.workspaceId === WS2)).toBe(true),
    )
    await waitFor(() => expect(view.getByTestId('seat-tab-queued').textContent).toContain('0'))
    await waitFor(() => expect(view.queryByTestId(`seat-session-item-${SESSION}`)).toBeNull())
    // SSE 流 scopeKey 变化 → 重建。
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBefore))
  })
})
