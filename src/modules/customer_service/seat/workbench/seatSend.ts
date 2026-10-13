import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

function bodyValidationError(body: string): Error | null {
  if (/[\uD800-\uDFFF]/u.test(body)) return new Error('正文包含无效字符，请修改后发送')
  if (Array.from(body).length > 4000) return new Error('正文超过4000个Unicode码点，请分条发送')
  return null
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

async function querySendResult(
  api: SeatWorkbenchApi, scope: SendScope, attempt: SendAttempt, signal: AbortSignal, isActiveScope: () => boolean,
) {
  let afterId: EntityId | undefined
  for (let page = 0; page < 20; page += 1) {
    signal.throwIfAborted()
    if (!isActiveScope()) throw new Error('会话已切换，发送结果查询已停止')
    const messages = await api.fetchMessages(scope.orgId, scope.conversationId, scope.workspaceId, {
      ...(afterId === undefined ? {} : { afterId }), limit: SEAT_MESSAGE_PAGE_LIMIT,
    })
    signal.throwIfAborted()
    if (!isActiveScope()) throw new Error('会话已切换，发送结果查询已停止')
    if (messages.length === 0) break
    let cursor = BigInt(afterId ?? '0')
    for (const message of messages) {
      const messageId = BigInt(message.id)
      if (messageId <= cursor) throw new Error('消息分页游标未前进，发送结果仍未知')
      cursor = messageId
    }
    if (messages.some((message) => message.clientMsgId === attempt.clientMsgId
      && message.senderIdentityId === scope.myIdentityId)) return
    afterId = messages[messages.length - 1]!.id
  }
  throw new Error('发送结果仍未知；最多查询1000条，未命中不能证明未写入，请勿重复发送')
}

function useSendRevocation(
  prefix: string, writeRevoked: boolean, controllersRef: { current: Record<string, AbortController> },
  setEntries: React.Dispatch<React.SetStateAction<Record<string, SendEntry>>>,
  writablePrefixes: string[] | undefined,
) {
  const generations = useRef<Record<string, object>>({})
  const denied = useRef(new Set<string>())
  const generation = useMemo(() => ({ prefix, writeRevoked }), [prefix, writeRevoked])
  useLayoutEffect(() => {
    const isRevoked = (scopeKey: string) => (writeRevoked && scopeKey.startsWith(prefix)) ||
      (writablePrefixes !== undefined && !writablePrefixes.some((allowed) => scopeKey.startsWith(allowed)))
    generations.current = Object.fromEntries(Object.entries({ ...generations.current, [prefix]: generation })
      .filter(([scopeKey]) => !isRevoked(scopeKey)))
    if (!writeRevoked && writablePrefixes === undefined) return
    for (const [scopeKey, controller] of Object.entries(controllersRef.current)) {
      if (isRevoked(scopeKey)) controller.abort()
    }
    controllersRef.current = Object.fromEntries(Object.entries(controllersRef.current).filter(([scopeKey]) => !isRevoked(scopeKey)))
    denied.current = new Set([...denied.current].filter((scopeKey) => !isRevoked(scopeKey)))
    setEntries((previous) => Object.fromEntries(Object.entries(previous).filter(([scopeKey]) => !isRevoked(scopeKey))))
  }, [prefix, writeRevoked, generation, controllersRef, setEntries, writablePrefixes])
  const isWritable = useCallback(() => !writeRevoked && generation === generations.current[prefix],
    [prefix, writeRevoked, generation])
  return { isWritable, denied }
}

function useSendCache(key: string, prefix: string, writeRevoked: boolean, writablePrefixes: string[] | undefined) {
  const [entries, setEntries] = useState<Record<string, SendEntry>>({})
  const authState = useSeatAuthStore()
  const controllers = useRef<Record<string, AbortController>>({})
  const authEpoch = useRef(0)
  const mounted = useRef(true)
  const scopeEpoch = useRef(0)
  const { isWritable, denied } = useSendRevocation(prefix, writeRevoked, controllers, setEntries, writablePrefixes)
  useLayoutEffect(() => { scopeEpoch.current += 1 }, [key])
  useEffect(() => {
    mounted.current = true
    const abort = () => {
      authEpoch.current += 1
      for (const controller of Object.values(controllers.current)) controller.abort()
      controllers.current = {}
      denied.current.clear()
    }
    const unsubscribe = useSeatAuthStore.subscribe(() => { abort(); setEntries({}) })
    return () => { mounted.current = false; unsubscribe(); abort() }
  }, [denied])
  const isCurrent = useCallback(() => mounted.current && authState.status === 'authenticated'
    && useSeatAuthStore.getState() === authState && isWritable(), [authState, isWritable])
  const begin = useCallback((queryOnly: boolean) => {
    if (!isCurrent() || (!queryOnly && denied.current.has(key)) || controllers.current[key] !== undefined) return null
    const controller = new AbortController()
    controllers.current = { ...controllers.current, [key]: controller }
    return controller
  }, [isCurrent, key, denied])
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
      error: previous.attempt?.unknown || denied.current.has(key) ? previous.error : null,
    }))
  }, [isCurrent, key, updateEntry, denied])
  const finish = useCallback((scopeKey: string, epoch: number, controller: AbortController) => {
    if (controllers.current[scopeKey] === controller) {
      const { [scopeKey]: _finished, ...remaining } = controllers.current
      controllers.current = remaining
    }
    updateEntry(scopeKey, epoch, (previous) => ({ ...previous, pending: false }))
  }, [updateEntry])
  return { entry: entries[key] ?? EMPTY_ENTRY, authEpoch, scopeEpoch, denied, isCurrent, begin, updateEntry, edit, finish }
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
  if (isSeatApiError(error) && error.kind === 'forbidden' && !failed.unknown) cache.denied.current.add(key)
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
  const scopeEpoch = cache.scopeEpoch.current
  let attempt = initial
  let messageStarted = false
  try {
    if (attempt.unknown) await querySendResult(api, scope, attempt, controller.signal,
      () => cache.scopeEpoch.current === scopeEpoch)
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
    if (!controller.signal.aborted) handleSendFailure(cache, key, epoch, attempt, messageStarted, error)
  } finally {
    if (!controller.signal.aborted) cache.finish(key, epoch, controller)
  }
}

export function useSeatSendState({
  api, authSessionId, orgId, conversationId, workspaceId, myIdentityId, invalidate, writeRevoked = false, writablePrefixes,
}: {
  api: SeatWorkbenchApi
  authSessionId: string
  orgId: EntityId | null
  conversationId: EntityId | null
  workspaceId: EntityId | null
  myIdentityId: EntityId | null
  writeRevoked?: boolean
  writablePrefixes?: string[]
  invalidate: (..._subKeys: ('messages' | 'sessions' | 'detail')[]) => void
}) {
  const prefix = `${JSON.stringify([authSessionId, orgId, workspaceId, myIdentityId]).slice(0, -1)},`
  const [lastPrefix, setLastPrefix] = useState(prefix)
  const hasScope = orgId !== null && workspaceId !== null && myIdentityId !== null
  if (hasScope && lastPrefix !== prefix) setLastPrefix(prefix)
  const key = JSON.stringify([authSessionId, orgId, workspaceId, myIdentityId, conversationId])
  const cache = useSendCache(key, hasScope ? prefix : lastPrefix, writeRevoked, writablePrefixes)
  const { entry, edit, isCurrent, updateEntry } = cache
  const send = useCallback(() => {
    if (!isCurrent()) return
    const epoch = cache.authEpoch.current
    if (orgId === null || conversationId === null || workspaceId === null || myIdentityId === null) {
      updateEntry(key, epoch, (previous) => ({ ...previous, error: new Error('seat send requires scope') }))
      return
    }
    const draft = { ...entry.draft, body: entry.draft.body.trim() }
    if (entry.attempt?.unknown !== true) {
      const error = bodyValidationError(draft.body)
      if (error !== null) {
        updateEntry(key, epoch, (previous) => ({ ...previous, error }))
        return
      }
    }
    const attempt = entry.attempt ?? { draft, revision: entry.revision, clientMsgId: newClientMsgId(), unknown: false }
    if (!attempt.unknown && draft.body.length === 0 && draft.file === null) return
    const controller = cache.begin(attempt.unknown)
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
