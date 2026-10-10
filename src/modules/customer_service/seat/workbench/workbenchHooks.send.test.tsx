import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { SeatApiError } from '../errors'
import { SeatApiClient } from '../seatApiClient'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import type { EntityId } from '../types'
import type { SeatMessage } from './contract'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatWorkbenchProvider, useSeatSend, type SeatWorkbenchGateway } from './workbenchHooks'

type SendScope = {
  orgId: EntityId | null
  conversationId: EntityId | null
  workspaceId: EntityId | null
  identityId: EntityId | null
}
type SendInput = Parameters<SeatWorkbenchApi['sendMessage']>[2]
type SendResult = Awaited<ReturnType<SeatWorkbenchApi['sendMessage']>>

const USER: EntityId = '72057594037928001'
const OTHER_USER: EntityId = '72057594037928002'
const SCOPE: SendScope = {
  orgId: '72057594037927937',
  conversationId: '72057594037927938',
  workspaceId: '72057594037927939',
  identityId: '72057594037927940',
}
const SCOPE_CHANGES: { label: string; scope: SendScope }[] = [
  { label: 'A/B conversation', scope: { ...SCOPE, conversationId: '72057594037927941' } },
  { label: 'organization', scope: { ...SCOPE, orgId: '72057594037927942' } },
  { label: 'workspace', scope: { ...SCOPE, workspaceId: '72057594037927943' } },
  { label: 'identity', scope: { ...SCOPE, identityId: '72057594037927944' } },
]
const BODY = "客服答复 🧾 中文 ' & +"
const queryClients: QueryClient[] = []

function deferred<Value>() {
  let resolve!: (_value: Value) => void
  let reject!: (_reason: unknown) => void
  const promise = new Promise<Value>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

function message(input?: Partial<SendInput>): SeatMessage {
  return {
    id: '72057594037927950', senderType: 'business_identity', senderContactId: null,
    senderIdentityId: input?.identityId ?? SCOPE.identityId, clientMsgId: input?.clientMsgId ?? null,
    body: input?.body ?? BODY, createdAt: null, readAt: null, attachments: [],
  }
}

function attachment(bytes = 'A', name = '凭证 🧾.txt') {
  return new File([bytes], name, { type: 'text/plain', lastModified: 1 })
}

function rejected() {
  return new SeatApiError('validation', 'mock explicit rejection', { status: 400, code: 400 })
}

function harness(initialProps: SendScope = SCOPE) {
  useSeatAuthStore.getState().setSession(USER)
  const client = new SeatApiClient({ fetchImpl: mock(async () => { throw new Error('Unexpected real transport') }) })
  const api = new SeatWorkbenchApi({ client })
  const sendMessage = spyOn(api, 'sendMessage').mockImplementation(async (_org, _conversation, input) => message(input))
  const fetchMessages = spyOn(api, 'fetchMessages').mockResolvedValue([])
  const presign = spyOn(api, 'requestAssetPresign').mockResolvedValue({
    assetId: '72057594037927951', uploadRef: 'mock-upload-ref',
    uploadUrl: 'https://upload.invalid/mock', expiresAt: null,
  })
  const upload = spyOn(api, 'uploadAssetBytes').mockResolvedValue(undefined)
  const confirm = spyOn(api, 'confirmAssetUpload').mockResolvedValue(undefined)
  const gateway: SeatWorkbenchGateway = {
    api, createStream: mock(() => { throw new Error('Send unit test must not start SSE') }),
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  queryClients.push(queryClient)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider>
    </QueryClientProvider>
  )
  const view = renderHook((scope: SendScope) => useSeatSend(
    scope.orgId, scope.conversationId, scope.workspaceId, scope.identityId,
  ) as ReturnType<typeof useSeatSend> & { outcomeUnknown?: boolean }, { wrapper, initialProps })
  return { ...view, sendMessage, fetchMessages, presign, upload, confirm }
}

type Harness = ReturnType<typeof harness>

function setDraft(view: Harness, body = BODY, file?: File) {
  act(() => {
    view.result.current.updateDraftBody(body)
    if (file !== undefined) view.result.current.attachFile(file)
  })
}

async function failSend(view: Harness, error: SeatApiError = rejected()) {
  view.sendMessage.mockRejectedValueOnce(error)
  act(() => view.result.current.send())
  await waitFor(() => expect(view.result.current.error).toBe(error))
  expect(view.result.current.sending).toBe(false)
  return view.sendMessage.mock.calls[0]![2]
}

function expectDraft(view: Harness, body: string, file: File | null) {
  expect(view.result.current.draft).toEqual({
    body, fileName: file?.name ?? null, fileSize: file?.size ?? null,
  })
}

afterEach(() => {
  cleanup()
  for (const queryClient of queryClients.splice(0)) queryClient.clear()
  mock.restore()
  seatTokenVault.clear()
  useSeatAuthStore.getState().clearSession('logout')
})

describe('CX03 useSeatSend direct hook — mock API/JSDOM unit evidence only, not Required acceptance', () => {
  it.each(['', ' \n\t '])('空白正文且无附件不调用 POST gateway (%j)', (body) => {
    const view = harness()
    setDraft(view, body)
    act(() => { view.result.current.send(); view.result.current.retry() })
    expect(view.sendMessage).not.toHaveBeenCalled()
    expect(view.presign).not.toHaveBeenCalled()
    expect(view.result.current.sending).toBe(false)
  })

  it.each(['orgId', 'conversationId', 'workspaceId', 'identityId'] as const)(
    '缺少 %s 时 fail-closed，不调用上传或消息 API', (key) => {
      const view = harness({ ...SCOPE, [key]: null })
      setDraft(view, BODY, attachment())
      act(() => view.result.current.send())
      expect(view.sendMessage).not.toHaveBeenCalled()
      expect(view.presign).not.toHaveBeenCalled()
      expect(view.result.current.error).not.toBeNull()
      expect(view.result.current.sending).toBe(false)
    },
  )

  it('正文带 Unicode/特殊字符通过原 API 合同发送，成功清空正文与附件', async () => {
    const view = harness()
    setDraft(view, `  ${BODY}  `)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expect(view.sendMessage.mock.calls[0]).toEqual([SCOPE.orgId, SCOPE.conversationId, {
      body: BODY, workspaceId: SCOPE.workspaceId, identityId: SCOPE.identityId,
      assetIds: [], clientMsgId: expect.any(String),
    }])
    expectDraft(view, '', null)
    expect(view.result.current.error).toBeNull()
  })

  it.each(SCOPE_CHANGES)('$label 正文与 File 隔离，切回还原，发送的是各自原 File', async ({ scope }) => {
    const view = harness()
    const fileA = attachment('A')
    const fileB = attachment('B')
    setDraft(view, 'A 草稿', fileA)
    view.rerender(scope)
    expectDraft(view, '', null)
    setDraft(view, 'B 草稿', fileB)
    view.rerender(SCOPE)
    expectDraft(view, 'A 草稿', fileA)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
    expect(view.upload.mock.calls[0]![1]).toBe(fileA)
    expect(view.presign.mock.calls[0]!.slice(0, 3)).toEqual([
      SCOPE.orgId, SCOPE.conversationId, SCOPE.workspaceId,
    ])
    view.rerender(scope)
    expectDraft(view, 'B 草稿', fileB)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    expect(view.upload.mock.calls[1]![1]).toBe(fileB)
    expect(view.presign.mock.calls[1]!.slice(0, 3)).toEqual([
      scope.orgId, scope.conversationId, scope.workspaceId,
    ])
    expect(view.sendMessage.mock.calls[1]![2].identityId).toBe(scope.identityId)
    expect(view.presign.mock.calls[0]![3].objectHash).not.toBe(view.presign.mock.calls[1]![3].objectHash)
  })

  it.each(SCOPE_CHANGES)('$label error 隔离，B 的明确拒绝不覆盖 A', async ({ scope }) => {
    const view = harness()
    const errorA = rejected()
    setDraft(view, 'A 草稿')
    await failSend(view, errorA)
    view.rerender(scope)
    expect(view.result.current.error).toBeNull()
    setDraft(view, 'B 草稿')
    const errorB = rejected()
    await failSend(view, errorB)
    view.rerender(SCOPE)
    expect(view.result.current.error).toBe(errorA)
    expectDraft(view, 'A 草稿', null)
  })

  it.each(SCOPE_CHANGES)('$label busy 隔离，A 完成不能解除 B 正在发送的 busy', async ({ scope }) => {
    const view = harness()
    const pendingA = deferred<SendResult>()
    const pendingB = deferred<SendResult>()
    view.sendMessage.mockImplementationOnce(() => pendingA.promise).mockImplementationOnce(() => pendingB.promise)
    setDraft(view, 'A 草稿')
    act(() => view.result.current.send())
    expect(view.result.current.sending).toBe(true)
    view.rerender(scope)
    expect(view.result.current.sending).toBe(false)
    setDraft(view, 'B 草稿')
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(2)
    await act(async () => pendingA.resolve(message(view.sendMessage.mock.calls[0]![2])))
    expect(view.result.current.sending).toBe(true)
    expectDraft(view, 'B 草稿', null)
    await act(async () => pendingB.resolve(message(view.sendMessage.mock.calls[1]![2])))
    expect(view.result.current.sending).toBe(false)
  })

  it.each(['send', 'retry'] as const)('同一同步批次双击 %s 只调用一次 POST gateway', async (method) => {
    const view = harness()
    const pending = deferred<SendResult>()
    view.sendMessage.mockImplementation(() => pending.promise)
    setDraft(view)
    act(() => { view.result.current[method](); view.result.current[method]() })
    const count = view.sendMessage.mock.calls.length
    await act(async () => pending.resolve(message()))
    expect(count).toBe(1)
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'] as const)('A 在途切 B 后 A %s 不清 B 正文/File 或带入 error', async (outcome) => {
    const view = harness()
    const pending = deferred<SendResult>()
    view.sendMessage.mockImplementationOnce(() => pending.promise)
    setDraft(view, 'A 草稿')
    act(() => view.result.current.send())
    view.rerender(SCOPE_CHANGES[0]!.scope)
    const fileB = attachment('B')
    setDraft(view, 'B 草稿', fileB)
    await act(async () => {
      if (outcome === 'success') pending.resolve(message())
      else pending.reject(rejected())
    })
    expectDraft(view, 'B 草稿', fileB)
    expect(view.result.current.error).toBeNull()
    expect(view.result.current.sending).toBe(false)
  })

  it('明确失败后不编辑，同参 retry 复用 clientMsgId，保留失败草稿直到成功', async () => {
    const view = harness()
    setDraft(view)
    const original = await failSend(view)
    expectDraft(view, BODY, null)
    expect(original.clientMsgId.length).toBeGreaterThan(0)
    const pending = deferred<SendResult>()
    view.sendMessage.mockImplementationOnce(() => pending.promise)
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    expect(view.sendMessage.mock.calls[1]![2]).toEqual(original)
    expect(view.result.current.sending).toBe(true)
    expectDraft(view, BODY, null)
    await act(async () => pending.resolve(message(original)))
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expectDraft(view, '', null)
  })

  it('确定拒绝后改正文必须生成新 clientMsgId', async () => {
    const view = harness()
    setDraft(view)
    const original = await failSend(view)
    setDraft(view, '修改后的正文')
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    const edited = view.sendMessage.mock.calls[1]![2]
    expect(edited.body).toBe('修改后的正文')
    expect(edited.clientMsgId).not.toBe(original.clientMsgId)
  })

  it.each(['replace', 'detach'] as const)('确定拒绝后 %s 附件必须生成新 id，替换同名同尺寸不同字节 File 不能误复用', async (change) => {
    const view = harness()
    const originalFile = attachment('A')
    const editedFile = attachment('B')
    setDraft(view, BODY, originalFile)
    const original = await failSend(view)
    act(() => {
      if (change === 'replace') view.result.current.attachFile(editedFile)
      else view.result.current.detachFile()
    })
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    const edited = view.sendMessage.mock.calls[1]![2]
    expect(edited.clientMsgId).not.toBe(original.clientMsgId)
    if (change === 'replace') {
      expect(view.upload.mock.calls[1]![1]).toBe(editedFile)
      expect(view.presign.mock.calls[1]![3].objectHash).not.toBe(view.presign.mock.calls[0]![3].objectHash)
    } else {
      expect(edited.assetIds).toEqual([])
      expect(view.upload).toHaveBeenCalledTimes(1)
    }
  })

  it('confirm 成功但消息确定失败：retry 复用 assetIds/clientMsgId，不重复 presign/PUT/confirm', async () => {
    const view = harness()
    const file = attachment()
    setDraft(view, '', file)
    const original = await failSend(view)
    expectDraft(view, '', file)
    expect(original.assetIds).toEqual(['72057594037927951'])
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    expect(view.sendMessage.mock.calls[1]![2]).toEqual(original)
    expect(view.presign).toHaveBeenCalledTimes(1)
    expect(view.upload).toHaveBeenCalledTimes(1)
    expect(view.confirm).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(view.result.current.sending).toBe(false)
      expectDraft(view, '', null)
    })
  })

  it.each(['presign', 'upload', 'confirm'] as const)('附件 %s 拒绝保留正文/File 且不发消息', async (stage) => {
    const view = harness()
    const error = rejected()
    const file = attachment()
    view[stage].mockRejectedValueOnce(error)
    setDraft(view, BODY, file)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.result.current.error).toBe(error))
    expectDraft(view, BODY, file)
    expect(view.sendMessage).not.toHaveBeenCalled()
    expect(view.result.current.sending).toBe(false)
  })

  it('注销即清空草稿/File/error/busy，旧消息失败回包不能恢复它们', async () => {
    const view = harness()
    const pending = deferred<SendResult>()
    view.sendMessage.mockImplementationOnce(() => pending.promise)
    setDraft(view, BODY, attachment())
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
    act(() => useSeatAuthStore.getState().clearSession('logout'))
    await act(async () => pending.reject(rejected()))
    expectDraft(view, '', null)
    expect(view.result.current.error).toBeNull()
    expect(view.result.current.sending).toBe(false)
  })

  it.each([
    { label: '注销后同账号重登', logout: true, userId: USER },
    { label: '注销后其他账号登录', logout: true, userId: OTHER_USER },
    { label: '同账号重新认证', logout: false, userId: USER },
  ])('$label 旧 confirm 异步不能恢复草稿/asset 或继续旧 POST', async ({ logout, userId }) => {
    const view = harness()
    const pending = deferred<void>()
    view.confirm.mockImplementationOnce(() => pending.promise)
    setDraft(view, '旧认证草稿', attachment('A'))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.confirm).toHaveBeenCalledTimes(1))
    act(() => {
      if (logout) useSeatAuthStore.getState().clearSession('logout')
      useSeatAuthStore.getState().setSession(userId)
    })
    const freshFile = attachment('B')
    setDraft(view, '新认证草稿', freshFile)
    await act(async () => pending.resolve(undefined))
    expect(view.sendMessage).not.toHaveBeenCalled()
    expectDraft(view, '新认证草稿', freshFile)
    expect(view.result.current.error).toBeNull()
    expect(view.result.current.sending).toBe(false)
  })
})

describe('CX03 UNKNOWN — 最新有限消息页未命中不是负向精确证明，仅单测证据', () => {
  it.each([USER, OTHER_USER])('旧 render 的 send 在重新认证 %s 后不能发送旧正文/File', async (userId) => {
    const view = harness()
    setDraft(view, '旧私密草稿', attachment())
    const oldSend = view.result.current.send
    act(() => { useSeatAuthStore.getState().clearSession('logout'); useSeatAuthStore.getState().setSession(userId) })
    setDraft(view, '新账号草稿')
    await act(async () => oldSend())
    expect(view.presign).not.toHaveBeenCalled()
    expect(view.sendMessage).not.toHaveBeenCalled()
    expectDraft(view, '新账号草稿', null)
  })

  it('已卸载 hook 的旧 send 回调不能重新发起 POST', async () => {
    const view = harness()
    setDraft(view)
    const oldSend = view.result.current.send
    view.unmount()
    await act(async () => oldSend())
    expect(view.sendMessage).not.toHaveBeenCalled()
  })

  it('在途编辑后 confirm 推进加 POST 明确拒绝不能恢复旧快照或旧幂等键', async () => {
    const view = harness()
    const pending = deferred<void>()
    view.confirm.mockImplementationOnce(() => pending.promise)
    view.sendMessage.mockRejectedValueOnce(rejected())
    setDraft(view, '旧正文', attachment())
    act(() => view.result.current.send())
    await waitFor(() => expect(view.confirm).toHaveBeenCalledTimes(1))
    act(() => view.result.current.updateDraftBody('新正文'))
    await act(async () => pending.resolve(undefined))
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    expect(view.sendMessage.mock.calls[1]![2].body).toBe('新正文')
    expect(view.sendMessage.mock.calls[1]![2].clientMsgId).not.toBe(view.sendMessage.mock.calls[0]![2].clientMsgId)
    expect(view.presign).toHaveBeenCalledTimes(1)
    expect(view.confirm).toHaveBeenCalledTimes(1)
  })

  it('presign 回包前注销重登，不能用新身份继续 PUT/confirm/POST', async () => {
    const view = harness()
    const pending = deferred<Awaited<ReturnType<SeatWorkbenchApi['requestAssetPresign']>>>()
    view.presign.mockImplementationOnce(() => pending.promise)
    setDraft(view, BODY, attachment())
    act(() => view.result.current.send())
    await waitFor(() => expect(view.presign).toHaveBeenCalledTimes(1))
    act(() => { useSeatAuthStore.getState().clearSession('logout'); useSeatAuthStore.getState().setSession(OTHER_USER) })
    await act(async () => pending.resolve({ assetId: '72057594037927951', uploadRef: 'old-ref', uploadUrl: 'https://upload.invalid/mock', expiresAt: null }))
    expect(view.upload).not.toHaveBeenCalled()
    expect(view.confirm).not.toHaveBeenCalled()
    expect(view.sendMessage).not.toHaveBeenCalled()
    expectDraft(view, '', null)
  })

  it('PUT 已开始不伪称取消，注销后迟到回包不能继续 confirm/POST', async () => {
    const view = harness()
    const pending = deferred<void>()
    view.upload.mockImplementationOnce(() => pending.promise)
    setDraft(view, BODY, attachment())
    act(() => view.result.current.send())
    await waitFor(() => expect(view.upload).toHaveBeenCalledTimes(1))
    act(() => useSeatAuthStore.getState().clearSession('logout'))
    await act(async () => pending.resolve(undefined))
    expect(view.upload).toHaveBeenCalledTimes(1)
    expect(view.confirm).not.toHaveBeenCalled()
    expect(view.sendMessage).not.toHaveBeenCalled()
  })

  it('旧账号已发起 POST 的迟到 401 不能登出新账号', async () => {
    const view = harness()
    const pending = deferred<SendResult>()
    view.sendMessage.mockImplementationOnce(() => pending.promise)
    setDraft(view)
    act(() => view.result.current.send())
    act(() => { useSeatAuthStore.getState().clearSession('logout'); useSeatAuthStore.getState().setSession(OTHER_USER) })
    setDraft(view, '新账号草稿')
    await act(async () => pending.reject(new SeatApiError('unauthorized', 'old request')))
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
    expect(useSeatAuthStore.getState().userId).toBe(OTHER_USER)
    expectDraft(view, '新账号草稿', null)
  })

  it.each(['network', 'server', 'invalid_response'] as const)(
    '%s 可能已提交：retry 先查真源；同 clientMsgId + senderIdentityId 命中才清草稿', async (kind) => {
      const view = harness()
      const file = attachment()
      const pendingQuery = deferred<SeatMessage[]>()
      setDraft(view, BODY, file)
      const original = await failSend(view, new SeatApiError(kind, 'mock uncertain POST outcome'))
      view.fetchMessages.mockImplementationOnce(() => pendingQuery.promise)
      act(() => view.result.current.retry())
      await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(1))
      expect(view.fetchMessages.mock.calls[0]!.slice(0, 3)).toEqual([
        SCOPE.orgId, SCOPE.conversationId, SCOPE.workspaceId,
      ])
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expectDraft(view, BODY, file)
      expect(view.result.current.outcomeUnknown).toBe(true)
      await act(async () => pendingQuery.resolve([message(original)]))
      expectDraft(view, '', null)
      expect(view.result.current.error).toBeNull()
      expect(view.result.current.sending).toBe(false)
      expect(view.result.current.outcomeUnknown).toBe(false)
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expect(view.confirm).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['empty latest page', 'same id wrong sender', 'same sender wrong id'] as const)(
    '%s：保持未决，不清草稿，不因有限最新页未命中而 POST', async (mismatch) => {
      const view = harness()
      setDraft(view)
      const original = await failSend(view, new SeatApiError('network', 'mock uncertain POST outcome'))
      const rows = mismatch === 'empty latest page' ? [] : [message({
        ...original,
        ...(mismatch === 'same id wrong sender'
          ? { identityId: '72057594037927999' } : { clientMsgId: 'another-message' }),
      })]
      view.fetchMessages.mockResolvedValue(rows)
      act(() => view.result.current.retry())
      await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expectDraft(view, BODY, null)
      expect(view.result.current.error).not.toBeNull()
      expect(view.result.current.outcomeUnknown).toBe(true)
      act(() => view.result.current.retry())
      await act(async () => {})
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expectDraft(view, BODY, null)
    },
  )

  it('UNKNOWN 真源查询失败保持未决，不能清草稿或重发 POST', async () => {
    const view = harness()
    const file = attachment()
    setDraft(view, BODY, file)
    await failSend(view, new SeatApiError('server', 'mock uncertain POST outcome', { status: 503 }))
    view.fetchMessages.mockRejectedValue(new SeatApiError('network', 'mock authoritative read failed'))
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expectDraft(view, BODY, file)
    expect(view.result.current.error).not.toBeNull()
    expect(view.result.current.outcomeUnknown).toBe(true)
    expect(view.confirm).toHaveBeenCalledTimes(1)
  })

  it.each(['body', 'replace file', 'detach file'] as const)(
    'UNKNOWN 后改 %s 不能换新 id 绕过未决状态重放', async (edit) => {
      const view = harness()
      const file = attachment('A')
      setDraft(view, BODY, file)
      await failSend(view, new SeatApiError('invalid_response', 'mock response lost after commit'))
      act(() => {
        if (edit === 'body') view.result.current.updateDraftBody('编辑后的正文')
        else if (edit === 'replace file') view.result.current.attachFile(attachment('B'))
        else view.result.current.detachFile()
      })
      act(() => view.result.current.send())
      await act(async () => {})
      act(() => view.result.current.retry())
      await act(async () => {})
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expect(view.result.current.draft.body.length).toBeGreaterThan(0)
      expect(view.result.current.error).not.toBeNull()
      expect(view.result.current.outcomeUnknown).toBe(true)
    },
  )

  it.each(['send', 'retry'] as const)('UNKNOWN 编辑后 %s 只核对原 snapshot，命中解锁但保留新草稿', async (method) => {
    const view = harness()
    const oldFile = attachment('A')
    setDraft(view, BODY, oldFile)
    const original = await failSend(view, new SeatApiError('network', 'mock uncertain POST outcome'))
    const pendingQuery = deferred<SeatMessage[]>()
    view.fetchMessages.mockImplementationOnce(() => pendingQuery.promise)
    const freshFile = attachment('B')
    setDraft(view, '编辑后的正文', freshFile)
    act(() => view.result.current[method]())
    await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(1))
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expect(view.result.current.outcomeUnknown).toBe(true)
    await act(async () => pendingQuery.resolve([message(original)]))
    expect(view.result.current.outcomeUnknown).toBe(false)
    expectDraft(view, '编辑后的正文', freshFile)
    expect(view.result.current.error).toBeNull()
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(2))
    expect(view.sendMessage.mock.calls[1]![2].clientMsgId).not.toBe(original.clientMsgId)
    expect(view.sendMessage.mock.calls[1]![2].body).toBe('编辑后的正文')
    expect(view.upload.mock.calls[1]![1]).toBe(freshFile)
  })

  it('UNKNOWN 正在核对时注销重登，迟到命中不得清新草稿或恢复旧认证状态', async () => {
    const view = harness()
    setDraft(view)
    const original = await failSend(view, new SeatApiError('network', 'mock uncertain POST outcome'))
    const pendingQuery = deferred<SeatMessage[]>()
    view.fetchMessages.mockImplementationOnce(() => pendingQuery.promise)
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.fetchMessages).toHaveBeenCalledTimes(1))
    act(() => {
      useSeatAuthStore.getState().clearSession('logout')
      useSeatAuthStore.getState().setSession(USER)
    })
    const freshFile = attachment('B')
    setDraft(view, '新认证草稿', freshFile)
    await act(async () => pendingQuery.resolve([message(original)]))
    expectDraft(view, '新认证草稿', freshFile)
    expect(view.result.current.error).toBeNull()
    expect(view.result.current.sending).toBe(false)
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
  })
})
