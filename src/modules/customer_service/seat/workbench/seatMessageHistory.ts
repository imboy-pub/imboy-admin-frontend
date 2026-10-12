import { useEffect, useMemo, useState } from 'react'
import { skipToken, useInfiniteQuery, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { isSeatApiError } from '../errors'
import type { EntityId } from '../types'
import type { SeatMessage } from './contract'
import { SEAT_MESSAGE_PAGE_LIMIT, type SeatWorkbenchApi } from './workbenchApi'

export type MessageHistoryScope = {
  api: SeatWorkbenchApi
  queryRoot: string
  authSessionId: string
  authStatus: 'anonymous' | 'authenticated'
  orgId: EntityId | null
  conversationId: EntityId | null
  workspaceId: EntityId | null
}
type MessageKeys = { message: QueryKey; history: QueryKey; revoked: QueryKey }
type ReadScope = MessageHistoryScope & { queryClient: QueryClient; keys: MessageKeys }

export function useSeatMessageHistory(input: MessageHistoryScope) {
  const queryClient = useQueryClient()
  const scope = useMemo(() => ({ ...input, queryClient, keys: messageKeys(input) }), [input, queryClient])
  const denied = useQuery<Error>({ queryKey: scope.keys.revoked, queryFn: skipToken, gcTime: Infinity })
  const readRevoked = denied.data !== undefined
  const query = useMessagePages(scope, readRevoked)
  const data = useHistorySnapshot(scope, query.data?.pages, readRevoked)
  const scopeId = JSON.stringify([input.authSessionId, input.orgId, input.conversationId, input.workspaceId])
  const older = useOlderAction(query, scopeId, readRevoked)
  return {
    ...query, ...older, data, error: denied.data ?? query.error, readRevoked,
    readAllowed: !readRevoked && input.authStatus === 'authenticated' && query.data?.pages !== undefined,
  }
}

function messageKeys(scope: MessageHistoryScope): MessageKeys {
  const dimensions = [scope.authSessionId, scope.orgId, scope.conversationId, scope.workspaceId]
  return {
    message: [scope.queryRoot, 'messages', ...dimensions],
    history: [scope.queryRoot, 'message-history', ...dimensions],
    revoked: [scope.queryRoot, 'message-read-revoked', ...dimensions],
  }
}

function useMessagePages(scope: ReadScope, revoked: boolean) {
  return useInfiniteQuery({
    queryKey: scope.keys.message,
    enabled: !revoked && scope.authStatus === 'authenticated' &&
      scope.orgId !== null && scope.conversationId !== null && scope.workspaceId !== null,
    initialPageParam: null as EntityId | null,
    queryFn: ({ pageParam, signal }) => readMessagePage(scope, pageParam, signal),
    getNextPageParam: nextOlderCursor,
  })
}

async function readMessagePage(scope: ReadScope, beforeId: EntityId | null, signal: AbortSignal) {
  const { queryClient, keys } = scope
  const denial = queryClient.getQueryData<Error>(keys.revoked)
  if (denial !== undefined) throw denial
  try {
    const rows = await scope.api.fetchMessages(
      scope.orgId as EntityId, scope.conversationId as EntityId, scope.workspaceId as EntityId, {
        limit: SEAT_MESSAGE_PAGE_LIMIT, order: 'desc',
        ...(beforeId === null ? {} : { beforeId }), signal,
      })
    const revokedAfter = queryClient.getQueryData<Error>(keys.revoked)
    if (revokedAfter !== undefined) throw revokedAfter
    if (signal.aborted) throw new DOMException('message read cancelled', 'AbortError')
    return rows
  } catch (error) {
    if (isSeatApiError(error) && (error.kind === 'unauthorized' || error.kind === 'forbidden')) {
      await revokeMessageScope(scope, error)
    }
    throw error
  }
}

async function revokeMessageScope({ queryClient, keys }: ReadScope, error: Error) {
  queryClient.setQueryData(keys.revoked, error)
  await queryClient.cancelQueries({ queryKey: keys.message, exact: true })
  queryClient.removeQueries({ queryKey: keys.message, exact: true })
  queryClient.removeQueries({ queryKey: keys.history, exact: true })
}

function useHistorySnapshot(scope: ReadScope, pages: SeatMessage[][] | undefined, revoked: boolean) {
  const { queryClient, keys } = scope
  const history = useQuery<SeatMessage[]>({ queryKey: keys.history, queryFn: skipToken })
  useEffect(() => {
    if (pages === undefined || queryClient.getQueryData(keys.revoked) !== undefined) return
    queryClient.setQueryData<SeatMessage[]>(keys.history, (previous = []) => mergeMessagePages(previous, pages))
  }, [queryClient, pages, keys])
  return useMemo(() => revoked || pages === undefined ? undefined :
    mergeMessagePages(history.data ?? [], pages), [revoked, pages, history.data])
}

function useOlderAction(query: ReturnType<typeof useMessagePages>, scope: string, revoked: boolean) {
  const [failure, setFailure] = useState<{ scope: string; error: unknown } | null>(null)
  return {
    hasOlderMessages: !revoked && query.hasNextPage,
    loadingOlder: query.isFetchingNextPage,
    olderError: query.isFetchNextPageError ? query.error : failure?.scope === scope ? failure.error : null,
    loadOlder: () => {
      if (!revoked && query.hasNextPage && !query.isFetching) {
        void query.fetchNextPage().then(
          ({ error }) => setFailure({ scope, error }),
          (error: unknown) => setFailure({ scope, error }),
        )
      }
    },
  }
}

function nextOlderCursor(lastPage: SeatMessage[]): EntityId | undefined {
  if (lastPage.length < SEAT_MESSAGE_PAGE_LIMIT) return undefined
  return lastPage.reduce((min, row) => BigInt(row.id) < BigInt(min) ? row.id : min, lastPage[0]!.id)
}

function mergeMessagePages(retained: SeatMessage[], pages: SeatMessage[][]): SeatMessage[] {
  const byId = new Map(retained.map((message) => [message.id, message]))
  // The newest page wins an overlap, including refreshed receipt projections.
  for (const page of [...pages].reverse()) for (const message of page) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
}
