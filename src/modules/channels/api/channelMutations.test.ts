/**
 * Unit tests for channels/api/public.ts mutation & management functions:
 *   updateChannel, deleteChannel,
 *   pinChannelMessage, deleteChannelMessage,
 *   removeChannelSubscriber,
 *   updateChannelAdminRole, removeChannelAdmin
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  updateChannel,
  deleteChannel,
  pinChannelMessage,
  deleteChannelMessage,
  removeChannelSubscriber,
  updateChannelAdminRole,
  removeChannelAdmin,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { put: AnyFn; delete: AnyFn; post: AnyFn }
const mutableClient = client as unknown as MutableClient
const origPut = mutableClient.put
const origDelete = mutableClient.delete
const origPost = mutableClient.post

afterEach(() => {
  mutableClient.put = origPut
  mutableClient.delete = origDelete
  mutableClient.post = origPost
})

// ---------------------------------------------------------------------------
// updateChannel
// ---------------------------------------------------------------------------

describe('updateChannel', () => {
  it('resolves with response data on success', async () => {
    mutableClient.put = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await updateChannel('ch-1', { name: 'New Name' })
    expect(result.code).toBe(0)
  })

  it('sends update data to correct URL', async () => {
    let capturedUrl: unknown
    let capturedBody: unknown
    mutableClient.put = async (url: unknown, body: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await updateChannel('channel-99', { name: 'Updated', description: 'Desc' })
    expect(capturedUrl).toBe('/channel/detail/channel-99')
    expect((capturedBody as { name: string }).name).toBe('Updated')
  })
})

// ---------------------------------------------------------------------------
// deleteChannel
// ---------------------------------------------------------------------------

describe('deleteChannel', () => {
  it('resolves with response data on success', async () => {
    mutableClient.delete = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteChannel('ch-5')
    expect(result.code).toBe(0)
  })

  it('passes id in request body', async () => {
    let capturedConfig: unknown
    mutableClient.delete = async (_url: unknown, config: unknown) => {
      capturedConfig = config
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteChannel('ch-42')
    expect((capturedConfig as { data: { id: string } }).data.id).toBe('ch-42')
  })
})

// ---------------------------------------------------------------------------
// pinChannelMessage
// ---------------------------------------------------------------------------

describe('pinChannelMessage', () => {
  it('resolves with response data on success', async () => {
    mutableClient.put = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await pinChannelMessage('ch-1', 'msg-1', true)
    expect(result.code).toBe(0)
  })

  it('sends pinned=true to correct URL', async () => {
    let capturedUrl: unknown
    let capturedBody: unknown
    mutableClient.put = async (url: unknown, body: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await pinChannelMessage('ch-10', 'msg-20', true)
    expect(capturedUrl).toBe('/channel/ch-10/message/msg-20/pin')
    expect((capturedBody as { pinned: boolean }).pinned).toBe(true)
  })

  it('sends pinned=false for unpin', async () => {
    let capturedBody: unknown
    mutableClient.put = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await pinChannelMessage('ch-1', 'msg-1', false)
    expect((capturedBody as { pinned: boolean }).pinned).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// deleteChannelMessage
// ---------------------------------------------------------------------------

describe('deleteChannelMessage', () => {
  it('resolves with response data on success', async () => {
    mutableClient.delete = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteChannelMessage('ch-1', 'msg-1')
    expect(result.code).toBe(0)
  })

  it('calls correct URL', async () => {
    let capturedUrl: unknown
    mutableClient.delete = async (url: unknown) => {
      capturedUrl = url
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteChannelMessage('ch-5', 'msg-10')
    expect(capturedUrl).toBe('/channel/ch-5/message/msg-10/delete')
  })
})

// ---------------------------------------------------------------------------
// removeChannelSubscriber
// ---------------------------------------------------------------------------

describe('removeChannelSubscriber', () => {
  it('resolves with response data on success', async () => {
    mutableClient.delete = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await removeChannelSubscriber('ch-1', 'user-1')
    expect(result.code).toBe(0)
  })

  it('calls correct URL with channelId and userId', async () => {
    let capturedUrl: unknown
    mutableClient.delete = async (url: unknown) => {
      capturedUrl = url
      return { data: { code: 0, msg: 'ok' } }
    }
    await removeChannelSubscriber('channel-A', 'user-B')
    expect(capturedUrl).toBe('/channel/channel-A/subscriber/user-B')
  })
})

// ---------------------------------------------------------------------------
// updateChannelAdminRole
// ---------------------------------------------------------------------------

describe('updateChannelAdminRole', () => {
  it('resolves with response data on success', async () => {
    mutableClient.put = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await updateChannelAdminRole('ch-1', 'user-1', 2)
    expect(result.code).toBe(0)
  })

  it('sends role to correct URL', async () => {
    let capturedUrl: unknown
    let capturedBody: unknown
    mutableClient.put = async (url: unknown, body: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await updateChannelAdminRole('ch-99', 'user-42', 3)
    expect(capturedUrl).toBe('/channel/ch-99/admin/user-42/role')
    expect((capturedBody as { role: number }).role).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// removeChannelAdmin
// ---------------------------------------------------------------------------

describe('removeChannelAdmin', () => {
  it('resolves with response data on success', async () => {
    mutableClient.delete = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await removeChannelAdmin('ch-1', 'user-1')
    expect(result.code).toBe(0)
  })

  it('calls correct URL with channelId and userId', async () => {
    let capturedUrl: unknown
    mutableClient.delete = async (url: unknown) => {
      capturedUrl = url
      return { data: { code: 0, msg: 'ok' } }
    }
    await removeChannelAdmin('ch-77', 'admin-5')
    expect(capturedUrl).toBe('/channel/ch-77/admin/admin-5')
  })
})
