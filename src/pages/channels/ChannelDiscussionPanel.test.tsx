import '../../test/setupDom'
import { afterEach, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import client from '@/services/api/client'
import { ChannelDiscussionPanel } from './ChannelDiscussionPanel'

const originalGet = client.get
const originalPut = client.put
afterEach(() => { cleanup(); client.get = originalGet; client.put = originalPut })

function setup(profile: string, canManage = true, bound: string | null = null) {
  client.get = (async (url: string) => ({ data: { payload:
    url === '/admin/config/policy' ? { profile, features: { channel: true } } :
    url.endsWith('/candidates') ? { list: [{ id: '20', title: '同拥有者空群' }], page: 1, size: 10, total: 21 } :
    { discussion_group_id: bound },
  } })) as typeof client.get
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <ChannelDiscussionPanel channelId="10" canManage={canManage} />
  </QueryClientProvider>)
}

it('phase1 hides management even when channel flag is true', async () => {
  const view = setup('phase1_delivery')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) })
  expect(view.queryByText('保存讨论群')).toBeNull()
})

it('permission denial hides management', async () => {
  const view = setup('community', false)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) })
  expect(view.queryByText('保存讨论群')).toBeNull()
})

it('requires confirmation and preserves a conflict error', async () => {
  let writes = 0
  client.put = (async () => { writes++; throw new Error('讨论群已有内容，409冲突') }) as typeof client.put
  const view = setup('community')
  await view.findByText('保存讨论群')
  await waitFor(() => expect(view.getByLabelText('选择讨论群').hasAttribute('disabled')).toBe(false))
  fireEvent.change(view.getByLabelText('选择讨论群'), { target: { value: '20' } })
  fireEvent.click(view.getByText('保存讨论群'))
  expect(writes).toBe(0)
  fireEvent.click(await view.findByText('确认保存'))
  await waitFor(() => expect(writes).toBe(1))
  await waitFor(() => expect(view.getByRole('alert').textContent).toContain('409冲突'))
  expect(view.getByText('当前讨论群：未绑定')).toBeTruthy()
})

it('initial binding remains selected even when absent from empty candidates', async () => {
  const view = setup('community', true, '99')
  await waitFor(() => expect((view.getByLabelText('选择讨论群') as HTMLSelectElement).value).toBe('99'))
  expect(view.getByText('当前讨论群（99）')).toBeTruthy()
  expect(view.getByText('保存讨论群').hasAttribute('disabled')).toBe(true)
})

it('candidate paging preserves the explicit selection draft', async () => {
  const view = setup('community', true, '99')
  await waitFor(() => expect((view.getByLabelText('选择讨论群') as HTMLSelectElement).value).toBe('99'))
  fireEvent.change(view.getByLabelText('选择讨论群'), { target: { value: '20' } })
  fireEvent.click(view.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect((view.getByLabelText('选择讨论群') as HTMLSelectElement).value).toBe('20'))
})

it('explicit empty selection unbinds instead of falling back to the current binding', async () => {
  let saved: unknown
  let bound: string | null = '9007199254740993'
  client.put = (async (_url: string, data: unknown) => {
    saved = data
    bound = null
    return { data: { payload: { discussion_group_id: null } } }
  }) as typeof client.put
  const view = setup('community', true, bound)
  const get = client.get
  client.get = (async (...args: Parameters<typeof client.get>) => {
    if (String(args[0]).endsWith('/discussion')) return { data: { payload: { discussion_group_id: bound } } }
    return get(...args)
  }) as typeof client.get
  await waitFor(() => expect((view.getByLabelText('选择讨论群') as HTMLSelectElement).value).toBe('9007199254740993'))
  fireEvent.change(view.getByLabelText('选择讨论群'), { target: { value: '' } })
  fireEvent.click(view.getByText('保存讨论群'))
  fireEvent.click(await view.findByText('确认保存'))
  await waitFor(() => expect(saved).toEqual({ discussion_group_id: null }))
  await waitFor(() => expect(view.getByText('当前讨论群：未绑定')).toBeTruthy())
  expect((view.getByLabelText('选择讨论群') as HTMLSelectElement).value).toBe('')
  await waitFor(() => expect(view.getByText('保存讨论群').hasAttribute('disabled')).toBe(true))
})
