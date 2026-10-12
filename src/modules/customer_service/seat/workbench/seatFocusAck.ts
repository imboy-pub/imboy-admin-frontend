import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntityId } from '../types'
import type { SeatWorkbenchApi } from './workbenchApi'

export type FocusAckScope = {
  api: SeatWorkbenchApi
  authSessionId: string
  authStatus: 'anonymous' | 'authenticated'
  orgId: EntityId | null
  workspaceId: EntityId | null
  sessionId: EntityId | null
  readAllowed: boolean
}
type AckState = { scope: string; error: unknown; pending: boolean }
type AckGeneration = { target: EntityId | null; run: () => Promise<void>; dispose: () => void }

export function useSeatVisibleAck(scope: FocusAckScope, visibleMessageId: EntityId | null) {
  const key = JSON.stringify([scope.authSessionId, scope.orgId, scope.workspaceId,
    scope.sessionId, scope.authStatus, scope.readAllowed])
  const [state, setState] = useState<AckState>({ scope: '', error: null, pending: false })
  const generationRef = useRef<AckGeneration | null>(null)
  useEffect(() => {
    const generation = createAckGeneration(scope, key, setState)
    generationRef.current = generation
    const unsubscribe = subscribeReadiness(generation.run)
    return () => {
      generation.dispose()
      if (generationRef.current === generation) generationRef.current = null
      unsubscribe()
    }
  }, [scope, key])
  useEffect(() => {
    const generation = generationRef.current
    if (generation !== null) {
      generation.target = visibleMessageId
      void generation.run()
    }
  }, [scope, key, visibleMessageId])
  const retry = useCallback(() => { void generationRef.current?.run() }, [])
  return { error: state.scope === key ? state.error : null,
    isPending: state.scope === key && state.pending, retry }
}

function createAckGeneration(scope: FocusAckScope, key: string, publish: (_state: AckState) => void): AckGeneration {
  let active = true, pending = false
  let successful: EntityId | null = null
  const generation: AckGeneration = {
    target: null, run: async () => {}, dispose: () => { active = false },
  }
  generation.run = async () => {
    const target = generation.target
    if (!active || pending || !mayAcknowledge(scope, target, successful)) return
    pending = true
    publish({ scope: key, error: null, pending: true })
    try {
      await scope.api.ackRead(scope.orgId as EntityId, scope.workspaceId as EntityId,
        scope.sessionId as EntityId, target as EntityId)
      if (active) {
        successful = target
        publish({ scope: key, error: null, pending: false })
      }
    } catch (error) {
      if (active) publish({ scope: key, error, pending: false })
    } finally {
      pending = false
      if (active && generation.target !== target) void generation.run()
    }
  }
  return generation
}

function mayAcknowledge(scope: FocusAckScope, target: EntityId | null, successful: EntityId | null) {
  return scope.readAllowed === true && scope.authStatus === 'authenticated' &&
    scope.orgId !== null && scope.workspaceId !== null && scope.sessionId !== null &&
    target !== null && /^[1-9]\d*$/.test(target) &&
    typeof document !== 'undefined' && document.visibilityState === 'visible' &&
    document.hasFocus() && (typeof navigator === 'undefined' || navigator.onLine !== false) &&
    (successful === null || BigInt(target) > BigInt(successful))
}

function subscribeReadiness(run: () => Promise<void>) {
  const attempt = () => { void run() }
  document.addEventListener('visibilitychange', attempt)
  window.addEventListener('focus', attempt)
  window.addEventListener('online', attempt)
  return () => {
    document.removeEventListener('visibilitychange', attempt)
    window.removeEventListener('focus', attempt)
    window.removeEventListener('online', attempt)
  }
}
