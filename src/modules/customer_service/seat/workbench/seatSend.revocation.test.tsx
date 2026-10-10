import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { SeatApiError } from '../errors'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import type { SeatContext } from '../types'
import type { SeatSessionDetail } from './contract'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import { SeatSessionView } from './sessionView'
import { SeatWorkbenchProvider, useSeatEventStream, useSeatScopeSelection, useSeatSend } from './workbenchHooks'
import { CONV, FakeSseStream, IDENTITY, ORG, SESSION, SeatFakeBackend, WS, envelopeFrame, makeGateway } from './workbenchTestHarness'

const SCOPE = { orgId: ORG, conversationId: CONV as string | null, workspaceId: WS, identityId: IDENTITY, writeRevoked: false }
const queryClients: QueryClient[] = []

function deferred<Value>() {
  let resolve!: (_value: Value) => void
  let reject!: (_reason: unknown) => void
  const promise = new Promise<Value>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

function setup() {
  seatTokenVault.setToken('eyJh.eyJi.c2ln')
  useSeatAuthStore.getState().setSession('1000000000000000001')
  const backend = new SeatFakeBackend()
  const sse = new FakeSseStream()
  const gateway = makeGateway(backend, sse)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  queryClients.push(queryClient)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}><SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider></QueryClientProvider>
  )
  return { gateway, sse, queryClient, wrapper }
}

function harness() {
  const environment = setup()
  const api = environment.gateway.api
  const send = spyOn(api, 'sendMessage').mockResolvedValue({
    id: '9000000000000000011', senderType: 'business_identity', senderIdentityId: IDENTITY,
    senderContactId: null, clientMsgId: null, body: 'reply', readAt: null, createdAt: null, attachments: [],
  })
  const presign = spyOn(api, 'requestAssetPresign').mockResolvedValue({
    assetId: '8000000000000000012', uploadRef: 'mock-ref', uploadUrl: 'https://upload.invalid/mock', expiresAt: null,
  })
  const upload = spyOn(api, 'uploadAssetBytes').mockResolvedValue(undefined)
  const confirm = spyOn(api, 'confirmAssetUpload').mockResolvedValue(undefined)
  const fetchMessages = spyOn(api, 'fetchMessages').mockResolvedValue([])
  const view = renderHook((scope: typeof SCOPE) => useSeatSend(
    scope.orgId, scope.conversationId, scope.workspaceId, scope.identityId, scope.writeRevoked,
  ), { wrapper: environment.wrapper, initialProps: SCOPE })
  act(() => { view.result.current.updateDraftBody('私密草稿 🧾'); view.result.current.attachFile(new File(['secret'], '凭证.txt')) })
  return { ...view, send, presign, upload, confirm, fetchMessages }
}

type Harness = ReturnType<typeof harness>

function expectCleared(view: Harness) {
  expect(view.result.current.draft).toEqual({ body: '', fileName: null, fileSize: null })
  expect(view.result.current.error).toBeNull()
  expect(view.result.current.sending).toBe(false)
  expect(view.result.current.outcomeUnknown).toBe(false)
}

async function failSend(view: Harness, kind: ConstructorParameters<typeof SeatApiError>[0]) {
  const error = new SeatApiError(kind, `mock ${kind}`)
  view.send.mockRejectedValueOnce(error)
  act(() => view.result.current.send())
  await waitFor(() => expect(view.result.current.error).toBe(error))
}

afterEach(() => {
  cleanup()
  for (const queryClient of queryClients.splice(0)) queryClient.clear()
  mock.restore()
  seatTokenVault.clear()
  useSeatAuthStore.getState().clearSession('logout')
})

describe('CX03 revocation — isolated mock/JSDOM, not browser/API/SQL acceptance', () => {
  it.each(['organization', 'workspace', 'all'] as const)('权威%s移除旧grant时清全部旧稿，停止迟到confirm续写，不误清合法B', async (removal) => {
    const { gateway, wrapper } = setup()
    const first = (await gateway.api.fetchContexts()).contexts[0]!
    const second: SeatContext = removal === 'workspace'
      ? { ...first, workspaces: [{ ...first.workspaces[0]!, id: '3000000000000000004' }] }
      : { ...first, organizationId: '2000000000000000003', businessIdentityId: '4000000000000000003' }
    const contexts = removal === 'workspace'
      ? [{ ...first, workspaces: [...first.workspaces, ...second.workspaces] }] : [first, second]
    const pending = deferred<void>()
    spyOn(gateway.api, 'requestAssetPresign').mockResolvedValue({
      assetId: '6000000000000000006', uploadUrl: 'https://mock.invalid/put', headers: {},
    })
    spyOn(gateway.api, 'uploadAssetBytes').mockResolvedValue(undefined)
    spyOn(gateway.api, 'confirmAssetUpload').mockImplementationOnce(() => pending.promise)
    const send = spyOn(gateway.api, 'sendMessage')
    const view = renderHook((grants: SeatContext[]) => {
      const scope = useSeatScopeSelection(grants)
      const composer = useSeatSend(scope.organizationId, CONV, scope.workspaceId, scope.myIdentityId, false, grants)
      return { scope, composer }
    }, { wrapper, initialProps: contexts })
    act(() => {
      view.result.current.composer.updateDraftBody('A私密稿')
      view.result.current.composer.attachFile(new File(['secret'], 'secret.txt'))
    })
    act(() => view.result.current.composer.send())
    await waitFor(() => expect(gateway.api.confirmAssetUpload).toHaveBeenCalledTimes(1))
    act(() => {
      view.result.current.scope.selectOrganization(second.organizationId)
      view.result.current.scope.selectWorkspace(second.workspaces[0]!.id)
    })
    act(() => view.result.current.composer.updateDraftBody('B合法稿'))
    view.rerender(removal === 'all' ? [] : [second])
    await act(async () => pending.resolve())
    expect(send).not.toHaveBeenCalled()
    if (removal !== 'all') expect(view.result.current.composer.draft.body).toBe('B合法稿')
    view.rerender(contexts)
    act(() => {
      view.result.current.scope.selectOrganization(first.organizationId)
      view.result.current.scope.selectWorkspace(first.workspaces[0]!.id)
    })
    expect(view.result.current.composer.draft).toEqual({ body: '', fileName: null, fileSize: null })
    if (removal === 'all') {
      act(() => {
        view.result.current.scope.selectOrganization(second.organizationId)
        view.result.current.scope.selectWorkspace(second.workspaces[0]!.id)
      })
      expect(view.result.current.composer.draft.body).toBe('')
    }
  })

  it('重新认证不继承SSE撤权，旧流迟到401和撤权不能影响新登录', () => {
    const { gateway, wrapper } = setup()
    const createStream = spyOn(gateway, 'createStream')
    const view = renderHook(() => useSeatEventStream(ORG, WS), { wrapper })
    const oldHandlers = createStream.mock.calls[0]![0]
    act(() => oldHandlers.onEnded('forbidden'))
    expect(view.result.current.writeRevoked).toBe(true)
    act(() => {
      useSeatAuthStore.getState().clearSession('logout')
      seatTokenVault.setToken('eyJu.eyJl.c2ln')
      useSeatAuthStore.getState().setSession('1000000000000000002')
    })
    expect(view.result.current.writeRevoked).toBe(false)
    act(() => {
      oldHandlers.onEnded('forbidden')
      oldHandlers.onEnded('unauthorized')
      oldHandlers.onEnvelope({
        eventId: '9800000000000000003', type: 'seat.changed', organizationId: ORG, workspaceId: WS,
        resourceType: 'seat', resourceId: null, resourceVersion: 3, occurredAt: '2026-10-10T07:00:00Z', reason: 'revoked',
      })
    })
    expect(view.result.current.writeRevoked).toBe(false)
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
  })

  it('撤权清该org/ws全部会话敏感稿，保留其他合法scope；旧send/retry不复活', () => {
    const view = harness()
    const oldSend = view.result.current.send
    view.rerender({ ...SCOPE, conversationId: '5000000000000000006' })
    act(() => view.result.current.updateDraftBody('同scope B'))
    view.rerender({ ...SCOPE, orgId: '2000000000000000003' })
    act(() => view.result.current.updateDraftBody('其他合法组织'))
    view.rerender({ ...SCOPE, writeRevoked: true })
    expectCleared(view)
    act(() => { oldSend(); view.result.current.retry(); view.result.current.updateDraftBody('不应恢复') })
    expectCleared(view)
    expect(view.send).not.toHaveBeenCalled()
    view.rerender({ ...SCOPE, writeRevoked: false })
    act(() => oldSend())
    expect(view.send).not.toHaveBeenCalled()
    view.rerender({ ...SCOPE, conversationId: '5000000000000000006' })
    expectCleared(view)
    view.rerender({ ...SCOPE, orgId: '2000000000000000003' })
    expect(view.result.current.draft.body).toBe('其他合法组织')
  })

  it('普通会话空选/切换不是撤权，正文与File切回仍保留', () => {
    const view = harness()
    view.rerender({ ...SCOPE, conversationId: null })
    expectCleared(view)
    view.rerender({ ...SCOPE, orgId: '2000000000000000003' })
    expectCleared(view)
    view.rerender(SCOPE)
    expect(view.result.current.draft).toEqual({ body: '私密草稿 🧾', fileName: '凭证.txt', fileSize: 6 })
  })

  it.each(['presign', 'upload', 'confirm'] as const)('%s在途撤权：迟到回包不能推进上传/confirm/POST', async (stage) => {
    const view = harness()
    const pending = deferred<Awaited<ReturnType<typeof view.presign>> | void>()
    view[stage].mockImplementationOnce(() => pending.promise as never)
    act(() => view.result.current.send())
    await waitFor(() => expect(view[stage]).toHaveBeenCalledTimes(1))
    view.rerender({ ...SCOPE, writeRevoked: true })
    expectCleared(view)
    await act(async () => pending.resolve(stage === 'presign'
      ? { assetId: '8000000000000000012', uploadRef: 'mock-ref', uploadUrl: 'https://upload.invalid/mock', expiresAt: null } : undefined))
    expect(view.send).not.toHaveBeenCalled()
    if (stage === 'presign') expect(view.upload).not.toHaveBeenCalled()
    if (stage !== 'confirm') expect(view.confirm).not.toHaveBeenCalled()
    expectCleared(view)
  })

  it.each(['success', 'failure'] as const)('已发POST的迟到%s不伪称撤销、不恢复敏感缓存或污染新稿', async (outcome) => {
    const view = harness()
    const pending = deferred<Awaited<ReturnType<typeof view.send>>>()
    view.send.mockImplementationOnce(() => pending.promise)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.send).toHaveBeenCalledTimes(1))
    view.rerender({ ...SCOPE, writeRevoked: true })
    expectCleared(view)
    view.rerender(SCOPE)
    act(() => view.result.current.updateDraftBody('新合法稿'))
    await act(async () => {
      if (outcome === 'success') pending.resolve({
        id: '9000000000000000011', senderType: 'business_identity', senderIdentityId: IDENTITY,
        senderContactId: null, clientMsgId: view.send.mock.calls[0]![2].clientMsgId,
        body: 'reply', readAt: null, createdAt: null, attachments: [],
      })
      else pending.reject(new SeatApiError('unauthorized', 'old POST'))
    })
    expect(view.send).toHaveBeenCalledTimes(1)
    expect(view.result.current.draft.body).toBe('新合法稿')
    expect(view.result.current.error).toBeNull()
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
  })

  it('403确定拒绝保稿且不清登录；send/retry和编辑均不能直接重放', async () => {
    const view = harness()
    const staleSend = view.result.current.send
    await failSend(view, 'forbidden')
    expect(view.result.current.draft.fileName).toBe('凭证.txt')
    act(() => { view.result.current.send(); view.result.current.retry(); staleSend(); view.result.current.updateDraftBody('编辑稿'); view.result.current.send() })
    expect(view.send).toHaveBeenCalledTimes(1)
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
  })

  it.each(['validation', 'rate_limited'] as const)('%s合法稿和confirmed asset保护，同参重试保持原键且不重复上传', async (kind) => {
    const view = harness()
    await failSend(view, kind)
    const original = view.send.mock.calls[0]![2]
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.send).toHaveBeenCalledTimes(2))
    expect(view.send.mock.calls[1]![2]).toEqual(original)
    expect(view.presign).toHaveBeenCalledTimes(1)
    expect(view.confirm).toHaveBeenCalledTimes(1)
  })

  it('当前401继续清登录/草稿，不解释成保稿重试', async () => {
    const view = harness()
    view.send.mockRejectedValueOnce(new SeatApiError('unauthorized', 'expired'))
    act(() => view.result.current.send())
    await waitFor(() => expect(useSeatAuthStore.getState().status).toBe('anonymous'))
    expectCleared(view)
  })

  it('UNKNOWN查询403仍未决并可再次查真源，绝不POST重放', async () => {
    const view = harness()
    await failSend(view, 'network')
    view.fetchMessages.mockRejectedValueOnce(new SeatApiError('forbidden', 'query denied'))
    act(() => view.result.current.retry())
    await waitFor(() => expect((view.result.current.error as SeatApiError).kind).toBe('forbidden'))
    expect(view.result.current.outcomeUnknown).toBe(true)
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(2))
    expect(view.send).toHaveBeenCalledTimes(1)
    expect(view.result.current.draft.fileName).toBe('凭证.txt')
  })

  it('撤权UNKNOWN时迟到查询不能清新稿或恢复原错误/id', async () => {
    const view = harness()
    await failSend(view, 'network')
    const pending = deferred<Awaited<ReturnType<typeof view.fetchMessages>>>()
    view.fetchMessages.mockImplementationOnce(() => pending.promise)
    act(() => view.result.current.retry())
    view.rerender({ ...SCOPE, writeRevoked: true })
    expectCleared(view)
    view.rerender(SCOPE)
    act(() => view.result.current.updateDraftBody('新合法稿'))
    await act(async () => pending.resolve([]))
    expect(view.result.current.draft.body).toBe('新合法稿')
    expect(view.result.current.error).toBeNull()
    expect(view.send).toHaveBeenCalledTimes(1)
  })

  it('stream撤权只属于原org/ws，切合法scope不继承，切回仍关闭', () => {
    const { gateway, wrapper } = setup()
    const createStream = spyOn(gateway, 'createStream')
    const view = renderHook((scope: { orgId: string; workspaceId: string }) => useSeatEventStream(scope.orgId, scope.workspaceId), {
      wrapper, initialProps: { orgId: ORG, workspaceId: WS },
    })
    act(() => createStream.mock.calls[0]![0].onEnded('forbidden'))
    expect(view.result.current.writeRevoked).toBe(true)
    view.rerender({ orgId: '2000000000000000003', workspaceId: WS })
    expect(view.result.current.writeRevoked).toBe(false)
    act(() => createStream.mock.calls.at(-1)![0].onEnded('forbidden'))
    view.rerender({ orgId: ORG, workspaceId: WS })
    expect(view.result.current.writeRevoked).toBe(true)
  })

  it('撤权→retry→新SSE connected/updated未证明授权时写入口仍关闭', () => {
    const { gateway, wrapper } = setup()
    const createStream = spyOn(gateway, 'createStream')
    const view = renderHook(() => useSeatEventStream(ORG, WS), { wrapper })
    act(() => createStream.mock.calls[0]![0].onEnded('forbidden'))
    expect(view.result.current.writeRevoked).toBe(true)
    act(() => view.result.current.retry())
    expect(createStream).toHaveBeenCalledTimes(2)
    expect(view.result.current.writeRevoked).toBe(true)
    act(() => createStream.mock.calls[1]![0].onStatus('connected'))
    expect(view.result.current.writeRevoked).toBe(true)
    act(() => createStream.mock.calls[1]![0].onEnvelope({
      eventId: '9800000000000000002', type: 'seat.changed', organizationId: ORG, workspaceId: WS,
      resourceType: 'seat', resourceId: null, resourceVersion: 2, occurredAt: '2026-10-10T07:00:00Z', reason: 'updated',
    }))
    expect(view.result.current.writeRevoked).toBe(true)
  })

  it.each(['stream', 'capability', 'empty-contexts'] as const)('page权威%s撤权接通hook：confirm迟到不能POST；重新获权不恢复旧稿', async (source) => {
    const { gateway, sse, queryClient } = setup()
    const contexts = await gateway.api.fetchContexts()
    const contextsSpy = spyOn(gateway.api, 'fetchContexts').mockResolvedValue(contexts)
    const pending = deferred<void>()
    spyOn(gateway.api, 'confirmAssetUpload').mockImplementationOnce(() => pending.promise)
    const send = spyOn(gateway.api, 'sendMessage')
    const view = render(<QueryClientProvider client={queryClient}><SeatWorkspacePage gateway={gateway} /></QueryClientProvider>)
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`)))
    const composer = await waitFor(() => view.getByTestId('seat-composer'))
    fireEvent.change(composer, { target: { value: 'page私密稿' } })
    fireEvent.change(view.getByTestId('seat-attach-input'), { target: { files: [new File(['x'], 'secret.txt')] } })
    fireEvent.click(view.getByTestId('seat-send'))
    await waitFor(() => expect(gateway.api.confirmAssetUpload).toHaveBeenCalledTimes(1))
    contextsSpy.mockResolvedValue({ ...contexts, contexts: source === 'empty-contexts' ? [] : contexts.contexts.map((context) => ({ ...context, capabilities: context.capabilities.filter((capability) => capability !== 'conversation.write') })) })
    act(() => sse.push(envelopeFrame('9800000000000000001', 'seat.changed', 'seat', null, source === 'stream' ? 'revoked' : 'updated')))
    await waitFor(() => expect(view.queryByTestId('seat-composer') === null).toBe(true))
    await act(async () => pending.resolve())
    expect(send).not.toHaveBeenCalled()
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
    if (source === 'capability') {
      contextsSpy.mockResolvedValue(contexts)
      act(() => sse.push(envelopeFrame('9800000000000000002', 'seat.changed', 'seat', null, 'updated')))
      await waitFor(() => expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe(''))
      expect(view.queryByTestId('seat-attach-chip')).toBeNull()
    }
  })
})

describe('CX03 forbidden retry UI', () => {
  function renderFailure(canWrite: boolean, sendOutcomeUnknown = false) {
    const retry = mock(() => {})
    const props: ComponentProps<typeof SeatSessionView> = {
      fetchAssetBlob: mock(async () => new Blob()),
      detail: { id: SESSION, conversationId: CONV, status: 'active', visitorMaskedName: 'mock' } as SeatSessionDetail,
      messages: [], messagesLoading: false, messagesError: null, onRetryMessages: mock(() => {}),
      canWrite, writeClosedReason: '权限已收回', draft: { body: '保留稿', fileName: null, fileSize: null },
      onUpdateDraftBody: mock(() => {}), onAttachFile: mock(() => {}), onDetachFile: mock(() => {}),
      onSend: mock(() => {}), onRetrySend: retry, sending: false, sendOutcomeUnknown,
      sendError: new SeatApiError('forbidden', 'denied'),
    }
    return { ...render(<SeatSessionView {...props} />), retry }
  }

  it.each([true, false])('canWrite=%s的确定403不提供POST重试按钮，文案不声称可重试', (canWrite) => {
    const view = renderFailure(canWrite)
    expect(view.queryByTestId('seat-send-retry') === null).toBe(true)
    expect(view.getByTestId('seat-send-error-text').textContent).not.toContain('可重试')
    if (canWrite) expect(view.getByTestId('seat-send').hasAttribute('disabled')).toBe(true)
  })

  it('UNKNOWN+403允许只查询结果，不显示直接重发', () => {
    const view = renderFailure(false, true)
    expect(view.getByTestId('seat-send-retry').textContent).toBe('查询发送结果')
    fireEvent.click(view.getByTestId('seat-send-retry'))
    expect(view.retry).toHaveBeenCalledTimes(1)
  })
})
