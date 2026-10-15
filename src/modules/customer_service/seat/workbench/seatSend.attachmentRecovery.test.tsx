import '@/test/attachmentJournalFixture'
import { uploadJournal } from '@/lib/attachmentUploadJournal'
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
  const postOutcomes: (Response | Error)[] = []
  const getOutcomes: (Response | Error)[] = []
  const transport = spyOn(backend, 'handle').mockImplementation(async (url, init) => {
    if (url.split('?')[0]!.endsWith('/messages')) {
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
  return { ...view, transport, postOutcomes, getOutcomes, presign, upload, confirm, sendMessage }
}

type Harness = ReturnType<typeof harness>

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
