import { expect, test } from 'bun:test'
import { createVisitorReads, canonicalReadId } from './visitorRead'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
test('canonical ids reject unsafe inputs and preserve bigint', () => {
  for (const id of [null, undefined, 1, '', '0', '01', '-1', '1.2', '9223372036854775808', '😀']) expect(canonicalReadId(id)).toBe(false)
  expect(canonicalReadId('9223372036854775807')).toBe(true)
})
test('only observed foreground ids, sets preserve lower later reads and deduplicate', async () => {
  const calls: string[][] = []; let active = false
  const reads = createVisitorReads(() => active, async ids => { calls.push(ids) })
  reads.visible(['100']); await tick(); expect(calls).toEqual([])
  active = true; reads.visible(['100']); await tick()
  reads.visible(['100', '2']); await tick()
  expect(calls).toEqual([['100'], ['2']])
})
test('failed request can retry without marking ids confirmed', async () => {
  let attempts = 0
  const reads = createVisitorReads(() => true, async () => { if (++attempts === 1) throw Error('offline') })
  reads.visible(['2']); await tick(); reads.visible(['2']); await tick()
  expect(attempts).toBe(2)
})
test('batch limit and scope reset abort old requests and ignore late completion', async () => {
  const calls: string[][] = []; const signals: AbortSignal[] = []; let complete!: () => void
  const reads = createVisitorReads(() => true, (ids, signal) => { calls.push(ids); signals.push(signal); return new Promise(resolve => { complete = resolve }) })
  reads.visible(Array.from({length: 201}, (_, i) => String(i + 1))); expect(calls[0].length).toBe(200)
  reads.reset(); expect(signals[0].aborted).toBe(true); complete(); await tick()
  reads.visible(['1']); expect(calls[1]).toEqual(['1'])
})
