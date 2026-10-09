import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { act, cleanup, render, renderHook, waitFor, within } from '@testing-library/react'
import { SeatApiClient } from '../seatApiClient'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import type { EntityId } from '../types'
import { toSeatSessionPage, toSeatSessionSummary, type SeatSessionSummary } from './contract'
import { SeatQueuePanel } from './queuePanel'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatWorkbenchProvider, useSeatSessionViews, type SeatViewStatus } from './workbenchHooks'
import { FakeSseStream, ORG, SESSION, SESSION2, SeatFakeBackend, WS, makeGateway } from './workbenchTestHarness'

type InboxPanelProps = ComponentProps<typeof SeatQueuePanel> & {
  search?: string
  onSearchChange?: (_search: string) => void
}

const useInboxViews: (
  _orgId: EntityId | null,
  _workspaceId: EntityId | null,
  _search?: string,
) => ReturnType<typeof useSeatSessionViews> = useSeatSessionViews

const SEARCH = "李*** 🧾 + & '"
const CURSOR: EntityId = '72057594037927939'
const LEGACY_SESSION: EntityId = '9223372036854775807'
const COUNTS = { queued: 41, active: 7, closed: 88 }

function wireSession(id: EntityId = SESSION, status: SeatViewStatus = 'active') {
  return {
    id,
    organization_id: ORG,
    workspace_id: WS,
    status,
    version: 3,
    source: 'widget',
    contact: { masked_name: '王***' },
    last_message: { id: CURSOR, sender_type: 'contact', created_at: 1759000000, preview: null },
  }
}

function wirePage(status: SeatViewStatus = 'queued', nextAfterId: EntityId | null = null) {
  return {
    sessions: [wireSession(SESSION, status)],
    total: COUNTS[status],
    total_by_status: COUNTS,
    next_after_id: nextAfterId,
  }
}

function summary(id: EntityId = SESSION): SeatSessionSummary {
  const session = toSeatSessionSummary(wireSession(id))
  if (session === null) throw new Error('CX02 fixture must be a valid session summary')
  return session
}

function panelProps(sessions: SeatSessionSummary[], overrides: Partial<InboxPanelProps> = {}): InboxPanelProps {
  const view = {
    sessions,
    nextAfterId: null,
    isLoading: false,
    error: null,
    refetch: mock(() => {}),
    fetchNextPage: mock(() => {}),
    hasNextPage: false,
  }
  return {
    viewStatus: 'active',
    onViewStatusChange: mock(() => {}),
    counts: COUNTS,
    views: { queued: { ...view }, active: { ...view }, closed: { ...view } },
    selectedSessionId: null,
    onSelectSession: mock(() => {}),
    onClaim: mock(() => {}),
    claimPendingSessionId: null,
    claimDisabled: false,
    claimDisabledReason: '',
    ...overrides,
  }
}

function renderSearchPanel() {
  const onSearchChange = mock((_search: string) => {})
  function ControlledPanel() {
    const [search, setSearch] = useState('')
    const props = panelProps([summary()], {
      search,
      onSearchChange: (value) => {
        onSearchChange(value)
        setSearch(value)
      },
    })
    return <SeatQueuePanel {...props} />
  }
  return { ...render(<ControlledPanel />), onSearchChange }
}

function hookHarness() {
  useSeatAuthStore.getState().setSession('72057594037928001')
  const gateway = makeGateway(new SeatFakeBackend(), new FakeSseStream())
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider>
    </QueryClientProvider>
  )
  return { gateway, queryClient, wrapper }
}

afterEach(() => {
  cleanup()
  mock.restore()
  seatTokenVault.clear()
  useSeatAuthStore.getState().clearSession('logout')
})

describe('CX02 inbox RED（仅前端合同/JSDOM/内存 transport）', () => {
  it('同账号同 scope 换 BID 建立新本人列表 key，认证令牌不进入 key', async () => {
    const { gateway, queryClient, wrapper } = hookHarness()
    spyOn(gateway.api, 'fetchQueue').mockResolvedValue(toSeatSessionPage(wirePage()))
    const fetchSessions = spyOn(gateway.api, 'fetchSessions')
      .mockImplementation(async (_org, status) => toSeatSessionPage(wirePage(status)))
    const token = 'aa.bb.cc'
    seatTokenVault.setToken(token)
    const view = renderHook(({ identityId }) => useSeatSessionViews(ORG, WS, '', identityId),
      { wrapper, initialProps: { identityId: '72057594037928011' } })
    await waitFor(() => expect(view.result.current.active.isLoading).toBe(false))
    view.rerender({ identityId: '72057594037928012' })
    await waitFor(() => expect(view.result.current.active.isLoading).toBe(false))
    expect(fetchSessions.mock.calls.filter((call) => call[1] === 'active')).toHaveLength(2)
    const keys = queryClient.getQueryCache().findAll({ queryKey: ['seat-workbench', 'sessions'] })
      .map((query) => query.queryKey)
    expect(JSON.stringify(keys)).toContain('72057594037928011')
    expect(JSON.stringify(keys)).toContain('72057594037928012')
    expect(JSON.stringify(keys)).not.toContain(token)
  })

  it('同 scope 换账号或同账号重建认证会话不复用旧本人列表，迟到回包不能覆盖', async () => {
    const { gateway, queryClient, wrapper } = hookHarness()
    let resolveOld: (_page: ReturnType<typeof toSeatSessionPage>) => void = () => {}
    let callCount = 0
    spyOn(gateway.api, 'fetchQueue').mockResolvedValue(toSeatSessionPage(wirePage()))
    spyOn(gateway.api, 'fetchSessions').mockImplementation(async (_org, status) => {
      if (status !== 'active') return toSeatSessionPage(wirePage(status))
      callCount += 1
      if (callCount === 1) return new Promise((resolve) => { resolveOld = resolve })
      return toSeatSessionPage({ ...wirePage(status), sessions: [wireSession(SESSION2, status)] })
    })
    const view = renderHook(() => useInboxViews(ORG, WS), { wrapper })
    await waitFor(() => expect(callCount).toBe(1))
    act(() => useSeatAuthStore.getState().setSession('72057594037928002'))
    await waitFor(() => expect(view.result.current.active.sessions.map((row) => row.id)).toEqual([SESSION2]))
    await act(async () => resolveOld(toSeatSessionPage(wirePage('active'))))
    expect(view.result.current.active.sessions.map((row) => row.id)).toEqual([SESSION2])
    act(() => useSeatAuthStore.getState().setSession('72057594037928002'))
    await waitFor(() => expect(callCount).toBe(3))
    act(() => useSeatAuthStore.getState().clearSession('logout'))
    expect(view.result.current.active.sessions).toEqual([])
    expect(queryClient.getQueryCache().findAll({ queryKey: ['seat-workbench', 'sessions'] })
      .every((query) => query.state.data === undefined)).toBe(true)
  })

  it('CX02-RED-01 摘要投影保留服务端 unread_count/needs_reply，已读零未读仍可待回复', () => {
    const rows = [
      { ...wireSession(), unread_count: 0, needs_reply: true },
      { ...wireSession(SESSION2), unread_count: 4, needs_reply: false },
      { ...wireSession(CURSOR), unread_count: 0, needs_reply: false },
      wireSession(LEGACY_SESSION),
    ]
    const page = toSeatSessionPage({ ...wirePage('active'), sessions: rows })
    expect(page.counts).toEqual(COUNTS)
    expect(page.sessions).toMatchObject([
      { id: SESSION, unreadCount: 0, needsReply: true, lastMessage: { preview: null } },
      { id: SESSION2, unreadCount: 4, needsReply: false },
      { id: CURSOR, unreadCount: 0, needsReply: false },
      { id: LEGACY_SESSION, unreadCount: null, needsReply: null },
    ])
  })

  it('CX02-RED-02 列表分别展示真实未读与待回复，不把 unreadCount 当作待回复条件', () => {
    const sessions = [
      { ...summary(), unreadCount: 0, needsReply: true },
      { ...summary(SESSION2), unreadCount: 4, needsReply: false },
      { ...summary(CURSOR), unreadCount: 0, needsReply: false },
      { ...summary(LEGACY_SESSION), unreadCount: null, needsReply: null },
    ]
    const view = render(<SeatQueuePanel {...panelProps(sessions)} />)
    const list = view.getByTestId('seat-session-list')
    const rows = within(list).getAllByRole('listitem')
    expect({
      unread: view.getByTestId(`seat-session-unread-${SESSION2}`).textContent,
      needsReply: rows.map((row) => row.textContent?.includes('待回复')),
    }).toEqual({ unread: '4', needsReply: [true, false, false, false] })
  })

  it('CX02-RED-03 queued/active/closed 标为待接待/我的/历史，保留服务端计数', () => {
    const view = render(<SeatQueuePanel {...panelProps([summary()])} />)
    expect(['queued', 'active', 'closed'].map((status) => view.getByTestId(`seat-tab-${status}`).textContent))
      .toEqual(['待接待 (41)', '我的 (7)', '历史 (88)'])
  })

  it('CX02-RED-04 搜索值受页面 search 控制，并经 onSearchChange 原样交回页面', async () => {
    const view = renderSearchPanel()
    const input = view.getByRole('searchbox')
    await userEvent.setup().type(input, SEARCH)
    expect(view.onSearchChange).toHaveBeenLastCalledWith(SEARCH)
    const props = panelProps([summary()], { search: SESSION2 })
    view.rerender(<SeatQueuePanel {...props} />)
    expect(view.getByRole('searchbox')).toHaveProperty('value', SESSION2)
    expect(view.getByRole('searchbox').getAttribute('placeholder')).not.toMatch(/摘要|已加载/)
  })

  it('CX02-RED-05 等待页面搜索回包期间保留已有行，面板不自行过滤本页', async () => {
    const view = renderSearchPanel()
    const input = view.getByRole('searchbox')
    await userEvent.setup().type(input, SESSION2)
    expect(within(view.getByTestId('seat-session-list')).queryByTestId(`seat-session-item-${SESSION}`))
      .not.toBeNull()
    expect(view.queryByTestId('seat-queue-filter-empty')).toBeNull()
  })

  it('CX02-RED-06 API 原样透传 search/mine；不擅自注入 hook 才负责的 mine 默认值', async () => {
    const calls: URL[] = []
    const client = new SeatApiClient({
      getToken: () => 'eyJh.eyJi.c2ln',
      fetchImpl: async (url) => {
        const parsed = new URL(url, 'http://localhost')
        calls.push(parsed)
        const status = parsed.pathname.endsWith('/sessions/queue')
          ? 'queued'
          : parsed.searchParams.get('status') === 'closed' ? 'closed' : 'active'
        return new Response(JSON.stringify({ code: 0, msg: 'success', payload: wirePage(status) }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    const api = new SeatWorkbenchApi({ client })
    const filters = { workspaceId: WS, search: SEARCH, mine: false }
    const defaults = { workspaceId: WS, search: SEARCH }
    const mineFilters = { ...filters, mine: true }
    await api.fetchQueue(ORG, filters)
    await api.fetchSessions(ORG, 'active', defaults)
    await api.fetchSessions(ORG, 'active', filters)
    await api.fetchSessions(ORG, 'active', mineFilters)
    await api.fetchSessions(ORG, 'closed', mineFilters)
    await api.fetchSessions(ORG, 'closed', { workspaceId: WS })
    expect(calls.map((url) => ({
      path: url.pathname,
      workspaceId: url.searchParams.get('workspace_id'),
      status: url.searchParams.get('status'),
      search: url.searchParams.get('search'),
      mine: url.searchParams.get('mine'),
    }))).toEqual([
      { path: `/api/v1/seat/cs/organizations/${ORG}/sessions/queue`, workspaceId: WS, status: null, search: SEARCH, mine: 'false' },
      { path: `/api/v1/seat/cs/organizations/${ORG}/seats/sessions`, workspaceId: WS, status: 'active', search: SEARCH, mine: null },
      { path: `/api/v1/seat/cs/organizations/${ORG}/seats/sessions`, workspaceId: WS, status: 'active', search: SEARCH, mine: 'false' },
      { path: `/api/v1/seat/cs/organizations/${ORG}/seats/sessions`, workspaceId: WS, status: 'active', search: SEARCH, mine: 'true' },
      { path: `/api/v1/seat/cs/organizations/${ORG}/seats/sessions`, workspaceId: WS, status: 'closed', search: SEARCH, mine: 'true' },
      { path: `/api/v1/seat/cs/organizations/${ORG}/seats/sessions`, workspaceId: WS, status: 'closed', search: null, mine: null },
    ])
  })

  it('CX02-RED-07 hook 的 query key 区分 search，active 查询和 key 固定 mine=true', async () => {
    const { gateway, queryClient, wrapper } = hookHarness()
    spyOn(gateway.api, 'fetchQueue').mockResolvedValue(toSeatSessionPage(wirePage()))
    const fetchSessions = spyOn(gateway.api, 'fetchSessions')
      .mockImplementation(async (_org, status) => toSeatSessionPage(wirePage(status)))
    const initialProps = { search: SEARCH }
    const view = renderHook(({ search }) => useInboxViews(ORG, WS, search), { wrapper, initialProps })
    await waitFor(() => expect(view.result.current.active.isLoading).toBe(false))
    view.rerender({ search: SESSION2 })
    await waitFor(() => expect(view.result.current.active.isLoading).toBe(false))
    const keys = queryClient.getQueryCache()
      .findAll({ queryKey: ['seat-workbench', 'sessions', ORG, WS] })
      .map((query) => query.queryKey)
    const activeCalls = fetchSessions.mock.calls.filter((call) => call[1] === 'active')
    expect({
      cachedViews: keys.length,
      distinctKeys: new Set(keys.map((key) => JSON.stringify(key))).size,
      activeQueries: activeCalls.map((call) => call[2]),
      activeMineKeys: keys.filter((key) => key.includes('active')).every((key) => key.includes(true)),
    }).toEqual({
      cachedViews: 6,
      distinctKeys: 6,
      activeQueries: [
        { afterId: null, limit: 20, workspaceId: WS, search: SEARCH, mine: true },
        { afterId: null, limit: 20, workspaceId: WS, search: SESSION2, mine: true },
      ],
      activeMineKeys: true,
    })
    expect(JSON.stringify(keys)).toContain(JSON.stringify(SEARCH))
    expect(JSON.stringify(keys)).toContain(JSON.stringify(SESSION2))
  })

  it('CX02-RED-08 已加载下一页后 search 改变，从空 cursor 重新请求而非接续旧页', async () => {
    const { gateway, wrapper } = hookHarness()
    const afterIds: Array<EntityId | null> = []
    spyOn(gateway.api, 'fetchQueue').mockImplementation(async (_org, query) => {
      const afterId = query?.afterId ?? null
      afterIds.push(afterId)
      return toSeatSessionPage(wirePage('queued', afterId === null ? CURSOR : null))
    })
    spyOn(gateway.api, 'fetchSessions').mockImplementation(async (_org, status) => toSeatSessionPage(wirePage(status)))
    const initialProps = { search: '' }
    const view = renderHook(({ search }) => useInboxViews(ORG, WS, search), { wrapper, initialProps })
    await waitFor(() => expect(view.result.current.queued.hasNextPage).toBe(true))
    act(() => view.result.current.queued.fetchNextPage())
    await waitFor(() => expect(view.result.current.queued.sessions).toHaveLength(2))
    view.rerender({ search: SEARCH })
    await waitFor(() => expect(view.result.current.queued.isLoading).toBe(false))
    view.rerender({ search: SESSION2 })
    await waitFor(() => expect(view.result.current.queued.isLoading).toBe(false))
    expect({ afterIds, loadedRows: view.result.current.queued.sessions.length })
      .toEqual({ afterIds: [null, CURSOR, null, null], loadedRows: 1 })
  })

  it('各标签计数取各自查询真源，不把组织进行中总数标成我的', async () => {
    const { gateway, wrapper } = hookHarness()
    spyOn(gateway.api, 'fetchQueue').mockResolvedValue(toSeatSessionPage({
      ...wirePage(), total_by_status: { queued: 41, active: 90, closed: 88 },
    }))
    spyOn(gateway.api, 'fetchSessions').mockImplementation(async (_org, status) => {
      const counts = status === 'active'
        ? { queued: 0, active: 7, closed: 2 }
        : { queued: 41, active: 90, closed: 88 }
      return toSeatSessionPage({ ...wirePage(status), total_by_status: counts })
    })
    const view = renderHook(() => useInboxViews(ORG, WS), { wrapper })
    await waitFor(() => expect(view.result.current.closed.isLoading).toBe(false))
    expect(view.result.current.counts).toEqual(COUNTS)
  })

  it('非法未读或待回复事实保持未知，不伪造零或将字符串当true', () => {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4', null]) {
      expect(toSeatSessionSummary({ ...wireSession(), unread_count: value, needs_reply: 'true' }))
        .toMatchObject({ unreadCount: null, needsReply: null })
    }
  })
})
