import { useCallback, useEffect, useRef, useState } from 'react'
import { isSeatApiError } from '../errors'
import { useSeatAuthStore } from '../seatAuthStore'
import type { EntityId } from '../types'
import { runSeatAttachmentUpload } from './attachmentUpload'
import { SEAT_MESSAGE_PAGE_LIMIT, type SeatWorkbenchApi } from './workbenchApi'

type SeatSendDraft = {
  body: string
  file: File | null
  objectHash: string | null
  confirmedAssetId: EntityId | null
}

type SendAttempt = {
  draft: SeatSendDraft
  revision: number
  clientMsgId: string
  unknown: boolean
}

type SendEntry = {
  draft: SeatSendDraft
  revision: number
  attempt: SendAttempt | null
  pending: boolean
  error: unknown
}

type SendScope = {
  orgId: EntityId
  conversationId: EntityId
  workspaceId: EntityId
  myIdentityId: EntityId
}

const EMPTY_DRAFT: SeatSendDraft = { body: '', file: null, objectHash: null, confirmedAssetId: null }
const EMPTY_ENTRY: SendEntry = { draft: EMPTY_DRAFT, revision: 0, attempt: null, pending: false, error: null }

function newClientMsgId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `seat-web-${globalThis.crypto.randomUUID()}`
  return `seat-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function mayHaveCommitted(error: unknown): boolean {
  return !isSeatApiError(error) || ['network', 'server', 'invalid_response'].includes(error.kind)
}

async function uploadDraft(
  api: SeatWorkbenchApi, scope: SendScope, draft: SeatSendDraft, signal: AbortSignal,
): Promise<SeatSendDraft> {
  if (draft.file === null || draft.confirmedAssetId !== null) return draft
  const uploaded = await runSeatAttachmentUpload({
    api, ...scope, file: draft.file, fileName: draft.file.name, objectHash: draft.objectHash, signal,
  })
  signal.throwIfAborted()
  return { ...draft, objectHash: uploaded.objectHash, confirmedAssetId: uploaded.assetId }
}

async function querySendResult(api: SeatWorkbenchApi, scope: SendScope, attempt: SendAttempt, signal: AbortSignal) {
  const messages = await api.fetchMessages(scope.orgId, scope.conversationId, scope.workspaceId, {
    limit: SEAT_MESSAGE_PAGE_LIMIT,
  })
  signal.throwIfAborted()
  if (!messages.some((message) => message.clientMsgId === attempt.clientMsgId
    && message.senderIdentityId === scope.myIdentityId)) {
    throw new Error('发送结果仍未知；有限消息页未命中不能证明未写入，请稍后查询，勿重复发送')
  }
}

function useSendCache(key: string) {
  const [entries, setEntries] = useState<Record<string, SendEntry>>({})
  const authState = useSeatAuthStore()
  const controllers = useRef<Record<string, AbortController>>({})
  const authEpoch = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const abort = () => {
      authEpoch.current += 1
      for (const controller of Object.values(controllers.current)) controller.abort()
      controllers.current = {}
    }
    const unsubscribe = useSeatAuthStore.subscribe(() => { abort(); setEntries({}) })
    return () => { mounted.current = false; unsubscribe(); abort() }
  }, [])
  const isCurrent = useCallback(() => mounted.current && authState.status === 'authenticated'
    && useSeatAuthStore.getState() === authState, [authState])
  const begin = useCallback(() => {
    if (!isCurrent() || controllers.current[key] !== undefined) return null
    const controller = new AbortController()
    controllers.current = { ...controllers.current, [key]: controller }
    return controller
  }, [isCurrent, key])
  const updateEntry = useCallback((scopeKey: string, epoch: number, update: (_entry: SendEntry) => SendEntry) => {
    if (epoch !== authEpoch.current || !mounted.current) return
    setEntries((previous) => epoch === authEpoch.current
      ? { ...previous, [scopeKey]: update(previous[scopeKey] ?? EMPTY_ENTRY) } : previous)
  }, [])
  const edit = useCallback((update: (_draft: SeatSendDraft) => SeatSendDraft) => {
    if (!isCurrent()) return
    updateEntry(key, authEpoch.current, (previous) => ({
      ...previous, draft: update(previous.draft), revision: previous.revision + 1,
      attempt: previous.attempt?.unknown ? previous.attempt : null,
      error: previous.attempt?.unknown ? previous.error : null,
    }))
  }, [isCurrent, key, updateEntry])
  const finish = useCallback((scopeKey: string, epoch: number, controller: AbortController) => {
    if (controllers.current[scopeKey] === controller) {
      const { [scopeKey]: _finished, ...remaining } = controllers.current
      controllers.current = remaining
    }
    updateEntry(scopeKey, epoch, (previous) => ({ ...previous, pending: false }))
  }, [updateEntry])
  return { entry: entries[key] ?? EMPTY_ENTRY, authEpoch, isCurrent, begin, updateEntry, edit, finish }
}

type SendCache = ReturnType<typeof useSendCache>

function withConfirmedDraft(previous: SendEntry, attempt: SendAttempt): SendEntry {
  const draft = attempt.draft
  return {
    ...previous, attempt: previous.revision === attempt.revision ? attempt : previous.attempt,
    draft: previous.draft.file === draft.file
      ? { ...previous.draft, objectHash: draft.objectHash, confirmedAssetId: draft.confirmedAssetId } : previous.draft,
  }
}

function handleSendFailure(cache: SendCache, key: string, epoch: number, attempt: SendAttempt, messageStarted: boolean, error: unknown) {
  if (epoch !== cache.authEpoch.current) return
  if (isSeatApiError(error) && error.kind === 'unauthorized') {
    useSeatAuthStore.getState().clearSession('unauthorized')
    return
  }
  const failed = { ...attempt, unknown: attempt.unknown || (messageStarted && mayHaveCommitted(error)) }
  cache.updateEntry(key, epoch, (previous) => ({
    ...previous, attempt: failed.unknown || previous.revision === failed.revision ? failed : previous.attempt,
    error: failed.unknown || previous.revision === failed.revision ? error : previous.error,
  }))
}

async function runSend(
  api: SeatWorkbenchApi, scope: SendScope, initial: SendAttempt, controller: AbortController,
  cache: SendCache, key: string, invalidate: (..._subKeys: ('messages' | 'sessions' | 'detail')[]) => void,
) {
  const epoch = cache.authEpoch.current
  let attempt = initial
  let messageStarted = false
  try {
    if (attempt.unknown) await querySendResult(api, scope, attempt, controller.signal)
    else {
      const draft = attempt.draft.file !== null && attempt.draft.confirmedAssetId === null
        ? await uploadDraft(api, scope, attempt.draft, controller.signal) : attempt.draft
      attempt = { ...attempt, draft }
      controller.signal.throwIfAborted()
      const confirmed = attempt
      cache.updateEntry(key, epoch, (previous) => withConfirmedDraft(previous, confirmed))
      messageStarted = true
      await api.sendMessage(scope.orgId, scope.conversationId, {
        body: draft.body, clientMsgId: attempt.clientMsgId, workspaceId: scope.workspaceId,
        identityId: scope.myIdentityId, assetIds: draft.confirmedAssetId === null ? [] : [draft.confirmedAssetId],
      })
      controller.signal.throwIfAborted()
    }
    const completed = attempt
    cache.updateEntry(key, epoch, (previous) => ({
      ...previous, draft: previous.revision === completed.revision ? EMPTY_DRAFT : previous.draft,
      attempt: null, error: null,
    }))
    if (epoch === cache.authEpoch.current) invalidate('messages', 'sessions', 'detail')
  } catch (error: unknown) {
    handleSendFailure(cache, key, epoch, attempt, messageStarted, error)
  } finally {
    cache.finish(key, epoch, controller)
  }
}

export function useSeatSendState({
  api, authSessionId, orgId, conversationId, workspaceId, myIdentityId, invalidate,
}: {
  api: SeatWorkbenchApi
  authSessionId: string
  orgId: EntityId | null
  conversationId: EntityId | null
  workspaceId: EntityId | null
  myIdentityId: EntityId | null
  invalidate: (..._subKeys: ('messages' | 'sessions' | 'detail')[]) => void
}) {
  const key = JSON.stringify([authSessionId, orgId, workspaceId, conversationId, myIdentityId])
  const cache = useSendCache(key)
  const { entry, edit, isCurrent, updateEntry } = cache
  const send = useCallback(() => {
    if (!isCurrent()) return
    const epoch = cache.authEpoch.current
    if (orgId === null || conversationId === null || workspaceId === null || myIdentityId === null) {
      updateEntry(key, epoch, (previous) => ({ ...previous, error: new Error('seat send requires scope') }))
      return
    }
    const draft = { ...entry.draft, body: entry.draft.body.trim() }
    const attempt = entry.attempt ?? { draft, revision: entry.revision, clientMsgId: newClientMsgId(), unknown: false }
    if (!attempt.unknown && draft.body.length === 0 && draft.file === null) return
    const controller = cache.begin()
    if (controller === null) return
    updateEntry(key, epoch, (previous) => ({
      ...previous, draft: attempt.unknown ? previous.draft : draft, attempt, pending: true,
      error: attempt.unknown ? previous.error : null,
    }))
    void runSend(api, { orgId, conversationId, workspaceId, myIdentityId }, attempt, controller, cache, key, invalidate)
  }, [api, cache, conversationId, entry, invalidate, isCurrent, key, myIdentityId, orgId, updateEntry, workspaceId])
  return {
    draft: { body: entry.draft.body, fileName: entry.draft.file?.name ?? null, fileSize: entry.draft.file?.size ?? null },
    updateDraftBody: (body: string) => edit((draft) => ({ ...draft, body })),
    attachFile: (file: File) => edit((draft) => ({ ...draft, file, objectHash: null, confirmedAssetId: null })),
    detachFile: () => edit((draft) => ({ ...draft, file: null, objectHash: null, confirmedAssetId: null })),
    send, retry: send, sending: entry.pending, error: entry.error, outcomeUnknown: entry.attempt?.unknown ?? false,
  }
}
