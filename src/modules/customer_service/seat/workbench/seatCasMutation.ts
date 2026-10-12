import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient, type UseMutationResult, type MutateOptions } from '@tanstack/react-query'
import { useSeatAuthStore } from '../seatAuthStore'
import { isSeatApiError } from '../errors'
import type { EntityId } from '../types'
import type { SeatWorkbenchApi } from './workbenchApi'

type Input = { expectedVersion: number; sessionId?: EntityId }
type CasScope = { api: SeatWorkbenchApi; authSessionId: string; orgId: EntityId | null; workspaceId: EntityId | null; sessionId: EntityId | null }
type Packet<I, R> = { input: I; sessionId: EntityId; scope: object; execute: () => Promise<R>; active: () => boolean }

/** Three Seat CAS actions share dispatch custody and scope-local result projection. */
export function useSeatCasMutation<I extends Input, R>(scope: CasScope, execute: (_input: I) => Promise<R>) {
  const auth = useSeatAuthStore()
  const queryClient = useQueryClient()
  const { api, authSessionId, orgId, workspaceId, sessionId } = scope
  const origin = useMemo(() => ({ api, authSessionId, orgId, workspaceId, sessionId, auth }), [api, authSessionId, orgId, workspaceId, sessionId, auth])
  const current = useRef<typeof origin | null>(origin)
  useLayoutEffect(() => { current.current = origin; return () => { current.current = null } }, [origin])
  const active = useCallback(() => current.current === origin && useSeatAuthStore.getState() === auth && auth.status === 'authenticated', [origin, auth])
  const [dismissed, setDismissed] = useState<object>()
  const mutation = useMutation<R, Error, Packet<I, R>>({
    mutationKey: ['seat-workbench', 'cas', scope.authSessionId, scope.orgId, scope.workspaceId, scope.sessionId],
    retry: false,
    mutationFn: async (packet) => {
      if (!packet.active()) throw new Error('Seat CAS scope changed before dispatch')
      return packet.execute()
    },
    onSettled: (_data, _error, packet) => {
      if (!packet.active()) return
      void queryClient.invalidateQueries({ predicate: ({ queryKey: key }) => {
        if (key[0] !== 'seat-workbench' || key[2] !== origin.orgId) return false
        if (key[1] === 'sessions') return key[3] === origin.workspaceId && key[key.length - 1] === origin.authSessionId
        return key[1] === 'detail' && key[3] === packet.sessionId && key[4] === origin.workspaceId
      } })
    },
  })
  const actions = useCasActions(origin, active, execute, mutation)
  const visible = mutation.variables?.scope === origin
  const result = visible ? mutation : { ...mutation, status: 'idle' as const, isIdle: true, isPending: false, isError: false, isSuccess: false, isPaused: false, data: undefined, error: null, variables: undefined, failureCount: 0, failureReason: null, submittedAt: 0 }
  return {
    ...result, variables: visible ? mutation.variables?.input : undefined, ...actions,
    reset: () => { if (active()) mutation.reset() },
    conflict: visible && mutation.variables !== dismissed && isSeatApiError(mutation.error) && mutation.error.kind === 'conflict',
    clearConflict: () => setDismissed(mutation.variables),
  }
}

function useCasActions<I extends Input, R>(
  origin: CasScope & { auth: ReturnType<typeof useSeatAuthStore.getState> },
  active: () => boolean, execute: (_input: I) => Promise<R>,
  mutation: UseMutationResult<R, Error, Packet<I, R>>,
) {
  const inFlight = useRef(new WeakMap<object, Set<EntityId>>())
  const packet = useCallback((input: I): Packet<I, R> => {
    if (!active() || origin.orgId === null || origin.workspaceId === null) throw new Error('Seat CAS requires current scope')
    const frozen = { ...input }
    const sessionId = origin.sessionId ?? frozen.sessionId
    if (sessionId === undefined) throw new Error('Seat CAS requires session')
    return { input: frozen, sessionId, scope: origin, active, execute: () => execute(frozen) }
  }, [active, origin, execute])
  const dispatch = mutation.mutateAsync
  const mutateAsync = useCallback(async (input: I, callbacks?: MutateOptions<R, Error, I>) => {
    const item = packet(input)
    const busy = inFlight.current.get(item.scope) ?? new Set<EntityId>()
    if (busy.has(item.sessionId)) throw new Error('Seat CAS session already pending')
    busy.add(item.sessionId)
    inFlight.current.set(item.scope, busy)
    try {
      return await dispatch(item, safeCallbacks(item, callbacks))
    } finally {
      busy.delete(item.sessionId)
    }
  }, [packet, dispatch])
  const mutate = useCallback((input: I, callbacks?: MutateOptions<R, Error, I>) => {
    void mutateAsync(input, callbacks).catch(() => {})
  }, [mutateAsync])
  return { mutate, mutateAsync }
}

function safeCallbacks<I, R>(item: Packet<I, R>, callbacks?: MutateOptions<R, Error, I>) {
  return {
    onSuccess: (data: R, _variables: Packet<I, R>, context: unknown, mutationContext: Parameters<NonNullable<MutateOptions<R, Error, I>['onSuccess']>>[3]) => {
      if (item.active()) callbacks?.onSuccess?.(data, item.input, context, mutationContext)
    },
    onError: (error: Error, _variables: Packet<I, R>, context: unknown, mutationContext: Parameters<NonNullable<MutateOptions<R, Error, I>['onError']>>[3]) => {
      if (item.active()) callbacks?.onError?.(error, item.input, context, mutationContext)
    },
    onSettled: (data: R | undefined, error: Error | null, _variables: Packet<I, R>, context: unknown, mutationContext: Parameters<NonNullable<MutateOptions<R, Error, I>['onSettled']>>[4]) => {
      if (item.active()) callbacks?.onSettled?.(data, error, item.input, context, mutationContext)
    },
  }
}
