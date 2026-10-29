import '@/test/attachmentJournalFixture'
import { uploadJournal } from '@/lib/attachmentUploadJournal'
import { blobSha256Hex } from './attachmentUpload'
import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { SeatWorkbenchProvider, useSeatSend } from './workbenchHooks'
import {
  CONV, FakeSseStream, IDENTITY, ORG, SeatFakeBackend, WS, makeGateway,
} from './workbenchTestHarness'

const SCOPE = { orgId: ORG, conversationId: CONV, workspaceId: WS, identityId: IDENTITY }
const BODY = "附件答复 🧾 中文 ' & +"
const REJECTIONS = [{ status: 429, kind: 'rate_limited' }, { status: 422, kind: 'validation' }]
const queryClients: QueryClient[] = []

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status === 200 ? 0 : status, msg: 'mock response', payload }), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

function harness() {
  seatTokenVault.setToken('eyJh.eyJi.c2ln')
  useSeatAuthStore.getState().setSession('1000000000000000001')
  const backend = new SeatFakeBackend()
  const handle = backend.handle
  const dispatchCheckpoints: ({ clientMsgId: string; dispatchState?: string; clientUploadId: string } | null)[] = []
  const postOutcomes: (Response | Error)[] = []
  const getOutcomes: (Response | Error)[] = []
  const transport = spyOn(backend, 'handle').mockImplementation(async (url, init) => {
    if (url.split('?')[0]!.endsWith('/messages')) {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { client_msg_id: string }
        let checkpoint = null
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i)
          if (!key?.startsWith('imboy:attachment:v5:')) continue
          const row = JSON.parse(localStorage.getItem(key)!)
          if (row.clientMsgId === body.client_msg_id) checkpoint = row
        }
        dispatchCheckpoints.push(checkpoint)
      }
      const outcome = (init?.method === 'POST' ? postOutcomes : getOutcomes).shift()
      if (outcome instanceof Error) throw outcome
      if (outcome !== undefined) return outcome
    }
    return handle(url, init)
  })
  const gateway = makeGateway(backend, new FakeSseStream())
  const presign = spyOn(gateway.api, 'registerAssetUpload')
  const upload = spyOn(gateway.api, 'uploadAssetBytes')
  const confirm = spyOn(gateway.api, 'confirmRecoveredAsset')
  const sendMessage = spyOn(gateway.api, 'sendMessage')
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false },
  } })
  queryClients.push(queryClient)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider>
    </QueryClientProvider>
  )
  const view = renderHook((scope: typeof SCOPE) => useSeatSend(
    scope.orgId, scope.conversationId, scope.workspaceId, scope.identityId,
  ), { wrapper, initialProps: SCOPE })
  return { ...view, api: gateway.api, transport, dispatchCheckpoints, postOutcomes, getOutcomes, presign, upload, confirm, sendMessage, backendHandle: handle, gateway }
}

type Harness = ReturnType<typeof harness>

/** 同一 backend（服务端状态存活）上的客户端重启：仅重挂载 hook，共享同一 gateway/传输观测。 */
function resumedOnSameBackend(previous: Harness) {
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false },
  } })
  queryClients.push(queryClient)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SeatWorkbenchProvider gateway={previous.gateway}>{children}</SeatWorkbenchProvider>
    </QueryClientProvider>
  )
  const view = renderHook((scope: typeof SCOPE) => useSeatSend(
    scope.orgId, scope.conversationId, scope.workspaceId, scope.identityId,
  ), { wrapper, initialProps: SCOPE })
  return { ...view, transport: previous.transport, dispatchCheckpoints: previous.dispatchCheckpoints,
    presign: previous.presign, upload: previous.upload, confirm: previous.confirm, sendMessage: previous.sendMessage }
}

function setDraft(view: Harness, body: string, file?: File) {
  act(() => {
    view.result.current.updateDraftBody(body)
    if (file !== undefined) view.result.current.attachFile(file)
  })
}

function expectDraft(view: Harness, body: string, file: File | null) {
  expect(view.result.current.draft).toEqual({ body, fileName: file?.name ?? null, fileSize: file?.size ?? null })
}

function expectUploads(view: Harness, count: number) {
  expect(view.presign).toHaveBeenCalledTimes(count)
  expect(view.upload).toHaveBeenCalledTimes(count)
  expect(view.confirm).toHaveBeenCalledTimes(count)
}

function messageRequests(view: Harness, method: string) {
  return view.transport.mock.calls.filter(([url, init]) => url.split('?')[0]!.endsWith('/messages')
    && (init?.method ?? 'GET') === method)
}

async function rejectSend(view: Harness, status: number, kind: string) {
  view.postOutcomes.push(response({}, status))
  act(() => view.result.current.send())
  await waitFor(() => {
    expect(view.result.current.error).toMatchObject({ status, code: status, kind })
    expect(view.result.current.sending).toBe(false)
  })
  expect(view.result.current.outcomeUnknown).toBe(false)
  expect(view.sendMessage).toHaveBeenCalledTimes(1)
  expectUploads(view, 1)
  return view.sendMessage.mock.calls[0]![2]
}

afterEach(() => {
  localStorage.clear()
  cleanup()
  for (const queryClient of queryClients.splice(0)) queryClient.clear()
  mock.restore()
  seatTokenVault.clear()
  useSeatAuthStore.getState().clearSession('logout')
})

describe('CX03 attachment recovery — unit/mock transport/JSDOM only, not Required PASS', () => {
  it.each(REJECTIONS)('confirm 后 HTTP $status 明确拒绝，同参 retry 不重新上传且复用 wire 幂等键/asset', async ({ status, kind }) => {
    const view = harness()
    const file = new File([''], '空附件 🧾.txt', { type: 'text/plain' })
    setDraft(view, '', file)
    const original = await rejectSend(view, status, kind)
    expect(original.clientMsgId).toMatch(/^seat-web-/)
    expect(original.assetIds).toHaveLength(1)
    expectDraft(view, '', file)
    expect(view.upload.mock.calls[0]![1]).toBe(file)
    expect(view.transport.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PUT', 'POST', 'POST'])
    act(() => view.result.current.retry())
    await waitFor(() => {
      expect(view.sendMessage).toHaveBeenCalledTimes(2)
      expect(view.result.current.sending).toBe(false)
      expectDraft(view, '', null)
    })
    expect(view.sendMessage.mock.calls[1]![2]).toEqual(original)
    const posts = messageRequests(view, 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[1]).toEqual(posts[0])
    expect(JSON.parse(String(posts[0]![1]!.body))).toMatchObject({
      client_msg_id: original.clientMsgId, asset_ids: original.assetIds, workspace_id: WS,
    })
    expect(messageRequests(view, 'GET')).toHaveLength(0)
    expectUploads(view, 1)
    expect(view.result.current.error).toBeNull()
  })

  it.each(REJECTIONS)('HTTP $status 拒绝完成后仅编辑正文：新键复用同一 confirmed asset', async ({ status, kind }) => {
    const view = harness()
    const file = new File(['原始附件字节 🧾'], '凭证.txt', { type: 'text/plain' })
    setDraft(view, BODY, file)
    const original = await rejectSend(view, status, kind)
    const editedBody = `${BODY} — 修改后的答复`
    setDraft(view, editedBody)
    expectDraft(view, editedBody, file)
    act(() => view.result.current.retry())
    await waitFor(() => {
      expect(view.sendMessage).toHaveBeenCalledTimes(2)
      expect(view.result.current.sending).toBe(false)
    })
    const edited = view.sendMessage.mock.calls[1]![2]
    expect(edited).toEqual({ ...original, body: editedBody, clientMsgId: expect.any(String) })
    expect(edited.clientMsgId).toMatch(/^seat-web-/)
    expect(edited.clientMsgId).not.toBe(original.clientMsgId)
    expect(view.dispatchCheckpoints[1]).toMatchObject({ clientMsgId: edited.clientMsgId, dispatchState: 'dispatch_intent' })
    expect(view.dispatchCheckpoints[1]?.clientUploadId).toBe(view.dispatchCheckpoints[0]?.clientUploadId)
    expect(JSON.parse(String(messageRequests(view, 'POST')[1]![1]!.body))).toMatchObject({
      body: editedBody, client_msg_id: edited.clientMsgId, asset_ids: original.assetIds,
    })
    expect(messageRequests(view, 'GET')).toHaveLength(0)
    expectUploads(view, 1)
    expectDraft(view, '', null)
    expect(view.result.current.error).toBeNull()
  })

  it('confirm 后 POST 网络结果未知：GET 失败/空页/命中均不 POST 重放或重复上传', async () => {
    const view = harness()
    const file = new File(['私密附件'], '凭证.txt', { type: 'text/plain' })
    setDraft(view, BODY, file)
    view.postOutcomes.push(new Error('mock POST connection lost'))
    act(() => view.result.current.send())
    await waitFor(() => {
      expect(view.result.current.error).toMatchObject({ kind: 'network' })
      expect(view.result.current.sending).toBe(false)
    })
    const original = view.sendMessage.mock.calls[0]![2]
    expect(original.assetIds).toHaveLength(1)
    expectUploads(view, 1)
    const outcomes = [new Error('mock GET connection lost'), response({ messages: [] }), response({ messages: [{
      id: '9000000000000000011', sender_type: 'business_identity', sender_identity_id: IDENTITY,
      client_msg_id: original.clientMsgId, body: BODY,
      assets: [{ id: original.assetIds[0], mime: 'text/plain', size_bytes: file.size, file_name: file.name, status: 'active' }],
    }] })]
    for (const [index, outcome] of outcomes.entries()) {
      view.getOutcomes.push(outcome)
      act(() => view.result.current.retry())
      await waitFor(() => {
        expect(messageRequests(view, 'GET')).toHaveLength(index + 1)
        expect(view.result.current.sending).toBe(false)
      })
      expect(messageRequests(view, 'POST')).toHaveLength(1)
      expectUploads(view, 1)
      expect(view.result.current.outcomeUnknown).toBe(index < 2)
      expectDraft(view, index < 2 ? BODY : '', index < 2 ? file : null)
      if (index < 2) expect(view.result.current.error).not.toBeNull()
      else expect(view.result.current.error).toBeNull()
    }
    for (const [url] of messageRequests(view, 'GET')) {
      const request = new URL(url, 'https://unit.invalid')
      expect(request.pathname).toBe(`/api/v1/seat/enterprise/conversations/${CONV}/messages`)
      expect(request.searchParams.get('organization_id')).toBe(ORG)
      expect(request.searchParams.get('workspace_id')).toBe(WS)
    }
  })

  it('edited message response loss queries only the new identity on retry', async () => {
    const view = harness()
    setDraft(view, BODY, new File(['abc'], 'proof.txt', { type: 'text/plain' }))
    const original = await rejectSend(view, 422, 'validation')
    setDraft(view, `${BODY} edited`)
    view.postOutcomes.push(new Error('lost edited response'))
    act(() => view.result.current.retry())
    await waitFor(() => {
      expect(view.sendMessage).toHaveBeenCalledTimes(2)
      expect(view.result.current.sending).toBe(false)
    })
    const edited = view.sendMessage.mock.calls[1]![2]
    expect(edited.clientMsgId).not.toBe(original.clientMsgId)
    expect(view.result.current.outcomeUnknown).toBe(true)
    view.getOutcomes.push(response({ messages: [] }))
    act(() => view.result.current.retry())
    await waitFor(() => {
      expect(messageRequests(view, 'GET')).toHaveLength(1)
      expect(view.result.current.sending).toBe(false)
    })
    expect(view.sendMessage).toHaveBeenCalledTimes(2)
    expect(view.result.current.outcomeUnknown).toBe(true)
    expectUploads(view, 1)
  })

  it.each([
    { label: 'organization', scope: { ...SCOPE, orgId: '2000000000000000003' } },
    { label: 'workspace', scope: { ...SCOPE, workspaceId: '3000000000000000004' } },
  ])('$label 切换：两个失败稿同名同尺寸 File 的 confirmed id 独立，切回各自复用', async ({ scope }) => {
    const view = harness()
    const fileA = new File(['A'], '同名凭证 🧾.txt', { type: 'text/plain', lastModified: 1 })
    const fileB = new File(['B'], fileA.name, { type: fileA.type, lastModified: 1 })
    const assetA = '8100000000000000001'
    const assetB = '8100000000000000002'
    view.presign.mockResolvedValueOnce({ state: 'registered', assetId: assetA, uploadRef: 'ref-A', uploadUrl: 'https://upload.invalid/A' })
      .mockResolvedValueOnce({ state: 'registered', assetId: assetB, uploadRef: 'ref-B', uploadUrl: 'https://upload.invalid/B' })
    view.upload.mockResolvedValue(undefined)
    view.confirm.mockResolvedValue(undefined)
    setDraft(view, 'A 答复', fileA)
    const originalA = await rejectSend(view, 429, 'rate_limited')
    view.rerender(scope)
    expectDraft(view, '', null)
    expect(view.result.current.error).toBeNull()
    setDraft(view, 'B 答复', fileB)
    view.postOutcomes.push(response({}, 422))
    act(() => view.result.current.send())
    await waitFor(() => {
      expect(view.result.current.error).toMatchObject({ kind: 'validation', status: 422 })
      expect(view.result.current.sending).toBe(false)
    })
    const originalB = view.sendMessage.mock.calls[1]![2]
    expect(originalA.assetIds).toEqual([assetA])
    expect(originalB.assetIds).toEqual([assetB])
    expect(originalB.clientMsgId).not.toBe(originalA.clientMsgId)
    for (const [index, currentScope, body, file, original] of [
      [0, SCOPE, 'A 答复', fileA, originalA], [1, scope, 'B 答复', fileB, originalB],
    ] as const) {
      view.rerender(currentScope)
      expectDraft(view, body, file)
      view.postOutcomes.push(response({ message: { id: '9000000000000000011', sender_type: 'business_identity' } }))
      act(() => view.result.current.retry())
      await waitFor(() => {
        expect(view.sendMessage).toHaveBeenCalledTimes(index + 3)
        expect(view.result.current.sending).toBe(false)
      })
      expect(view.sendMessage.mock.calls[index + 2]).toEqual([currentScope.orgId, CONV, original])
      expect(view.upload.mock.calls[index]![1]).toBe(file)
      expect(view.presign.mock.calls[index]!.slice(0, 3)).toEqual([currentScope.orgId, CONV, currentScope.workspaceId])
      expect(view.confirm.mock.calls[index]).toEqual([currentScope.orgId, currentScope.workspaceId, index === 0 ? assetA : assetB, index === 0 ? 'ref-A' : 'ref-B'])
      expectDraft(view, '', null)
      expectUploads(view, 2)
    }
    expect(view.presign.mock.calls[0]![3].objectHash).not.toBe(view.presign.mock.calls[1]![3].objectHash)
    expect(messageRequests(view, 'GET')).toHaveLength(0)
  })
})


it('refresh enumerates confirmed seat task and blocks re-publish when message result is unknown', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId: 'restored-seat', assetId: '8100000000000000001',
    phase: 'confirmed', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  act(() => view.result.current.send())
  await waitFor(() => expect(view.result.current.sending).toBe(false))
  expect(view.sendMessage).toHaveBeenCalledTimes(0)
  expect(view.result.current.error).toBeInstanceOf(Error)
  expect(journal.load('restored-seat')).not.toBeNull()
})


it('confirmed seat recovery rejects the original message identity with a different asset', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId: 'restored-wrong-asset', assetId: '8100000000000000001',
    phase: 'confirmed', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  view.getOutcomes.push(response({ messages: [{ id: '100', sender_type: 'business_identity', sender_identity_id: IDENTITY,
    client_msg_id: 'restored-wrong-asset', body: null, created_at: null,
    assets: [{ id: '8100000000000000002', mime: 'text/plain', size_bytes: 3, file_name: 'other.txt', status: 'active' }] }] }), response({ messages: [] }))
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  act(() => view.result.current.send())
  await waitFor(() => expect(view.result.current.sending).toBe(false))
  expect(view.sendMessage).toHaveBeenCalledTimes(0)
  expect(view.result.current.outcomeUnknown).toBe(true)
  expect(view.result.current.error).toBeInstanceOf(Error)
  expect(journal.load('restored-wrong-asset')).not.toBeNull()
})

 it('confirmed before dispatch survives restart and first-sends the original identity once', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId: 'ready-seat', assetId: '8100000000000000001',
    phase: 'confirmed', dispatchState: 'ready', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  act(() => view.result.current.send())
  await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
  expect(view.sendMessage.mock.calls[0]![2]).toMatchObject({ clientMsgId: 'ready-seat', assetIds: ['8100000000000000001'] })
  await waitFor(() => expect(journal.load('ready-seat')).toBeNull())
})

it('seat dispatch checkpoint denial stops before business send', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId: 'quota-seat', assetId: '8100000000000000001',
    phase: 'confirmed', dispatchState: 'ready', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  const storage = localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: storage.getItem.bind(storage), setItem: () => { throw new Error('quota') },
    removeItem: storage.removeItem.bind(storage), key: storage.key.bind(storage), get length() { return storage.length },
  } })
  try {
    act(() => view.result.current.send())
    await waitFor(() => expect(view.result.current.error).toBeInstanceOf(Error))
    expect(view.sendMessage).toHaveBeenCalledTimes(0)
    expect(journal.load('quota-seat')?.dispatchState).toBe('ready')
  } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage }) }
})

it('seat lost send response persists intent across restart and only queries original task', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId: 'lost-seat', assetId: '8100000000000000001',
    phase: 'confirmed', dispatchState: 'ready', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const first = harness()
  first.postOutcomes.push(new Error('response lost'))
  await waitFor(() => expect(first.result.current.recoverableAttachments).toHaveLength(1))
  act(() => first.result.current.selectRecovery(first.result.current.recoverableAttachments[0]!))
  act(() => first.result.current.send())
  await waitFor(() => expect(first.result.current.outcomeUnknown).toBe(true))
  expect(journal.load('lost-seat')?.dispatchState).toBe('dispatch_intent')
  first.unmount()
  const restarted = harness()
  await waitFor(() => expect(restarted.result.current.recoverableAttachments).toHaveLength(1))
  act(() => restarted.result.current.selectRecovery(restarted.result.current.recoverableAttachments[0]!))
  act(() => restarted.result.current.send())
  await waitFor(() => expect(restarted.result.current.error).toBeInstanceOf(Error))
  expect(restarted.sendMessage).toHaveBeenCalledTimes(0)
})

for (const phase of ['intent', 'registered', 'uploaded'] as const) {
  it(`reselect original file after editing ${phase} recovery keeps the upload and message identities`, async () => {
    const clientMsgId = `resume-${phase}`, clientUploadId = crypto.randomUUID()
    const file = new File(['abc'], 'original.txt', { type: 'text/plain' })
    const assetId = '8100000000000000001'
    const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
    await journal.save({ clientUploadId, clientMsgId, assetId: phase === 'intent' ? null : assetId,
      phase, dispatchState: 'ready', objectHash: await blobSha256Hex(file), sizeBytes: file.size, mime: file.type, updatedAt: Date.now() })
    const view = harness()
    const recover = spyOn(view.api, 'recoverAssetUpload').mockResolvedValue({ assetId, state: 'registered', uploadRef: 'same-ref', uploadUrl: 'https://upload.invalid/owned' })
    view.upload.mockResolvedValue(undefined)
    view.confirm.mockResolvedValue(undefined)
    view.postOutcomes.push(response({ message: { id: '9000000000000000011', sender_type: 'business_identity' } }))
    await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
    act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
    setDraft(view, 'edited before upload completes', file)
    act(() => view.result.current.send())
    await waitFor(() => {
      expect(view.result.current.sending).toBe(false)
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
    })
    expect(view.sendMessage.mock.calls[0]![2].clientMsgId).toBe(clientMsgId)
    expect(view.dispatchCheckpoints[0]?.clientUploadId).toBe(clientUploadId)
    expect(view.presign).toHaveBeenCalledTimes(0)
    expect(view.upload).toHaveBeenCalledTimes(phase === 'uploaded' ? 0 : 1)
    expect(view.confirm).toHaveBeenCalledTimes(1)
    expect(recover.mock.calls.every((call) => call[2] === clientUploadId)).toBe(true)
  })
}

it('reselected different bytes cannot replace a registered recovery task', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  const clientUploadId = crypto.randomUUID(), clientMsgId = 'mismatched-reselection'
  const original = new File(['abc'], 'original.txt', { type: 'text/plain' })
  await journal.save({ clientUploadId, clientMsgId, assetId: '8100000000000000001', phase: 'registered',
    dispatchState: 'ready', objectHash: await blobSha256Hex(original), sizeBytes: 3, mime: original.type, updatedAt: Date.now() })
  const view = harness()
  const recover = spyOn(view.api, 'recoverAssetUpload')
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  setDraft(view, 'edited body', new File(['xyz'], original.name, { type: original.type }))
  act(() => view.result.current.send())
  await waitFor(() => {
    expect(view.result.current.error).not.toBeNull()
    expect(view.result.current.sending).toBe(false)
  })
  expect(view.sendMessage).toHaveBeenCalledTimes(0)
  expect(view.presign).toHaveBeenCalledTimes(0)
  expect(view.upload).toHaveBeenCalledTimes(0)
  expect(view.confirm).toHaveBeenCalledTimes(0)
  expect(recover).toHaveBeenCalledTimes(0)
  expect(journal.load(clientMsgId)?.clientUploadId).toBe(clientUploadId)
  expect(journal.list()).toHaveLength(1)
})

it('selected durable UNKNOWN keeps original query identity when edited before first query', async () => {
  const clientMsgId = 'selected-unknown-original', assetId = '8100000000000000001'
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId: crypto.randomUUID(), clientMsgId, assetId, phase: 'confirmed',
    dispatchState: 'dispatch_intent', objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  view.getOutcomes.push(response({ messages: [{ id: '100', sender_type: 'business_identity', sender_identity_id: IDENTITY,
    client_msg_id: clientMsgId, body: null, created_at: null,
    assets: [{ id: assetId, mime: 'text/plain', size_bytes: 3, file_name: 'old.txt', status: 'active' }] }] }))
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  const fresh = new File(['new bytes'], 'new.txt', { type: 'text/plain' })
  setDraft(view, 'new body', fresh)
  act(() => view.result.current.send())
  await waitFor(() => {
    expect(view.result.current.outcomeUnknown).toBe(false)
    expect(view.result.current.sending).toBe(false)
  })
  expect(view.sendMessage).toHaveBeenCalledTimes(0)
  expectDraft(view, 'new body', fresh)
  expect(journal.load(clientMsgId)).toBeNull()
  view.postOutcomes.push(response({ message: { id: '9000000000000000011', sender_type: 'business_identity' } }))
  act(() => view.result.current.send())
  await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
  expect(view.sendMessage.mock.calls[0]![2].clientMsgId).not.toBe(clientMsgId)
  expect(view.sendMessage.mock.calls[0]![2].body).toBe('new body')
})

it('body-only edit of selected UNKNOWN reuses the confirmed asset through a new durable message task', async () => {
  const clientMsgId = 'selected-body-only', assetId = '8100000000000000001', clientUploadId = crypto.randomUUID()
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  await journal.save({ clientUploadId, clientMsgId, assetId, phase: 'confirmed', dispatchState: 'dispatch_intent',
    objectHash: 'a'.repeat(64), sizeBytes: 3, mime: 'text/plain', updatedAt: Date.now() })
  const view = harness()
  view.getOutcomes.push(response({ messages: [{ id: '100', sender_type: 'business_identity', sender_identity_id: IDENTITY,
    client_msg_id: clientMsgId, body: null, created_at: null,
    assets: [{ id: assetId, mime: 'text/plain', size_bytes: 3, file_name: 'old.txt', status: 'active' }] }] }))
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  setDraft(view, 'new body keeps original attachment')
  act(() => view.result.current.send())
  await waitFor(() => expect(view.result.current.outcomeUnknown).toBe(false))
  expect(view.result.current.draft.body).toBe('new body keeps original attachment')
  expect(view.sendMessage).toHaveBeenCalledTimes(0)
  view.postOutcomes.push(response({ message: { id: '9000000000000000011', sender_type: 'business_identity' } }))
  act(() => view.result.current.send())
  await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
  expect(view.sendMessage.mock.calls[0]![2]).toMatchObject({ assetIds: [assetId], body: 'new body keeps original attachment' })
  expect(view.sendMessage.mock.calls[0]![2].clientMsgId).not.toBe(clientMsgId)
  expect(view.dispatchCheckpoints[0]).toMatchObject({ clientUploadId, dispatchState: 'dispatch_intent' })
  expect(view.presign).toHaveBeenCalledTimes(0)
  expect(view.upload).toHaveBeenCalledTimes(0)
  expect(view.confirm).toHaveBeenCalledTimes(0)
})

it('seat_presign_response_lost: lost presign response persists intent and resume only queries the original task without re-presign', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  const fileBytes = 'presign-lost-bytes', fileName = 'presign-lost.txt'
  const first = harness()
  // 传输层 mock：服务端已受理 presign（会话登记完成），响应在途丢失。
  first.transport.mockImplementationOnce(async (url, init) => {
    await first.backendHandle(url, init)
    throw new Error('mock presign response lost')
  })
  setDraft(first, '丢失 presign 响应的答复', new File([fileBytes], fileName, { type: 'text/plain' }))
  act(() => first.result.current.send())
  await waitFor(() => {
    expect(first.result.current.error).toMatchObject({ kind: 'network' })
    expect(first.result.current.sending).toBe(false)
  })
  expect(first.presign).toHaveBeenCalledTimes(1)
  // 意图已在 presign 前持久化：intent 检查点 + 稳定 UUID/消息身份。
  const rows = journal.list()
  expect(rows).toHaveLength(1)
  const intent = rows[0]!
  expect(intent.phase).toBe('intent')
  expect(intent.clientUploadId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(intent.clientMsgId).toMatch(/^seat-web-/)
  expect(intent.objectHash).toMatch(/^[0-9a-f]{64}$/)
  first.unmount()

  // 重启恢复（同一服务端、客户端重挂载）：只查原任务（status/renew 同一
  // client_upload_id），不重复 presign/register。
  const restarted = resumedOnSameBackend(first)
  await waitFor(() => expect(restarted.result.current.recoverableAttachments).toHaveLength(1))
  act(() => restarted.result.current.selectRecovery(restarted.result.current.recoverableAttachments[0]!))
  setDraft(restarted, '丢失 presign 响应的答复', new File([fileBytes], fileName, { type: 'text/plain' }))
  act(() => restarted.result.current.send())
  await waitFor(() => {
    expect(restarted.result.current.sending).toBe(false)
    expect(restarted.result.current.error).toBeNull()
    expectDraft(restarted, '', null)
  })
  expect(restarted.sendMessage).toHaveBeenCalledTimes(1)
  expect(restarted.sendMessage.mock.calls[0]![2].clientMsgId).toBe(intent.clientMsgId)
  expect(restarted.presign).toHaveBeenCalledTimes(1) // register 只有最初 1 次
  expect(restarted.upload).toHaveBeenCalledTimes(1)
  expect(restarted.confirm).toHaveBeenCalledTimes(1)
  const presignBodies = restarted.transport.mock.calls
    .filter(([url]) => url.split('?')[0]!.endsWith('/assets/presign'))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
  expect(presignBodies.map((body) => body.operation)).toEqual(['register', 'status', 'renew'])
  expect(presignBodies.every((body) => body.client_upload_id === intent.clientUploadId)).toBe(true)
  expect(restarted.dispatchCheckpoints[0]).toMatchObject({
    clientMsgId: intent.clientMsgId, clientUploadId: intent.clientUploadId, dispatchState: 'dispatch_intent',
  })
  expect(journal.list()).toHaveLength(0)
})

it('seat_restart_before_put: restart between presign and PUT reuses the persisted registration without a second presign', async () => {
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  const fileBytes = 'restart-before-put-bytes', fileName = 'restart-before-put.txt'
  const first = harness()
  // 传输层 mock：presign 正常受理，随后的 PUT 在发起即进程终止（重启于 PUT 前）。
  first.transport.mockImplementationOnce(async (url, init) => first.backendHandle(url, init))
  first.transport.mockImplementationOnce(async () => { throw new Error('mock restart before PUT') })
  setDraft(first, '重启前 PUT 的答复', new File([fileBytes], fileName, { type: 'text/plain' }))
  act(() => first.result.current.send())
  await waitFor(() => {
    expect(first.result.current.error).toMatchObject({ kind: 'network' })
    expect(first.result.current.sending).toBe(false)
  })
  const rows = journal.list()
  expect(rows).toHaveLength(1)
  const registered = rows[0]!
  expect(registered.phase).toBe('registered')
  expect(registered.assetId).not.toBeNull()
  const uploadId = registered.clientUploadId
  expect(uploadId).toMatch(/^[0-9a-f-]{36}$/i)
  first.unmount()

  // 重启恢复（同一服务端、客户端重挂载）：持久化 registered 检查点 → 只
  // status/renew 原 UUID，不二次 presign/register。
  const restarted = resumedOnSameBackend(first)
  await waitFor(() => expect(restarted.result.current.recoverableAttachments).toHaveLength(1))
  act(() => restarted.result.current.selectRecovery(restarted.result.current.recoverableAttachments[0]!))
  setDraft(restarted, '重启前 PUT 的答复', new File([fileBytes], fileName, { type: 'text/plain' }))
  act(() => restarted.result.current.send())
  await waitFor(() => {
    expect(restarted.result.current.sending).toBe(false)
    expect(restarted.result.current.error).toBeNull()
    expectDraft(restarted, '', null)
  })
  expect(restarted.presign).toHaveBeenCalledTimes(1) // register 只有最初 1 次
  // PUT 共 2 次调用：重启前 1 次发起即中止（服务端零落账），重启后恰好成功 1 次。
  expect(restarted.upload).toHaveBeenCalledTimes(2)
  expect(restarted.confirm).toHaveBeenCalledTimes(1)
  const presignBodies = restarted.transport.mock.calls
    .filter(([url]) => url.split('?')[0]!.endsWith('/assets/presign'))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
  expect(presignBodies.map((body) => body.operation)).toEqual(['register', 'status', 'renew'])
  expect(presignBodies.every((body) => body.client_upload_id === uploadId)).toBe(true)
  expect(restarted.sendMessage).toHaveBeenCalledTimes(1)
  expect(restarted.sendMessage.mock.calls[0]![2].clientMsgId).toBe(registered.clientMsgId)
  expect(journal.list()).toHaveLength(0)
})

it('seat_expired_capability_resume: expired capability resumes with a fresh presign keeping the same upload UUID and content hash', async () => {
  const clientMsgId = 'expired-capability-seat', clientUploadId = crypto.randomUUID()
  const file = new File(['expired-capability-bytes'], 'expired-capability.txt', { type: 'text/plain' })
  const objectHash = await blobSha256Hex(file)
  const journal = uploadJournal(['seat', '1000000000000000001', ORG, WS, IDENTITY, CONV], () => true)
  // 持久化 intent（原 presign 能力已过期：服务端会话不复存在）。
  await journal.save({ clientUploadId, clientMsgId, assetId: null, phase: 'intent', dispatchState: 'ready',
    objectHash, sizeBytes: file.size, mime: file.type, updatedAt: Date.now() })
  const view = harness()
  await waitFor(() => expect(view.result.current.recoverableAttachments).toHaveLength(1))
  act(() => view.result.current.selectRecovery(view.result.current.recoverableAttachments[0]!))
  setDraft(view, '能力过期后恢复的答复', file)
  act(() => view.result.current.send())
  await waitFor(() => {
    expect(view.result.current.sending).toBe(false)
    expect(view.result.current.error).toBeNull()
    expectDraft(view, '', null)
  })
  // 新 presign（register）复用原 client_upload_id 与原内容标识（object_hash）。
  expect(view.presign).toHaveBeenCalledTimes(1)
  expect(view.presign.mock.calls[0]![3]).toMatchObject({
    clientUploadId, objectHash, sizeBytes: file.size, mime: file.type,
  })
  const presignBodies = view.transport.mock.calls
    .filter(([url]) => url.split('?')[0]!.endsWith('/assets/presign'))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
  expect(presignBodies.map((body) => body.operation)).toEqual(['status', 'register', 'renew'])
  expect(presignBodies.every((body) => body.client_upload_id === clientUploadId)).toBe(true)
  expect(view.upload).toHaveBeenCalledTimes(1)
  expect(view.confirm).toHaveBeenCalledTimes(1)
  expect(view.sendMessage).toHaveBeenCalledTimes(1)
  expect(view.sendMessage.mock.calls[0]![2]).toMatchObject({ clientMsgId, assetIds: ['8100000000000000001'] })
  expect(journal.list()).toHaveLength(0)
})
