import '../../../../test/setupDom'
import { afterEach, expect, it, mock, spyOn } from 'bun:test'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { SeatApiClient } from '../seatApiClient'
import { SeatApiError } from '../errors'
import { useSeatAuthStore } from '../seatAuthStore'
import type { SeatMessage } from './contract'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatWorkbenchProvider, useSeatFocusAck, useSeatMessages } from './workbenchHooks'

const BASE = 72057594037928000n
const id = (n: number) => String(BASE + BigInt(n))
const message = (n: number): SeatMessage => ({
  id: id(n), senderType: 'contact', senderContactId: id(500), senderIdentityId: null,
  clientMsgId: null, body: 'message ' + n, createdAt: null, readAt: null, attachments: [],
})
const clients: QueryClient[] = []
const restorers: (() => void)[] = []
function getter(object: object, key: string, value: () => unknown) {
  const previous = Object.getOwnPropertyDescriptor(object, key)
  Object.defineProperty(object, key, { configurable: true, get: value })
  restorers.push(() => previous ? Object.defineProperty(object, key, previous) : Reflect.deleteProperty(object, key))
}
function harness() {
  useSeatAuthStore.getState().setSession(id(900))
  const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl: mock(async () => {
    throw new Error('unit test must not use transport')
  }) }) })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  clients.push(qc)
  const gateway = { api, createStream: mock(() => { throw new Error('no live SSE') }) }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider></QueryClientProvider>
  )
  return { api, qc, wrapper }
}
function deferred() {
  let resolve!: () => void
  let reject!: (_error: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => {
  cleanup(); clients.splice(0).forEach((q) => q.clear()); mock.restore(); restorers.splice(0).reverse().forEach((restore) => restore())
  useSeatAuthStore.getState().clearSession('logout')
})

it('loads 200 messages in four bounded 50 pages; ascending unique history survives latest refresh', async () => {
  const { api, wrapper } = harness()
  let source = Array.from({ length: 200 }, (_, n) => message(n + 1))
  const fetch = spyOn(api, 'fetchMessages').mockImplementation(async (_org, _conv, _ws, query) =>
    source.filter((m) => !query?.beforeId || BigInt(m.id) < BigInt(query.beforeId))
      .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, query?.limit ?? 50))
  const view = renderHook(() => useSeatMessages(id(901), id(902), id(903)), { wrapper })
  await waitFor(() => expect(view.result.current.data?.length).toBe(50))
  for (let n = 2; n <= 4; n++) {
    act(() => view.result.current.loadOlder())
    await waitFor(() => expect(view.result.current.data?.length).toBe(n * 50))
  }
  expect(fetch.mock.calls.length).toBe(4)
  expect(fetch.mock.calls.map((c) => ({ limit: c[3]?.limit, order: c[3]?.order, ...(c[3]?.beforeId ? { beforeId: c[3].beforeId } : {}) }))).toEqual([
    { limit: 50, order: 'desc' }, { limit: 50, order: 'desc', beforeId: id(151) },
    { limit: 50, order: 'desc', beforeId: id(101) }, { limit: 50, order: 'desc', beforeId: id(51) },
  ])
  expect(view.result.current.data?.map((m) => m.id)).toEqual(Array.from({ length: 200 }, (_, n) => id(n + 1)))
  source = [...source, message(201)]
  source[199] = { ...message(200), readAt: 123 }
  await act(async () => { await view.result.current.refetch() })
  await waitFor(() => expect(view.result.current.data?.length).toBe(201))
  expect(view.result.current.data?.[0]?.id).toBe(id(1))
  expect(view.result.current.data?.find((m) => m.id === id(200))?.readAt).toBe(123)
})

it('message caches and pending responses are isolated across organization, workspace and auth generation', async () => {
  const { api, wrapper, qc } = harness()
  spyOn(api, 'fetchMessages').mockImplementation(async (org) => [{ ...message(1), body: org }])
  const view = renderHook(({ org, ws }) => useSeatMessages(org, id(902), ws), {
    wrapper, initialProps: { org: id(901), ws: id(903) },
  })
  await waitFor(() => expect(view.result.current.data?.[0]?.body).toBe(id(901)))
  act(() => view.rerender({ org: id(904), ws: id(903) }))
  await waitFor(() => expect(view.result.current.data?.[0]?.body).toBe(id(904)))
  act(() => view.rerender({ org: id(904), ws: id(905) }))
  await waitFor(() => expect(view.result.current.data?.[0]?.body).toBe(id(904)))
  const keys = qc.getQueryCache().getAll().map((q) => q.queryKey)
  expect(keys.filter((key) => key.includes('messages')).length).toBe(3)
  expect(keys.every((key) => key.includes(id(902)) && key.some((v) => typeof v === 'string' && v.includes(':')))).toBe(true)
  act(() => useSeatAuthStore.getState().setSession(id(906)))
  await waitFor(() => expect(qc.getQueryCache().getAll().filter((q) => q.queryKey.includes('messages')).length).toBe(1))
})

it('ACK requires visible focused online page, auto advances visible target, and retry catches failure', async () => {
  const { api, wrapper } = harness()
  let visible = false, focused = true, online = true
  getter(document, 'visibilityState', () => visible ? 'visible' : 'hidden')
  spyOn(document, 'hasFocus').mockImplementation(() => focused)
  getter(navigator, 'onLine', () => online)
  const ack = spyOn(api, 'ackRead').mockResolvedValue(undefined)
  const view = renderHook(({ target }) => useSeatFocusAck(id(901), id(903), id(907), {
    visibleMessageId: target, readAllowed: true,
  }), { wrapper, initialProps: { target: id(10) as string | null } })
  await act(async () => {})
  expect(ack.mock.calls.length).toBe(0)
  visible = true; focused = false
  act(() => window.dispatchEvent(new Event('focus')))
  expect(ack.mock.calls.length).toBe(0)
  focused = true; online = false
  act(() => window.dispatchEvent(new Event('focus')))
  expect(ack.mock.calls.length).toBe(0)
  online = true
  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(ack.mock.calls.length).toBe(1))
  ack.mockRejectedValueOnce(new Error('explicit failure'))
  view.rerender({ target: id(11) })
  await waitFor(() => expect(view.result.current.error).toBeInstanceOf(Error))
  act(() => view.result.current.retry())
  await waitFor(() => expect(view.result.current.error).toBeNull())
  expect(ack.mock.calls.map((c) => c[3])).toEqual([id(10), id(11), id(11)])
  view.rerender({ target: id(9) })
  await act(async () => {})
  expect(ack.mock.calls.length).toBe(3)
})

it('late ACK A cannot advance or fail B; lower visible IDs in B and new auth generation remain eligible', async () => {
  const { api, wrapper } = harness()
  getter(document, 'visibilityState', () => 'visible')
  spyOn(document, 'hasFocus').mockReturnValue(true)
  getter(navigator, 'onLine', () => true)
  const old = deferred()
  const ack = spyOn(api, 'ackRead').mockImplementationOnce(() => old.promise).mockResolvedValue(undefined)
  const view = renderHook(({ session, target }) => useSeatFocusAck(id(901), id(903), session, {
    visibleMessageId: target, readAllowed: true,
  }), { wrapper, initialProps: { session: id(907), target: id(190) } })
  await waitFor(() => expect(ack.mock.calls.length).toBe(1))
  view.rerender({ session: id(908), target: id(2) })
  await waitFor(() => expect(ack.mock.calls.length).toBe(2))
  await act(async () => old.reject(new Error('old scope failure')))
  expect(view.result.current.error).toBeNull()
  view.rerender({ session: id(908), target: id(3) })
  await waitFor(() => expect(ack.mock.calls.length).toBe(3))
  act(() => useSeatAuthStore.getState().setSession(id(909)))
  await waitFor(() => expect(ack.mock.calls.length).toBe(4))
  expect(ack.mock.calls.map((c) => [c[2], c[3]])).toEqual([
    [id(907), id(190)], [id(908), id(2)], [id(908), id(3)], [id(908), id(3)],
  ])
})

it('older page failure is reported without discarding data and an explicit load can retry', async () => {
  const { api, wrapper } = harness()
  const source = Array.from({ length: 100 }, (_, n) => message(n + 1))
  let fail = true
  spyOn(api, 'fetchMessages').mockImplementation(async (_org, _conv, _ws, q) => {
    if (q?.beforeId && fail) { fail = false; throw new Error('older unavailable') }
    return source.filter((m) => !q?.beforeId || BigInt(m.id) < BigInt(q.beforeId))
      .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 50)
  })
  const view = renderHook(() => useSeatMessages(id(901), id(902), id(903)), { wrapper })
  await waitFor(() => expect(view.result.current.data?.length).toBe(50))
  act(() => view.result.current.loadOlder())
  await waitFor(() => expect(view.result.current.olderError).toBeInstanceOf(Error))
  expect(view.result.current.data?.length).toBe(50)
  act(() => view.result.current.loadOlder())
  await waitFor(() => expect(view.result.current.data?.length).toBe(100))
  expect(view.result.current.olderError).toBeNull()
})

it('a late old scope message response cannot enter the selected conversation', async () => {
  const { api, wrapper } = harness()
  let resolve!: (_rows: SeatMessage[]) => void
  const pending = new Promise<SeatMessage[]>((yes) => { resolve = yes })
  spyOn(api, 'fetchMessages').mockImplementation(async (_org, conv) => conv === id(902) ? pending : [message(2)])
  const view = renderHook(({ conv }) => useSeatMessages(id(901), conv, id(903)), {
    wrapper, initialProps: { conv: id(902) },
  })
  view.rerender({ conv: id(904) })
  await waitFor(() => expect(view.result.current.data?.[0]?.id).toBe(id(2)))
  await act(async () => resolve([message(190)]))
  expect(view.result.current.data?.map((m) => m.id)).toEqual([id(2)])
})

for (const kind of ['forbidden', 'unauthorized'] as const) {
  it(kind + ' revokes only this message scope, erases body caches and prevents refetch/ACK until reauthentication', async () => {
    const { api, wrapper, qc } = harness()
    getter(document, 'visibilityState', () => 'visible')
    spyOn(document, 'hasFocus').mockReturnValue(true)
    getter(navigator, 'onLine', () => true)
    let denied = false
    const fetch = spyOn(api, 'fetchMessages').mockImplementation(async () => {
      if (denied) throw new SeatApiError(kind, 'permission denied', { status: kind === 'forbidden' ? 403 : 401 })
      return [{ ...message(1), body: 'PRIVATE BODY' }]
    })
    const ack = spyOn(api, 'ackRead').mockResolvedValue(undefined)
    const view = renderHook(({ target }) => {
      const messages = useSeatMessages(id(901), id(902), id(903))
      const acknowledgment = useSeatFocusAck(id(901), id(903), id(907), {
        visibleMessageId: target, readAllowed: messages.readAllowed,
      })
      return { messages, acknowledgment }
    }, { wrapper, initialProps: { target: id(1) } })
    await waitFor(() => expect(view.result.current.messages.data?.[0]?.body).toBe('PRIVATE BODY'))
    await waitFor(() => expect(ack.mock.calls.length).toBe(1))
    denied = true
    await act(async () => { await view.result.current.messages.refetch() })
    await waitFor(() => expect(view.result.current.messages.readRevoked).toBe(true))
    expect(view.result.current.messages.readAllowed).toBe(false)
    expect(view.result.current.messages.data).toBeUndefined()
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('PRIVATE BODY')
    const count = fetch.mock.calls.length
    denied = false
    await act(async () => { await view.result.current.messages.refetch() })
    expect(fetch.mock.calls.length).toBe(count)
    view.rerender({ target: id(2) })
    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {})
    expect(ack.mock.calls.length).toBe(1)
    act(() => useSeatAuthStore.getState().setSession(id(910)))
    await waitFor(() => expect(view.result.current.messages.readAllowed).toBe(true))
    expect(view.result.current.messages.data?.[0]?.body).toBe('PRIVATE BODY')
  })
}

it('network and server refresh failure keep previously authorized history without revocation', async () => {
  const { api, wrapper } = harness()
  const fetch = spyOn(api, 'fetchMessages').mockResolvedValue([message(1)])
  const view = renderHook(() => useSeatMessages(id(901), id(902), id(903)), { wrapper })
  await waitFor(() => expect(view.result.current.data?.length).toBe(1))
  for (const kind of ['network', 'server'] as const) {
    fetch.mockRejectedValueOnce(new SeatApiError(kind, 'temporary failure'))
    await act(async () => { await view.result.current.refetch() })
    expect(view.result.current.data?.length).toBe(1)
    expect(view.result.current.readRevoked).toBe(false)
    expect(view.result.current.readAllowed).toBe(true)
  }
})

it('a late older success cannot refill a denied scope; adjacent conversation retains its authorized body', async () => {
  const { api, wrapper, qc } = harness()
  let denied = false, resolve!: (_rows: SeatMessage[]) => void
  const old = new Promise<SeatMessage[]>((yes) => { resolve = yes })
  spyOn(api, 'fetchMessages').mockImplementation(async (_org, conv, _ws, query) => {
    if (conv === id(904)) return [{ ...message(2), body: 'OTHER AUTHORIZED' }]
    if (query?.beforeId) return old
    if (denied) throw new SeatApiError('forbidden', 'message read denied', { status: 403 })
    return Array.from({ length: 50 }, (_, n) => ({ ...message(n + 51), body: 'SCOPE A PRIVATE' }))
  })
  const view = renderHook(() => ({
    a: useSeatMessages(id(901), id(902), id(903)),
    b: useSeatMessages(id(901), id(904), id(903)),
  }), { wrapper })
  await waitFor(() => expect(view.result.current.a.data?.length).toBe(50))
  await waitFor(() => expect(view.result.current.b.data?.[0]?.body).toBe('OTHER AUTHORIZED'))
  act(() => view.result.current.a.loadOlder())
  await waitFor(() => expect(view.result.current.a.loadingOlder).toBe(true))
  denied = true
  await act(async () => { await view.result.current.a.refetch() })
  await waitFor(() => expect(view.result.current.a.readRevoked).toBe(true))
  await act(async () => resolve([{ ...message(1), body: 'LATE PRIVATE' }]))
  expect(view.result.current.a.data).toBeUndefined()
  expect(view.result.current.b.data?.[0]?.body).toBe('OTHER AUTHORIZED')
  const aCaches = qc.getQueryCache().getAll().filter((q) => q.queryKey.includes(id(902)))
  expect(JSON.stringify(aCaches.map((q) => q.state.data))).not.toContain('PRIVATE')
})
