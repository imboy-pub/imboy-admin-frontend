import '../../../../test/setupDom'

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { SeatSessionDetail } from './contract'
import { SeatSessionView } from './sessionView'
import { CONTACT, CONV, IDENTITY, ORG, SESSION, WS } from './workbenchTestHarness'

afterEach(cleanup)

const detail: SeatSessionDetail = {
  id: SESSION,
  organizationId: ORG,
  workspaceId: WS,
  contactId: CONTACT,
  conversationId: CONV,
  businessIdentityId: IDENTITY,
  status: 'active',
  version: 8,
  queuedAt: 1758999975,
  claimedAt: 1759000025,
  closedAt: null,
  source: 'widget',
  contactMaskedName: '王***',
  lastMessage: { id: null, senderType: null, preview: null, createdAt: null },
  waitingSeconds: null,
  unreadCount: null,
  needsReply: null,
  visitorMaskedName: '王***',
  visitorSource: '网页组件',
}

describe('SeatSessionView composer keyboard regression', () => {
  it.each([
    {
      name: 'IME Enter with nativeEvent.isComposing does not send or preventDefault',
      isComposing: true,
      keyCode: 13,
      shiftKey: false,
      sendCount: 0,
      defaultPrevented: false,
    },
    {
      name: 'IME Enter with keyCode 229 does not send or preventDefault',
      isComposing: false,
      keyCode: 229,
      shiftKey: false,
      sendCount: 0,
      defaultPrevented: false,
    },
    {
      name: 'control: ordinary Enter sends exactly once and prevents default',
      isComposing: false,
      keyCode: 13,
      shiftKey: false,
      sendCount: 1,
      defaultPrevented: true,
    },
    {
      name: 'control: Shift+Enter preserves newline default without sending',
      isComposing: false,
      keyCode: 13,
      shiftKey: true,
      sendCount: 0,
      defaultPrevented: false,
    },
  ])('$name', ({ isComposing, keyCode, shiftKey, sendCount, defaultPrevented }) => {
    const onSend = mock(() => {})
    const props = {
      fetchAssetBlob: mock(async () => new Blob()),
      detail,
      messages: [],
      messagesLoading: false,
      messagesError: null,
      onRetryMessages: mock(() => {}),
      canWrite: true,
      writeClosedReason: null,
      draft: { body: '您好，请问有什么可以帮您？', fileName: null, fileSize: null },
      onUpdateDraftBody: mock(() => {}),
      onAttachFile: mock((_file: File) => {}),
      onDetachFile: mock(() => {}),
      onSend,
      onRetrySend: mock(() => {}),
      sendError: null,
      sending: false,
    } satisfies ComponentProps<typeof SeatSessionView>
    const view = render(<SeatSessionView {...props} />)
    const composer = view.getByRole('textbox', { name: '回复访客' })
    composer.focus()
    expect(document.activeElement).toBe(composer)
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing,
      keyCode,
      shiftKey,
      bubbles: true,
      cancelable: true,
    })

    expect(event).toMatchObject({ isComposing, keyCode, shiftKey, defaultPrevented: false })
    expect(onSend).toHaveBeenCalledTimes(0)
    fireEvent(composer, event)
    expect({ sendCount: onSend.mock.calls.length, defaultPrevented: event.defaultPrevented })
      .toEqual({ sendCount, defaultPrevented })
    expect(composer).toHaveProperty('value', props.draft.body)
  })
})
