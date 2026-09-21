/**
 * SEAT-02：坐席工作台 hooks（react-query 权威读取 + CAS 写 + §3.6 事件收敛）。
 *
 * 事件语义（合同）：SSE at-least-once 信封只是通知，去重由 SeatEventStream
 * （event_id）承担；本层把去重后的信封映射为对应权威查询的失效刷新——
 * 列表/detail/messages 始终是真源，payload 不进业务状态。
 *
 * 写入口（A01/A04）：
 * - claim/transfer/close 全部 CAS（expected_version 来自权威事实）；
 *   409 → 失效刷新 + 冲突标记，失败方自动收敛到真实状态；
 * - seat.changed/assignment.changed revoked 或流被 403 关闭 → 立即收回写入口
 *   （writeRevoked），状态可解释，并失效 contexts 复核事实；
 * - 401 → 统一清会话回登录（SEAT-01 guard 语义复用）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query'
import { SeatEventStream, type SeatEventStreamStatus } from '../seatSseClient'
import type { SeatSseEnvelope } from '../seatSseProtocol'
import { isSeatApiError } from '../errors'
import { selectActiveSeatContexts } from '../seatContexts'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { SeatApiClient, type SeatFetchLike } from '../seatApiClient'
import type { SeatContext, EntityId } from '../types'
import {
  SEAT_MESSAGE_PAGE_LIMIT,
  SEAT_SESSION_PAGE_LIMIT,
  SeatWorkbenchApi,
  type SeatPageQuery,
  type SeatSessionCounts,
  type SeatSessionPage,
} from './workbenchApi'

export const SEAT_QUERY_ROOT_KEY = 'seat-workbench'

/** 流工厂回调包（与 SeatEventStream 构造 options 对齐；scope 由 start 提供）。 */
export type SeatStreamHandlers = {
  onEnvelope: (_envelope: SeatSseEnvelope) => void
  onResync: () => void
  onStatus?: (_status: SeatEventStreamStatus) => void
  onEnded?: (_reason: 'unauthorized' | 'forbidden') => void
}

export type SeatWorkbenchGateway = {
  api: SeatWorkbenchApi
  /** 流工厂可注入（组件层测试用假 SSE 传输驱动合同信封）。 */
  createStream: (_handlers: SeatStreamHandlers) => SeatEventStream
  /** QR 登录 subscribe 流的 fetch 注入点（测试；生产缺省 = 全局 fetch）。 */
  fetchImpl?: SeatFetchLike
}

export const SeatWorkbenchContext = createContext<SeatWorkbenchGateway | null>(null)

function defaultGateway(): SeatWorkbenchGateway {
  const client = new SeatApiClient({ getToken: () => seatTokenVault.getToken() })
  return {
    api: new SeatWorkbenchApi({ client }),
    createStream: (handlers) => new SeatEventStream({ getToken: () => seatTokenVault.getToken(), ...handlers }),
  }
}

export function SeatWorkbenchProvider({
  children,
  gateway,
}: {
  children: ReactNode
  gateway?: SeatWorkbenchGateway
}) {
  const value = useMemo(() => gateway ?? defaultGateway(), [gateway])
  return <SeatWorkbenchContext.Provider value={value}>{children}</SeatWorkbenchContext.Provider>
}

export function useSeatWorkbenchGateway(): SeatWorkbenchGateway {
  const value = useContext(SeatWorkbenchContext)
  if (value === null) throw new Error('SeatWorkbenchProvider is missing')
  return value
}

/** 401 统一清会话（回登录）；返回是否是 401 类错误。 */
export function isSeatUnauthorized(error: unknown): boolean {
  return isSeatApiError(error) && error.kind === 'unauthorized'
}

/** 错误可解释分类：UI 六态只认这几类。 */
export type SeatFailureKind = 'forbidden' | 'server' | 'network' | 'other' | null

export function seatFailureKind(error: unknown): SeatFailureKind {
  if (!isSeatApiError(error)) return error === null || error === undefined ? null : 'other'
  if (error.kind === 'forbidden') return 'forbidden'
  if (error.kind === 'network') return 'network'
  if (error.kind === 'server' || error.kind === 'rate_limited' || error.kind === 'invalid_response') return 'server'
  return 'other'
}

type SubKey = 'contexts' | 'sessions' | 'detail' | 'messages' | 'transfer-targets'

/** 失效刷新（权威刷新的唯一入口）。subKeys 省略 = 全量（resync）。 */
function useInvalidateSeatQueries() {
  const queryClient = useQueryClient()
  return useCallback(
    (...subKeys: SubKey[]) => {
      if (subKeys.length === 0) {
        void queryClient.invalidateQueries({ queryKey: [SEAT_QUERY_ROOT_KEY] })
        return
      }
      for (const sub of subKeys) {
        void queryClient.invalidateQueries({ queryKey: [SEAT_QUERY_ROOT_KEY, sub] })
      }
    },
    [queryClient],
  )
}

// ---------------------------------------------------------------------------
// 坐席上下文（组织/工作区切换 + 能力事实）
// ---------------------------------------------------------------------------

export function useSeatContexts() {
  const { api } = useSeatWorkbenchGateway()
  // 预认证期不发 seat-contexts：未建立坐席会话时该请求必然 401（浏览器还会
  // 记 console error）——QR confirmed 后 status 翻转自动触发首次加载。
  const status = useSeatAuthStore((state) => state.status)
  return useQuery({
    queryKey: [SEAT_QUERY_ROOT_KEY, 'contexts'],
    queryFn: async () => selectActiveSeatContexts(await api.fetchContexts()),
    enabled: status === 'authenticated',
  })
}

export type SeatScopeSelection = {
  context: SeatContext | null
  organizationId: EntityId | null
  organizationName: string
  workspaceId: EntityId | null
  myIdentityId: EntityId | null
  capabilities: SeatContext['capabilities']
  canWrite: boolean
  selectOrganization: (_organizationId: EntityId) => void
  selectWorkspace: (_workspaceId: EntityId) => void
}

/** 组织/工作区选路：默认第一个可用上下文；org 切换时工作区回落到第一个。 */
export function useSeatScopeSelection(contexts: SeatContext[] | undefined): SeatScopeSelection {
  const [selection, setSelection] = useState<{ organizationId: EntityId | null; workspaceId: EntityId | null }>({
    organizationId: null,
    workspaceId: null,
  })

  const activeContexts = useMemo(() => contexts ?? [], [contexts])

  const current: SeatContext | null = useMemo(() => {
    if (activeContexts.length === 0) return null
    return activeContexts.find((ctx) => ctx.organizationId === selection.organizationId) ?? activeContexts[0] ?? null
  }, [activeContexts, selection.organizationId])

  const workspaceId = useMemo<EntityId | null>(() => {
    if (current === null) return null
    const ws = current.workspaces.find((w) => w.id === selection.workspaceId) ?? current.workspaces[0]
    return ws?.id ?? null
  }, [current, selection.workspaceId])

  const selectOrganization = useCallback((organizationId: EntityId) => {
    setSelection({ organizationId, workspaceId: null })
  }, [])

  const selectWorkspace = useCallback((workspaceId: EntityId) => {
    setSelection((prev) => ({ ...prev, workspaceId }))
  }, [])

  return {
    context: current,
    organizationId: current?.organizationId ?? null,
    organizationName: current?.organizationName ?? '',
    workspaceId,
    myIdentityId: current?.businessIdentityId ?? null,
    capabilities: current?.capabilities ?? [],
    canWrite: current?.capabilities.includes('conversation.write') ?? false,
    selectOrganization,
    selectWorkspace,
  }
}

// ---------------------------------------------------------------------------
// 三视图（queued/active/closed）：键集分页 + 服务端计数（禁本地推断）
// ---------------------------------------------------------------------------

export type SeatViewStatus = 'queued' | 'active' | 'closed'

export type SeatSessionsView = {
  sessions: SeatSessionPage['sessions']
  nextAfterId: EntityId | null
  isLoading: boolean
  error: unknown
  refetch: () => void
  fetchNextPage: () => void
  hasNextPage: boolean
}

type ViewQuery = UseInfiniteQueryResult<InfiniteData<SeatSessionPage, EntityId | null>, Error>

function useSessionsInfiniteQuery(
  orgId: EntityId,
  workspaceId: EntityId | null,
  status: SeatViewStatus,
  enabled: boolean,
  api: SeatWorkbenchApi,
): ViewQuery {
  return useInfiniteQuery({
    queryKey: [SEAT_QUERY_ROOT_KEY, 'sessions', orgId, workspaceId, status],
    enabled,
    initialPageParam: null as EntityId | null,
    queryFn: ({ pageParam }) => {
      const query: SeatPageQuery = { afterId: pageParam, limit: SEAT_SESSION_PAGE_LIMIT, workspaceId }
      return status === 'queued' ? api.fetchQueue(orgId, query) : api.fetchSessions(orgId, status, query)
    },
    getNextPageParam: (lastPage: SeatSessionPage) => lastPage.nextAfterId,
  })
}

function toView(query: ViewQuery): SeatSessionsView {
  const pages = query.data?.pages ?? []
  const last = pages.length > 0 ? (pages[pages.length - 1] ?? null) : null
  return {
    sessions: pages.flatMap((page) => page.sessions),
    nextAfterId: last?.nextAfterId ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    fetchNextPage: () => void query.fetchNextPage(),
    hasNextPage: query.hasNextPage,
  }
}

/** 三视图 + 服务端计数（任一视图最新页携带 total_by_status 即更新；纯派生）。 */
export function useSeatSessionViews(orgId: EntityId | null, workspaceId: EntityId | null) {
  const { api } = useSeatWorkbenchGateway()
  const enabled = orgId !== null && workspaceId !== null

  const queued = useSessionsInfiniteQuery(orgId ?? '', workspaceId, 'queued', enabled, api)
  const active = useSessionsInfiniteQuery(orgId ?? '', workspaceId, 'active', enabled, api)
  const closed = useSessionsInfiniteQuery(orgId ?? '', workspaceId, 'closed', enabled, api)

  const pickLatest = (data: typeof queued.data): SeatSessionPage | undefined => {
    const pages = data?.pages ?? []
    return pages.length > 0 ? pages[pages.length - 1] : undefined
  }
  // 服务端计数是派生值（禁本地推断）：取任一视图最新一页携带的 total_by_status。
  const counts: SeatSessionCounts | null =
    pickLatest(queued.data)?.counts ?? pickLatest(active.data)?.counts ?? pickLatest(closed.data)?.counts ?? null

  const invalidate = useInvalidateSeatQueries()
  const refetchAll = useCallback(() => {
    void queued.refetch()
    void active.refetch()
    void closed.refetch()
  }, [queued, active, closed])

  return {
    queued: toView(queued),
    active: toView(active),
    closed: toView(closed),
    counts,
    refetchAll,
    invalidate: () => invalidate('sessions', 'detail'),
  }
}

// ---------------------------------------------------------------------------
// CAS 写：claim / transfer / close（409 → 失效刷新 + 冲突标记）
// ---------------------------------------------------------------------------

export type SeatCasConflict = { sessionId: EntityId } | null

export function useSeatClaim(orgId: EntityId | null, workspaceId: EntityId | null) {
  const { api } = useSeatWorkbenchGateway()
  const invalidate = useInvalidateSeatQueries()
  const [conflict, setConflict] = useState<SeatCasConflict>(null)
  const mutation = useMutation({
    mutationFn: async (input: { sessionId: EntityId; expectedVersion: number }) => {
      if (orgId === null || workspaceId === null) throw new Error('seat claim requires scope')
      await api.claim(orgId, input.sessionId, workspaceId, input.expectedVersion)
      return input.sessionId
    },
    onSettled: (_data, error, variables) => {
      // 成功与冲突都失效刷新：A01 成功方/失败方都自动收敛真实状态。
      invalidate('sessions', 'detail')
      if (error !== null && error !== undefined && isSeatApiError(error) && error.kind === 'conflict') {
        setConflict({ sessionId: variables.sessionId })
      } else if (error === null) {
        setConflict(null)
      }
    },
  })
  return { ...mutation, conflict, clearConflict: () => setConflict(null) }
}

export function useSeatTransfer(orgId: EntityId | null, sessionId: EntityId | null, workspaceId: EntityId | null) {
  const { api } = useSeatWorkbenchGateway()
  const invalidate = useInvalidateSeatQueries()
  const [conflict, setConflict] = useState(false)
  const mutation = useMutation({
    mutationFn: async (input: { toIdentityId: EntityId; expectedVersion: number }) => {
      if (orgId === null || sessionId === null || workspaceId === null) throw new Error('seat transfer requires scope')
      await api.transfer(orgId, sessionId, workspaceId, input)
    },
    onSettled: (_data, error) => {
      invalidate('sessions', 'detail')
      setConflict(isSeatApiError(error) && error.kind === 'conflict')
    },
  })
  return { ...mutation, conflict }
}

export function useSeatClose(orgId: EntityId | null, sessionId: EntityId | null, workspaceId: EntityId | null) {
  const { api } = useSeatWorkbenchGateway()
  const invalidate = useInvalidateSeatQueries()
  const [conflict, setConflict] = useState(false)
  const mutation = useMutation({
    mutationFn: async (input: { expectedVersion: number; reason?: string }) => {
      if (orgId === null || sessionId === null || workspaceId === null) throw new Error('seat close requires scope')
      await api.close(orgId, sessionId, workspaceId, input)
    },
    onSettled: (_data, error) => {
      invalidate('sessions', 'detail')
      setConflict(isSeatApiError(error) && error.kind === 'conflict')
    },
  })
  return { ...mutation, conflict }
}

// ---------------------------------------------------------------------------
// 详情 / 消息 / 发送（client_msg_id 幂等复用）/ 转接目标
// ---------------------------------------------------------------------------

/**
 * 详情（DF-9：query 必带 workspace_id——handler 级必填，缺失真实后端 422）。
 */
export function useSeatSessionDetail(
  orgId: EntityId | null,
  sessionId: EntityId | null,
  workspaceId: EntityId | null,
) {
  const { api } = useSeatWorkbenchGateway()
  return useQuery({
    queryKey: [SEAT_QUERY_ROOT_KEY, 'detail', orgId, sessionId, workspaceId],
    enabled: orgId !== null && sessionId !== null && workspaceId !== null,
    queryFn: () => api.fetchDetail(orgId as EntityId, sessionId as EntityId, workspaceId as EntityId),
  })
}

export function useSeatMessages(orgId: EntityId | null, conversationId: EntityId | null) {
  const { api } = useSeatWorkbenchGateway()
  return useQuery({
    queryKey: [SEAT_QUERY_ROOT_KEY, 'messages', conversationId],
    enabled: orgId !== null && conversationId !== null,
    queryFn: () => api.fetchMessages(orgId as EntityId, conversationId as EntityId, { limit: SEAT_MESSAGE_PAGE_LIMIT }),
  })
}

export type SeatSendState = {
  send: (_body: string) => void
  retry: () => void
  sending: boolean
  error: unknown
}

/**
 * 发送状态机：client_msg_id 在「草稿 → 成功」区间内复用——失败后 retry()
 * 用同一 id 重发（服务端同 id 幂等返回同一 message），成功后清空。
 * DF-9：真实合同（企业真源写路径）要求 workspace_id + 本人 identity_id
 * （缺失 identity_id 真链 500 identity_required）——二者来自坐席上下文 scope。
 */
export function useSeatSend(
  orgId: EntityId | null,
  conversationId: EntityId | null,
  workspaceId: EntityId | null,
  myIdentityId: EntityId | null,
): SeatSendState {
  const { api } = useSeatWorkbenchGateway()
  const invalidate = useInvalidateSeatQueries()
  const clientMsgIdRef = useRef<string | null>(null)
  const draftRef = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)

  const mutate = useCallback(
    (body: string, clientMsgId: string) => {
      if (orgId === null || conversationId === null || workspaceId === null || myIdentityId === null) {
        setSendError(new Error('seat send requires scope'))
        return
      }
      setPending(true)
      setSendError(null)
      api.sendMessage(orgId, conversationId, {
        body,
        clientMsgId,
        workspaceId,
        identityId: myIdentityId,
      })
        .then(() => {
          clientMsgIdRef.current = null
          draftRef.current = null
          invalidate('messages', 'sessions', 'detail')
        })
        .catch((error: unknown) => {
          // 失败保留 clientMsgIdRef：retry 复用同一 id（幂等合同）。
          if (isSeatUnauthorized(error)) useSeatAuthStore.getState().clearSession('unauthorized')
          setSendError(error)
        })
        .finally(() => setPending(false))
    },
    [api, orgId, conversationId, workspaceId, myIdentityId, invalidate],
  )

  const send = useCallback(
    (body: string) => {
      const trimmed = body.trim()
      if (trimmed.length === 0 || pending) return
      if (clientMsgIdRef.current === null) {
        clientMsgIdRef.current = `seat-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      }
      draftRef.current = trimmed
      mutate(trimmed, clientMsgIdRef.current)
    },
    [mutate, pending],
  )

  const retry = useCallback(() => {
    const draft = draftRef.current
    if (draft === null || pending) return
    // 幂等复用：不换 client_msg_id。
    mutate(draft, clientMsgIdRef.current ?? 'seat-web-empty')
  }, [mutate, pending])

  return { send, retry, sending: pending, error: sendError }
}

export function useSeatTransferTargets(orgId: EntityId | null, enabled: boolean) {
  const { api } = useSeatWorkbenchGateway()
  return useQuery({
    queryKey: [SEAT_QUERY_ROOT_KEY, 'transfer-targets', orgId],
    enabled: orgId !== null && enabled,
    queryFn: () => api.fetchTransferTargets(orgId as EntityId),
  })
}

// ---------------------------------------------------------------------------
// §3.6 事件流收敛：信封 → 权威刷新；resync → 全量；revocation → 写入口收回
// ---------------------------------------------------------------------------

export type SeatStreamState = {
  status: SeatEventStreamStatus
  /** seat.changed/assignment.changed revoked 或 403 关流后的写入口降级（立即生效）。 */
  writeRevoked: boolean
  retry: () => void
}

export function useSeatEventStream(organizationId: EntityId | null, workspaceId: EntityId | null): SeatStreamState {
  const { createStream } = useSeatWorkbenchGateway()
  const invalidate = useInvalidateSeatQueries()
  const [status, setStatus] = useState<SeatEventStreamStatus>('idle')
  const [writeRevoked, setWriteRevoked] = useState(false)

  const applyEnvelope = useCallback(
    (envelope: SeatSseEnvelope) => {
      // 信封不是业务真源：只按资源类型触发对应权威查询的失效刷新。
      if (envelope.resourceType === 'message') {
        invalidate('messages', 'detail', 'sessions')
        return
      }
      if (envelope.resourceType === 'queue' || envelope.resourceType === 'session') {
        invalidate('sessions', 'detail')
        return
      }
      // assignment/seat：撤权/停用事实变化 → 立即收回写入口并复核上下文。
      if (envelope.reason === 'revoked') setWriteRevoked(true)
      invalidate('contexts', 'sessions', 'detail')
    },
    [invalidate],
  )

  const handleEnded = useCallback(
    (reason: 'unauthorized' | 'forbidden') => {
      // 401 → 清会话回登录；403（suspend/offboarding/撤权）→ 降级可解释态。
      if (reason === 'unauthorized') {
        useSeatAuthStore.getState().clearSession('unauthorized')
        return
      }
      setWriteRevoked(true)
      invalidate('contexts')
    },
    [invalidate],
  )

  const streamRef = useRef<SeatEventStream | null>(null)
  const scopeKey = organizationId !== null && workspaceId !== null ? `${organizationId}:${workspaceId}` : null

  useEffect(() => {
    if (scopeKey === null || organizationId === null || workspaceId === null) return
    const stream = createStream({
      onEnvelope: applyEnvelope,
      // resync：游标已清空 → 全量权威刷新（去重器重置由流内部完成）。
      onResync: () => invalidate(),
      onStatus: setStatus,
      onEnded: handleEnded,
    })
    streamRef.current = stream
    stream.start({ organizationId, workspaceId })
    return () => {
      stream.stop()
      streamRef.current = null
    }
  }, [scopeKey, organizationId, workspaceId, createStream, applyEnvelope, invalidate, handleEnded])

  const retry = useCallback(() => {
    const current = streamRef.current
    if (current !== null) current.stop()
    setWriteRevoked(false)
    if (organizationId === null || workspaceId === null) return
    const stream = createStream({
      onEnvelope: applyEnvelope,
      onResync: () => invalidate(),
      onStatus: setStatus,
      onEnded: handleEnded,
    })
    streamRef.current = stream
    stream.start({ organizationId, workspaceId })
  }, [organizationId, workspaceId, createStream, applyEnvelope, invalidate, handleEnded])

  return { status, writeRevoked, retry }
}
