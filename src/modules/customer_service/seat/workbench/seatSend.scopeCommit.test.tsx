import '@/test/attachmentJournalFixture'
import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { act, startTransition, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SeatApiError } from '../errors'
import { SeatApiClient } from '../seatApiClient'
import { seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import type { EntityId } from '../types'
import type { SeatMessage } from './contract'
import { useSeatSendState } from './seatSend'
import { SeatWorkbenchApi } from './workbenchApi'

const SCOPE = {
  orgId: '72057594037927937', workspaceId: '72057594037927939', myIdentityId: '72057594037927940',
}
const CONVERSATION_A: EntityId = '72057594037927938'
const CONVERSATION_B: EntityId = '72057594037927941'
const roots: Root[] = []
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT

function historyPage(firstId: bigint, clientMsgId: string | null = null): SeatMessage[] {
  return Array.from({ length: 50 }, (_, rowIndex) => ({
    id: (firstId + BigInt(rowIndex)).toString(), senderType: 'business_identity',
    senderContactId: null, senderIdentityId: SCOPE.myIdentityId,
    clientMsgId: rowIndex === 25 ? clientMsgId : null,
    body: 'mock', createdAt: null, readAt: null, attachments: [],
  }))
}

function createProbe(lateHit: boolean) {
  let current!: ReturnType<typeof useSeatSendState>
  let releaseAtLayout = false
  let resolvePage!: (_rows: SeatMessage[]) => void
  const pendingPage = new Promise<SeatMessage[]>((resolve) => { resolvePage = resolve })
  const events: string[] = []
  const client = new SeatApiClient({ fetchImpl: mock(async () => { throw new Error('real transport forbidden') }) })
  const api = new SeatWorkbenchApi({ client })
  const sendMessage = spyOn(api, 'sendMessage').mockRejectedValue(new SeatApiError('network', 'mock lost response'))
  const fetchMessages = spyOn(api, 'fetchMessages').mockImplementation(async (): Promise<SeatMessage[]> => {
    const reads = fetchMessages.mock.calls.length
    events.push(`GET${reads}`)
    if (reads === 1) return historyPage(72057594037928000n)
    if (reads === 2) return pendingPage
    throw new Error('forbidden continuation after scope commit')
  })
  const invalidate = mock(() => { events.push('invalidate') })
  function Probe({ conversationId }: { conversationId: EntityId }) {
    current = useSeatSendState({ api, authSessionId: 'probe-auth', ...SCOPE, conversationId, invalidate })
    useLayoutEffect(() => {
      if (!releaseAtLayout || conversationId !== CONVERSATION_B) return
      events.push('B layout commit: resolve A response')
      resolvePage(historyPage(72057594037928050n, lateHit ? sendMessage.mock.calls[0]![2].clientMsgId : null))
      const deadline = performance.now() + 25
      while (performance.now() < deadline) { continue }
    }, [conversationId])
    return <div>{conversationId}</div>
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  roots.push(root)
  return {
    get current() { return current }, events, client, sendMessage, fetchMessages, invalidate,
    render: (conversationId: EntityId) => root.render(<Probe conversationId={conversationId} />),
    releaseOnCommit: () => { releaseAtLayout = true },
  }
}

afterEach(async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  for (const root of roots.splice(0)) await act(async () => root.unmount())
  seatTokenVault.clear()
  useSeatAuthStore.getState().clearSession('logout')
  mock.restore()
})

describe('CX03 scope commit→passive — mock API/JSDOM unit evidence only, not Required acceptance', () => {
  it.each([{ label: 'lateHit', lateHit: true }, { label: 'lateMiss', lateHit: false }])(
    'mock/JSDOM $label: B commit 后 A 第二页迟到不得清原稿、解锁、续查或重放 POST', async ({ label, lateHit }) => {
      const view = createProbe(lateHit)
      useSeatAuthStore.getState().setSession('72057594037928001')
      await act(async () => view.render(CONVERSATION_A))
      await act(async () => view.current.updateDraftBody('A original'))
      await act(async () => view.current.send())
      expect(view.current.outcomeUnknown).toBe(true)
      await act(async () => view.current.retry())
      expect(view.current.sending).toBe(true)
      expect(view.fetchMessages.mock.calls.map((call) => [...call.slice(0, 3), call[3]?.afterId ?? null, call[3]?.limit]))
        .toEqual([null, '72057594037928049'].map((afterId) => [SCOPE.orgId, CONVERSATION_A, SCOPE.workspaceId, afterId, 50]))
      view.releaseOnCommit()
      environment.IS_REACT_ACT_ENVIRONMENT = false
      try {
        startTransition(() => view.render(CONVERSATION_B))
        await new Promise<void>((resolve) => setTimeout(resolve, 100))
      } finally {
        environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
      }
      await act(async () => view.render(CONVERSATION_A))
      const observed = {
        label, events: view.events, reads: view.fetchMessages.mock.calls.length,
        posts: view.sendMessage.mock.calls.length, body: view.current.draft.body,
        unknown: view.current.outcomeUnknown, pending: view.current.sending,
        invalidations: view.invalidate.mock.calls.length,
      }
      console.log(JSON.stringify(observed))
      expect(view.events).toContain('B layout commit: resolve A response')
      expect(view.sendMessage).toHaveBeenCalledTimes(1)
      expect({ ...observed, events: undefined }).toEqual({
        label, events: undefined, reads: 2, posts: 1, body: 'A original', unknown: true, pending: false, invalidations: 0,
      })
    },
  )
})
