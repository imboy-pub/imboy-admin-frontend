import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useSeatAuthStore } from '../seatAuthStore'
import { useSeatSendState } from './seatSend'
import { CONV, FakeSseStream, IDENTITY, ORG, SeatFakeBackend, WS, makeGateway } from './workbenchTestHarness'

function harness() {
  useSeatAuthStore.getState().setSession('1000000000000000001')
  const api = makeGateway(new SeatFakeBackend(), new FakeSseStream()).api
  const originalSend = api.sendMessage.bind(api)
  const sendMessage = spyOn(api, 'sendMessage')
  const presign = spyOn(api, 'requestAssetPresign')
  const view = renderHook(() => useSeatSendState({
    api, authSessionId: 'body-limit-test', orgId: ORG, conversationId: CONV,
    workspaceId: WS, myIdentityId: IDENTITY, invalidate: mock(() => {}),
  }))
  return { ...view, api, originalSend, sendMessage, presign }
}

afterEach(() => {
  cleanup()
  mock.restore()
  useSeatAuthStore.getState().clearSession('logout')
})

describe('CX03 UTF-8 body / 4000 code points — unit/mock only', () => {
  it.each(['a', '中', '😀'])('accepts exactly 4000 %s code points without truncation', async (character) => {
    const view = harness()
    const body = character.repeat(4000)
    act(() => view.result.current.updateDraftBody(body))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
    expect(view.sendMessage.mock.calls[0]![2].body).toBe(body)
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(view.result.current.error).toBeNull()
  })

  it.each(['a', '中', '😀'])('rejects 4001 %s code points before sending or uploading, preserving the draft', async (character) => {
    const view = harness()
    const body = character.repeat(4001)
    const file = new File(['fixture'], 'draft.txt', { type: 'text/plain' })
    act(() => {
      view.result.current.updateDraftBody(body)
      view.result.current.attachFile(file)
    })
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(0)
    expect(view.presign).toHaveBeenCalledTimes(0)
    expect(view.result.current.sending).toBe(false)
    expect(view.result.current.outcomeUnknown).toBe(false)
    expect(view.result.current.draft).toMatchObject({ body, fileName: file.name })
    expect(view.result.current.error).toBeInstanceOf(Error)
    expect((view.result.current.error as Error).message).toContain('4000')
  })

  it('counts combining marks and newlines as code points, not graphemes', () => {
    const view = harness()
    const body = 'e\u0301\n'.repeat(1334)
    act(() => view.result.current.updateDraftBody(body))
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(0)
    expect(view.result.current.draft.body).toBe(body)
  })

  it.each(['\uD800', '\uDC00'])('rejects an unpaired surrogate without uploading or changing the draft', (surrogate) => {
    const view = harness()
    const body = `invalid${surrogate}`
    const file = new File(['fixture'], 'draft.txt', { type: 'text/plain' })
    act(() => {
      view.result.current.updateDraftBody(body)
      view.result.current.attachFile(file)
    })
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(0)
    expect(view.presign).toHaveBeenCalledTimes(0)
    expect(view.result.current.draft).toMatchObject({ body, fileName: file.name })
    expect(view.result.current.error).toBeInstanceOf(Error)
  })

  it('validates the trimmed outgoing body without changing the original draft on rejection', async () => {
    const view = harness()
    const valid = ` \n${'中'.repeat(4000)}\t `
    act(() => view.result.current.updateDraftBody(valid))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expect(view.sendMessage.mock.calls[0]![2].body).toBe(valid.trim())
    const invalid = ` \n${'中'.repeat(4001)}\t `
    act(() => view.result.current.updateDraftBody(invalid))
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expect(view.result.current.draft.body).toBe(invalid)
    expect(view.result.current.error).toBeInstanceOf(Error)
  })

  it.each([
    { label: 'over limit', body: '中'.repeat(4001) },
    { label: 'unpaired high surrogate', body: 'invalid\uD800' },
    { label: 'unpaired low surrogate', body: 'invalid\uDC00' },
  ])('UNKNOWN with $label new draft still queries the original attempt without replay or upload', async ({ body }) => {
    const view = harness()
    view.sendMessage.mockImplementationOnce(async (...parameters) => {
      await view.originalSend(...parameters)
      throw new Error('ACK lost after canonical acceptance')
    })
    act(() => view.result.current.updateDraftBody('original reply'))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.result.current.outcomeUnknown).toBe(true))
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    const originalKey = view.sendMessage.mock.calls[0]![2].clientMsgId
    const file = new File(['fixture'], 'new-draft.txt', { type: 'text/plain' })
    act(() => {
      view.result.current.updateDraftBody(body)
      view.result.current.attachFile(file)
    })
    const fetchMessages = spyOn(view.api, 'fetchMessages').mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: '9000000000000000011', senderType: 'business_identity',
      senderContactId: null, senderIdentityId: IDENTITY, clientMsgId: originalKey,
      body: 'original reply', createdAt: null, readAt: null, attachments: [],
    }])
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(fetchMessages).toHaveBeenCalledTimes(1)
    expect(fetchMessages.mock.calls[0]).toEqual([ORG, CONV, WS, { limit: 50 }])
    expect(view.result.current.outcomeUnknown).toBe(true)
    expect(view.result.current.draft).toMatchObject({ body, fileName: file.name })
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.result.current.outcomeUnknown).toBe(false))
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(fetchMessages).toHaveBeenCalledTimes(2)
    expect(view.sendMessage).toHaveBeenCalledTimes(1)
    expect(view.sendMessage.mock.calls[0]![2].clientMsgId).toBe(originalKey)
    expect(view.presign).toHaveBeenCalledTimes(0)
    expect(view.result.current.draft).toMatchObject({ body, fileName: file.name })
    expect(view.result.current.error).toBeNull()
  })

  it('allows an edited valid draft after a local length rejection', async () => {
    const view = harness()
    act(() => view.result.current.updateDraftBody('中'.repeat(4001)))
    act(() => view.result.current.send())
    expect(view.sendMessage).toHaveBeenCalledTimes(0)
    act(() => view.result.current.updateDraftBody('已缩短'))
    act(() => view.result.current.send())
    await waitFor(() => expect(view.sendMessage).toHaveBeenCalledTimes(1))
    expect(view.sendMessage.mock.calls[0]![2].body).toBe('已缩短')
    await waitFor(() => expect(view.result.current.sending).toBe(false))
    expect(view.result.current.error).toBeNull()
  })
})
