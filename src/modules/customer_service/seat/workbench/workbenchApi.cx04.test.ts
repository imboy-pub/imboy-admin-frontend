import { expect, it, spyOn } from 'bun:test'
import { SeatApiClient } from '../seatApiClient'
import { SeatWorkbenchApi } from './workbenchApi'

it('message-specific before cursor/order preserves legacy after/limit wire semantics and rejects mixed cursors before transport', async () => {
  const client = new SeatApiClient()
  const request = spyOn(client, 'request').mockResolvedValue([])
  const api = new SeatWorkbenchApi({ client })
  await api.fetchMessages('11', '12', '13', { beforeId: '72057594037928000', order: 'desc', limit: 50 })
  expect(request.mock.calls[0]?.[1]?.query).toEqual({
    organization_id: '11', workspace_id: '13', before_id: '72057594037928000', order: 'desc', limit: '50',
  })
  await api.fetchMessages('11', '12', '13', { afterId: '72057594037927999', limit: 20 })
  expect(request.mock.calls[1]?.[1]?.query).toEqual({
    organization_id: '11', workspace_id: '13', after_id: '72057594037927999', limit: '20',
  })
  await expect(api.fetchMessages('11', '12', '13', { afterId: '1', beforeId: '2' })).rejects.toBeInstanceOf(TypeError)
  expect(request.mock.calls.length).toBe(2)
  request.mockRestore()
})
