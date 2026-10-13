import { expect, test } from 'bun:test'
import { WidgetApiClient } from './widgetApi'

test('PATCH only installation and ids; exact receipts required and AbortSignal forwarded', async () => {
  const requests: RequestInit[] = []; let wrong = false
  const api = new WidgetApiClient(async (_path, init) => {
    requests.push(init!)
    return new Response(JSON.stringify({code:0,payload:{session_id:'10',highest_confirmed_id:'100',receipts:[{message_id:wrong?'3':'2',read_at:'2026-10-11T01:00:00Z'}]}}))
  })
  const abort = new AbortController()
  await api.confirmMessageReads('10', {installationId:'11'}, ['2','2'], abort.signal)
  expect(requests[0].method).toBe('PATCH'); expect(requests[0].signal).toBe(abort.signal)
  expect(JSON.parse(requests[0].body as string)).toEqual({installation_id:'11',message_ids:['2']})
  expect(requests[0].credentials).toBe('omit')
  wrong = true; await expect(api.confirmMessageReads('10',{installationId:'11'},['2'])).rejects.toThrow('收据')
})
test('null, empty, invalid and over-limit ids never issue network writes', async () => {
  let calls = 0; const api = new WidgetApiClient(async () => { calls++; throw Error('unexpected') })
  for (const ids of [null, [], ['0'], ['😀'], [1], Array(201).fill('2')]) {
    await expect(api.confirmMessageReads('10',{installationId:'11'}, ids as string[])).rejects.toThrow('请求形状')
  }
  expect(calls).toBe(0)
})
